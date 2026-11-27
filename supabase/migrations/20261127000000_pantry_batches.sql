-- Запаси партіями: кілька рядків одного продукту, списання спершу з найближчим терміном.
-- Підписи adjust_pantry(uuid, jsonb) і confirm_scan(uuid) ті самі, тож старий код після
-- застосування міграції далі викликає їх. Елемент без нових полів лишається робочим.

alter table pantry_items
  drop constraint if exists pantry_items_household_id_product_id_key;

alter table pantry_items
  add column created_at timestamptz not null default now(),
  add column label text,
  add column brand text,
  add column package_amount numeric(10, 2),
  add column package_unit text check (package_unit in ('г', 'мл'));

create index pantry_items_fefo_idx
  on pantry_items (household_id, product_id, expires_at, created_at);

-- Наявні рядки лишаються першими партіями: created_at = now() за замовчуванням, label = null.

create or replace function adjust_pantry(p_household_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_item jsonb;
  v_pid uuid;
  v_delta numeric;
  v_expires date;
  v_label text;
  v_brand text;
  v_pkg numeric;
  v_unit text;
  v_zone text;
  v_batch_id uuid;
  v_need numeric;
begin
  -- один рух на елемент, source = manual: setCooked потім перепозначає свіжі рухи на cooked
  insert into pantry_movements (household_id, product_id, delta, source)
  select p_household_id, (i ->> 'product_id')::uuid, (i ->> 'delta')::numeric, 'manual'
  from jsonb_array_elements(p_items) i;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_pid := (v_item ->> 'product_id')::uuid;
    v_delta := (v_item ->> 'delta')::numeric;
    if v_pid is null or v_delta is null or v_delta = 0 then
      continue;
    end if;

    if v_delta > 0 then
      begin
        v_expires := nullif(btrim(coalesce(v_item ->> 'expires_at', '')), '')::date;
      exception when others then
        v_expires := null;
      end;
      v_label := nullif(btrim(coalesce(v_item ->> 'label', '')), '');
      v_brand := nullif(btrim(coalesce(v_item ->> 'brand', '')), '');
      begin
        v_pkg := nullif(btrim(coalesce(v_item ->> 'package_amount', '')), '')::numeric;
      exception when others then
        v_pkg := null;
      end;
      if v_pkg is not null and v_pkg <= 0 then
        v_pkg := null;
      end if;
      v_unit := nullif(btrim(coalesce(v_item ->> 'package_unit', '')), '');
      if v_unit is not null and v_unit not in ('г', 'мл') then
        v_unit := null;
      end if;
      v_zone := nullif(btrim(coalesce(v_item ->> 'storage_zone', '')), '');
      if v_zone is null or v_zone not in ('fridge', 'freezer', 'pantry') then
        select storage_zone into v_zone
        from pantry_items
        where household_id = p_household_id and product_id = v_pid
        order by created_at desc, id desc
        limit 1;
        v_zone := coalesce(v_zone, 'pantry');
      end if;

      select id into v_batch_id
      from pantry_items
      where household_id = p_household_id
        and product_id = v_pid
        and expires_at is not distinct from v_expires
        and label is not distinct from v_label
        and storage_zone = v_zone
      order by created_at asc, id asc
      limit 1
      for update;

      if v_batch_id is not null then
        update pantry_items
        set quantity = quantity + v_delta, updated_at = now()
        where id = v_batch_id;
      else
        insert into pantry_items (
          household_id, product_id, quantity, storage_zone, expires_at,
          label, brand, package_amount, package_unit
        ) values (
          p_household_id, v_pid, v_delta, v_zone, v_expires,
          v_label, v_brand, v_pkg, v_unit
        );
      end if;
    else
      v_need := -v_delta;
      perform 1 from pantry_items
      where household_id = p_household_id and product_id = v_pid
      for update;

      with ordered as (
        select
          id,
          quantity,
          sum(quantity) over (
            order by expires_at asc nulls last, created_at asc, id asc
          ) as running
        from pantry_items
        where household_id = p_household_id
          and product_id = v_pid
          and quantity > 0
      ),
      taken as (
        select
          id,
          least(quantity, greatest(0, v_need - (running - quantity))) as take
        from ordered
      )
      update pantry_items p
      set quantity = p.quantity - t.take, updated_at = now()
      from taken t
      where p.id = t.id
        and t.take > 0;

      delete from pantry_items
      where household_id = p_household_id
        and product_id = v_pid
        and quantity = 0;
    end if;
  end loop;
end;
$fn$;

create or replace function confirm_scan(p_scan_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_scan record;
  v_receipt_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_delta numeric;
  v_has_prices boolean := false;
  v_expires date;
  v_label text;
  v_brand text;
  v_pkg numeric;
  v_unit text;
  v_zone text;
  v_batch_id uuid;
  v_n numeric;
  v_old numeric;
  v_item_qty numeric;
  v_need numeric;
  v_take numeric;
  v_dated boolean;
  v_idx int;
  v_pool pantry_items[];
  v_kept numeric[];
  v_match pantry_items;
begin
  select * into strict v_scan from incoming_scans where id = p_scan_id;

  if v_scan.status != 'pending' then
    raise exception 'scan is not pending';
  end if;

  if auth.uid() is not null then
    if not is_household_member(v_scan.household_id) then
      raise exception 'access denied';
    end if;
  elsif current_user is distinct from 'service_role' then
    raise exception 'access denied';
  end if;

  if v_scan.mode = 'add' then
    for v_item in select value from jsonb_array_elements(v_scan.items) loop
      v_product_id := (v_item ->> 'productId')::uuid;
      v_delta := (v_item ->> 'quantity')::numeric;
      if v_product_id is not null and v_delta is not null and v_delta > 0 then
        begin
          v_expires := nullif(btrim(coalesce(v_item ->> 'expiresAt', '')), '')::date;
        exception when others then
          v_expires := null;
        end;
        v_label := nullif(btrim(coalesce(v_item ->> 'label', '')), '');
        v_brand := nullif(btrim(coalesce(v_item ->> 'brand', '')), '');
        begin
          v_pkg := nullif(btrim(coalesce(v_item ->> 'packageAmount', '')), '')::numeric;
        exception when others then
          v_pkg := null;
        end;
        if v_pkg is not null and v_pkg <= 0 then
          v_pkg := null;
        end if;
        v_unit := nullif(btrim(coalesce(v_item ->> 'packageUnit', '')), '');
        if v_unit is not null and v_unit not in ('г', 'мл') then
          v_unit := null;
        end if;

        select storage_zone into v_zone
        from pantry_items
        where household_id = v_scan.household_id and product_id = v_product_id
        order by created_at desc, id desc
        limit 1;
        if v_zone is null or v_zone not in ('fridge', 'freezer', 'pantry') then
          v_zone := 'pantry';
        end if;

        select id into v_batch_id
        from pantry_items
        where household_id = v_scan.household_id
          and product_id = v_product_id
          and expires_at is not distinct from v_expires
          and label is not distinct from v_label
          and storage_zone = v_zone
        order by created_at asc, id asc
        limit 1
        for update;

        if v_batch_id is not null then
          update pantry_items
          set quantity = quantity + v_delta, updated_at = now()
          where id = v_batch_id;
        else
          insert into pantry_items (
            household_id, product_id, quantity, storage_zone, expires_at,
            label, brand, package_amount, package_unit
          ) values (
            v_scan.household_id, v_product_id, v_delta, v_zone, v_expires,
            v_label, v_brand, v_pkg, v_unit
          );
        end if;

        insert into pantry_movements (household_id, product_id, delta, source, scan_id)
        values (v_scan.household_id, v_product_id, v_delta, 'scan', p_scan_id);
      end if;
    end loop;

    select exists(
      select 1 from jsonb_array_elements(v_scan.items) i
      where (i ->> 'price') is not null
    ) into v_has_prices;

    if v_scan.total is not null or v_has_prices then
      insert into receipts (household_id, store_name, purchased_at, total, input_source, scan_id)
      values (v_scan.household_id, v_scan.store_name, current_date, v_scan.total, 'scan', p_scan_id)
      returning id into v_receipt_id;

      insert into receipt_items (receipt_id, household_id, product_id, raw_name, quantity, unit, price)
      select
        v_receipt_id,
        v_scan.household_id,
        (i ->> 'productId')::uuid,
        coalesce(i ->> 'raw', i ->> 'name', ''),
        coalesce((i ->> 'quantity')::numeric, 1),
        i ->> 'unit',
        (i ->> 'price')::numeric
      from jsonb_array_elements(v_scan.items) i;
    end if;

  elsif v_scan.mode = 'set' then
    -- Без тимчасових таблиць: з'єднання пулове, а ролі в ньому чергуються.
    for v_product_id in
      select distinct nullif(i ->> 'productId', '')::uuid
      from jsonb_array_elements(v_scan.items) i
      where nullif(i ->> 'productId', '') is not null
        and (i ->> 'quantity')::numeric >= 0
    loop
      perform 1 from pantry_items
      where household_id = v_scan.household_id and product_id = v_product_id
      for update;

      -- Знімок наявних партій, від найстарішої до найновішої.
      select coalesce(array_agg(p order by p.created_at, p.id), '{}') into v_pool
      from pantry_items p
      where p.household_id = v_scan.household_id and p.product_id = v_product_id;

      select coalesce(sum((i ->> 'quantity')::numeric), 0) into v_n
      from jsonb_array_elements(v_scan.items) i
      where nullif(i ->> 'productId', '')::uuid = v_product_id
        and (i ->> 'quantity')::numeric >= 0;

      select coalesce(sum(u.quantity), 0) into v_old from unnest(v_pool) u;

      insert into pantry_movements (household_id, product_id, delta, source, scan_id)
      values (v_scan.household_id, v_product_id, v_n - v_old, 'inventory', p_scan_id);

      v_zone := coalesce((v_pool[cardinality(v_pool)]).storage_zone, 'pantry');
      v_kept := array_fill(0::numeric, array[cardinality(v_pool)]);

      delete from pantry_items
      where household_id = v_scan.household_id and product_id = v_product_id;

      -- Спершу позиції з терміном, потім без нього: другі забирають те, що лишилось.
      foreach v_dated in array array[true, false] loop
        for v_item in select value from jsonb_array_elements(v_scan.items) loop
          if nullif(v_item ->> 'productId', '')::uuid is distinct from v_product_id then
            continue;
          end if;
          v_item_qty := (v_item ->> 'quantity')::numeric;
          if v_item_qty is null or v_item_qty <= 0 then
            continue;
          end if;
          begin
            v_expires := nullif(btrim(coalesce(v_item ->> 'expiresAt', '')), '')::date;
          exception when others then
            v_expires := null;
          end;
          if (v_expires is not null) <> v_dated then
            continue;
          end if;

          v_label := nullif(btrim(coalesce(v_item ->> 'label', '')), '');
          v_brand := nullif(btrim(coalesce(v_item ->> 'brand', '')), '');
          begin
            v_pkg := nullif(btrim(coalesce(v_item ->> 'packageAmount', '')), '')::numeric;
          exception when others then
            v_pkg := null;
          end;
          if v_pkg is not null and v_pkg <= 0 then
            v_pkg := null;
          end if;
          v_unit := nullif(btrim(coalesce(v_item ->> 'packageUnit', '')), '');
          if v_unit is not null and v_unit not in ('г', 'мл') then
            v_unit := null;
          end if;

          v_need := v_item_qty;

          if v_dated then
            -- Партії з тим самим терміном (спершу та сама назва) — це ці самі товари.
            v_match := null;
            for v_idx in
              select s from generate_subscripts(v_pool, 1) s
              where (v_pool[s]).expires_at = v_expires
              order by case when (v_pool[s]).label = v_label then 0 else 1 end, s
            loop
              exit when v_need <= 0;
              v_take := least((v_pool[v_idx]).quantity, v_need);
              if v_take <= 0 then
                continue;
              end if;
              if v_match.id is null then
                v_match := v_pool[v_idx];
              end if;
              v_pool[v_idx].quantity := (v_pool[v_idx]).quantity - v_take;
              v_need := v_need - v_take;
            end loop;

            insert into pantry_items (
              household_id, product_id, quantity, storage_zone, expires_at,
              label, brand, package_amount, package_unit, created_at
            ) values (
              v_scan.household_id, v_product_id, v_item_qty,
              coalesce(v_match.storage_zone, v_zone), v_expires,
              coalesce(v_label, v_match.label), coalesce(v_brand, v_match.brand),
              coalesce(v_pkg, v_match.package_amount), coalesce(v_unit, v_match.package_unit),
              coalesce(v_match.created_at, now())
            );
          else
            -- Лишаються партії, які FEFO списав би останніми. Спершу та сама назва.
            for v_idx in
              select s from generate_subscripts(v_pool, 1) s
              order by
                case when (v_pool[s]).label = v_label then 0 else 1 end,
                (v_pool[s]).expires_at desc nulls first,
                s desc
            loop
              exit when v_need <= 0;
              v_take := least((v_pool[v_idx]).quantity, v_need);
              if v_take <= 0 then
                continue;
              end if;
              v_pool[v_idx].quantity := (v_pool[v_idx]).quantity - v_take;
              v_kept[v_idx] := v_kept[v_idx] + v_take;
              v_need := v_need - v_take;
            end loop;

            if v_need > 0 then
              insert into pantry_items (
                household_id, product_id, quantity, storage_zone, expires_at,
                label, brand, package_amount, package_unit
              ) values (
                v_scan.household_id, v_product_id, v_need, v_zone, null,
                v_label, v_brand, v_pkg, v_unit
              );
            end if;
          end if;
        end loop;
      end loop;

      -- Підтверджені партії без нового терміну повертаються зі своїми даними.
      for v_idx in select s from generate_subscripts(v_pool, 1) s loop
        if v_kept[v_idx] > 0 then
          v_match := v_pool[v_idx];
          v_match.quantity := v_kept[v_idx];
          v_match.updated_at := now();
          insert into pantry_items values (v_match.*);
        end if;
      end loop;
    end loop;
  end if;

  update incoming_scans set status = 'confirmed', confirmed_at = now()
  where id = p_scan_id;
end;
$fn$;

revoke execute on function confirm_scan(uuid) from public, anon;
grant execute on function confirm_scan(uuid) to authenticated, service_role;
grant execute on function is_household_member(uuid) to service_role;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
