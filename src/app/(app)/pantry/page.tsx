import Link from "next/link";
import { getContext } from "@/lib/context";
import { Notice } from "@/components/Notice";
import { PRODUCT_CATEGORIES } from "@/lib/seed-data";
import { deleteRow, setPantryItem } from "../actions";

type Item = {
  id: string;
  product_id: string;
  quantity: number;
  products: { name: string; category: string; unit: string } | null;
};

export default async function PantryPage({ searchParams }: PageProps<"/pantry">) {
  const { supabase } = await getContext();
  const [itemsRes, productsRes] = await Promise.all([
    supabase.from("pantry_items").select("id, product_id, quantity, products(name, category, unit)"),
    supabase.from("products").select("id, name, unit").order("name"),
  ]);
  const items = ((itemsRes.data ?? []) as unknown as Item[]).sort((a, b) =>
    (a.products?.name ?? "").localeCompare(b.products?.name ?? "", "uk"),
  );
  const products = productsRes.data ?? [];
  const inStock = new Set(items.map((i) => i.product_id));
  const categories = [
    ...PRODUCT_CATEGORIES,
    ...new Set(
      items.map((i) => i.products?.category ?? "інше").filter((c) => !(PRODUCT_CATEGORIES as readonly string[]).includes(c)),
    ),
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="h1 mb-1">Запаси</h1>
          <p className="text-sm text-stone-600">
            Що є вдома. Список покупок враховує запаси, а позначка «приготовано» в меню списує інгредієнти.
          </p>
        </div>
        <Link href="/products" className="btn-secondary text-sm">
          Продукти →
        </Link>
      </div>
      <Notice params={await searchParams} />

      <form action={setPantryItem} className="card mb-5 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-48">
          <label className="label" htmlFor="product_id">Продукт</label>
          <select className="input" id="product_id" name="product_id" defaultValue="" required>
            <option value="" disabled>обрати…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.unit}){inStock.has(p.id) ? " — вже є" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="quantity">Скільки є</label>
          <input className="input w-28" id="quantity" name="quantity" inputMode="decimal" placeholder="напр. 500" required />
        </div>
        <button className="btn">Зберегти</button>
      </form>

      {items.length === 0 ? (
        <p className="card text-sm text-stone-600">
          Запаси порожні. Додайте продукти вручну або відмітьте куплене у списку покупок і натисніть «Перенести куплене в
          запаси».
        </p>
      ) : (
        <div className="space-y-4">
          {categories.map((category) => {
            const list = items.filter((i) => (i.products?.category ?? "інше") === category);
            if (list.length === 0) return null;
            return (
              <section key={category} className="card">
                <h2 className="h2 mb-2 capitalize">{category}</h2>
                <ul className="divide-y divide-stone-100 text-sm">
                  {list.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate">{item.products?.name}</span>
                      <form action={setPantryItem} className="flex items-center gap-1.5">
                        <input type="hidden" name="product_id" value={item.product_id} />
                        <input
                          className="input w-24 py-1 text-right"
                          name="quantity"
                          inputMode="decimal"
                          defaultValue={String(Number(item.quantity)).replace(".", ",")}
                          aria-label={`Кількість: ${item.products?.name}`}
                        />
                        <span className="w-6 text-xs text-stone-500">{item.products?.unit}</span>
                        <button className="btn-secondary px-2.5 py-1">ок</button>
                      </form>
                      <form action={deleteRow}>
                        <input type="hidden" name="table" value="pantry_items" />
                        <input type="hidden" name="id" value={item.id} />
                        <button className="btn-ghost" aria-label={`Закінчилось: ${item.products?.name}`}>×</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
