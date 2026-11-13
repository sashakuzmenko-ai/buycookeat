import Link from "next/link";
import { getContext } from "@/lib/context";
import { Notice } from "@/components/Notice";
import { addDays, formatDate, parseWeekParam, weekDays } from "@/lib/dates";
import {
  StorePriceIndex,
  calculateItemEstimatedPrice,
  findStoreSavingsRecommendation,
  buildPriceComparisonTable,
  buildMonthlyStoreSummaries,
  currentMonthUk,
  type StoreInput,
  type ReceiptInput,
  type ReceiptItemInput,
  type StoreProductInput,
} from "@/lib/prices";
import { generateShopping, stockBought } from "./actions";
import { SummaryBanner } from "@/components/shopping/SummaryBanner";
import { ShoppingDesktopList, type StoreGroup } from "@/components/shopping/ShoppingDesktopList";
import { ShoppingMobileList } from "@/components/shopping/ShoppingMobileList";
import { PriceComparisonSection } from "@/components/shopping/PriceComparisonSection";
import { MonthlyStoresSection } from "@/components/shopping/MonthlyStoresSection";
import { AddShoppingItemDialog } from "@/components/shopping/AddShoppingItemDialog";
import { StoreManagementModal } from "@/components/shopping/StoreManagementModal";
import type { ShoppingItemViewData } from "@/components/shopping/ShoppingItemRow";

type RawItem = {
  id: string;
  title: string | null;
  quantity: number | null;
  unit: string | null;
  store_id: string | null;
  source: "plan" | "manual";
  checked: boolean;
  stocked_at: string | null;
  product_id: string | null;
  products: { id: string; name: string; category: string; unit: string; preferred_store_id: string | null } | null;
};

export default async function ShoppingPage({ searchParams }: PageProps<"/shopping">) {
  const params = await searchParams;
  const week = parseWeekParam(params.week);
  const days = weekDays(week);
  const { supabase } = await getContext();

  const [itemsRes, storesRes, storeProductsRes, receiptsRes, receiptItemsRes, productsRes] = await Promise.all([
    supabase
      .from("shopping_list_items")
      .select("id, title, quantity, unit, store_id, source, checked, stocked_at, product_id, products(id, name, category, unit, preferred_store_id)")
      .eq("week_start", week)
      .order("created_at"),
    supabase
      .from("stores")
      .select("id, name, access, kind, visit_frequency, phone, url, notes, sort_order")
      .order("sort_order"),
    supabase
      .from("store_products")
      .select("store_id, product_id, price, price_updated_at"),
    supabase
      .from("receipts")
      .select("id, store_id, store_name, purchased_at, total, created_at")
      .order("purchased_at", { ascending: false }),
    supabase
      .from("receipt_items")
      .select("id, receipt_id, product_id, raw_name, quantity, unit, price, created_at"),
    supabase
      .from("products")
      .select("id, name, unit"),
  ]);

  const rawItems = (itemsRes.data ?? []) as unknown as RawItem[];
  const stores = (storesRes.data ?? []) as StoreInput[];
  const storeProducts = (storeProductsRes.data ?? []) as StoreProductInput[];
  const receipts = (receiptsRes.data ?? []) as ReceiptInput[];
  const receiptItems = (receiptItemsRes.data ?? []) as ReceiptItemInput[];
  const products = (productsRes.data ?? []) as { id: string; name: string; unit: string }[];

  // 1. Створюємо індекс цін з пріоритетом чеків над store_products
  const priceIndex = new StorePriceIndex(stores, receipts, receiptItems, storeProducts);

  // 2. Рахуємо орієнтовну ціну для кожної позиції
  const viewItems: ShoppingItemViewData[] = rawItems.map((item) => {
    const productName = item.products?.name ?? item.title ?? "";
    const category = item.products?.category ?? "інше";
    const storeId = item.store_id ?? item.products?.preferred_store_id ?? null;
    const pricePerBasis = priceIndex.getPrice(storeId, item.product_id);
    const estimatedPrice = calculateItemEstimatedPrice(item.quantity, item.unit, pricePerBasis);

    return {
      id: item.id,
      title: item.title,
      quantity: item.quantity !== null ? Number(item.quantity) : null,
      unit: item.unit,
      store_id: item.store_id,
      checked: item.checked,
      stocked_at: item.stocked_at,
      product_id: item.product_id,
      productName,
      category,
      estimatedPrice,
    };
  });

  // 3. Сортування позицій: некуплені зверху, далі за назвою
  const sorted = [...viewItems].sort((a, b) => {
    if (a.checked !== b.checked) return Number(a.checked) - Number(b.checked);
    return a.productName.localeCompare(b.productName, "uk");
  });

  // 4. Групування за магазинами. Позиції без магазину — окрема група
  const groups: StoreGroup[] = [
    {
      storeId: null,
      storeName: "Без магазину",
      items: sorted.filter((i) => !i.store_id || !stores.some((s) => s.id === i.store_id)),
      estimatedSum: 0,
      hasPricedItems: false,
    },
    ...stores.map((s) => ({
      storeId: s.id,
      storeName: s.name,
      items: sorted.filter((i) => i.store_id === s.id),
      estimatedSum: 0,
      hasPricedItems: false,
    })),
  ]
    .map((g) => {
      const sum = g.items.reduce((acc, i) => acc + (i.estimatedPrice ?? 0), 0);
      const hasPriced = g.items.some((i) => i.estimatedPrice != null);
      return {
        ...g,
        estimatedSum: sum,
        hasPricedItems: hasPriced,
      };
    })
    .filter((g) => g.items.length > 0);

  // 5. Підсумки
  const totalCount = viewItems.length;
  const pricedCount = viewItems.filter((i) => i.estimatedPrice != null).length;
  const totalEstimatedSum = viewItems.reduce((acc, i) => acc + (i.estimatedPrice ?? 0), 0);
  const routeStores = stores.filter((s) => viewItems.some((i) => i.store_id === s.id));

  // 6. Підказка економії за чеками
  const recommendation = findStoreSavingsRecommendation(rawItems, stores, priceIndex);

  // 7. Порівняння «Де що дешевше»
  const priceComparison = buildPriceComparisonTable(stores, receipts, receiptItems, products);

  // 8. «Наші магазини · місяць»
  const monthName = currentMonthUk();
  const monthlySummaries = buildMonthlyStoreSummaries(stores, receipts, receiptItems);

  // 9. Стани для дій
  const toStock = rawItems.filter((i) => i.checked && !i.stocked_at && i.product_id && i.quantity !== null).length;
  const hasPlanItems = rawItems.some((i) => i.source === "plan");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Шапка розділу */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold text-shops">Магазини</div>
          <h1 className="m-0 font-unbounded font-bold text-2xl md:text-[28px] text-ink leading-tight">
            Покупки до неділі
          </h1>
          <div className="flex items-center gap-2 text-xs md:text-sm text-ink-2 mt-0.5">
            <span>
              {formatDate(days[0])} – {formatDate(days[6])}
            </span>
            <div className="flex items-center gap-1 ml-2">
              <Link
                className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-12 border border-line-strong bg-surface text-ink flex items-center justify-center text-sm font-semibold hover:bg-soft transition"
                href={`/shopping?week=${addDays(week, -7)}`}
                aria-label="Попередній тиждень"
              >
                ←
              </Link>
              <Link
                className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-12 border border-line-strong bg-surface text-ink flex items-center justify-center text-sm font-semibold hover:bg-soft transition"
                href={`/shopping?week=${addDays(week, 7)}`}
                aria-label="Наступний тиждень"
              >
                →
              </Link>
            </div>
          </div>
        </div>

        {/* Дії */}
        <div className="flex flex-wrap items-center gap-2">
          <AddShoppingItemDialog stores={stores} week={week} />

          <form action={generateShopping}>
            <input type="hidden" name="week" value={week} />
            <button
              type="submit"
              className="h-[44px] min-h-[44px] px-4 rounded-12 bg-brand text-white font-semibold text-[15px] hover:bg-menu-ink transition cursor-pointer"
            >
              {hasPlanItems ? "Перерахувати з меню" : "Зібрати з меню"}
            </button>
          </form>

          {toStock > 0 && (
            <form action={stockBought}>
              <input type="hidden" name="week" value={week} />
              <button
                type="submit"
                className="h-[44px] min-h-[44px] px-4 rounded-12 border border-brand text-brand bg-surface font-semibold text-[15px] hover:bg-menu-tint transition cursor-pointer"
              >
                Перенести куплене на склад ({toStock})
              </button>
            </form>
          )}

          <StoreManagementModal stores={stores} week={week} />
        </div>
      </div>

      <Notice params={params} />

      {/* Підсумок: кількість, орієнтовна сума, маршрут та рекомендація економії */}
      <SummaryBanner
        totalCount={totalCount}
        pricedCount={pricedCount}
        totalSum={totalEstimatedSum}
        routeStores={routeStores}
        recommendation={recommendation}
        week={week}
      />

      {/* Головна зона списку покупок та аналітики цін */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
        {/* Ліва колонка: списки покупок */}
        <div className="space-y-4">
          {/* Десктопний вигляд: картки магазинів у сітці */}
          <div className="hidden md:block">
            <ShoppingDesktopList groups={groups} />
          </div>

          {/* Мобільний вигляд: вкладки магазинів і групування за категорією */}
          <div className="block md:hidden">
            <ShoppingMobileList groups={groups} />
          </div>

          <div className="pt-2 text-xs text-ink-2">
            Кількості — на всю сім&apos;ю, мінус те, що вже є в запасах; базові запаси (сіль, олія) не додаються.
          </div>
        </div>

        {/* Права колонка: «Де що дешевше» та «Наші магазини · місяць» */}
        <div className="space-y-6">
          <PriceComparisonSection data={priceComparison} />
          <MonthlyStoresSection monthName={monthName} summaries={monthlySummaries} />
        </div>
      </div>
    </div>
  );
}
