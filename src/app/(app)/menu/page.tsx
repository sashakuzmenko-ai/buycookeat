import { Notice } from "@/components/Notice";
import { MenuScreen, type MenuEntryView, type RecipeChoice, type TomorrowInfo } from "@/components/menu/menu-screen";
import { addDays, parseWeekParam, todayISO, weekDays } from "@/lib/dates";
import { dishStockStatus, isMenuSlot, MENU_SLOTS, shortProductIds, summarizeMenu } from "@/lib/menu";
import { type PlanLine, type ProductInfo } from "@/lib/shopping";
import { getContext } from "@/lib/context";

type MenuPageProps = {
  readonly searchParams: Promise<{
    readonly week?: string;
    readonly day?: string;
    readonly [key: string]: string | string[] | undefined;
  }>;
};

type DbIngredient = {
  product_id: string;
  quantity: number | string;
  optional: boolean;
};

type DbRecipe = {
  id: string;
  title: string;
  cook_minutes: number | null;
  base_servings: number | string;
  recipe_ingredients: DbIngredient[] | null;
};

type DbEntry = {
  id: string;
  plan_date: string;
  meal_type: string;
  title: string | null;
  cooked_at: string | null;
  servings: number | string | null;
  recipes: DbRecipe | DbRecipe[] | null;
};

type DbRecipeList = {
  id: string;
  title: string;
  meal_types: string[] | null;
};

type DbProduct = {
  id: string;
  name: string;
  unit: string;
  is_staple: boolean;
  preferred_store_id: string | null;
};

type DbPantry = {
  product_id: string;
  quantity: number | string;
};

const SLOT_INDEX: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2 };

function positive(value: number | string | null | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function oneRecipe(value: DbRecipe | DbRecipe[] | null): DbRecipe | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function toLine(entry: DbEntry): PlanLine | null {
  const recipe = oneRecipe(entry.recipes);
  if (!recipe) return null;
  return {
    servings: entry.servings === null ? null : positive(entry.servings, 1),
    baseServings: positive(recipe.base_servings, 1),
    ingredients: (recipe.recipe_ingredients ?? []).map((item) => ({
      productId: item.product_id,
      quantity: Number(item.quantity),
      optional: Boolean(item.optional),
    })),
  };
}

function toView(
  entry: DbEntry,
  portions: number,
  products: Map<string, ProductInfo>,
  stock: Map<string, number>,
  names: Map<string, string>,
): { view: MenuEntryView; cooked: boolean; line: PlanLine | null } {
  const recipe = oneRecipe(entry.recipes);
  const line = toLine(entry);
  const cooked = Boolean(entry.cooked_at);
  const status = dishStockStatus({ cooked, line }, portions, products, stock);
  return {
    cooked,
    line,
    view: {
      id: entry.id,
      planDate: entry.plan_date,
      mealType: entry.meal_type,
      title: recipe?.title ?? entry.title ?? "Страва",
      minutes: recipe?.cook_minutes ?? null,
      cookedAt: entry.cooked_at,
      recipeId: recipe?.id ?? null,
      status,
      missingNames: status.missingProductIds.map((id) => names.get(id) ?? "продукт"),
    },
  };
}

function slotRank(mealType: string): number {
  return SLOT_INDEX[mealType] ?? MENU_SLOTS.length;
}

export default async function MenuPage({ searchParams }: MenuPageProps) {
  const params = await searchParams;
  const week = parseWeekParam(typeof params.week === "string" ? params.week : undefined);
  const days = weekDays(week);
  const today = todayISO();
  const daySet = new Set(days);
  const dayParam = typeof params.day === "string" ? params.day : undefined;
  const selected = dayParam && daySet.has(dayParam) ? dayParam : daySet.has(today) ? today : days[0];
  const { supabase, portions } = await getContext();

  const [entriesRes, recipesRes, productsRes, pantryRes] = await Promise.all([
    supabase
      .from("meal_plan_entries")
      .select(
        "id, plan_date, meal_type, title, cooked_at, servings, recipes(id, title, cook_minutes, base_servings, recipe_ingredients(product_id, quantity, optional))",
      )
      .gte("plan_date", days[0])
      .lte("plan_date", days[6])
      .order("created_at"),
    supabase.from("recipes").select("id, title, meal_types").order("title"),
    supabase.from("products").select("id, name, unit, is_staple, preferred_store_id"),
    supabase.from("pantry_items").select("product_id, quantity"),
  ]);

  const loadError =
    entriesRes.error?.message ?? recipesRes.error?.message ?? productsRes.error?.message ?? pantryRes.error?.message ?? null;

  const productRows = (productsRes.data ?? []) as unknown as DbProduct[];
  const products = new Map<string, ProductInfo>(
    productRows.map((product) => [
      product.id,
      { unit: product.unit, isStaple: product.is_staple, storeId: product.preferred_store_id },
    ]),
  );
  const names = new Map(productRows.map((product) => [product.id, product.name]));
  const stock = new Map(
    ((pantryRes.data ?? []) as unknown as DbPantry[]).map((item) => [item.product_id, Number(item.quantity)]),
  );
  const planned = ((entriesRes.data ?? []) as unknown as DbEntry[]).map((entry) =>
    toView(entry, portions, products, stock, names),
  );
  const visible = planned.filter((dish) => isMenuSlot(dish.view.mealType));
  const summary = summarizeMenu(
    visible.map((dish) => ({ cooked: dish.cooked, line: dish.line })),
    portions,
    products,
    stock,
  );
  const recipes: RecipeChoice[] = ((recipesRes.data ?? []) as unknown as DbRecipeList[]).map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    mealTypes: recipe.meal_types ?? [],
  }));

  const tomorrowDate = addDays(selected, 1);
  const tomorrowDishes = visible
    .filter((dish) => dish.view.planDate === tomorrowDate)
    .sort((a, b) => slotRank(a.view.mealType) - slotRank(b.view.mealType));
  const tomorrow: TomorrowInfo = daySet.has(tomorrowDate)
    ? {
        inWeek: true,
        titles: tomorrowDishes.map((dish) => dish.view.title),
        missing: shortProductIds(
          tomorrowDishes.flatMap((dish) => (!dish.cooked && dish.line ? [dish.line] : [])),
          portions,
          products,
          stock,
        ).length,
        allCooked: tomorrowDishes.length > 0 && tomorrowDishes.every((dish) => dish.cooked),
      }
    : { inWeek: false };

  return (
    <MenuScreen
      week={week}
      days={days}
      today={today}
      selected={selected}
      portionsLabel={portions.toLocaleString("uk-UA")}
      recipes={recipes}
      entries={visible.map((dish) => dish.view)}
      summary={summary}
      canClear={planned.length > 0}
      tomorrow={tomorrow}
      loadError={loadError}
      notice={<Notice params={params} />}
    />
  );
}
