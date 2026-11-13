import { getContext } from "@/lib/context";
import { Notice } from "@/components/Notice";
import { RecipeForm } from "@/components/RecipeForm";
import { saveRecipe } from "../../actions";

export default async function NewRecipePage({ searchParams }: PageProps<"/recipes/new">) {
  const { supabase } = await getContext();
  const { data: products } = await supabase.from("products").select("id, name, unit").order("name");
  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-semibold text-recipes">Рецепти</p>
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-[28px] mb-4">Новий рецепт</h1>
      <Notice params={await searchParams} />
      <RecipeForm action={saveRecipe} products={products ?? []} />
    </div>
  );
}
