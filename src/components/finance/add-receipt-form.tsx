import { Button, Card, Field } from "@/components/ui";
import { createReceipt } from "@/app/(app)/finance/actions";
import type { PeriodKind } from "@/lib/finance";

export function AddReceiptForm({
  kind,
  anchor,
  defaultDate,
  storeNames,
  open,
}: {
  readonly kind: PeriodKind;
  readonly anchor: string;
  readonly defaultDate: string;
  readonly storeNames: readonly string[];
  readonly open: boolean;
}) {
  return (
    <Card>
      <details open={open || undefined}>
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center text-[15px] font-semibold text-finance focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finance [&::-webkit-details-marker]:hidden">
          Додати чек
        </summary>
        <form action={createReceipt} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="range" value={kind} />
          <input type="hidden" name="at" value={anchor} />
          <Field label="Магазин" name="store_name" required maxLength={200} list="finance-stores" autoComplete="off" />
          <datalist id="finance-stores">
            {storeNames.map((name, index) => (
              <option key={`${name}-${index}`} value={name} />
            ))}
          </datalist>
          <Field label="Дата" name="purchased_at" type="date" required defaultValue={defaultDate} />
          <Field
            label="Сума, грн"
            name="total"
            required
            inputMode="decimal"
            placeholder="0,00"
            autoComplete="off"
            wrapperClassName="sm:col-span-2"
          />
          <div className="sm:col-span-2">
            <Button type="submit" module="finance">
              Записати чек
            </Button>
          </div>
        </form>
      </details>
    </Card>
  );
}
