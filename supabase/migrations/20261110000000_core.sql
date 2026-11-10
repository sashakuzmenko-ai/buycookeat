-- Cook & Eat: ядро (сім'я, магазини, продукти, техніка, рецепти, меню, список покупок)

-- ---------- Домогосподарство і доступ ----------

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  created_at timestamptz not null default now()
);

create table household_users (
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_users_user_idx on household_users (user_id);

-- security definer, щоб політики RLS не зациклювались на household_users
create function is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from household_users
    where household_id = hid and user_id = auth.uid()
  );
$$;

create function create_household(p_name text, p_city text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into households (name, city) values (p_name, p_city) returning id into hid;
  insert into household_users (household_id, user_id, role) values (hid, auth.uid(), 'owner');
  return hid;
end;
$$;

-- ---------- Члени сім'ї (для розрахунку порцій) ----------

create table family_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  kind text not null default 'adult' check (kind in ('adult', 'child')),
  birth_date date,
  -- частка дорослої порції: дорослий 1.0, дитина 4-5 р. ~0.55, 1-2 р. ~0.3
  portion_factor numeric(4, 2) not null default 1.0 check (portion_factor > 0 and portion_factor <= 3),
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Магазини і доставки ----------

create table stores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  kind text not null default 'supermarket' check (kind in ('supermarket', 'market', 'delivery', 'other')),
  access text not null default 'walk' check (access in ('walk', 'drive', 'delivery')),
  visit_frequency text not null default 'daily' check (visit_frequency in ('daily', 'weekly', 'rare')),
  address text,
  phone text,
  url text,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Продукти ----------

create table products (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  category text not null default 'інше',
  unit text not null default 'г' check (unit in ('г', 'мл', 'шт')),
  -- де зазвичай купуємо; null = у найближчому магазині
  preferred_store_id uuid references stores (id) on delete set null,
  -- базові запаси (сіль, олія, спеції) не потрапляють у список покупок автоматично
  is_staple boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

-- приблизний асортимент магазину
create table store_products (
  household_id uuid not null references households (id) on delete cascade,
  store_id uuid not null references stores (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  price numeric(10, 2),
  price_updated_at timestamptz,
  primary key (store_id, product_id)
);

-- ---------- Техніка ----------

create table equipment (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

-- ---------- Рецепти ----------

create table recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  title text not null,
  description text,
  instructions text,
  -- на скільки дорослих порцій розраховані кількості інгредієнтів
  base_servings numeric(4, 1) not null default 4 check (base_servings > 0),
  cook_minutes int,
  meal_types text[] not null default '{}',
  kid_friendly boolean not null default true,
  kid_notes text,
  source_url text,
  created_at timestamptz not null default now()
);

create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  recipe_id uuid not null references recipes (id) on delete cascade,
  product_id uuid not null references products (id) on delete restrict,
  quantity numeric(10, 2) not null check (quantity > 0),
  optional boolean not null default false,
  note text,
  sort_order int not null default 0
);

create index recipe_ingredients_recipe_idx on recipe_ingredients (recipe_id);

create table recipe_equipment (
  household_id uuid not null references households (id) on delete cascade,
  recipe_id uuid not null references recipes (id) on delete cascade,
  equipment_id uuid not null references equipment (id) on delete cascade,
  primary key (recipe_id, equipment_id)
);

-- ---------- Меню ----------

create table meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  plan_date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_id uuid references recipes (id) on delete cascade,
  -- вільний текст, якщо страва без рецепта («залишки», «в гостях»)
  title text,
  -- скільки дорослих порцій готуємо; null = на всю сім'ю
  servings numeric(4, 1) check (servings > 0),
  cooked_at timestamptz,
  created_at timestamptz not null default now(),
  check (recipe_id is not null or title is not null)
);

create index meal_plan_entries_date_idx on meal_plan_entries (household_id, plan_date);

-- ---------- Список покупок ----------

create table shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  week_start date not null,
  product_id uuid references products (id) on delete cascade,
  -- вільний текст для позицій поза базою продуктів
  title text,
  quantity numeric(10, 2),
  unit text,
  store_id uuid references stores (id) on delete set null,
  source text not null default 'manual' check (source in ('plan', 'manual')),
  checked boolean not null default false,
  created_at timestamptz not null default now(),
  check (product_id is not null or title is not null)
);

create index shopping_list_items_week_idx on shopping_list_items (household_id, week_start);

-- ---------- RLS: усе видно лише членам домогосподарства ----------

alter table households enable row level security;
alter table household_users enable row level security;

create policy households_member on households
  for all to authenticated
  using (is_household_member(id))
  with check (is_household_member(id));

create policy household_users_member on household_users
  for select to authenticated
  using (is_household_member(household_id));

do $$
declare
  t text;
begin
  foreach t in array array[
    'family_members', 'stores', 'products', 'store_products', 'equipment',
    'recipes', 'recipe_ingredients', 'recipe_equipment',
    'meal_plan_entries', 'shopping_list_items'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all to authenticated using (is_household_member(household_id)) with check (is_household_member(household_id))',
      t || '_member', t
    );
  end loop;
end;
$$;

revoke execute on function create_household(text, text) from public, anon;
grant execute on function create_household(text, text) to authenticated;
