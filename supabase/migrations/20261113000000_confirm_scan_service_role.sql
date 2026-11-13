-- Бот підтверджує скан службовою роллю: у неї немає auth.uid(), тож стара
-- перевірка is_household_member завжди відмовляла. Ввійшлий користувач як і раніше
-- має бути членом сім'ї. Службова роль лишається лише для сервера; застосунок
-- сам перевіряє прив'язку й сім'ю перед викликом.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role bypassrls;
  end if;
end
$$;

create or replace function confirm_scan(p_scan_id uuid)
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

  if auth.uid() is not null then
    if not is_household_member(v_scan.household_id) then
      raise exception 'access denied';
    end if;
  elsif current_user is distinct from 'service_role' then
    raise exception 'access denied';
  end if;

  if v_scan.mode = 'add' then
    for v_item in select * from jsonb_array_elements(v_scan.items) loop
      v_product_id := (v_item ->> 'productId')::uuid;
      v_delta := (v_item ->> 'quantity')::numeric;
      if v_product_id is not null and v_delta is not null and v_delta > 0 then
        insert into pantry_items (household_id, product_id, quantity)
        values (v_scan.household_id, v_product_id, v_delta)
        on conflict (household_id, product_id)
          do update set quantity = pantry_items.quantity + excluded.quantity,
                        updated_at = now();

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
    for v_item in select * from jsonb_array_elements(v_scan.items) loop
      v_product_id := (v_item ->> 'productId')::uuid;
      v_delta := (v_item ->> 'quantity')::numeric;
      if v_product_id is not null and v_delta is not null then
        declare
          v_current numeric := 0;
        begin
          select quantity into v_current from pantry_items
          where household_id = v_scan.household_id and product_id = v_product_id;
          if not found then v_current := 0; end if;

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
  end if;

  update incoming_scans set status = 'confirmed', confirmed_at = now()
  where id = p_scan_id;
end;
$$;

revoke execute on function confirm_scan(uuid) from public, anon;
grant execute on function confirm_scan(uuid) to authenticated, service_role;
grant execute on function is_household_member(uuid) to service_role;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
