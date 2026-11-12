import { Notice } from "@/components/Notice";
import { FinanceScreen } from "@/components/finance/finance-screen";
import { buildFinanceModel } from "@/components/finance/model";
import { getContext } from "@/lib/context";
import { todayISO } from "@/lib/dates";
import { parsePeriod } from "@/lib/finance";
import { loadFinance } from "./load";

type FinancePageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FinancePage({ searchParams }: FinancePageProps) {
  const params = await searchParams;
  const today = todayISO();
  const { kind, anchor } = parsePeriod(first(params.range), first(params.at), today);
  const { supabase, householdId } = await getContext();
  const data = await loadFinance(supabase, householdId, kind, anchor, today);

  if (data.error) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="h1">Фінанси</h1>
        <p role="alert" className="mt-4 rounded-12 border border-recipes/30 bg-recipes-tint px-4 py-3 text-sm text-recipes-ink">
          Не вдалося завантажити витрати. Сторінка читає чеки й місячний бюджет — вони з’являться, коли міграцію епіку застосовано.
        </p>
      </div>
    );
  }

  const model = buildFinanceModel({
    kind,
    anchor,
    today,
    budget: data.budget,
    receipts: data.receipts,
    householdCount: data.householdCount,
  });

  return (
    <>
      <Notice params={params} />
      <FinanceScreen model={model} storeNames={data.storeNames} formOpen={Boolean(first(params.error))} />
    </>
  );
}
