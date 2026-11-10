-- Запаси: один рядок на продукт у домогосподарстві

create table pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  quantity numeric(10, 2) not null check (quantity >= 0),
  updated_at timestamptz not null default now(),
  unique (household_id, product_id)
);

alter table pantry_items enable row level security;

create policy pantry_items_member on pantry_items
  for all to authenticated
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- коли куплену позицію перенесли в запаси (щоб не додати двічі)
alter table shopping_list_items add column stocked_at timestamptz;

-- Атомарно змінює запаси: p_items = [{"product_id": "...", "delta": 250}, ...]
-- Від'ємна delta списує, але не нижче нуля; нульові залишки видаляються.
-- security invoker: діє RLS викликача.
create function adjust_pantry(p_household_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
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

revoke execute on function adjust_pantry(uuid, jsonb) from public, anon;
grant execute on function adjust_pantry(uuid, jsonb) to authenticated;
