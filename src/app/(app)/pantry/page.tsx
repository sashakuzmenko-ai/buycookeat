import { getContext } from "@/lib/context";
import { Notice } from "@/components/Notice";
import { todayISO, weekStart, weekDays } from "@/lib/dates";
import { type PlanLine, formatQty } from "@/lib/shopping";
import {
  type PantryItemView,
  type StorageZone,
  type MovementInput,
  calculateScalePercent,
  isLowStock,
  isExpiringSoon,
  determineItemState,
  formatExpiryNote,
  calculateWeekSufficiency,
  formatMovements,
} from "@/lib/pantry";
import { PantryScreen } from "@/components/pantry/PantryScreen";

type PantryPageProps = {
  readonly searchParams: Promise<{
    readonly [key: string]: string | string[] | undefined;
  }>;
};

type DbPantryItem = {
  id: string;
  product_id: string;
  quantity: number;
  storage_zone: string;
  expires_at: string | null;
  products: { name: string; category: string; unit: string } | null;
};

type DbUpcomingRow = {
  servings: number | null;
  recipes: {
    base_servings: number;
    recipe_ingredients: { product_id: string; quantity: number; optional: boolean }[];
  } | null;
};

export default async function PantryPage({ searchParams }: PantryPageProps) {
  const { supabase, householdId, portions } = await getContext();
  const today = todayISO();
  const startOfToday = `${today}T00:00:00+02:00`;
  const currWeekStart = weekStart(today);
  const remainingDays = weekDays(currWeekStart).filter((d) => d >= today);

  const [itemsRes, productsRes, movementsRes, histMovementsRes, upcomingRes] = await Promise.all([
    supabase
      .from("pantry_items")
      .select("id, product_id, quantity, storage_zone, expires_at, products(name, category, unit)")
      .eq("household_id", householdId),
    supabase
      .from("products")
      .select("id, name, unit, category, is_staple, preferred_store_id")
      .order("name"),
    supabase
      .from("pantry_movements")
      .select(`
        id,
        product_id,
        delta,
        source,
        scan_id,
        meal_plan_entry_id,
        created_at,
        products(name, unit),
        incoming_scans(store_name, input_type, channel),
        meal_plan_entries(recipes(title))
      `)
      .eq("household_id", householdId)
      .gte("created_at", startOfToday)
      .order("created_at", { ascending: false }),
    supabase
      .from("pantry_movements")
      .select("product_id, delta")
      .eq("household_id", householdId)
      .gt("delta", 0),
    supabase
      .from("meal_plan_entries")
      .select("servings, recipes(base_servings, recipe_ingredients(product_id, quantity, optional))")
      .eq("household_id", householdId)
      .in("plan_date", remainingDays)
      .is("cooked_at", null)
      .not("recipe_id", "is", null),
  ]);

  const products = productsRes.data ?? [];
  const productMap = new Map(
    products.map((p) => [
      p.id,
      {
        unit: p.unit,
        isStaple: Boolean(p.is_staple),
        storeId: p.preferred_store_id,
        name: p.name,
      },
    ]),
  );

  const historicalMaxMap = new Map<string, number>();
  for (const m of histMovementsRes.data ?? []) {
    const pid = m.product_id;
    const d = Number(m.delta);
    const prev = historicalMaxMap.get(pid) ?? 0;
    if (d > prev) historicalMaxMap.set(pid, d);
  }

  const rawItems = (itemsRes.data ?? []) as unknown as DbPantryItem[];
  const stockMap = new Map<string, number>();
  for (const item of rawItems) {
    stockMap.set(item.product_id, Number(item.quantity));
  }

  const planLines: PlanLine[] = ((upcomingRes.data ?? []) as unknown as DbUpcomingRow[])
    .filter((r) => r.recipes)
    .map((r) => ({
      servings: r.servings === null ? null : Number(r.servings),
      baseServings: Number(r.recipes!.base_servings),
      ingredients: (r.recipes!.recipe_ingredients ?? []).map((ing) => ({
        productId: ing.product_id,
        quantity: Number(ing.quantity),
        optional: Boolean(ing.optional),
      })),
    }));

  const sufficiency = calculateWeekSufficiency(planLines, stockMap, productMap, portions);

  const items: PantryItemView[] = rawItems
    .map((item) => {
      const qty = Number(item.quantity);
      const unit = item.products?.unit ?? "г";
      const name = item.products?.name ?? "Продукт";
      const category = item.products?.category ?? "інше";
      const scalePercent = calculateScalePercent(
        qty,
        unit,
        historicalMaxMap.get(item.product_id),
      );
      const isLow = isLowStock(scalePercent);
      const isExpiring = isExpiringSoon(item.expires_at, today);
      const state = determineItemState(isExpiring, isLow);
      const note =
        isExpiring && item.expires_at
          ? formatExpiryNote(item.expires_at, today)
          : isLow
            ? "Мало"
            : null;

      return {
        id: item.id,
        productId: item.product_id,
        name,
        category,
        unit,
        quantity: qty,
        formattedQty: formatQty(qty, unit),
        storageZone: ((item.storage_zone as StorageZone) || "pantry"),
        expiresAt: item.expires_at,
        scalePercent,
        isLow,
        isExpiring,
        state,
        note,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "uk"));

  const movements = formatMovements((movementsRes.data ?? []) as unknown as MovementInput[]);

  return (
    <PantryScreen
      items={items}
      products={products}
      movements={movements}
      sufficiency={sufficiency}
      notice={<Notice params={await searchParams} />}
    />
  );
}
