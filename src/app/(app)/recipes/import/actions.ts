"use server";

import { getContext } from "@/lib/context";
import { checkRecipeUrl, importRecipeDraft, ImportRecipeError, type RecipeDraft } from "@/lib/recipes/import";

export type ImportRecipeState =
  | { ok: true; draft: RecipeDraft }
  | { ok: false; error: string }
  | null;

export async function fetchRecipeDraft(_prev: ImportRecipeState, formData: FormData): Promise<ImportRecipeState> {
  const rawUrl = String(formData.get("url") ?? "").trim();
  const checked = checkRecipeUrl(rawUrl);
  if (!checked.ok) return { ok: false, error: checked.error };

  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return { ok: false, error: "Імпорт недоступний — не задано OPENROUTER_API_KEY" };
  }

  try {
    const { supabase } = await getContext();
    const { data: products, error } = await supabase.from("products").select("id, name, unit").order("name");
    if (error) return { ok: false, error: error.message };

    const draft = await importRecipeDraft({
      url: checked.url,
      products: (products ?? []).map((p) => ({ id: String(p.id), name: String(p.name), unit: String(p.unit) })),
      apiKey,
    });
    return { ok: true, draft };
  } catch (err) {
    if (err instanceof ImportRecipeError) return { ok: false, error: err.message };
    return { ok: false, error: err instanceof Error ? err.message : "Не вдалося імпортувати рецепт" };
  }
}
