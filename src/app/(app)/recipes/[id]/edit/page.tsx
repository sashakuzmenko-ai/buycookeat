import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { Notice } from "@/components/Notice";
import { RecipeForm } from "@/components/RecipeForm";
import { saveRecipe } from "../../../actions";

export default async function EditRecipePage({ params, searchParams }: PageProps<"/recipes/[id]/edit">) {
  const { id } = await params;
  const { supabase } = await getContext();
  const [{ data: recipe }, { data: products }] = await Promise.all([
    supabase
      .from("recipes")
      .select(
        "id, title, description, instructions, base_servings, cook_minutes, meal_types, kid_notes, recipe_ingredients(product_id, quantity, optional, sort_order)",
      )
      .eq("id", id)
      .order("sort_order", { referencedTable: "recipe_ingredients" })
      .maybeSingle(),
    supabase.from("products").select("id, name, unit").order("name"),
  ]);
  if (!recipe) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/recipes/${id}`} className="text-sm text-stone-500 hover:underline">← Назад до рецепта</Link>
      <h1 className="h1 mt-2 mb-4">Редагування</h1>
      <Notice params={await searchParams} />
      <RecipeForm
        action={saveRecipe}
        products={products ?? []}
        initial={{
          id: recipe.id,
          title: recipe.title,
          description: recipe.description ?? "",
          instructions: recipe.instructions ?? "",
          base_servings: Number(recipe.base_servings),
          cook_minutes: recipe.cook_minutes,
          meal_types: recipe.meal_types ?? [],
          kid_notes: recipe.kid_notes ?? "",
          ingredients: (recipe.recipe_ingredients ?? []).map((i) => ({
            product_id: i.product_id as string,
            quantity: Number(i.quantity),
            optional: i.optional as boolean,
          })),
        }}
      />
    </div>
  );
}
