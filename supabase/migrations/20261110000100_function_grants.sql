-- is_household_member потрібна лише політикам RLS для ввійшлих користувачів
revoke execute on function is_household_member(uuid) from public, anon;
grant execute on function is_household_member(uuid) to authenticated;
