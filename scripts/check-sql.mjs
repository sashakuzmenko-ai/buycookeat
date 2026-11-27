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

await runAs(a, `insert into channel_bindings (household_id, user_id, channel, external_id, title, chat_type, linked_at) values ('${hid}', '${a}', 'telegram', '20001', 'Родина', 'group', now())`);
await runAs(a, `insert into channel_bindings (household_id, user_id, channel, external_id, title, chat_type, linked_at) values ('${hid}', '${a}', 'telegram', '20002', 'Оля', 'private', now())`);
const multiBindings = await runAs(
  a,
  `select id, title, chat_type from channel_bindings where household_id = '${hid}' and user_id = '${a}' and linked_at is not null order by external_id`,
);
const multiBindingsOk =
  multiBindings.length >= 2 &&
  multiBindings.some((row) => row.title === "Родина" && row.chat_type === "group") &&
  multiBindings.some((row) => row.title === "Оля" && row.chat_type === "private");
console.log(
  `Два Telegram-чати на одного користувача: ${multiBindings.length} рядків, title/chat_type — ${multiBindingsOk ? "OK" : "FAIL"}`,
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

// ---------- Партії: різні терміни, FEFO, інвентаризація ----------

const dayOf = (value) => {
  if (value == null) return null;
  const text = value instanceof Date ? value.toISOString() : String(value);
  return text.slice(0, 10);
};
const adjustProduct = (productId, delta) =>
  runAs(a, `select adjust_pantry('${hid}', '[{"product_id":"${productId}","delta":${delta}}]'::jsonb)`);
async function batchesOf(productId) {
  const rows = await runAs(
    a,
    `select quantity, expires_at::text as expires_at, label from pantry_items
     where product_id = '${productId}'
     order by expires_at asc nulls last, created_at asc, id asc`,
  );
  return rows.map((row) => ({ qty: Number(row.quantity), expires: row.expires_at ? dayOf(row.expires_at) : null, label: row.label }));
}
async function insertScan(mode, items) {
  const payload = JSON.stringify(items);
  const rows = await runAs(
    a,
    `insert into incoming_scans (household_id, sent_by, channel, input_type, status, mode, items)
     values ('${hid}', '${a}', 'web', 'text', 'pending', '${mode}', $j$${payload}$j$::jsonb)
     returning id`,
  );
  return rows[0].id;
}
async function seedMilkDates() {
  await runAs(a, `delete from pantry_items where product_id = '${milkId}'`);
  await runAs(
    a,
    `insert into pantry_items (household_id, product_id, quantity, expires_at, label, created_at) values
      ('${hid}', '${milkId}', 1, '2026-12-05', 'Рання', '2026-11-01'),
      ('${hid}', '${milkId}', 1, '2026-12-10', 'Пізня', '2026-11-02')`,
  );
}

const [{ milk: milkId }] = await runAs(
  a,
  `insert into products (household_id, name, unit) values ('${hid}', 'Молоко партія', 'мл') returning id as milk`,
);
const [{ bread: breadId }] = await runAs(
  a,
  `insert into products (household_id, name, unit) values ('${hid}', 'Хліб партія', 'шт') returning id as bread`,
);

await runAs(a, `delete from pantry_items where product_id = '${milkId}'`);
const addEarly = await insertScan("add", [{ productId: milkId, quantity: 1, expiresAt: "2026-12-05", label: "Рання" }]);
await runAs(a, `select confirm_scan('${addEarly}')`);
const addLate = await insertScan("add", [{ productId: milkId, quantity: 2, expiresAt: "2026-12-10", label: "Пізня" }]);
await runAs(a, `select confirm_scan('${addLate}')`);
const addedBatches = await batchesOf(milkId);
const twoAddsOk =
  addedBatches.length === 2 &&
  nearly(addedBatches[0].qty, 1) &&
  addedBatches[0].expires === "2026-12-05" &&
  nearly(addedBatches[1].qty, 2) &&
  addedBatches[1].expires === "2026-12-10";

await runAs(a, `delete from pantry_items where product_id = '${milkId}'`);
const mergedScan = await insertScan("add", [
  { productId: milkId, quantity: 1, expiresAt: "2026-12-05", label: "Тасама" },
  { productId: milkId, quantity: 2, expiresAt: "2026-12-05", label: "Тасама" },
]);
await runAs(a, `select confirm_scan('${mergedScan}')`);
const mergedBatches = await batchesOf(milkId);
const mergedMoves = await runAs(a, `select count(*)::int as n from pantry_movements where scan_id = '${mergedScan}' and source = 'scan'`);
const mergeWithinScanOk = mergedBatches.length === 1 && nearly(mergedBatches[0].qty, 3) && Number(mergedMoves[0].n) === 2;

await runAs(a, `delete from pantry_items where product_id = '${milkId}'`);
await runAs(
  a,
  `insert into pantry_items (household_id, product_id, quantity, expires_at, label, created_at) values
    ('${hid}', '${milkId}', 1, '2026-12-05', 'д05', '2026-11-01'),
    ('${hid}', '${milkId}', 1, '2026-12-10', 'д10', '2026-11-02'),
    ('${hid}', '${milkId}', 1, null, 'стара', '2026-11-03'),
    ('${hid}', '${milkId}', 1, null, 'нова', '2026-11-04')`,
);
const labelsOf = async () => (await batchesOf(milkId)).map((row) => row.label).join(",");
await adjustProduct(milkId, -1);
const fefo1 = await labelsOf();
await adjustProduct(milkId, -1);
const fefo2 = await labelsOf();
await adjustProduct(milkId, -1);
const fefo3 = await labelsOf();
await adjustProduct(milkId, -1);
const fefo4 = await labelsOf();
const fefoOrderOk = fefo1 === "д10,стара,нова" && fefo2 === "стара,нова" && fefo3 === "нова" && fefo4 === "";

await runAs(a, `delete from pantry_items where product_id = '${milkId}'`);
await runAs(
  a,
  `insert into pantry_items (household_id, product_id, quantity, expires_at, label, created_at) values
    ('${hid}', '${milkId}', 2, '2026-12-05', 'д05', '2026-11-01'),
    ('${hid}', '${milkId}', 2, '2026-12-10', 'д10', '2026-11-02')`,
);
await adjustProduct(milkId, -3);
const overflow = await batchesOf(milkId);
const overflowOk = overflow.length === 1 && overflow[0].label === "д10" && nearly(overflow[0].qty, 1);

await runAs(a, `delete from pantry_items where product_id = '${milkId}'`);
await runAs(
  a,
  `insert into pantry_items (household_id, product_id, quantity, expires_at, label) values
    ('${hid}', '${milkId}', 1, '2026-12-05', 'д05')`,
);
await adjustProduct(milkId, -5);
const afterOver = await batchesOf(milkId);
const negativeRows = await runAs(a, `select count(*)::int as n from pantry_items where quantity < 0`);
const overshootOk = afterOver.length === 0 && Number(negativeRows[0].n) === 0;

await runAs(a, `delete from pantry_items where product_id = '${milkId}'`);
await runAs(a, `delete from pantry_movements where product_id = '${milkId}'`);
const setSumScan = await insertScan("set", [
  { productId: milkId, quantity: 1, expiresAt: "2026-12-05", label: "А" },
  { productId: milkId, quantity: 1, expiresAt: "2026-12-10", label: "Б" },
]);
await runAs(a, `select confirm_scan('${setSumScan}')`);
const setSumRows = await batchesOf(milkId);
const setSumMoves = await runAs(a, `select delta, source from pantry_movements where scan_id = '${setSumScan}'`);
const setSumOk =
  setSumRows.length === 2 &&
  nearly(setSumRows.reduce((sum, row) => sum + row.qty, 0), 2) &&
  setSumMoves.length === 1 &&
  setSumMoves[0].source === "inventory" &&
  nearly(setSumMoves[0].delta, 2);

await seedMilkDates();
const setKeepLate = await insertScan("set", [{ productId: milkId, quantity: 1 }]);
await runAs(a, `select confirm_scan('${setKeepLate}')`);
const keptLate = await batchesOf(milkId);
const setKeepLateOk =
  keptLate.length === 1 && keptLate[0].expires === "2026-12-10" && keptLate[0].label === "Пізня" && nearly(keptLate[0].qty, 1);
const setKeepLateDelta = await runAs(a, `select delta from pantry_movements where scan_id = '${setKeepLate}'`);
const setKeepLateMoveOk = setKeepLateDelta.length === 1 && nearly(setKeepLateDelta[0].delta, -1);

await seedMilkDates();
const setKeepBoth = await insertScan("set", [{ productId: milkId, quantity: 2 }]);
await runAs(a, `select confirm_scan('${setKeepBoth}')`);
const keptBoth = await batchesOf(milkId);
const setKeepBothOk =
  keptBoth.length === 2 &&
  keptBoth.some((row) => row.expires === "2026-12-05" && row.label === "Рання" && nearly(row.qty, 1)) &&
  keptBoth.some((row) => row.expires === "2026-12-10" && row.label === "Пізня" && nearly(row.qty, 1));

await seedMilkDates();
const setExtra = await insertScan("set", [{ productId: milkId, quantity: 3 }]);
await runAs(a, `select confirm_scan('${setExtra}')`);
const extraRows = await batchesOf(milkId);
const setExtraOk =
  extraRows.length === 3 &&
  nearly(extraRows.reduce((sum, row) => sum + row.qty, 0), 3) &&
  extraRows.some((row) => row.expires === "2026-12-05" && row.label === "Рання") &&
  extraRows.some((row) => row.expires === "2026-12-10" && row.label === "Пізня") &&
  extraRows.some((row) => row.expires === null && nearly(row.qty, 1));

await runAs(a, `delete from pantry_items where product_id = '${milkId}'`);
await runAs(
  a,
  `insert into pantry_items (household_id, product_id, quantity, expires_at, label, created_at) values
    ('${hid}', '${milkId}', 3, '2026-12-10', 'Пізня', '2026-11-02')`,
);
const setPartial = await insertScan("set", [{ productId: milkId, quantity: 1 }]);
await runAs(a, `select confirm_scan('${setPartial}')`);
const partialRows = await batchesOf(milkId);
const setPartialOk =
  partialRows.length === 1 && partialRows[0].expires === "2026-12-10" && partialRows[0].label === "Пізня" && nearly(partialRows[0].qty, 1);

await runAs(a, `delete from pantry_items where product_id = '${milkId}'`);
await runAs(
  a,
  `insert into pantry_items (household_id, product_id, quantity, label, created_at) values
    ('${hid}', '${milkId}', 1, 'Чужа', '2026-11-20'),
    ('${hid}', '${milkId}', 1, 'Своя', '2026-11-01')`,
);
const setPrefer = await insertScan("set", [{ productId: milkId, quantity: 1, label: "Своя" }]);
await runAs(a, `select confirm_scan('${setPrefer}')`);
const preferred = await batchesOf(milkId);
const setPreferOk = preferred.length === 1 && preferred[0].label === "Своя" && preferred[0].expires === null;

await seedMilkDates();
await runAs(a, `delete from pantry_items where product_id = '${breadId}'`);
await runAs(a, `insert into pantry_items (household_id, product_id, quantity) values ('${hid}', '${breadId}', 7)`);
const setMixed = await insertScan("set", [
  { productId: milkId, quantity: 1, expiresAt: "2026-12-10", label: "Пізня" },
  { productId: milkId, quantity: 1 },
]);
await runAs(a, `select confirm_scan('${setMixed}')`);
const mixedMilk = await batchesOf(milkId);
const mixedBread = await batchesOf(breadId);
const mixedMoves = await runAs(a, `select product_id::text as product_id, delta, source from pantry_movements where scan_id = '${setMixed}'`);
const setMixedOk =
  mixedMilk.length === 2 &&
  nearly(mixedMilk.reduce((sum, row) => sum + row.qty, 0), 2) &&
  mixedMilk.some((row) => row.expires === "2026-12-05" && row.label === "Рання" && nearly(row.qty, 1)) &&
  mixedMilk.some((row) => row.expires === "2026-12-10" && row.label === "Пізня" && nearly(row.qty, 1)) &&
  mixedBread.length === 1 &&
  nearly(mixedBread[0].qty, 7) &&
  mixedMoves.length === 1 &&
  mixedMoves[0].source === "inventory" &&
  mixedMoves[0].product_id === milkId &&
  nearly(mixedMoves[0].delta, 0);

await runAs(a, `delete from pantry_items`);
await runAs(a, `insert into pantry_items (household_id, product_id, quantity) values ('${hid}', '${pid}', 4)`);
const legacy = await runAs(a, `select quantity, label from pantry_items where product_id = '${pid}'`);
const legacyReadOk = legacy.length === 1 && nearly(legacy[0].quantity, 4) && legacy[0].label == null;
await runAs(
  a,
  `insert into pantry_items (household_id, product_id, quantity, expires_at, label, created_at) values
    ('${hid}', '${pid}', 1, '2026-12-01', 'Свіжа', '2026-11-01')`,
);
await adjust(a, -1);
const legacyLeft = await batchesOf(pid);
const legacyFefoOk = legacyLeft.length === 1 && legacyLeft[0].label == null && nearly(legacyLeft[0].qty, 4);
await adjust(a, 1);
const legacyAdded = await batchesOf(pid);
const oldFormatOk = legacyAdded.length === 1 && nearly(legacyAdded[0].qty, 5);
let secondBatchOk = false;
try {
  await runAs(
    a,
    `insert into pantry_items (household_id, product_id, quantity, expires_at) values ('${hid}', '${pid}', 2, '2026-12-20')`,
  );
  secondBatchOk = (await batchesOf(pid)).length === 2;
} catch (error) {
  console.error("друга партія", error.message);
}
const uniqueRows = (
  await db.query(
    `select conname from pg_constraint where conrelid = 'public.pantry_items'::regclass and contype = 'u'`,
  )
).rows;
const uniqueGone = !uniqueRows.some((row) => String(row.conname).includes("household_id"));

// У робочій базі ролі API працюють із safeupdate: DELETE/UPDATE без WHERE відхиляються.
// PGlite цього розширення не має, тому перевіряємо тіла функцій статично.
// Тимчасові таблиці в пуловому з'єднанні переживають запит і належать першій ролі.
const functions = (
  await db.query(
    `select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`,
  )
).rows;
const unsafe = [];
for (const { proname, prosrc } of functions) {
  const body = String(prosrc).replace(/--[^\n]*/g, " ");
  for (const [statement] of body.matchAll(/\b(?:delete\s+from|update\s+[\w.]+(?:\s+(?:as\s+)?\w+)?\s+set)\b[^;]*;/gi)) {
    if (!/\bwhere\b/i.test(statement)) unsafe.push(`${proname}: без WHERE`);
  }
  if (/\bcreate\s+(?:temp|temporary)\b/i.test(body)) unsafe.push(`${proname}: тимчасова таблиця`);
}
const safeSqlOk = unsafe.length === 0;

// Інвентаризацію підтверджують і застосунок, і бот — по черзі в одному з'єднанні.
await seedMilkDates();
const setByUser = await insertScan("set", [{ productId: milkId, quantity: 2 }]);
await runAs(a, `select confirm_scan('${setByUser}')`);
const setByBot = await insertScan("set", [{ productId: milkId, quantity: 1 }]);
let botSetOk = false;
try {
  await db.exec(`select set_config('request.jwt.sub', '', false)`);
  await db.exec(`set role service_role`);
  await db.query(`select confirm_scan('${setByBot}')`);
  botSetOk = true;
} catch (error) {
  console.error("інвентаризація ботом", error.message);
} finally {
  await db.exec(`reset role`);
}
botSetOk = botSetOk && (await batchesOf(milkId)).map((row) => row.label).join(",") === "Пізня";

// Без назви в позиції лишаються найсвіжіші партії, а не перша безіменна.
await runAs(a, `delete from pantry_items where product_id = '${milkId}'`);
await runAs(
  a,
  `insert into pantry_items (household_id, product_id, quantity, expires_at, label) values
    ('${hid}', '${milkId}', 1, '2026-12-05', null),
    ('${hid}', '${milkId}', 1, '2026-12-10', 'Пізня')`,
);
const setNoLabel = await insertScan("set", [{ productId: milkId, quantity: 1, label: "" }]);
await runAs(a, `select confirm_scan('${setNoLabel}')`);
const noLabelRows = await batchesOf(milkId);
const noLabelOk = noLabelRows.length === 1 && noLabelRows[0].expires === "2026-12-10";

// Позиція з терміном успадковує зону партії, яку вона підтверджує.
const zonesOf = async () =>
  (await runAs(a, `select storage_zone from pantry_items where product_id = '${milkId}' order by storage_zone`)).map(
    (row) => row.storage_zone,
  );
await runAs(a, `delete from pantry_items where product_id = '${milkId}'`);
await runAs(
  a,
  `insert into pantry_items (household_id, product_id, quantity, expires_at, label, storage_zone, brand) values
    ('${hid}', '${milkId}', 2, '2026-12-05', 'Холодна', 'fridge', 'Ферма')`,
);
const setZone = await insertScan("set", [{ productId: milkId, quantity: 1, expiresAt: "2026-12-05" }]);
await runAs(a, `select confirm_scan('${setZone}')`);
const zoneRows = await runAs(
  a,
  `select quantity, storage_zone, label, brand from pantry_items where product_id = '${milkId}'`,
);
const setZoneOk =
  zoneRows.length === 1 &&
  nearly(zoneRows[0].quantity, 1) &&
  zoneRows[0].storage_zone === "fridge" &&
  zoneRows[0].label === "Холодна" &&
  zoneRows[0].brand === "Ферма";

// Надходження без зони (покупка, зняття «приготовано») лягає туди, де продукт уже лежить.
await adjustProduct(milkId, 1);
const addedZones = await zonesOf();
const addZoneOk = addedZones.length === 2 && addedZones.every((zone) => zone === "fridge");

console.log(
  `Безпека SQL ${safeSqlOk ? "OK" : `FAIL (${unsafe.join("; ")})`}, веб і бот ${botSetOk ? "OK" : "FAIL"}, без назви ${noLabelOk ? "OK" : "FAIL"}, зона інвентаризації ${setZoneOk ? "OK" : "FAIL"}, зона надходження ${addZoneOk ? "OK" : "FAIL"}`,
);

const batchesOk =
  safeSqlOk &&
  botSetOk &&
  noLabelOk &&
  setZoneOk &&
  addZoneOk &&
  twoAddsOk &&
  mergeWithinScanOk &&
  fefoOrderOk &&
  overflowOk &&
  overshootOk &&
  setSumOk &&
  setKeepLateOk &&
  setKeepLateMoveOk &&
  setKeepBothOk &&
  setExtraOk &&
  setPartialOk &&
  setPreferOk &&
  setMixedOk &&
  legacyReadOk &&
  legacyFefoOk &&
  oldFormatOk &&
  secondBatchOk &&
  uniqueGone;
console.log(
  `Партії: два скани ${twoAddsOk ? "OK" : "FAIL"}, злиття в скані ${mergeWithinScanOk ? "OK" : "FAIL"}, FEFO ${fefoOrderOk ? `${fefo1} → ${fefo2} → ${fefo3} → порожньо` : `FAIL (${fefo1} | ${fefo2} | ${fefo3} | ${fefo4})`}, перелив ${overflowOk ? "OK" : "FAIL"}, надлишок ${overshootOk ? "OK" : "FAIL"}`,
);
console.log(
  `Інвентаризація: сума ${setSumOk ? "OK" : "FAIL"}, без терміну 1/2/3 ${setKeepLateOk && setKeepBothOk && setExtraOk ? "OK" : "FAIL"}, частково ${setPartialOk ? "OK" : "FAIL"}, назва ${setPreferOk ? "OK" : "FAIL"}, без подвійного обліку ${setMixedOk ? "OK" : "FAIL"}, рух ${setKeepLateMoveOk ? "OK" : "FAIL"}`,
);
console.log(
  `Сумісність: старий рядок ${legacyReadOk ? "OK" : "FAIL"}, FEFO бачить ${legacyFefoOk ? "OK" : "FAIL"}, старий формат ${oldFormatOk ? "OK" : "FAIL"}, друга партія ${secondBatchOk ? "OK" : "FAIL"}, unique знято ${uniqueGone ? "OK" : "FAIL"}`,
);

// ---------- Підсумок ----------

const receiptsB = await runAs(b, `select * from receipts`);
const scansB = await runAs(b, `select * from incoming_scans`);

const newTablesOk =
  receiptsA.length === 1 && receiptsB.length === 0 && receiptBlocked &&
  riA.length === 1 && riB.length === 0 &&
  movB.length === 0 &&
  scansA.length === 1 && scansB.length === 0 && scanBlocked &&
  cbA.length === 1 && cbB.length === 0;

const pass =
  seenByA.length === 1 &&
  seenByB.length === 0 &&
  blocked &&
  pantryOk &&
  newTablesOk &&
  multiBindingsOk &&
  confirmOk &&
  channelClosed &&
  foreignConfirmBlocked &&
  serviceConfirmed &&
  batchesOk;
console.log(`RLS: власник бачить ${seenByA.length}, сторонній бачить ${seenByB.length}, чужий запис ${blocked ? "заблоковано" : "ПРОЙШОВ"}`);
console.log(`Нові таблиці RLS: ${newTablesOk ? "OK" : "FAIL"}`);
console.log(`Підтвердження скану: ${confirmOk ? "OK" : "FAIL"}`);
await db.close();
process.exitCode = pass ? 0 : 1;
