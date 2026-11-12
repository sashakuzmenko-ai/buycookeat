import { Card } from "@/components/ui";

export default function FinancePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="h1">Фінанси</h1>
        <p className="text-sm text-stone-600">
          Книга витрат на їжу та аналітика покупок
        </p>
      </div>

      <Card className="text-center py-12">
        <p className="text-base text-stone-600">
          Витрати з&apos;являться після першого підтвердженого чека
        </p>
      </Card>
    </div>
  );
}
