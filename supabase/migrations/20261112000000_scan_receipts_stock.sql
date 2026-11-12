-- T3: Storage zones & expiry, receipts, budget, scan queue, channel binding

-- ========== 1. Pantry: storage zone + expiry ==========

alter table pantry_items
  add column storage_zone text not null default 'pantry'
    check (storage_zone in ('fridge', 'freezer', 'pantry')),
  add column expires_at date;

create index pantry_items_expires_idx on pantry_items (household_id, expires_at)
  where expires_at is not null;

-- ========== 2. Inventory movements log ==========

create table pantry_movements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  delta numeric(10, 2) not null,
  source text not null check (source in ('scan', 'cooked', 'inventory', 'manual')),
  scan_id uuid,          -- filled when source = 'scan'
  meal_plan_entry_id uuid references meal_plan_entries (id) on delete set null,
  created_at timestamptz not null default now()
);

create index pantry_movements_household_idx on pantry_movements (household_id, created_at);

-- ========== 3. Family members: dietary restrictions & preferences ==========

alter table family_members
  add column restrictions text[] not null default '{}';

-- ========== 4. Household monthly food budget ==========

alter table households
  add column monthly_budget numeric(10, 2);

-- ========== 5. Receipts ==========

create table receipts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  store_id uuid references stores (id) on delete set null,
  store_name text,
  purchased_at date not null default current_date,
  total numeric(10, 2),
  input_source text not null default 'manual',
  scan_id uuid,          -- filled when created from a scan
  created_at timestamptz not null default now()
);

create index receipts_household_date_idx on receipts (household_id, purchased_at);

create table receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references receipts (id) on delete cascade,
  product_id uuid references products (id) on delete set null,
  raw_name text not null,
  quantity numeric(10, 2) not null default 1,
  unit text,
  price numeric(10, 2),
  created_at timestamptz not null default now()
);

create index receipt_items_receipt_idx on receipt_items (receipt_id);

-- receipt_items inherits household scope through the receipt; we add household_id
-- for RLS consistency so the same is_household_member policy pattern works.
alter table receipt_items
  add column household_id uuid not null references households (id) on delete cascade;

-- ========== 6. Incoming scans ==========

create table incoming_scans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  sent_by uuid not null references auth.users (id) on delete cascade,
  channel text not null,              -- 'telegram', 'web', etc. (free text)
  input_type text not null check (input_type in ('receipt', 'voice', 'video', 'screenshot', 'text')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  mode text not null default 'add' check (mode in ('add', 'set')),
  store_name text,
  total numeric(10, 2),
  items jsonb not null default '[]',  -- array of ScanItem
  channel_data jsonb,                 -- opaque channel-specific payload
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index incoming_scans_household_idx on incoming_scans (household_id, created_at);

-- FK from pantry_movements and receipts to incoming_scans (deferred because table created after)
alter table pantry_movements
  add constraint pantry_movements_scan_fk foreign key (scan_id)
    references incoming_scans (id) on delete set null;

alter table receipts
  add constraint receipts_scan_fk foreign key (scan_id)
    references incoming_scans (id) on delete set null;

-- ========== 7. Channel bindings ==========

create table channel_bindings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null,                -- 'telegram', 'web', etc.
  external_id text not null,            -- chat id or user id in the external system
  link_code text,                       -- one-time code for binding
  link_code_expires_at timestamptz,     -- expiry of the link code
  linked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (channel, external_id)
);

create index channel_bindings_household_idx on channel_bindings (household_id);

-- ========== 8. RLS on all new tables ==========

do $$
declare
  t text;
begin
  foreach t in array array[
    'pantry_movements', 'receipts', 'receipt_items',
    'incoming_scans', 'channel_bindings'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all to authenticated using (is_household_member(household_id)) with check (is_household_member(household_id))',
      t || '_member', t
    );
  end loop;
end;
$$;

-- ========== 9. Updated adjust_pantry: also logs movements ==========

create or replace function adjust_pantry(p_household_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- log movements first
  insert into pantry_movements (household_id, product_id, delta, source)
  select p_household_id, (i ->> 'product_id')::uuid, (i ->> 'delta')::numeric, 'manual'
  from jsonb_array_elements(p_items) i;

  update pantry_items p
  set quantity = greatest(0, p.quantity + d.delta), updated_at = now()
  from (
    select (i ->> 'product_id')::uuid as pid, sum((i ->> 'delta')::numeric) as delta
    from jsonb_array_elements(p_items) i
    group by 1
  ) d
  where p.household_id = p_household_id and p.product_id = d.pid;

  insert into pantry_items (household_id, product_id, quantity)
  select p_household_id, d.pid, d.delta
  from (
    select (i ->> 'product_id')::uuid as pid, sum((i ->> 'delta')::numeric) as delta
    from jsonb_array_elements(p_items) i
    group by 1
  ) d
  where d.delta > 0
  on conflict (household_id, product_id) do nothing;

  delete from pantry_items where household_id = p_household_id and quantity = 0;
end;
$$;

-- ========== 10. confirm_scan: atomic scan confirmation ==========

create function confirm_scan(p_scan_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_scan record;
  v_receipt_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_delta numeric;
  v_has_prices boolean := false;
begin
  select * into strict v_scan from incoming_scans where id = p_scan_id;

  if v_scan.status != 'pending' then
    raise exception 'scan is not pending';
  end if;

  -- check caller is household member (RLS would catch it anyway but be explicit)
  if not is_household_member(v_scan.household_id) then
    raise exception 'access denied';
  end if;

  if v_scan.mode = 'add' then
    -- MODE ADD: increase stock, log movements, optionally create receipt

    -- adjust stock & log movements
    for v_item in select * from jsonb_array_elements(v_scan.items) loop
      v_product_id := (v_item ->> 'productId')::uuid;
      v_delta := (v_item ->> 'quantity')::numeric;
      if v_product_id is not null and v_delta is not null and v_delta > 0 then
        -- upsert pantry
        insert into pantry_items (household_id, product_id, quantity)
        values (v_scan.household_id, v_product_id, v_delta)
        on conflict (household_id, product_id)
          do update set quantity = pantry_items.quantity + excluded.quantity,
                        updated_at = now();

        -- log movement
        insert into pantry_movements (household_id, product_id, delta, source, scan_id)
        values (v_scan.household_id, v_product_id, v_delta, 'scan', p_scan_id);
      end if;
    end loop;

    -- create receipt if there is a total or any item has a price
    select exists(
      select 1 from jsonb_array_elements(v_scan.items) i
      where (i ->> 'price') is not null
    ) into v_has_prices;

    if v_scan.total is not null or v_has_prices then
      insert into receipts (household_id, store_name, purchased_at, total, input_source, scan_id)
      values (v_scan.household_id, v_scan.store_name, current_date, v_scan.total, 'scan', p_scan_id)
      returning id into v_receipt_id;

      -- insert receipt items
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
    -- MODE SET: set stock to exact quantities, log movements

    for v_item in select * from jsonb_array_elements(v_scan.items) loop
      v_product_id := (v_item ->> 'productId')::uuid;
      v_delta := (v_item ->> 'quantity')::numeric;
      if v_product_id is not null and v_delta is not null then
        -- calculate actual delta for movement log
        declare
          v_current numeric := 0;
        begin
          select quantity into v_current from pantry_items
          where household_id = v_scan.household_id and product_id = v_product_id;
          if not found then v_current := 0; end if;

          -- log movement (delta = new - old)
          insert into pantry_movements (household_id, product_id, delta, source, scan_id)
          values (v_scan.household_id, v_product_id, v_delta - v_current, 'inventory', p_scan_id);

          if v_delta > 0 then
            insert into pantry_items (household_id, product_id, quantity)
            values (v_scan.household_id, v_product_id, v_delta)
            on conflict (household_id, product_id)
              do update set quantity = excluded.quantity, updated_at = now();
          else
            delete from pantry_items
            where household_id = v_scan.household_id and product_id = v_product_id;
          end if;
        end;
      end if;
    end loop;
    -- no receipt in set mode
  end if;

  -- mark scan as confirmed
  update incoming_scans set status = 'confirmed', confirmed_at = now()
  where id = p_scan_id;
end;
$$;

revoke execute on function confirm_scan(uuid) from public, anon;
grant execute on function confirm_scan(uuid) to authenticated;

-- grant on updated adjust_pantry is inherited (same signature)
