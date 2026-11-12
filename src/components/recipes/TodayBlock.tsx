import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { formatPortionPrice, formatPortions, todayMealLabel } from "@/lib/recipes";
import { cookRecipe } from "@/app/(app)/recipes/actions";

export function TodayBlock({
  entryId,
  recipeId,
  mealType,
  title,
  description,
  cookMinutes,
  productCount,
  portionPrice,
  missing,
  portionsLabel,
}: {
  readonly entryId: string;
  readonly recipeId: string | null;
  readonly mealType: string;
  readonly title: string;
  readonly description: string | null;
  readonly cookMinutes: number | null;
  readonly productCount: number | null;
  readonly portionPrice: number | null;
  readonly missing: number | null;
  readonly portionsLabel: string | null;
}) {
  const status =
    missing == null ? null : missing > 0 ? `бракує ${missing}` : "усе є на складі";

  return (
    <Card variant="tint" module="recipes" className="flex flex-wrap items-end justify-between gap-6 rounded-[22px] p-6 md:p-7">
      <div className="flex min-w-0 flex-1 basis-[320px] flex-col gap-3">
        <p className="text-xs font-semibold tracking-[0.08em] text-recipes-ink uppercase">
          {todayMealLabel(mealType)}
          {status ? ` · ${status}` : ""}
        </p>
        {recipeId ? (
          <Link href={`/recipes/${recipeId}`} className="text-ink no-underline">
            <h2 className="font-display text-[32px] leading-[1.05] font-bold text-ink md:text-[40px]">{title}</h2>
          </Link>
        ) : (
          <h2 className="font-display text-[32px] leading-[1.05] font-bold text-ink md:text-[40px]">{title}</h2>
        )}
        {description ? <p className="max-w-xl text-[15px] leading-relaxed text-ink-2">{description}</p> : null}
        {portionsLabel ? <p className="max-w-xl text-[15px] leading-relaxed text-ink-2">{portionsLabel}</p> : null}
      </div>
      <div className="flex flex-wrap items-end gap-7">
        {cookMinutes != null ? (
          <div>
            <div className="font-display text-[22px] font-medium text-ink">{cookMinutes} хв</div>
            <div className="text-[13px] text-recipes-ink">готування</div>
          </div>
        ) : null}
        {productCount != null && productCount > 0 ? (
          <div>
            <div className="font-display text-[22px] font-medium text-ink">{productCount}</div>
            <div className="text-[13px] text-recipes-ink">продуктів</div>
          </div>
        ) : null}
        {portionPrice != null ? (
          <div>
            <div className="font-display text-[22px] font-medium text-ink">{formatPortionPrice(portionPrice)}</div>
            <div className="text-[13px] text-recipes-ink">за порцію</div>
          </div>
        ) : null}
        <form action={cookRecipe}>
          <input type="hidden" name="entry_id" value={entryId} />
          {recipeId ? <input type="hidden" name="recipe_id" value={recipeId} /> : null}
          <Button type="submit" size="lg" className="!bg-ink !text-white hover:!bg-ink-raised">
            Готувати
          </Button>
        </form>
      </div>
    </Card>
  );
}

export function portionsSentence(portions: number, servings: number | null): string {
  if (servings != null && servings > 0) {
    return `У меню — ${formatPortions(servings)} порції.`;
  }
  return `Кількості вже перераховано на ${formatPortions(portions)} порції.`;
}
