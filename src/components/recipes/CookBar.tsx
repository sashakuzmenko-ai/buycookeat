import { Button } from "@/components/ui";
import { cookRecipe } from "@/app/(app)/recipes/actions";

export function CookBar({
  recipeId,
  entryId,
  alreadyCooked,
}: {
  readonly recipeId: string;
  readonly entryId: string | null;
  readonly alreadyCooked: boolean;
}) {
  return (
    <div className="fixed inset-x-0 bottom-[84px] z-20 border-t border-line bg-surface px-4 pt-3 pb-3 lg:bottom-0 lg:left-[232px] lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2">
        {alreadyCooked ? (
          <Button type="button" variant="secondary" size="lg" className="w-full" disabled>
            Уже приготовано сьогодні
          </Button>
        ) : (
          <form action={cookRecipe}>
            <input type="hidden" name="recipe_id" value={recipeId} />
            {entryId ? <input type="hidden" name="entry_id" value={entryId} /> : null}
            <Button type="submit" size="lg" className="w-full !bg-ink !text-white hover:!bg-ink-raised">
              Готувати — списати зі складу
            </Button>
          </form>
        )}
        <p className="text-center text-xs text-ink-2">
          {alreadyCooked
            ? "Повторно зі складу не спишеться."
            : "Кількості вже перераховано на вашу сім'ю"}
        </p>
      </div>
    </div>
  );
}
