import Link from "next/link";
import { getContext } from "@/lib/context";
import { Notice } from "@/components/Notice";
import { addDays, formatDate, formatWeekday, parseWeekParam, todayISO, weekDays } from "@/lib/dates";
import { MEAL_LABELS, type MealType } from "@/lib/seed-data";
import { addPlanEntry, autoFillWeek, clearWeek, removePlanEntry, setCooked } from "../actions";

type Entry = {
  id: string;
  plan_date: string;
  meal_type: MealType;
  title: string | null;
  cooked_at: string | null;
  recipes: { id: string; title: string; cook_minutes: number | null } | null;
};

const SLOTS: MealType[] = ["breakfast", "lunch", "dinner"];

type MenuPageProps = {
  readonly searchParams: Promise<{
    readonly week?: string;
    readonly [key: string]: string | string[] | undefined;
  }>;
};

export default async function MenuPage({ searchParams }: MenuPageProps) {
  const params = await searchParams;
  const week = parseWeekParam(typeof params.week === "string" ? params.week : undefined);
  const days = weekDays(week);
  const today = todayISO();
  const { supabase, portions, family } = await getContext();

  const [entriesRes, recipesRes] = await Promise.all([
    supabase
      .from("meal_plan_entries")
      .select("id, plan_date, meal_type, title, cooked_at, recipes(id, title, cook_minutes)")
      .gte("plan_date", days[0])
      .lte("plan_date", days[6])
      .order("created_at"),
    supabase.from("recipes").select("id, title, meal_types").order("title"),
  ]);
  const entries = (entriesRes.data ?? []) as unknown as Entry[];
  const recipes = (recipesRes.data ?? []) as { id: string; title: string; meal_types: string[] }[];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Меню на тиждень</h1>
          <p className="text-sm text-stone-600">
            {formatDate(days[0])} – {formatDate(days[6])} · готуємо на {portions.toLocaleString("uk-UA")} дорослої порції (
            {family.length} {family.length === 1 ? "людина" : "людей"})
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-secondary" href={`/menu?week=${addDays(week, -7)}`} aria-label="Попередній тиждень">←</Link>
          <Link className="btn-secondary" href="/menu">Цей тиждень</Link>
          <Link className="btn-secondary" href={`/menu?week=${addDays(week, 7)}`} aria-label="Наступний тиждень">→</Link>
        </div>
      </div>

      <Notice params={params} />

      <div className="mb-5 flex flex-wrap gap-2">
        <form action={autoFillWeek}>
          <input type="hidden" name="week" value={week} />
          <button type="submit" className="btn">Заповнити порожні дні</button>
        </form>
        <Link className="btn-secondary" href={`/shopping?week=${week}`}>Список покупок →</Link>
        {entries.length > 0 && (
          <form action={clearWeek} className="ml-auto">
            <input type="hidden" name="week" value={week} />
            <button type="submit" className="btn-ghost">Очистити тиждень</button>
          </form>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {days.map((date) => (
          <section key={date} className={`card ${date === today ? "ring-2 ring-brand-500" : ""}`}>
            <h2 className="h2 mb-3 flex items-baseline justify-between">
              {formatWeekday(date)}
              <span className="text-xs font-normal text-stone-500">
                {date === today ? "сьогодні · " : ""}
                {formatDate(date)}
              </span>
            </h2>
            <div className="space-y-3">
              {SLOTS.map((slot) => {
                const items = entries.filter((e) => e.plan_date === date && e.meal_type === slot);
                const options = recipes.filter((r) => r.meal_types.includes(slot));
                const others = recipes.filter((r) => !r.meal_types.includes(slot));
                return (
                  <div key={slot}>
                    <div className="mb-1 text-xs font-medium tracking-wide text-stone-500 uppercase">{MEAL_LABELS[slot]}</div>
                    {items.map((e) => (
                      <div key={e.id} className="flex items-center gap-2 py-0.5">
                        <form action={setCooked}>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="week" value={week} />
                          <input type="hidden" name="cooked" value={String(!e.cooked_at)} />
                          <button
                            type="submit"
                            aria-pressed={Boolean(e.cooked_at)}
                            aria-label={`Приготовано: ${e.recipes?.title ?? e.title}`}
                            title={e.cooked_at ? "Приготовано — натисніть, щоб скасувати" : "Позначити як приготовано (спише продукти із запасів)"}
                            className={`flex size-5 cursor-pointer items-center justify-center rounded border text-xs text-white ${
                              e.cooked_at ? "border-brand-600 bg-brand-600" : "border-stone-300 bg-white hover:border-brand-500"
                            }`}
                          >
                            {e.cooked_at ? "✓" : ""}
                          </button>
                        </form>
                        {e.recipes ? (
                          <Link
                            href={`/recipes/${e.recipes.id}`}
                            className={`min-w-0 flex-1 text-sm hover:underline ${e.cooked_at ? "text-stone-400 line-through" : ""}`}
                          >
                            {e.recipes.title}
                            {e.recipes.cook_minutes ? (
                              <span className="ml-1.5 text-xs text-stone-400">{e.recipes.cook_minutes} хв</span>
                            ) : null}
                          </Link>
                        ) : (
                          <span className="min-w-0 flex-1 text-sm">{e.title}</span>
                        )}
                        <form action={removePlanEntry}>
                          <input type="hidden" name="id" value={e.id} />
                          <button type="submit" className="btn-ghost" aria-label={`Прибрати: ${e.recipes?.title ?? e.title}`}>×</button>
                        </form>
                      </div>
                    ))}
                    {items.length === 0 && (
                      <form action={addPlanEntry} className="flex gap-1.5">
                        <input type="hidden" name="week" value={week} />
                        <input type="hidden" name="date" value={date} />
                        <input type="hidden" name="meal_type" value={slot} />
                        <select
                          name="recipe_id"
                          defaultValue=""
                          required
                          aria-label={`${MEAL_LABELS[slot]}, ${formatWeekday(date)}`}
                          className="input py-1.5 text-stone-500"
                        >
                          <option value="" disabled>обрати страву…</option>
                          {options.map((r) => (
                            <option key={r.id} value={r.id}>{r.title}</option>
                          ))}
                          {others.length > 0 && (
                            <optgroup label="Інші рецепти">
                              {others.map((r) => (
                                <option key={r.id} value={r.id}>{r.title}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        <button type="submit" className="btn-secondary px-2.5 py-1.5" aria-label="Додати">+</button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
