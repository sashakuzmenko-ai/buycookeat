// Перевіряє, що міграції застосовуються на чистий Postgres (PGlite, без Docker).
// Supabase-специфічні речі (схема auth, ролі) підмінені мінімальними заглушками.
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "supabase", "migrations");
const db = new PGlite();

await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
`);

for (const file of readdirSync(dir).sort()) {
  try {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  } catch (e) {
    console.error("FAIL", file, "-", e.message, e.position ? `(pos ${e.position})` : "");
    process.exit(1);
  }
  console.log("ok  ", file);
}

// Димовий тест: create_household + RLS між двома користувачами
const a = "00000000-0000-0000-0000-00000000000a";
const b = "00000000-0000-0000-0000-00000000000b";
await db.exec(`
  insert into auth.users values ('${a}'), ('${b}');
  grant usage on schema public, auth to authenticated;
  grant all on all tables in schema public to authenticated;
  grant select on auth.users to authenticated;
`);
const as = async (uid, sql) => {
  await db.exec(`set role authenticated; set request.jwt.sub = '${uid}';`);
  try {
    return (await db.query(sql)).rows;
  } finally {
    await db.exec(`reset role;`);
  }
};
const [{ hid }] = await as(a, `select create_household('Тест', 'Івано-Франківськ') as hid`);
await as(a, `insert into stores (household_id, name) values ('${hid}', 'АТБ')`);
const seenByA = await as(a, `select name from stores`);
const seenByB = await as(b, `select name from stores`);
let blocked = false;
try {
  await as(b, `insert into stores (household_id, name) values ('${hid}', 'Чужий')`);
} catch {
  blocked = true;
}
// запаси: додати, списати більше ніж є (не нижче нуля → рядок зникає), чужий не може
const [{ pid }] = await as(a, `insert into products (household_id, name) values ('${hid}', 'Гречка') returning id as pid`);
const adjust = (uid, delta) =>
  as(uid, `select adjust_pantry('${hid}', '[{"product_id":"${pid}","delta":${delta}}]'::jsonb)`);
const qty = async () => (await as(a, `select quantity from pantry_items`)).map((r) => Number(r.quantity));
await adjust(a, 500);
await adjust(a, 300);
const afterAdd = await qty();
await adjust(a, -200);
const afterUse = await qty();
await adjust(a, -9999);
const afterEmpty = await qty();
let strangerBlocked = false;
try { await adjust(b, 100); } catch { strangerBlocked = true; }
const pantryOk = afterAdd[0] === 800 && afterUse[0] === 600 && afterEmpty.length === 0 && strangerBlocked && (await qty()).length === 0;
console.log(`Запаси: ${afterAdd[0]} → ${afterUse[0]} → порожньо: ${afterEmpty.length === 0}, чужий заблокований: ${strangerBlocked}`);
const pass = seenByA.length === 1 && seenByB.length === 0 && blocked && pantryOk;
console.log(`RLS: власник бачить ${seenByA.length}, сторонній бачить ${seenByB.length}, чужий запис ${blocked ? "заблоковано" : "ПРОЙШОВ"}`);
process.exit(pass ? 0 : 1);
