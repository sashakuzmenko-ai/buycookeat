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

-- ---------- Спільні частини ----------

-- Текстові поля позиції → типізовані поля партії. Невідоме й некоректне стає null.
create function pantry_batch_fields(
  p_expires text,
  p_label text,
  p_brand text,
  p_amount text,
  p_unit text,
  out expires_at date,
  out label text,
  out brand text,
  out package_amount numeric,
  out package_unit text
)
language plpgsql
stable
set search_path = public
as $fn$
begin
  begin
    expires_at := nullif(btrim(p_expires), '')::date;
  exception when others then
    expires_at := null;
  end;
  label := nullif(btrim(p_label), '');
  brand := nullif(btrim(p_brand), '');
  begin
    package_amount := nullif(btrim(p_amount), '')::numeric;
  exception when others then
    package_amount := null;
  end;
  if package_amount <= 0 then
    package_amount := null;
  end if;
  if btrim(p_unit) in ('г', 'мл') then
    package_unit := btrim(p_unit);
  end if;
end;
$fn$;

-- Позиції скану (ключі camelCase, як їх пише застосунок) у порядку скану.
create function pantry_scan_lines(p_items jsonb)
returns table (
  product_id uuid,
  quantity numeric,
  expires_at date,
  label text,
  brand text,
  package_amount numeric,
  package_unit text
)
language sql
stable
set search_path = public
as $fn$
  select
    nullif(t.item ->> 'productId', '')::uuid,
    (t.item ->> 'quantity')::numeric,
    f.expires_at, f.label, f.brand, f.package_amount, f.package_unit
  from jsonb_array_elements(p_items) with ordinality as t(item, position)
  cross join lateral pantry_batch_fields(
    t.item ->> 'expiresAt',
    t.item ->> 'label',
    t.item ->> 'brand',
    t.item ->> 'packageAmount',
    t.item ->> 'packageUnit'
  ) f
  order by t.position
$fn$;

-- Зона найновішої партії продукту; для нового продукту — комора.
create function pantry_default_zone(p_household_id uuid, p_product_id uuid)
returns text
language sql
stable
security invoker
set search_path = public
as $fn$
  select coalesce(
    (
      select storage_zone from pantry_items
      where household_id = p_household_id and product_id = p_product_id
      order by created_at desc, id desc
      limit 1
    ),
    'pantry'
  )
$fn$;

-- Надходження з тим самим терміном, назвою й зоною додається до партії, інакше створює нову.
create function pantry_add_batch(
  p_household_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_zone text,
  p_expires date,
  p_label text,
  p_brand text,
  p_package_amount numeric,
  p_package_unit text
)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_batch_id uuid;
begin
  select id into v_batch_id
  from pantry_items
  where household_id = p_household_id
    and product_id = p_product_id
    and expires_at is not distinct from p_expires
    and label is not distinct from p_label
    and storage_zone = p_zone
  order by created_at asc, id asc
  limit 1
  for update;

  if v_batch_id is not null then
    update pantry_items
    set quantity = quantity + p_quantity, updated_at = now()
    where id = v_batch_id;
  else
    insert into pantry_items (
      household_id, product_id, quantity, storage_zone, expires_at,
      label, brand, package_amount, package_unit
    ) values (
      p_household_id, p_product_id, p_quantity, p_zone, p_expires,
      p_label, p_brand, p_package_amount, p_package_unit
    );
  end if;
end;
$fn$;

-- ---------- Зміна запасів ----------

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
  v_fields record;
  v_zone text;
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
      select * into v_fields from pantry_batch_fields(
        v_item ->> 'expires_at',
        v_item ->> 'label',
        v_item ->> 'brand',
        v_item ->> 'package_amount',
        v_item ->> 'package_unit'
      );
      v_zone := btrim(v_item ->> 'storage_zone');
      if v_zone is null or v_zone not in ('fridge', 'freezer', 'pantry') then
        v_zone := pantry_default_zone(p_household_id, v_pid);
      end if;
      perform pantry_add_batch(
        p_household_id, v_pid, v_delta, v_zone, v_fields.expires_at,
        v_fields.label, v_fields.brand, v_fields.package_amount, v_fields.package_unit
      );
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

-- ---------- Підтвердження скану ----------

create or replace function confirm_scan(p_scan_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_scan record;
  v_receipt_id uuid;
  v_line record;
  v_product_id uuid;
  v_has_prices boolean := false;
  v_zone text;
  v_n numeric;
  v_old numeric;
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
    for v_line in
      select * from pantry_scan_lines(v_scan.items) l
      where l.product_id is not null and l.quantity > 0
    loop
      perform pantry_add_batch(
        v_scan.household_id, v_line.product_id, v_line.quantity,
        pantry_default_zone(v_scan.household_id, v_line.product_id), v_line.expires_at,
        v_line.label, v_line.brand, v_line.package_amount, v_line.package_unit
      );

      insert into pantry_movements (household_id, product_id, delta, source, scan_id)
      values (v_scan.household_id, v_line.product_id, v_line.quantity, 'scan', p_scan_id);
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
    for v_product_id, v_n in
      select l.product_id, sum(l.quantity)
      from pantry_scan_lines(v_scan.items) l
      where l.product_id is not null and l.quantity >= 0
      group by l.product_id
    loop
      perform 1 from pantry_items
      where household_id = v_scan.household_id and product_id = v_product_id
      for update;

      -- Знімок наявних партій, від найстарішої до найновішої.
      select coalesce(array_agg(p order by p.created_at, p.id), '{}') into v_pool
      from pantry_items p
      where p.household_id = v_scan.household_id and p.product_id = v_product_id;

      select coalesce(sum(u.quantity), 0) into v_old from unnest(v_pool) u;

      insert into pantry_movements (household_id, product_id, delta, source, scan_id)
      values (v_scan.household_id, v_product_id, v_n - v_old, 'inventory', p_scan_id);

      v_zone := pantry_default_zone(v_scan.household_id, v_product_id);
      v_kept := array_fill(0::numeric, array[cardinality(v_pool)]);

      delete from pantry_items
      where household_id = v_scan.household_id and product_id = v_product_id;

      -- Спершу позиції з терміном, потім без нього: другі забирають те, що лишилось.
      foreach v_dated in array array[true, false] loop
        for v_line in
          select * from pantry_scan_lines(v_scan.items) l
          where l.product_id = v_product_id
            and l.quantity > 0
            and (l.expires_at is not null) = v_dated
        loop
          v_need := v_line.quantity;

          if v_dated then
            -- Партії з тим самим терміном (спершу та сама назва) — це ці самі товари.
            v_match := null;
            for v_idx in
              select s from generate_subscripts(v_pool, 1) s
              where (v_pool[s]).expires_at = v_line.expires_at
              order by case when (v_pool[s]).label = v_line.label then 0 else 1 end, s
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
              v_scan.household_id, v_product_id, v_line.quantity,
              coalesce(v_match.storage_zone, v_zone), v_line.expires_at,
              coalesce(v_line.label, v_match.label), coalesce(v_line.brand, v_match.brand),
              coalesce(v_line.package_amount, v_match.package_amount),
              coalesce(v_line.package_unit, v_match.package_unit),
              coalesce(v_match.created_at, now())
            );
          else
            -- Лишаються партії, які FEFO списав би останніми. Спершу та сама назва.
            for v_idx in
              select s from generate_subscripts(v_pool, 1) s
              order by
                case when (v_pool[s]).label = v_line.label then 0 else 1 end,
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
              perform pantry_add_batch(
                v_scan.household_id, v_product_id, v_need, v_zone, null,
                v_line.label, v_line.brand, v_line.package_amount, v_line.package_unit
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

revoke execute on function pantry_batch_fields(text, text, text, text, text) from public, anon;
revoke execute on function pantry_scan_lines(jsonb) from public, anon;
revoke execute on function pantry_default_zone(uuid, uuid) from public, anon;
revoke execute on function pantry_add_batch(uuid, uuid, numeric, text, date, text, text, numeric, text) from public, anon;
grant execute on function pantry_batch_fields(text, text, text, text, text) to authenticated, service_role;
grant execute on function pantry_scan_lines(jsonb) to authenticated, service_role;
grant execute on function pantry_default_zone(uuid, uuid) to authenticated, service_role;
grant execute on function pantry_add_batch(uuid, uuid, numeric, text, date, text, text, numeric, text) to authenticated, service_role;

revoke execute on function confirm_scan(uuid) from public, anon;
grant execute on function confirm_scan(uuid) to authenticated, service_role;
grant execute on function is_household_member(uuid) to service_role;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
