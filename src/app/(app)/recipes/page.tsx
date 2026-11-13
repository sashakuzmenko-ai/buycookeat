import Link from "next/link";
import { getContext } from "@/lib/context";
import { todayISO } from "@/lib/dates";
import { Notice } from "@/components/Notice";
import { Card, StatusChip } from "@/components/ui";
import { CatalogFilters } from "@/components/recipes/CatalogFilters";
import { TodayBlock, portionsSentence } from "@/components/recipes/TodayBlock";
import { MEAL_LABELS, type MealType } from "@/lib/seed-data";
import {
  countMissing,
  coverIngredients,
  formatPortionPrice,
  freshestPrices,
  matchesCatalog,
  parseCatalogFilters,
  pickUncookedToday,
  portionPriceUah,
  readIngredients,
  stockMap,
} from "@/lib/recipes";

type DbIngredient = { quantity: number | string; optional: boolean; products: unknown };
type DbRecipe = {
  id: string;
  title: string;
  description: string | null;
  cook_minutes: number | null;
  meal_types: string[] | null;
  base_servings: number | string;
  recipe_ingredients: DbIngredient[] | null;
};
type TodayEntry = {
  id: string;
  meal_type: string;
  title: string | null;
  cooked_at: string | null;
  recipe_id: string | null;
  servings: number | string | null;
};

function mealLabel(mealTypes: readonly string[]): string {
  const labels = mealTypes.filter((meal): meal is MealType => meal in MEAL_LABELS).map((meal) => MEAL_LABELS[meal]);
  return labels.length > 0 ? labels.join(" · ") : "Рецепт";
}

export default async function RecipesPage({ searchParams }: PageProps<"/recipes">) {
  const params = await searchParams;
  const filters = parseCatalogFilters(params);
  const today = todayISO();
  const { supabase, portions } = await getContext();

  const [recipesRes, pantryRes, pricesRes, todayRes] = await Promise.all([
    supabase
      .from("recipes")
      .select("id, title, description, cook_minutes, meal_types, base_servings, recipe_ingredients(quantity, optional, products(id, name, unit))")
      .order("title"),
    supabase.from("pantry_items").select("product_id, quantity"),
    supabase.from("store_products").select("product_id, price, price_updated_at"),
    supabase
      .from("meal_plan_entries")
      .select("id, meal_type, title, cooked_at, recipe_id, servings")
      .eq("plan_date", today)
      .order("created_at"),
  ]);

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
  const recipes = ((recipesRes.data ?? []) as unknown as DbRecipe[]).map((recipe) => {
    const ingredients = readIngredients(recipe.recipe_ingredients);
    const baseServings = Number(recipe.base_servings);
    const covered = coverIngredients(ingredients, baseServings, portions, stock);
    return {
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      cookMinutes: recipe.cook_minutes,
      mealTypes: recipe.meal_types ?? [],
      ingredients,
      missing: stockKnown ? countMissing(covered) : null,
      price: pricesRes.error ? null : portionPriceUah(baseServings, ingredients, prices),
      productCount: covered.filter((item) => !item.optional).length,
    };
  });
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const todayDish = pickUncookedToday(
    ((todayRes.data ?? []) as unknown as TodayEntry[]).map((entry) => ({
      ...entry,
      cookedAt: entry.cooked_at,
      mealType: entry.meal_type,
    })),
  );
  const todayRecipe = todayDish?.recipe_id ? byId.get(todayDish.recipe_id) : undefined;
  const visible = recipes.filter((recipe) =>
    matchesCatalog(
      {
        title: recipe.title,
        productNames: recipe.ingredients.map((item) => item.name),
        mealTypes: recipe.mealTypes,
        cookMinutes: recipe.cookMinutes,
        missingCount: recipe.missing,
      },
      filters,
    ),
  );
  const filtered = filters.q.length > 0 || filters.meal != null || filters.quick || filters.now;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-recipes">Рецепти</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-[28px]">Наша кулінарна книга</h1>
        </div>
        <Link
          href="/recipes/new"
          className="inline-flex min-h-[44px] items-center justify-center rounded-12 bg-recipes px-[18px] text-[15px] font-semibold text-white no-underline hover:opacity-90"
        >
          Новий рецепт
        </Link>
      </div>

      <Notice params={params} />
      {recipesRes.error || pantryRes.error || pricesRes.error ? (
        <Card>
          <p role="alert" className="text-[15px] text-ink-2">
            {recipesRes.error
              ? "Не вдалося завантажити рецепти. Спробуйте оновити сторінку."
              : "Не вдалося прочитати запаси або ціни. Статус складу й ціна порції можуть бути приховані."}
          </p>
        </Card>
      ) : null}

      {todayDish && !recipesRes.error ? (
        <TodayBlock
          entryId={todayDish.id}
          recipeId={todayRecipe?.id ?? null}
          mealType={todayDish.mealType}
          title={todayRecipe?.title ?? todayDish.title ?? "Страва"}
          description={todayRecipe?.description ?? null}
          cookMinutes={todayRecipe?.cookMinutes ?? null}
          productCount={todayRecipe ? todayRecipe.productCount : null}
          portionPrice={todayRecipe?.price ?? null}
          missing={stockKnown && todayRecipe ? todayRecipe.missing : null}
          portionsLabel={
            todayRecipe
              ? portionsSentence(portions, todayDish.servings == null ? null : Number(todayDish.servings))
              : "Продукти зі складу не спишуться — у страви немає рецепта."
          }
        />
      ) : null}

      <CatalogFilters key={catalogKey(filters)} state={filters} />

      {recipesRes.error ? null : recipes.length === 0 ? (
        <Card>
          <p className="text-[15px] text-ink-2">Рецептів ще немає. Додайте перший — і він з&apos;явиться в меню.</p>
        </Card>
      ) : visible.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-[15px] text-ink-2">
            {filtered ? "За цим запитом рецептів немає." : "Рецептів ще немає."}
          </p>
          {filtered ? (
            <Link href="/recipes" className="text-[15px] font-semibold text-recipes">
              Скинути фільтри
            </Link>
          ) : null}
        </Card>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {visible.map((recipe) => (
            <li key={recipe.id} className="min-w-0">
              <Link href={`/recipes/${recipe.id}`} className="block h-full text-ink no-underline">
                <Card className="flex h-full min-h-[220px] flex-col gap-2.5 p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[11px] font-semibold tracking-[0.08em] text-recipes-ink uppercase">
                      {mealLabel(recipe.mealTypes)}
                    </span>
                    {recipe.cookMinutes != null ? (
                      <span className="font-mono text-[13px] text-ink-2">{recipe.cookMinutes} хв</span>
                    ) : null}
                  </div>
                  <div className="font-display text-[19px] leading-snug font-medium break-words">{recipe.title}</div>
                  {recipe.description ? (
                    <p className="line-clamp-3 text-[13px] leading-snug text-ink-2">{recipe.description}</p>
                  ) : null}
                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-soft pt-3">
                    {recipe.missing == null ? (
                      <span className="text-[13px] text-ink-2">Немає даних складу</span>
                    ) : (
                      <StatusChip status={recipe.missing > 0 ? "missing" : "ready"} count={recipe.missing} />
                    )}
                    {recipe.price != null ? (
                      <span className="font-mono text-[13px] font-semibold">{formatPortionPrice(recipe.price)}</span>
                    ) : null}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function catalogKey(filters: { q: string; meal: string | null; quick: boolean; now: boolean }): string {
  return `${filters.q}|${filters.meal ?? ""}|${filters.quick ? "1" : "0"}|${filters.now ? "1" : "0"}`;
}
