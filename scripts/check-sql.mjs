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

// ---------- RLS на нових таблицях ----------

// Чеки: власник створює, сторонній не бачить і не може вставити
await as(a, `insert into receipts (household_id, store_name, purchased_at, total, input_source)
  values ('${hid}', 'АТБ', '2026-11-01', 150.50, 'manual')`);
const receiptsA = await as(a, `select * from receipts`);
const receiptsB = await as(b, `select * from receipts`);
let receiptBlocked = false;
try {
  await as(b, `insert into receipts (household_id, store_name, purchased_at, total, input_source) values ('${hid}', 'АТБ', '2026-11-01', 100, 'manual')`);
} catch { receiptBlocked = true; }
console.log(`Чеки RLS: власник ${receiptsA.length}, сторонній ${receiptsB.length}, блок: ${receiptBlocked}`);

// receipt_items
const rid = receiptsA[0]?.id;
await as(a, `insert into receipt_items (receipt_id, household_id, product_id, raw_name, quantity, price)
  values ('${rid}', '${hid}', '${pid}', 'Гречка', 1, 45.90)`);
const riA = await as(a, `select * from receipt_items`);
const riB = await as(b, `select * from receipt_items`);
console.log(`Позиції чека RLS: власник ${riA.length}, сторонній ${riB.length}`);

// Рух складу: сторонній не бачить
const movA = await as(a, `select * from pantry_movements`);
const movB = await as(b, `select * from pantry_movements`);
console.log(`Рух складу RLS: власник ${movA.length}, сторонній ${movB.length}`);

// Скани: власник створює, сторонній не бачить
await as(a, `insert into incoming_scans (household_id, sent_by, channel, input_type, status, mode, items)
  values ('${hid}', '${a}', 'telegram', 'receipt', 'pending', 'add', '[]'::jsonb)`);
const scansA = await as(a, `select * from incoming_scans`);
const scansB = await as(b, `select * from incoming_scans`);
let scanBlocked = false;
try {
  await as(b, `insert into incoming_scans (household_id, sent_by, channel, input_type, mode, items) values ('${hid}', '${b}', 'web', 'text', 'add', '[]'::jsonb)`);
} catch { scanBlocked = true; }
console.log(`Скани RLS: власник ${scansA.length}, сторонній ${scansB.length}, блок: ${scanBlocked}`);

// Прив'язка каналу: сторонній не бачить
await as(a, `insert into channel_bindings (household_id, user_id, channel, external_id, link_code, link_code_expires_at)
  values ('${hid}', '${a}', 'telegram', '12345', 'ABC123', now() + interval '1 hour')`);
const cbA = await as(a, `select * from channel_bindings`);
const cbB = await as(b, `select * from channel_bindings`);
console.log(`Прив'язка каналу RLS: власник ${cbA.length}, сторонній ${cbB.length}`);

// ---------- confirm_scan у режимі add: збільшує запас і створює чек ----------

// Скинемо старий тестовий скан, створимо новий з позиціями
await as(a, `delete from incoming_scans`);
await as(a, `delete from pantry_items`);
await as(a, `delete from receipts`); // cascade видалить receipt_items

// створюємо скан з позиціями та сумою
const scanItems = JSON.stringify([
  { raw: "Гречка 1кг", productId: pid, name: "Гречка", category: "крупи", unit: "г", quantity: 1000, uncertain: false, price: 45.90 }
]);
await as(a, `insert into incoming_scans (household_id, sent_by, channel, input_type, status, mode, store_name, total, items)
  values ('${hid}', '${a}', 'telegram', 'receipt', 'pending', 'add', 'АТБ', 45.90, '${scanItems}'::jsonb)`);
const [{ id: testScanId }] = await as(a, `select id from incoming_scans where status = 'pending' limit 1`);

// grant execute (already granted in migration but need to grant sequences too)
await db.exec(`grant usage on all sequences in schema public to authenticated;`);

await as(a, `select confirm_scan('${testScanId}')`);

// Перевірки:
const stockAfterConfirm = await as(a, `select quantity from pantry_items where product_id = '${pid}'`);
const receiptAfterConfirm = await as(a, `select * from receipts where scan_id = '${testScanId}'`);
const riAfterConfirm = await as(a, `select * from receipt_items where receipt_id = '${receiptAfterConfirm[0]?.id}'`);
const scanStatus = await as(a, `select status from incoming_scans where id = '${testScanId}'`);
const movAfterConfirm = await as(a, `select * from pantry_movements where scan_id = '${testScanId}'`);

const confirmOk =
  Number(stockAfterConfirm[0]?.quantity) === 1000 &&
  receiptAfterConfirm.length === 1 &&
  Number(receiptAfterConfirm[0]?.total) === 45.90 &&
  riAfterConfirm.length === 1 &&
  scanStatus[0]?.status === 'confirmed' &&
  movAfterConfirm.length === 1 &&
  Number(movAfterConfirm[0]?.delta) === 1000;

console.log(`confirm_scan(add): запас ${stockAfterConfirm[0]?.quantity}, чек ${receiptAfterConfirm.length}, позицій ${riAfterConfirm.length}, статус ${scanStatus[0]?.status}, рух ${movAfterConfirm.length} — ${confirmOk ? 'OK' : 'FAIL'}`);

// ---------- Підсумок ----------

const newTablesOk =
  receiptsA.length === 1 && receiptsB.length === 0 && receiptBlocked &&
  riA.length === 1 && riB.length === 0 &&
  movB.length === 0 &&
  scansA.length === 1 && scansB.length === 0 && scanBlocked &&
  cbA.length === 1 && cbB.length === 0;

const pass = seenByA.length === 1 && seenByB.length === 0 && blocked && pantryOk && newTablesOk && confirmOk;
console.log(`RLS: власник бачить ${seenByA.length}, сторонній бачить ${seenByB.length}, чужий запис ${blocked ? "заблоковано" : "ПРОЙШОВ"}`);
console.log(`Нові таблиці RLS: ${newTablesOk ? 'OK' : 'FAIL'}`);
console.log(`Підтвердження скану: ${confirmOk ? 'OK' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
