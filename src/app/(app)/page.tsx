import React from "react";
import { Notice } from "@/components/Notice";
import { HomeScreen } from "@/components/home";
import { getContext } from "@/lib/context";
import { todayISO, weekDays, weekStart } from "@/lib/dates";
import { monthStart } from "@/lib/finance";
import {
  buildHomeModel,
  type DbMealEntry,
  type DbPantryRow,
  type DbShoppingItemRow,
} from "@/lib/home";
import { listIncomingScans } from "@/lib/scan/inbox";
import type { ProductInfo } from "@/lib/shopping";
import type { ReceiptItemInput, StoreInput, StoreProductInput } from "@/lib/prices";
import { loadFinance } from "./finance/load";

export default async function HomePage({
  searchParams,
}: {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const { supabase, householdId, family, portions } = await getContext();
  const today = todayISO();
  const currWeek = weekStart(today);
  const days = weekDays(currWeek);

  const [
    financeLoad,
    entriesRes,
    productsRes,
    pantryItemsRes,
    pantryHistRes,
    shoppingItemsRes,
    storesRes,
    storeProductsRes,
    receiptItemsRes,
    scansRes,
  ] = await Promise.all([
    loadFinance(supabase, householdId, "month", monthStart(today), today),
    supabase
      .from("meal_plan_entries")
      .select(
        "id, plan_date, meal_type, title, cooked_at, servings, recipes(id, title, cook_minutes, base_servings, recipe_ingredients(product_id, quantity, optional))",
      )
      .eq("household_id", householdId)
      .gte("plan_date", days[0])
      .lte("plan_date", days[6])
      .order("created_at"),
    supabase
      .from("products")
      .select("id, name, unit, category, is_staple, preferred_store_id")
      .order("name"),
    supabase
      .from("pantry_items")
      .select(
        "id, product_id, quantity, storage_zone, expires_at, products(id, name, category, unit, is_staple, preferred_store_id)",
      )
      .eq("household_id", householdId),
    supabase
      .from("pantry_movements")
      .select("product_id, delta")
      .eq("household_id", householdId)
      .gt("delta", 0),
    supabase
      .from("shopping_list_items")
      .select(
        "id, title, quantity, unit, store_id, checked, stocked_at, product_id, products(id, name, category, unit, preferred_store_id)",
      )
      .eq("household_id", householdId)
      .eq("week_start", currWeek)
      .order("created_at"),
    supabase
      .from("stores")
      .select("id, name, access, kind, visit_frequency, phone, url, notes, sort_order")
      .eq("household_id", householdId)
      .order("sort_order"),
    supabase.from("store_products").select("store_id, product_id, price, price_updated_at"),
    supabase
      .from("receipt_items")
      .select("id, receipt_id, product_id, raw_name, quantity, unit, price, created_at"),
    listIncomingScans(supabase, householdId),
  ]);

  const rawProducts = (productsRes.data ?? []) as {
    id: string;
    name: string;
    unit: string;
    category: string;
    is_staple: boolean;
    preferred_store_id: string | null;
  }[];

  const productMap = new Map<string, ProductInfo>(
    rawProducts.map((p) => [
      p.id,
      { unit: p.unit, isStaple: Boolean(p.is_staple), storeId: p.preferred_store_id },
    ]),
  );

  const productNameMap = new Map<string, string>(
    rawProducts.map((p) => [p.id, p.name]),
  );

  const stockMap = new Map<string, number>(
    ((pantryItemsRes.data ?? []) as { product_id: string; quantity: number | string }[]).map((i) => [
      i.product_id,
      Number(i.quantity),
    ]),
  );

  const historicalMaxMap = new Map<string, number>();
  for (const m of (pantryHistRes.data ?? []) as { product_id: string; delta: number | string }[]) {
    const pid = m.product_id;
    const d = Number(m.delta);
    const prev = historicalMaxMap.get(pid) ?? 0;
    if (d > prev) historicalMaxMap.set(pid, d);
  }

  const model = buildHomeModel({
    today,
    familyCount: family.length,
    portions,
    finance: {
      budget: financeLoad.budget,
      receipts: financeLoad.receipts,
      householdCount: financeLoad.householdCount,
    },
    menu: {
      entries: (entriesRes.data ?? []) as unknown as DbMealEntry[],
      products: productMap,
      names: productNameMap,
      stock: stockMap,
    },
    pantry: {
      items: (pantryItemsRes.data ?? []) as unknown as DbPantryRow[],
      historicalMaxMap,
    },
    shopping: {
      items: (shoppingItemsRes.data ?? []) as unknown as DbShoppingItemRow[],
      stores: (storesRes.data ?? []) as unknown as StoreInput[],
      storeProducts: (storeProductsRes.data ?? []) as unknown as StoreProductInput[],
      receipts: financeLoad.receipts.map((r) => ({
        id: r.id,
        store_id: null,
        store_name: r.storeName,
        purchased_at: r.purchasedAt,
        total: r.total,
        created_at: r.purchasedAt,
      })),
      receiptItems: (receiptItemsRes.data ?? []) as unknown as ReceiptItemInput[],
    },
    scans: {
      inboxScans: scansRes.ok ? scansRes.scans : [],
      now: new Date(),
    },
  });

  return (
    <>
      <Notice params={params} />
      <HomeScreen model={model} />
    </>
  );
}
