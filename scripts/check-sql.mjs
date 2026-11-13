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

// Helper: run SQL as a given user (set role + jwt sub, reset after)
async function runAs(uid, sql) {
  await db.exec(`set role authenticated; set request.jwt.sub = '${uid}';`);
  try {
    return (await db.query(sql)).rows;
  } finally {
    await db.exec(`reset role;`);
  }
}

const [{ hid }] = await runAs(a, `select create_household('Тест', 'Івано-Франківськ') as hid`);
await runAs(a, `insert into stores (household_id, name) values ('${hid}', 'АТБ')`);

// ---------- RLS helper ----------

// Verifies that the owner sees rows, a stranger sees nothing,
// and (when strangerSql is given) a stranger insert is blocked.
async function rlsCheck(label, table, ownerSql, strangerSql) {
  await runAs(a, ownerSql);
  const ownRows = await runAs(a, `select * from ${table}`);
  const otherRows = await runAs(b, `select * from ${table}`);
  let insertBlocked = true;
  if (strangerSql) {
    try {
      await runAs(b, strangerSql);
      insertBlocked = false; // should not reach here
    } catch { /* expected: RLS blocks stranger */ }
  }
  const blockMsg = strangerSql ? `, блок: ${insertBlocked}` : "";
  console.log(`${label} RLS: власник ${ownRows.length}, сторонній ${otherRows.length}${blockMsg}`);
  return { ownRows, otherRows, insertBlocked };
}

// ---------- Stores RLS ----------

const seenByA = await runAs(a, `select name from stores`);
const seenByB = await runAs(b, `select name from stores`);
let blocked = true;
try {
  await runAs(b, `insert into stores (household_id, name) values ('${hid}', 'Чужий')`);
  blocked = false;
} catch { /* expected: RLS blocks stranger */ }

// ---------- Pantry ----------

const [{ pid }] = await runAs(a, `insert into products (household_id, name) values ('${hid}', 'Гречка') returning id as pid`);
const adjust = (uid, delta) =>
  runAs(uid, `select adjust_pantry('${hid}', '[{"product_id":"${pid}","delta":${delta}}]'::jsonb)`);
const qty = async () => (await runAs(a, `select quantity from pantry_items`)).map((r) => Number(r.quantity));
await adjust(a, 500);
await adjust(a, 300);
const afterAdd = await qty();
await adjust(a, -200);
const afterUse = await qty();
await adjust(a, -9999);
const afterEmpty = await qty();
let strangerBlocked = false;
try {
  await adjust(b, 100);
} catch { strangerBlocked = true; }
const pantryOk = afterAdd[0] === 800 && afterUse[0] === 600 && afterEmpty.length === 0 && strangerBlocked && (await qty()).length === 0;
console.log(`Запаси: ${afterAdd[0]} → ${afterUse[0]} → порожньо: ${afterEmpty.length === 0}, чужий заблокований: ${strangerBlocked}`);

// ---------- RLS на нових таблицях ----------

const { ownRows: receiptsA, insertBlocked: receiptBlocked } = await rlsCheck(
  "Чеки", "receipts",
  `insert into receipts (household_id, store_name, purchased_at, total, input_source) values ('${hid}', 'АТБ', '2026-11-01', 150.50, 'manual')`,
  `insert into receipts (household_id, store_name, purchased_at, total, input_source) values ('${hid}', 'АТБ', '2026-11-01', 100, 'manual')`
);

const rid = receiptsA[0]?.id;
const { ownRows: riA, otherRows: riB } = await rlsCheck(
  "Позиції чека", "receipt_items",
  `insert into receipt_items (receipt_id, household_id, product_id, raw_name, quantity, price) values ('${rid}', '${hid}', '${pid}', 'Гречка', 1, 45.90)`,
  null
);

const movA = await runAs(a, `select * from pantry_movements`);
const movB = await runAs(b, `select * from pantry_movements`);
console.log(`Рух складу RLS: власник ${movA.length}, сторонній ${movB.length}`);

const { ownRows: scansA, insertBlocked: scanBlocked } = await rlsCheck(
  "Скани", "incoming_scans",
  `insert into incoming_scans (household_id, sent_by, channel, input_type, status, mode, items) values ('${hid}', '${a}', 'telegram', 'receipt', 'pending', 'add', '[]'::jsonb)`,
  `insert into incoming_scans (household_id, sent_by, channel, input_type, mode, items) values ('${hid}', '${b}', 'web', 'text', 'add', '[]'::jsonb)`
);

const { ownRows: cbA, otherRows: cbB } = await rlsCheck(
  "Прив'язка каналу", "channel_bindings",
  `insert into channel_bindings (household_id, user_id, channel, external_id, link_code, link_code_expires_at) values ('${hid}', '${a}', 'telegram', '12345', 'ABC123', now() + interval '1 hour')`,
  null
);

// ---------- confirm_scan у режимі add: збільшує запас і створює чек ----------

await runAs(a, `delete from incoming_scans`);
await runAs(a, `delete from pantry_items`);
await runAs(a, `delete from receipts`); // cascade видалить receipt_items

const scanItems = JSON.stringify([
  { raw: "Гречка 1кг", productId: pid, name: "Гречка", category: "крупи", unit: "г", quantity: 1000, uncertain: false, price: 45.90 }
]);
await runAs(a, `insert into incoming_scans (household_id, sent_by, channel, input_type, status, mode, store_name, total, items)
  values ('${hid}', '${a}', 'telegram', 'receipt', 'pending', 'add', 'АТБ', 45.90, '${scanItems}'::jsonb)`);
const [{ id: testScanId }] = await runAs(a, `select id from incoming_scans where status = 'pending' limit 1`);

await db.exec(`grant usage on all sequences in schema public to authenticated;`);
await runAs(a, `select confirm_scan('${testScanId}')`);

const stockAfterConfirm = await runAs(a, `select quantity from pantry_items where product_id = '${pid}'`);
const receiptAfterConfirm = await runAs(a, `select * from receipts where scan_id = '${testScanId}'`);
const riAfterConfirm = await runAs(a, `select * from receipt_items where receipt_id = '${receiptAfterConfirm[0]?.id}'`);
const scanStatus = await runAs(a, `select status from incoming_scans where id = '${testScanId}'`);
const movAfterConfirm = await runAs(a, `select * from pantry_movements where scan_id = '${testScanId}'`);

// numeric з Postgres повертається рядком, тому порівнюємо з допуском
const nearly = (value, expected) => Math.abs(Number(value) - expected) < 0.005;

const confirmOk =
  nearly(stockAfterConfirm[0]?.quantity, 1000) &&
  receiptAfterConfirm.length === 1 &&
  nearly(receiptAfterConfirm[0]?.total, 45.90) &&
  riAfterConfirm.length === 1 &&
  scanStatus[0]?.status === "confirmed" &&
  movAfterConfirm.length === 1 &&
  nearly(movAfterConfirm[0]?.delta, 1000);

console.log(`confirm_scan(add): запас ${stockAfterConfirm[0]?.quantity}, чек ${receiptAfterConfirm.length}, позицій ${riAfterConfirm.length}, статус ${scanStatus[0]?.status}, рух ${movAfterConfirm.length} — ${confirmOk ? "OK" : "FAIL"}`);

let channelClosed = false;
try {
  const changed = await runAs(b, `update incoming_scans set store_name = 'чужий' where household_id = '${hid}' returning id`);
  const leakedScans = await runAs(b, `select id from incoming_scans where household_id = '${hid}'`);
  const leakedCodes = await runAs(b, `select link_code from channel_bindings where household_id = '${hid}'`);
  channelClosed = changed.length === 0 && leakedScans.length === 0 && leakedCodes.length === 0;
} catch (error) {
  console.error("channel closed", error.message);
}

let foreignConfirmBlocked = false;
await runAs(
  a,
  `insert into incoming_scans (household_id, sent_by, channel, input_type, status, mode, items) values ('${hid}', '${a}', 'telegram', 'voice', 'pending', 'add', '[]'::jsonb)`,
);
const [{ id: foreignId }] = await runAs(a, `select id from incoming_scans where input_type = 'voice' and status = 'pending' limit 1`);
try {
  await runAs(b, `select confirm_scan('${foreignId}')`);
} catch {
  foreignConfirmBlocked = true;
}
const foreignStatus = await runAs(a, `select status from incoming_scans where id = '${foreignId}'`);
foreignConfirmBlocked = foreignConfirmBlocked && foreignStatus[0]?.status === "pending";

let serviceConfirmed = false;
const serviceItems = JSON.stringify([
  { raw: "Хліб", productId: pid, name: "Хліб", category: "інше", unit: "шт", quantity: 1, uncertain: false, price: null },
]);
try {
  await db.exec(
    `insert into incoming_scans (household_id, sent_by, channel, input_type, status, mode, items) values ('${hid}', '${a}', 'telegram', 'text', 'pending', 'add', '${serviceItems}'::jsonb)`,
  );
  const [{ id: serviceId }] = (await db.query(`select id from incoming_scans where input_type = 'text' and status = 'pending' limit 1`)).rows;
  await db.exec(`select set_config('request.jwt.sub', '', false)`);
  await db.exec(`set role service_role`);
  await db.query(`select confirm_scan('${serviceId}')`);
  await db.exec(`reset role`);
  const serviceStatus = (await db.query(`select status from incoming_scans where id = '${serviceId}'`)).rows;
  serviceConfirmed = serviceStatus[0]?.status === "confirmed";
} catch (error) {
  console.error("service_role confirm", error.message);
  try {
    await db.exec(`reset role`);
  } catch {
    // роль уже скинуто
  }
}
console.log(`Чужа сім'я: читання ${channelClosed ? "закрито" : "ВІДКРИТО"}, confirm ${foreignConfirmBlocked ? "закрито" : "ПРОЙШОВ"}, service_role ${serviceConfirmed ? "OK" : "FAIL"}`);

// ---------- Підсумок ----------

const receiptsB = await runAs(b, `select * from receipts`);
const scansB = await runAs(b, `select * from incoming_scans`);

const newTablesOk =
  receiptsA.length === 1 && receiptsB.length === 0 && receiptBlocked &&
  riA.length === 1 && riB.length === 0 &&
  movB.length === 0 &&
  scansA.length === 1 && scansB.length === 0 && scanBlocked &&
  cbA.length === 1 && cbB.length === 0;

const pass = seenByA.length === 1 && seenByB.length === 0 && blocked && pantryOk && newTablesOk && confirmOk && channelClosed && foreignConfirmBlocked && serviceConfirmed;
console.log(`RLS: власник бачить ${seenByA.length}, сторонній бачить ${seenByB.length}, чужий запис ${blocked ? "заблоковано" : "ПРОЙШОВ"}`);
console.log(`Нові таблиці RLS: ${newTablesOk ? "OK" : "FAIL"}`);
console.log(`Підтвердження скану: ${confirmOk ? "OK" : "FAIL"}`);
await db.close();
process.exitCode = pass ? 0 : 1;
