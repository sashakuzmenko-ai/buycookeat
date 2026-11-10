import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { Notice } from "@/components/Notice";
import { MEAL_LABELS, type MealType } from "@/lib/seed-data";
import { formatQty, roundCooking } from "@/lib/shopping";
import { deleteRecipe } from "../../actions";

type Ingredient = {
  id: string;
  quantity: number;
  optional: boolean;
  products: { name: string; unit: string } | null;
};

export default async function RecipePage({ params, searchParams }: PageProps<"/recipes/[id]">) {
  const { id } = await params;
  const { supabase, portions } = await getContext();
  const { data: recipe } = await supabase
    .from("recipes")
    .select(
      "id, title, description, instructions, base_servings, cook_minutes, meal_types, kid_notes, recipe_ingredients(id, quantity, optional, sort_order, products(name, unit)), recipe_equipment(equipment(name))",
    )
    .eq("id", id)
    .order("sort_order", { referencedTable: "recipe_ingredients" })
    .maybeSingle();
  if (!recipe) notFound();

  const base = Number(recipe.base_servings);
  const scale = portions / base;
  const ingredients = recipe.recipe_ingredients as unknown as Ingredient[];
  const equipment = (recipe.recipe_equipment as unknown as { equipment: { name: string } | null }[])
    .map((e) => e.equipment?.name)
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/recipes" className="text-sm text-stone-500 hover:underline">← Усі рецепти</Link>
      <div className="mt-2 mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="h1">{recipe.title}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(recipe.meal_types as MealType[]).map((m) => (
              <span key={m} className="chip">{MEAL_LABELS[m]}</span>
            ))}
            {recipe.cook_minutes ? <span className="chip">{recipe.cook_minutes} хв</span> : null}
            {equipment.map((e) => (
              <span key={e} className="chip">{e}</span>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Link className="btn-secondary" href={`/recipes/${recipe.id}/edit`}>Редагувати</Link>
          <form action={deleteRecipe}>
            <input type="hidden" name="id" value={recipe.id} />
            <button className="btn-ghost py-2">Видалити</button>
          </form>
        </div>
      </div>

      <Notice params={await searchParams} />
      {recipe.description && <p className="mb-4 text-sm text-stone-600">{recipe.description}</p>}

      <section className="card mb-4">
        <h2 className="h2">Інгредієнти</h2>
        <p className="mb-3 text-xs text-stone-500">
          Перераховано на вашу сім&apos;ю: {portions.toLocaleString("uk-UA")} дорослої порції (у рецепті —{" "}
          {base.toLocaleString("uk-UA")})
        </p>
        {ingredients.length === 0 ? (
          <p className="text-sm text-stone-500">Інгредієнти не вказані.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {ingredients.map((ing) => {
              const unit = ing.products?.unit ?? "";
              return (
                <li key={ing.id} className="flex justify-between gap-3 py-1.5">
                  <span>
                    {ing.products?.name}
                    {ing.optional && <span className="ml-1.5 text-xs text-stone-400">за бажанням</span>}
                  </span>
                  <span className="text-right whitespace-nowrap">
                    <span className="font-medium">{formatQty(roundCooking(Number(ing.quantity) * scale, unit), unit)}</span>
                    <span className="ml-2 text-xs text-stone-400">з {formatQty(Number(ing.quantity), unit)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {recipe.kid_notes && (
        <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <span className="font-medium">Для дітей: </span>
          {recipe.kid_notes}
        </section>
      )}

      {recipe.instructions && (
        <section className="card">
          <h2 className="h2 mb-2">Приготування</h2>
          <p className="text-sm leading-relaxed whitespace-pre-line">{recipe.instructions}</p>
        </section>
      )}
    </div>
  );
}
