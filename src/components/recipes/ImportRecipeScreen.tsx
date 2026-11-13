"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveRecipe } from "@/app/(app)/actions";
import { fetchRecipeDraft } from "@/app/(app)/recipes/import/actions";
import { RecipeForm, type RecipeFormValues } from "@/components/RecipeForm";
import { Button, Card, Field } from "@/components/ui";
import type { RecipeDraft } from "@/lib/recipes/import";

type Product = { id: string; name: string; unit: string };

function toFormValues(draft: RecipeDraft): RecipeFormValues {
  return {
    title: draft.title,
    description: draft.description,
    instructions: draft.instructions,
    base_servings: draft.base_servings,
    cook_minutes: draft.cook_minutes,
    meal_types: draft.meal_types,
    kid_notes: "",
    ingredients: draft.ingredients,
  };
}

export function ImportRecipeScreen({
  products,
  apiAvailable,
  initialUrl,
}: {
  readonly products: readonly Product[];
  readonly apiAvailable: boolean;
  readonly initialUrl: string;
}) {
  const [state, formAction, pending] = useActionState(fetchRecipeDraft, null);

  if (!apiAvailable) {
    return (
      <Card className="p-5">
        <p className="text-[15px] text-ink-2">
          Імпорт рецептів за посиланням поки недоступний: у середовищі не задано{" "}
          <span className="font-mono text-sm">OPENROUTER_API_KEY</span>. Додайте ключ у змінні середовища та перезапустіть
          застосунок, або створіть рецепт вручну.
        </p>
        <Link href="/recipes/new" className="mt-4 inline-block text-[15px] font-semibold text-recipes">
          Новий рецепт вручну
        </Link>
      </Card>
    );
  }

  const draft = state?.ok ? state.draft : null;
  const error = state && !state.ok ? state.error : null;

  return (
    <div className="flex flex-col gap-6">
      <Card className="space-y-3 p-5">
        <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Field
              label="Адреса сторінки з рецептом"
              id="import_url"
              name="url"
              type="url"
              defaultValue={initialUrl}
              placeholder="https://…"
              required
              module="recipes"
            />
          </div>
          <Button type="submit" disabled={pending} module="recipes" className="min-h-[44px] shrink-0">
            {pending ? "Отримую…" : "Отримати чернетку"}
          </Button>
        </form>
        {error ? (
          <p role="alert" className="text-[15px] text-recipes">
            {error}
          </p>
        ) : null}
        {!draft ? (
          <p className="text-[13px] text-ink-2">Сторінку завантажимо один раз; у базу нічого не збережеться, доки ви не натиснете «Зберегти».</p>
        ) : null}
      </Card>

      {draft ? (
        <>
          <RecipeForm action={saveRecipe} products={products} initial={toFormValues(draft)} />
          {draft.unmatched.length > 0 ? (
            <Card className="space-y-2 p-5">
              <h2 className="text-[15px] font-semibold text-ink">Не зіставлено з довідником</h2>
              <p className="text-[13px] text-ink-2">
                Додайте ці продукти в{" "}
                <Link href="/products" className="font-semibold text-recipes underline underline-offset-2">
                  довідник
                </Link>
                , потім доповніть інгредієнти у формі вручну.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-[15px] text-ink">
                {draft.unmatched.map((item) => (
                  <li key={`${item.name}-${item.raw}`}>
                    {item.name}
                    {item.quantity > 0 ? ` — ${item.quantity} ${item.unit}` : null}
                    {item.optional ? " (за бажанням)" : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
