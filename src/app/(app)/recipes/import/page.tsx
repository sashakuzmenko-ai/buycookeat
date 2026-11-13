import { getContext } from "@/lib/context";
import { Notice } from "@/components/Notice";
import { ImportRecipeScreen } from "@/components/recipes/ImportRecipeScreen";

export default async function ImportRecipePage({ searchParams }: PageProps<"/recipes/import">) {
  const params = await searchParams;
  const { supabase } = await getContext();
  const { data: products } = await supabase.from("products").select("id, name, unit").order("name");
  const apiAvailable = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  const initialUrl = typeof params.url === "string" ? params.url : "";

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-semibold text-recipes">Рецепти</p>
      <h1 className="mb-4 font-display text-2xl font-bold tracking-tight text-ink md:text-[28px]">Імпорт за посиланням</h1>
      <Notice params={params} />
      <ImportRecipeScreen products={products ?? []} apiAvailable={apiAvailable} initialUrl={initialUrl} />
    </div>
  );
}
