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
        v_zone := 'pantry';
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
  v_ids uuid[];
  v_id uuid;
  v_row record;
  v_src_count int;
  v_src_full boolean;
  v_src_id uuid;
  v_src_expires date;
  v_src_label text;
  v_src_brand text;
  v_src_pkg numeric;
  v_src_unit text;
  v_src_zone text;
  v_src_created timestamptz;
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
    -- Робочі таблиці сесії: search_path лишається public, тому читаємо їх як pg_temp.*.
    create temporary table if not exists pantry_set_pool (
      id uuid primary key,
      quantity numeric(10, 2) not null,
      expires_at date,
      label text,
      brand text,
      package_amount numeric(10, 2),
      package_unit text,
      storage_zone text,
      created_at timestamptz
    );
    create temporary table if not exists pantry_set_keep (
      id uuid primary key,
      quantity numeric(10, 2) not null,
      expires_at date,
      label text,
      brand text,
      package_amount numeric(10, 2),
      package_unit text,
      storage_zone text,
      created_at timestamptz
    );

    for v_product_id in
      select distinct (i ->> 'productId')::uuid
      from jsonb_array_elements(v_scan.items) i
      where coalesce(i ->> 'productId', '') <> ''
        and (i ->> 'quantity') is not null
        and (i ->> 'quantity')::numeric >= 0
    loop
      select coalesce(sum((i ->> 'quantity')::numeric), 0) into v_n
      from jsonb_array_elements(v_scan.items) i
      where (i ->> 'productId')::uuid = v_product_id
        and (i ->> 'quantity') is not null
        and (i ->> 'quantity')::numeric >= 0;

      select coalesce(sum(quantity), 0) into v_old
      from pantry_items
      where household_id = v_scan.household_id and product_id = v_product_id;

      insert into pantry_movements (household_id, product_id, delta, source, scan_id)
      values (v_scan.household_id, v_product_id, v_n - v_old, 'inventory', p_scan_id);

      select p.storage_zone into v_zone
      from pantry_items p
      where p.household_id = v_scan.household_id and p.product_id = v_product_id
      order by p.created_at desc, p.id desc
      limit 1;
      if v_zone is null or v_zone not in ('fridge', 'freezer', 'pantry') then
        v_zone := 'pantry';
      end if;

      delete from pg_temp.pantry_set_pool;
      delete from pg_temp.pantry_set_keep;

      insert into pg_temp.pantry_set_pool (
        id, quantity, expires_at, label, brand, package_amount, package_unit, storage_zone, created_at
      )
      select id, quantity, expires_at, label, brand, package_amount, package_unit, storage_zone, created_at
      from pantry_items
      where household_id = v_scan.household_id and product_id = v_product_id;

      -- Позиції з терміном стають партіями з цим терміном. Збіг за датою
      -- (спершу та сама назва) вибуває з подальшого розподілу.
      for v_item in select value from jsonb_array_elements(v_scan.items) loop
        if (v_item ->> 'productId')::uuid is distinct from v_product_id then
          continue;
        end if;
        if (v_item ->> 'quantity') is null then
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
        if v_expires is null then
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
        v_src_count := 0;
        v_src_full := false;
        v_src_id := null;
        v_ids := array(
          select p.id
          from pg_temp.pantry_set_pool p
          where p.expires_at is not distinct from v_expires
          order by
            case when p.label is not distinct from v_label then 0 else 1 end,
            p.created_at asc,
            p.id asc
        );

        foreach v_id in array v_ids loop
          exit when v_need <= 0;
          select * into v_row from pg_temp.pantry_set_pool where id = v_id;
          if not found or v_row.quantity <= 0 then
            continue;
          end if;
          v_take := least(v_row.quantity, v_need);
          if v_src_count = 0 then
            v_src_id := v_row.id;
            v_src_full := v_take = v_row.quantity;
            v_src_expires := v_row.expires_at;
            v_src_label := v_row.label;
            v_src_brand := v_row.brand;
            v_src_pkg := v_row.package_amount;
            v_src_unit := v_row.package_unit;
            v_src_zone := v_row.storage_zone;
            v_src_created := v_row.created_at;
          end if;
          v_src_count := v_src_count + 1;
          if v_row.quantity - v_take <= 0 then
            delete from pg_temp.pantry_set_pool where id = v_id;
          else
            update pg_temp.pantry_set_pool
            set quantity = quantity - v_take
            where id = v_id;
          end if;
          v_need := v_need - v_take;
        end loop;

        if v_need = 0 and v_src_count = 1 and v_src_full and v_src_label is not distinct from v_label then
          insert into pg_temp.pantry_set_keep (
            id, quantity, expires_at, label, brand, package_amount, package_unit, storage_zone, created_at
          ) values (
            v_src_id, v_item_qty, v_src_expires, v_src_label, v_src_brand, v_src_pkg, v_src_unit, v_src_zone, v_src_created
          );
        else
          insert into pg_temp.pantry_set_keep (
            id, quantity, expires_at, label, brand, package_amount, package_unit, storage_zone, created_at
          ) values (
            gen_random_uuid(), v_item_qty, v_expires, v_label, v_brand, v_pkg, v_unit, v_zone, now()
          );
        end if;
      end loop;

      -- Кількість без терміну забирає решту так, щоб лишились партії,
      -- які FEFO списав би останніми. Спершу та сама назва.
      for v_item in select value from jsonb_array_elements(v_scan.items) loop
        if (v_item ->> 'productId')::uuid is distinct from v_product_id then
          continue;
        end if;
        if (v_item ->> 'quantity') is null then
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
        if v_expires is not null then
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
        v_ids := array(
          select p.id
          from pg_temp.pantry_set_pool p
          order by
            case when p.label is not distinct from v_label then 0 else 1 end,
            p.expires_at desc nulls first,
            p.created_at desc,
            p.id desc
        );

        foreach v_id in array v_ids loop
          exit when v_need <= 0;
          select * into v_row from pg_temp.pantry_set_pool where id = v_id;
          if not found or v_row.quantity <= 0 then
            continue;
          end if;
          v_take := least(v_row.quantity, v_need);
          if v_take = v_row.quantity then
            insert into pg_temp.pantry_set_keep (
              id, quantity, expires_at, label, brand, package_amount, package_unit, storage_zone, created_at
            ) values (
              v_row.id, v_row.quantity, v_row.expires_at, v_row.label, v_row.brand,
              v_row.package_amount, v_row.package_unit, v_row.storage_zone, v_row.created_at
            );
            delete from pg_temp.pantry_set_pool where id = v_id;
          else
            insert into pg_temp.pantry_set_keep (
              id, quantity, expires_at, label, brand, package_amount, package_unit, storage_zone, created_at
            ) values (
              gen_random_uuid(), v_take, v_row.expires_at, v_row.label, v_row.brand,
              v_row.package_amount, v_row.package_unit, v_row.storage_zone, v_row.created_at
            );
            update pg_temp.pantry_set_pool
            set quantity = quantity - v_take
            where id = v_id;
          end if;
          v_need := v_need - v_take;
        end loop;

        if v_need > 0 then
          insert into pg_temp.pantry_set_keep (
            id, quantity, expires_at, label, brand, package_amount, package_unit, storage_zone, created_at
          ) values (
            gen_random_uuid(), v_need, null, v_label, v_brand, v_pkg, v_unit, v_zone, now()
          );
        end if;
      end loop;

      delete from pantry_items
      where household_id = v_scan.household_id and product_id = v_product_id;

      insert into pantry_items (
        id, household_id, product_id, quantity, storage_zone, expires_at,
        label, brand, package_amount, package_unit, created_at, updated_at
      )
      select
        id,
        v_scan.household_id,
        v_product_id,
        quantity,
        storage_zone,
        expires_at,
        label,
        brand,
        package_amount,
        package_unit,
        coalesce(created_at, now()),
        now()
      from pg_temp.pantry_set_keep
      where quantity > 0;
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
