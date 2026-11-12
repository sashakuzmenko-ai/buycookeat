import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { todayISO } from "@/lib/dates";
import { Notice } from "@/components/Notice";
import { Button, Card } from "@/components/ui";
import { CookBar } from "@/components/recipes/CookBar";
import { deleteRecipe } from "../../actions";
import { addMissingToShopping } from "../actions";
import { formatQty } from "@/lib/shopping";
import {
  availabilityLabel,
  coverIngredients,
  formatPortionPrice,
  formatPortions,
  freshestPrices,
  pickUncookedToday,
  portionPriceUah,
  readIngredients,
  recipeKindLabel,
  stockMap,
  type CoveredIngredient,
} from "@/lib/recipes";

type IngredientRow = { quantity: number | string; optional: boolean; products: unknown };

export default async function RecipePage({ params, searchParams }: PageProps<"/recipes/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const today = todayISO();
  const { supabase, portions } = await getContext();

  const [recipeRes, pantryRes, pricesRes, todayRes] = await Promise.all([
    supabase
      .from("recipes")
      .select(
        "id, title, description, instructions, base_servings, cook_minutes, meal_types, kid_notes, recipe_ingredients(id, quantity, optional, sort_order, products(id, name, unit)), recipe_equipment(equipment(name))",
      )
      .eq("id", id)
      .order("sort_order", { referencedTable: "recipe_ingredients" })
      .maybeSingle(),
    supabase.from("pantry_items").select("product_id, quantity"),
    supabase.from("store_products").select("product_id, price, price_updated_at"),
    supabase
      .from("meal_plan_entries")
      .select("id, cooked_at, meal_type")
      .eq("recipe_id", id)
      .eq("plan_date", today)
      .order("created_at"),
  ]);
  const recipe = recipeRes.data;
  if (!recipe) notFound();

  const ingredients = readIngredients((recipe.recipe_ingredients ?? []) as unknown as IngredientRow[]);
  const baseServings = Number(recipe.base_servings);
  const stock = stockMap(
    (pantryRes.data ?? []).map((row) => ({ productId: row.product_id as string, quantity: row.quantity as number | string })),
  );
  const prices = freshestPrices(
    (pricesRes.data ?? []).map((row) => ({
      productId: row.product_id as string,
      price: row.price as number | string | null,
      updatedAt: row.price_updated_at as string | null,
    })),
  );
  const stockKnown = !pantryRes.error;
  const covered = coverIngredients(ingredients, baseServings, portions, stock);
  const missing = stockKnown ? covered.filter((item) => item.short) : [];
  const portionPrice = pricesRes.error ? null : portionPriceUah(baseServings, ingredients, prices);
  const equipment = equipmentNames(recipe.recipe_equipment);
  const todayEntries = (todayRes.data ?? []) as { id: string; cooked_at: string | null; meal_type: string }[];
  const open = pickUncookedToday(todayEntries.map((entry) => ({ ...entry, cookedAt: entry.cooked_at, mealType: entry.meal_type })));
  const alreadyCooked = todayEntries.length > 0 && !open;
  const steps = String(recipe.instructions ?? "")
    .split(/\n+/)
    .map((step) => step.trim())
    .filter((step) => step.length > 0);

  return (
    <div className="pb-36">
      <header className="-mx-4 -mt-4 mb-5 bg-recipes-tint px-4 py-6 sm:-mx-6 sm:-mt-6 sm:px-6 lg:-mx-8 lg:-mt-8 lg:px-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link
            href="/recipes"
            aria-label="Усі рецепти"
            className="inline-flex size-11 items-center justify-center rounded-[14px] bg-surface text-lg text-ink no-underline"
          >
            ←
          </Link>
          <p className="text-xs font-semibold tracking-[0.08em] text-recipes-ink uppercase">
            {recipeKindLabel(recipe.meal_types ?? [])}
          </p>
          <Link
            href={`/recipes/${recipe.id}/edit`}
            aria-label="Редагувати рецепт"
            className="inline-flex size-11 items-center justify-center rounded-[14px] bg-surface text-ink"
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />
            </svg>
          </Link>
        </div>
        <h1 className="font-display text-[30px] leading-[1.1] font-bold text-ink">{recipe.title}</h1>
        <div className="mt-4 flex flex-wrap gap-5">
          {recipe.cook_minutes != null ? (
            <div>
              <div className="font-display text-[17px] font-medium text-ink">{recipe.cook_minutes} хв</div>
              <div className="text-xs text-recipes-ink">готування</div>
            </div>
          ) : null}
          <div>
            <div className="font-display text-[17px] font-medium text-ink">{formatPortions(portions)}</div>
            <div className="text-xs text-recipes-ink">порції сім&apos;ї</div>
          </div>
          {portionPrice != null ? (
            <div>
              <div className="font-display text-[17px] font-medium text-ink">{formatPortionPrice(portionPrice)}</div>
              <div className="text-xs text-recipes-ink">за порцію</div>
            </div>
          ) : null}
        </div>
      </header>

      <Notice params={query} />
      {recipe.description ? <p className="mb-4 text-[15px] leading-relaxed text-ink-2">{recipe.description}</p> : null}

      {stockKnown ? (
        <StockBanner recipeId={recipe.id} missing={missing} requiredCount={covered.filter((item) => !item.optional).length} />
      ) : (
        <div className="rounded-[14px] bg-soft px-3.5 py-3 text-sm text-ink-2" role="alert">
          Не вдалося прочитати запаси, тож звірку «є / бракує» не показано.
        </div>
      )}

      <section className="mt-4" aria-labelledby="recipe-products">
        <h2 id="recipe-products" className="h2 mb-2">
          Продукти{covered.length > 0 ? ` · ${covered.length}` : ""}
        </h2>
        <p className="mb-3 text-[13px] text-ink-2">
          Перераховано на вашу сім&apos;ю: {formatPortions(portions)} порції (у рецепті — {formatPortions(baseServings)})
        </p>
        {covered.length === 0 ? (
          <p className="text-[15px] text-ink-2">Інгредієнти не вказані.</p>
        ) : (
          <ul>
            {covered.map((item) => (
              <li key={`${item.optional ? "o" : "r"}-${item.productId}`} className="flex min-h-11 items-center gap-2.5 border-b border-soft text-[15px]">
                <span className="min-w-0 flex-1">
                  {item.name}
                  {item.optional ? <span className="ml-2 text-[13px] text-ink-2">за бажанням</span> : null}
                </span>
                <span className="font-mono text-sm font-semibold whitespace-nowrap">{formatQty(item.needed, item.unit)}</span>
                {stockKnown ? (
                  <span className={`w-[7.5rem] text-right text-xs ${item.lacks ? "font-semibold text-shops-ink" : "text-ink-2"}`}>
                    {availabilityLabel(item.have, item.needed, item.unit)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {recipe.kid_notes ? (
        <Card variant="tint" module="recipes" className="mt-4 p-4 text-[15px] text-recipes-ink">
          <span className="font-semibold">Для дітей: </span>
          {recipe.kid_notes}
        </Card>
      ) : null}

      <section className="mt-6" aria-labelledby="recipe-steps">
        <h2 id="recipe-steps" className="h2 mb-2">
          Кроки{steps.length > 0 ? ` · ${steps.length}` : ""}
        </h2>
        {steps.length === 0 ? (
          <p className="text-[15px] text-ink-2">Кроків ще немає.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {steps.map((step, index) => (
              <li key={`${index}-${step}`} className="flex gap-3 text-[15px] leading-relaxed">
                <span className="font-mono text-sm font-semibold text-recipes-ink">{index + 1}</span>
                <span>{step.replace(/^\d+\.\s*/, "")}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-6" aria-labelledby="recipe-equipment">
        <h2 id="recipe-equipment" className="h2 mb-2">
          Техніка
        </h2>
        {equipment.length === 0 ? (
          <p className="text-[15px] text-ink-2">Техніку не вказано.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {equipment.map((name) => (
              <li key={name} className="text-[15px]">
                {name}
              </li>
            ))}
          </ul>
        )}
      </section>

      <form action={deleteRecipe} className="mt-8">
        <input type="hidden" name="id" value={recipe.id} />
        <Button type="submit" variant="secondary">
          Видалити рецепт
        </Button>
      </form>

      <CookBar recipeId={recipe.id} entryId={open?.id ?? null} alreadyCooked={alreadyCooked} />
    </div>
  );
}

function StockBanner({
  recipeId,
  missing,
  requiredCount,
}: {
  readonly recipeId: string;
  readonly missing: readonly CoveredIngredient[];
  readonly requiredCount: number;
}) {
  if (requiredCount === 0) {
    return (
      <div className="rounded-[14px] bg-soft px-3.5 py-3 text-sm text-ink-2">
        Немає обов&apos;язкових продуктів — зі складу нічого не спишеться.
      </div>
    );
  }
  if (missing.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-[14px] bg-pantry-tint px-3.5 py-3 text-sm text-pantry-ink">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5 9-10" />
        </svg>
        <span>
          <span className="font-bold">Усе є на складі.</span> Після готування спишеться автоматично.
        </span>
      </div>
    );
  }
  return (
    <div className="rounded-[14px] bg-shops-tint px-3.5 py-3 text-sm text-shops-ink">
      <p>
        <span className="font-bold">Бракує: </span>
        {missing.map((item) => item.name).join(", ")}.
      </p>
      <form action={addMissingToShopping} className="mt-2">
        <input type="hidden" name="recipe_id" value={recipeId} />
        <button type="submit" className="font-semibold text-shops-ink underline">
          Додати в покупки
        </button>
      </form>
    </div>
  );
}

function equipmentNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const row of value) {
    const equipment = (row as { equipment?: unknown }).equipment;
    const one = Array.isArray(equipment) ? equipment[0] : equipment;
    const name = (one as { name?: string } | null)?.name;
    if (name) names.push(name);
  }
  return names;
}
