import { getContext } from "@/lib/context";
import { coerceNumber, loadWindow, readBudget, type FinanceLine, type FinanceReceipt, type PeriodKind } from "@/lib/finance";

type Client = Awaited<ReturnType<typeof getContext>>["supabase"];

type RawReceipt = {
  id: string;
  store_name: string | null;
  purchased_at: string;
  total: unknown;
  input_source: string;
  scan_id: string | null;
};

type RawItem = {
  id: string;
  receipt_id: string;
  price: unknown;
  quantity: unknown;
  unit: string | null;
  product_id: string | null;
  raw_name: string;
  products: { name: string; category: string } | { name: string; category: string }[] | null;
};

export type FinanceLoad = {
  error: string | null;
  budget: number | null;
  receipts: FinanceReceipt[];
  householdCount: number;
  storeNames: string[];
};

export async function loadFinance(supabase: Client, householdId: string, kind: PeriodKind, anchor: string, today: string): Promise<FinanceLoad> {
  const window = loadWindow(kind, anchor, today);
  const [budgetRes, receiptsRes, countRes, storesRes] = await Promise.all([
    supabase.from("households").select("monthly_budget").eq("id", householdId).maybeSingle(),
    supabase
      .from("receipts")
      .select("id, store_name, purchased_at, total, input_source, scan_id")
      .eq("household_id", householdId)
      .gte("purchased_at", window.start)
      .lte("purchased_at", window.end)
      .order("purchased_at", { ascending: false }),
    supabase.from("receipts").select("id", { count: "exact", head: true }).eq("household_id", householdId),
    supabase.from("stores").select("name").eq("household_id", householdId).order("sort_order"),
  ]);

  const error =
    budgetRes.error?.message ?? receiptsRes.error?.message ?? countRes.error?.message ?? storesRes.error?.message ?? null;
  if (error) {
    return { error, budget: null, receipts: [], householdCount: 0, storeNames: [] };
  }

  const receiptRows = (receiptsRes.data ?? []) as RawReceipt[];
  const ids = receiptRows.map((row) => row.id);
  const scanIds = [...new Set(receiptRows.map((row) => row.scan_id).filter((id): id is string => Boolean(id)))];
  const [items, scans] = await Promise.all([loadItems(supabase, householdId, ids), loadScans(supabase, householdId, scanIds)]);
  if (items.error || scans.error) {
    return { error: items.error ?? scans.error, budget: null, receipts: [], householdCount: 0, storeNames: [] };
  }

  const scanTypes = new Map(scans.rows.map((row) => [row.id, row.input_type]));
  const itemsByReceipt = groupItems(items.rows);
  return {
    error: null,
    budget: readBudget(budgetRes.data?.monthly_budget),
    receipts: receiptRows.map((row) => toReceipt(row, itemsByReceipt.get(row.id) ?? [], scanTypes)),
    householdCount: countRes.count ?? receiptRows.length,
    storeNames: ((storesRes.data ?? []) as { name: string }[]).map((store) => store.name).filter(Boolean),
  };
}

export async function loadReceipt(supabase: Client, householdId: string, id: string): Promise<{ error: string | null; receipt: FinanceReceipt | null }> {
  const { data, error } = await supabase
    .from("receipts")
    .select("id, store_name, purchased_at, total, input_source, scan_id")
    .eq("id", id)
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) return { error: error.message, receipt: null };
  if (!data) return { error: null, receipt: null };
  const row = data as RawReceipt;
  const [items, scans] = await Promise.all([
    loadItems(supabase, householdId, [row.id]),
    loadScans(supabase, householdId, row.scan_id ? [row.scan_id] : []),
  ]);
  if (items.error || scans.error) return { error: items.error ?? scans.error, receipt: null };
  const scanTypes = new Map(scans.rows.map((scan) => [scan.id, scan.input_type]));
  return { error: null, receipt: toReceipt(row, items.rows, scanTypes) };
}

function toReceipt(row: RawReceipt, items: readonly RawItem[], scanTypes: ReadonlyMap<string, string>): FinanceReceipt {
  return {
    id: row.id,
    purchasedAt: String(row.purchased_at).slice(0, 10),
    storeName: row.store_name,
    total: coerceNumber(row.total),
    inputSource: row.input_source,
    scanInputType: row.scan_id ? scanTypes.get(row.scan_id) ?? null : null,
    items: items.map(toLine),
  };
}

function toLine(row: RawItem): FinanceLine {
  const product = one(row.products);
  return {
    id: row.id,
    productId: row.product_id,
    productName: product?.name ?? null,
    category: product?.category ?? null,
    rawName: row.raw_name,
    quantity: coerceNumber(row.quantity),
    unit: row.unit,
    price: coerceNumber(row.price),
  };
}

function one<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function groupItems(rows: readonly RawItem[]): Map<string, RawItem[]> {
  const grouped = new Map<string, RawItem[]>();
  for (const row of rows) {
    const list = grouped.get(row.receipt_id) ?? [];
    list.push(row);
    grouped.set(row.receipt_id, list);
  }
  return grouped;
}

async function loadItems(supabase: Client, householdId: string, ids: readonly string[]) {
  return loadIn<RawItem>(ids, (chunk) =>
    supabase
      .from("receipt_items")
      .select("id, receipt_id, price, quantity, unit, product_id, raw_name, products(name, category)")
      .eq("household_id", householdId)
      .in("receipt_id", chunk)
      .order("created_at"),
  );
}

async function loadScans(supabase: Client, householdId: string, ids: readonly string[]) {
  return loadIn<{ id: string; input_type: string }>(ids, (chunk) =>
    supabase.from("incoming_scans").select("id, input_type").eq("household_id", householdId).in("id", chunk),
  );
}

async function loadIn<T>(ids: readonly string[], query: (chunk: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const rows: T[] = [];
  if (ids.length === 0) return { rows, error: null as string | null };
  for (let index = 0; index < ids.length; index += 100) {
    const result = await query([...ids.slice(index, index + 100)]);
    if (result.error) return { rows, error: result.error.message };
    rows.push(...((result.data ?? []) as T[]));
  }
  return { rows, error: null as string | null };
}
