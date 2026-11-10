import Link from "next/link";
import { getContext } from "@/lib/context";
import { MEAL_LABELS, type MealType } from "@/lib/seed-data";

export default async function RecipesPage() {
  const { supabase } = await getContext();
  const { data } = await supabase
    .from("recipes")
    .select("id, title, cook_minutes, meal_types, base_servings, kid_notes")
    .order("title");
  const recipes = data ?? [];

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <h1 className="h1">Рецепти</h1>
        <Link className="btn" href="/recipes/new">+ Новий рецепт</Link>
      </div>
      {recipes.length === 0 ? (
        <p className="card text-sm text-stone-600">Рецептів ще немає. Додайте перший — і він з&apos;явиться у меню.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((r) => (
            <li key={r.id}>
              <Link href={`/recipes/${r.id}`} className="card block h-full transition hover:border-brand-500">
                <div className="mb-2 font-medium">{r.title}</div>
                <div className="flex flex-wrap gap-1.5">
                  {(r.meal_types as MealType[]).map((m) => (
                    <span key={m} className="chip">{MEAL_LABELS[m]}</span>
                  ))}
                  {r.cook_minutes ? <span className="chip">{r.cook_minutes} хв</span> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
