import { getContext } from "@/lib/context";
import { Notice } from "@/components/Notice";
import { PRODUCT_CATEGORIES } from "@/lib/seed-data";
import { Button, Card, Field, StatusChip } from "@/components/ui";
import { addProduct, deleteRow } from "../actions";

type Product = {
  id: string;
  name: string;
  category: string;
  unit: string;
  is_staple: boolean;
  stores: { name: string } | null;
};

function LabeledSelect({
  label,
  id,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-2">
        {label}
      </label>
      <select
        id={id}
        className="h-11 min-h-[44px] w-full rounded-12 border border-line-strong bg-surface px-3.5 text-[15px] text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-menu-tint"
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

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
    <div className="mx-auto max-w-3xl min-w-0">
      <h1 className="h1 mb-1">Продукти</h1>
      <p className="mb-4 text-[15px] text-ink-2">
        Довідник для рецептів і списку покупок. Магазин за замовчуванням визначає, де шукати товар у списку.
      </p>
      <Notice params={await searchParams} />

      <Card className="mb-5 p-5">
        <h2 className="h2 mb-3">Новий продукт</h2>
        <form action={addProduct} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Назва" id="name" name="name" required wrapperClassName="sm:col-span-2 lg:col-span-1" />
          <LabeledSelect label="Категорія" id="category" name="category" defaultValue="інше">
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </LabeledSelect>
          <LabeledSelect label="Одиниця" id="unit" name="unit" defaultValue="г">
            <option>г</option>
            <option>мл</option>
            <option>шт</option>
          </LabeledSelect>
          <LabeledSelect label="Де купуємо" id="store_id" name="store_id" defaultValue="">
            <option value="">найближчий магазин</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </LabeledSelect>
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-[15px] text-ink sm:col-span-2">
            <input type="checkbox" name="is_staple" className="mt-1 size-[18px] shrink-0 accent-brand" />
            <span>
              <span className="font-semibold">Базовий запас</span>
              <span className="mt-0.5 block text-[13px] text-ink-2">
                Завжди є вдома — не потрапляє у список покупок.
              </span>
            </span>
          </label>
          <div className="flex items-end sm:col-span-2 lg:col-span-2">
            <Button type="submit" className="w-full sm:w-auto">
              Додати до довідника
            </Button>
          </div>
        </form>
      </Card>

      <div className="space-y-4">
        {categories.map((category) => {
          const list = products.filter((p) => p.category === category);
          if (list.length === 0) return null;
          return (
            <Card key={category} className="p-0 overflow-hidden">
              <h2 className="h2 border-b border-line px-5 py-3 capitalize">{category}</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[min(100%,22rem)] text-left text-[15px]">
                  <thead>
                    <tr className="border-b border-line bg-soft text-[13px] font-semibold text-ink-2">
                      <th className="px-4 py-2.5 font-semibold" scope="col">
                        Назва
                      </th>
                      <th className="px-4 py-2.5 font-semibold" scope="col">
                        Магазин
                      </th>
                      <th className="px-4 py-2.5 font-semibold" scope="col">
                        Одиниця
                      </th>
                      <th className="w-12 px-2 py-2.5" scope="col">
                        <span className="sr-only">Дії</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {list.map((p) => (
                      <tr key={p.id} className="text-ink">
                        <td className="px-4 py-2.5">
                          <span className="font-medium">{p.name}</span>
                          {p.is_staple && (
                            <StatusChip module="pantry" label="Базовий запас" className="ml-2 align-middle" />
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-ink-2">
                          {p.stores ? (
                            <StatusChip module="shops" label={p.stores.name} />
                          ) : (
                            <span className="text-[13px]">за списком магазинів</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[13px] text-ink-2">{p.unit}</td>
                        <td className="px-2 py-1">
                          <form action={deleteRow}>
                            <input type="hidden" name="table" value="products" />
                            <input type="hidden" name="id" value={p.id} />
                            <button
                              type="submit"
                              className="btn-ghost min-h-[44px] min-w-[44px]"
                              aria-label={`Видалити: ${p.name}`}
                            >
                              ×
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })}
        {products.length === 0 && (
          <Card className="p-5 text-[15px] text-ink-2">
            Поки немає жодного продукту. Додайте перший у формі вище — він з&apos;явиться у рецептах і списку
            покупок.
          </Card>
        )}
      </div>
    </div>
  );
}
