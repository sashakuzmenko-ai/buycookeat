import Link from "next/link";
import { getContext } from "@/lib/context";
import { Notice } from "@/components/Notice";
import { addDays, formatDate, parseWeekParam, weekDays } from "@/lib/dates";
import { formatQty } from "@/lib/shopping";
import { addShoppingItem, deleteRow, generateShopping, stockBought, toggleShoppingItem } from "../actions";

type Item = {
  id: string;
  title: string | null;
  quantity: number | null;
  unit: string | null;
  store_id: string | null;
  source: "plan" | "manual";
  checked: boolean;
  stocked_at: string | null;
  product_id: string | null;
  products: { name: string; category: string } | null;
};
type Store = { id: string; name: string; access: string; visit_frequency: string };

const ACCESS: Record<string, string> = { walk: "пішки", drive: "їхати", delivery: "доставка" };
const FREQUENCY: Record<string, string> = { daily: "можна щодня", weekly: "раз на тиждень", rare: "зрідка" };

export default async function ShoppingPage({ searchParams }: PageProps<"/shopping">) {
  const params = await searchParams;
  const week = parseWeekParam(params.week);
  const days = weekDays(week);
  const { supabase } = await getContext();

  const [itemsRes, storesRes] = await Promise.all([
    supabase
      .from("shopping_list_items")
      .select("id, title, quantity, unit, store_id, source, checked, stocked_at, product_id, products(name, category)")
      .eq("week_start", week)
      .order("created_at"),
    supabase.from("stores").select("id, name, access, visit_frequency").order("sort_order"),
  ]);
  const items = (itemsRes.data ?? []) as unknown as Item[];
  const stores = (storesRes.data ?? []) as Store[];

  const name = (i: Item) => i.products?.name ?? i.title ?? "";
  const sorted = [...items].sort(
    (a, b) =>
      Number(a.checked) - Number(b.checked) ||
      (a.products?.category ?? "яяя").localeCompare(b.products?.category ?? "яяя", "uk") ||
      name(a).localeCompare(name(b), "uk"),
  );
  // спершу «найближчий магазин», далі магазини в порядку з налаштувань
  const groups: { store: Store | null; items: Item[] }[] = [
    { store: null as Store | null, items: sorted.filter((i) => !i.store_id || !stores.some((s) => s.id === i.store_id)) },
    ...stores.map((store) => ({ store, items: sorted.filter((i) => i.store_id === store.id) })),
  ].filter((g) => g.items.length > 0);
  const left = items.filter((i) => !i.checked).length;
  const toStock = items.filter((i) => i.checked && !i.stocked_at && i.product_id && i.quantity !== null).length;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Список покупок</h1>
          <p className="text-sm text-stone-600">
            {formatDate(days[0])} – {formatDate(days[6])}
            {items.length > 0 && ` · залишилось ${left} з ${items.length}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="btn-secondary" href={`/shopping?week=${addDays(week, -7)}`} aria-label="Попередній тиждень">←</Link>
          <Link className="btn-secondary" href={`/shopping?week=${addDays(week, 7)}`} aria-label="Наступний тиждень">→</Link>
        </div>
      </div>

      <Notice params={params} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <form action={generateShopping}>
          <input type="hidden" name="week" value={week} />
          <button className="btn">{items.some((i) => i.source === "plan") ? "Перерахувати з меню" : "Зібрати з меню"}</button>
        </form>
        {toStock > 0 && (
          <form action={stockBought}>
            <input type="hidden" name="week" value={week} />
            <button className="btn-secondary border-brand-500 text-brand-700">Перенести куплене в запаси ({toStock})</button>
          </form>
        )}
        <Link className="btn-secondary" href={`/menu?week=${week}`}>← Меню</Link>
        <span className="basis-full text-xs text-stone-500">
          Кількості — на всю сім&apos;ю, мінус те, що вже є в запасах; базові запаси (сіль, олія) не додаються.
        </span>
      </div>

      {groups.length === 0 && (
        <p className="card mb-4 text-sm text-stone-600">
          Список порожній. Заповніть меню на тиждень і натисніть «Зібрати з меню».
        </p>
      )}

      <div className="space-y-4">
        {groups.map(({ store, items: list }) => (
          <section key={store?.id ?? "nearby"} className="card">
            <h2 className="h2 mb-2 flex items-baseline justify-between gap-2">
              {store?.name ?? "Найближчий магазин"}
              <span className="text-xs font-normal text-stone-500">
                {store ? `${ACCESS[store.access]} · ${FREQUENCY[store.visit_frequency]}` : "будь-який поруч, можна щодня"}
              </span>
            </h2>
            <ul className="divide-y divide-stone-100">
              {list.map((item) => (
                <li key={item.id} className="flex items-center gap-2 py-1">
                  <form action={toggleShoppingItem} className="min-w-0 flex-1">
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="checked" value={String(!item.checked)} />
                    <button
                      role="checkbox"
                      aria-checked={item.checked}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-md py-1.5 text-left text-sm hover:bg-stone-50"
                    >
                      <span
                        aria-hidden
                        className={`flex size-5 shrink-0 items-center justify-center rounded border text-xs text-white ${
                          item.checked ? "border-brand-600 bg-brand-600" : "border-stone-300 bg-white"
                        }`}
                      >
                        {item.checked ? "✓" : ""}
                      </span>
                      <span className={`flex-1 truncate ${item.checked ? "text-stone-400 line-through" : ""}`}>{name(item)}</span>
                      {item.stocked_at && <span className="chip">у запасах</span>}
                      {item.quantity !== null && item.unit && (
                        <span className={`whitespace-nowrap ${item.checked ? "text-stone-400" : "font-medium"}`}>
                          {formatQty(Number(item.quantity), item.unit)}
                        </span>
                      )}
                    </button>
                  </form>
                  <form action={deleteRow}>
                    <input type="hidden" name="table" value="shopping_list_items" />
                    <input type="hidden" name="id" value={item.id} />
                    <button className="btn-ghost" aria-label={`Видалити: ${name(item)}`}>×</button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <form action={addShoppingItem} className="card mt-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="week" value={week} />
        <div className="min-w-0 flex-1 basis-48">
          <label className="label" htmlFor="title">Додати вручну</label>
          <input className="input" id="title" name="title" placeholder="напр.: серветки, кава" required />
        </div>
        <div>
          <label className="label" htmlFor="store_id">Де</label>
          <select className="input" id="store_id" name="store_id" defaultValue="">
            <option value="">найближчий</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <button className="btn">Додати</button>
      </form>
    </div>
  );
}
