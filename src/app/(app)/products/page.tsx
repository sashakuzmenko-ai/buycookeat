import { getContext } from "@/lib/context";
import { Notice } from "@/components/Notice";
import { PRODUCT_CATEGORIES } from "@/lib/seed-data";
import { addProduct, deleteRow } from "../actions";

type Product = {
  id: string;
  name: string;
  category: string;
  unit: string;
  is_staple: boolean;
  stores: { name: string } | null;
};

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const { supabase } = await getContext();
  const [productsRes, storesRes] = await Promise.all([
    supabase.from("products").select("id, name, category, unit, is_staple, stores(name)").order("name"),
    supabase.from("stores").select("id, name").order("sort_order"),
  ]);
  const products = (productsRes.data ?? []) as unknown as Product[];
  const stores = storesRes.data ?? [];
  const categories = [
    ...PRODUCT_CATEGORIES,
    ...new Set(products.map((p) => p.category).filter((c) => !(PRODUCT_CATEGORIES as readonly string[]).includes(c))),
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="h1 mb-1">Продукти</h1>
      <p className="mb-4 text-sm text-stone-600">
        База продуктів для рецептів і списку покупок. Магазин визначає, у яку групу списку потрапить продукт.
      </p>
      <Notice params={await searchParams} />

      <form action={addProduct} className="card mb-5 grid gap-3 sm:grid-cols-[2fr_1.3fr_auto_1.3fr]">
        <div>
          <label className="label" htmlFor="name">Назва</label>
          <input className="input" id="name" name="name" required />
        </div>
        <div>
          <label className="label" htmlFor="category">Категорія</label>
          <select className="input" id="category" name="category" defaultValue="інше">
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="unit">Одиниця</label>
          <select className="input" id="unit" name="unit" defaultValue="г">
            <option>г</option>
            <option>мл</option>
            <option>шт</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="store_id">Де купуємо</label>
          <select className="input" id="store_id" name="store_id" defaultValue="">
            <option value="">найближчий магазин</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-3">
          <input type="checkbox" name="is_staple" className="size-4 accent-brand-600" />
          Базовий запас (завжди є вдома, не додавати у список покупок)
        </label>
        <button className="btn">Додати продукт</button>
      </form>

      <div className="space-y-4">
        {categories.map((category) => {
          const list = products.filter((p) => p.category === category);
          if (list.length === 0) return null;
          return (
            <section key={category} className="card">
              <h2 className="h2 mb-2 capitalize">{category}</h2>
              <ul className="divide-y divide-stone-100 text-sm">
                {list.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 py-1.5">
                    <span className="flex-1">{p.name}</span>
                    {p.is_staple && <span className="chip">базовий запас</span>}
                    {p.stores && <span className="chip">{p.stores.name}</span>}
                    <span className="w-8 text-right text-xs text-stone-400">{p.unit}</span>
                    <form action={deleteRow}>
                      <input type="hidden" name="table" value="products" />
                      <input type="hidden" name="id" value={p.id} />
                      <button className="btn-ghost" aria-label={`Видалити: ${p.name}`}>×</button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
