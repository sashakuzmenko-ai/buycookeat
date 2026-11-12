import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { deleteReceipt } from "@/app/(app)/finance/actions";
import { formatQuantity, formatUah, type PeriodKind } from "@/lib/finance";

export type ReceiptDetailItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  price: number | null;
  category: string;
};

export function ReceiptDetail({
  title,
  dateLabel,
  amount,
  note,
  items,
  id,
  kind,
  anchor,
  backHref,
}: {
  readonly title: string;
  readonly dateLabel: string;
  readonly amount: string;
  readonly note: string;
  readonly items: readonly ReceiptDetailItem[];
  readonly id: string;
  readonly kind: PeriodKind;
  readonly anchor: string;
  readonly backHref: string;
}) {
  return (
    <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-4">
      <Link href={backHref} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-finance">
        До фінансів
      </Link>
      <div>
        <p className="text-sm font-semibold text-finance">Чек</p>
        <h1 className="h1 mt-1">{title}</h1>
        <p className="mt-2 font-mono text-[15px] text-ink-2">
          {dateLabel} · {amount}
        </p>
        <p className="mt-1 text-sm text-ink-2">{note}</p>
      </div>
      <Card>
        <h2 className="h2 mb-3">Позиції</h2>
        {items.length === 0 ? (
          <p className="text-[15px] text-ink-2">У цьому чеку немає позицій. Суму записано загальним рядком.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="text-[13px] text-ink-2">
                  <th className="py-2 pr-3 font-semibold">Назва</th>
                  <th className="py-2 pr-3 font-semibold">Категорія</th>
                  <th className="py-2 pr-3 font-semibold">Кількість</th>
                  <th className="py-2 text-right font-semibold">Ціна</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-dashed border-line-strong">
                    <td className="py-2.5 pr-3 font-semibold">{item.name}</td>
                    <td className="py-2.5 pr-3 text-ink-2">{item.category}</td>
                    <td className="py-2.5 pr-3 font-mono">{formatQuantity(item.quantity, item.unit)}</td>
                    <td className="py-2.5 text-right font-mono font-semibold">
                      {item.price === null ? "—" : formatUah(item.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <details className="rounded-18 border border-line bg-surface p-4">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finance [&::-webkit-details-marker]:hidden">
          Видалити чек
        </summary>
        <p className="mt-2 text-sm text-ink-2">Чек і його позиції зникнуть з книги витрат.</p>
        <form action={deleteReceipt} className="mt-3">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="range" value={kind} />
          <input type="hidden" name="at" value={anchor} />
          <Button type="submit" variant="secondary">
            Видалити назавжди
          </Button>
        </form>
      </details>
    </div>
  );
}
