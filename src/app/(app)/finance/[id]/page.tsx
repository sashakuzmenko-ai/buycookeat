import Link from "next/link";
import { Notice } from "@/components/Notice";
import { ReceiptDetail } from "@/components/finance/receipt-detail";
import { getContext } from "@/lib/context";
import { formatDate, todayISO } from "@/lib/dates";
import { amountOf, categoryLabel, financePath, formatUah, parsePeriod, receiptNote, sourceLabel, storeLabel } from "@/lib/finance";
import { loadReceipt } from "../load";

type ReceiptPageProps = {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReceiptPage({ params, searchParams }: ReceiptPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const today = todayISO();
  const { kind, anchor } = parsePeriod(first(query.range), first(query.at), today);
  const backHref = financePath(kind, anchor);
  const { supabase, householdId } = await getContext();
  const loaded = await loadReceipt(supabase, householdId, id);

  if (loaded.error) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="h1">Чек</h1>
        <p role="alert" className="mt-4 text-sm text-recipes-ink">
          Не вдалося відкрити чек.
        </p>
      </div>
    );
  }

  if (!loaded.receipt) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="h1">Чек не знайдено</h1>
        <Link href={backHref} className="mt-4 inline-flex min-h-[44px] items-center text-sm font-semibold text-finance">
          До фінансів
        </Link>
      </div>
    );
  }

  const receipt = loaded.receipt;
  return (
    <>
      <Notice params={query} />
      <ReceiptDetail
        title={storeLabel(receipt.storeName)}
        dateLabel={`${formatDate(receipt.purchasedAt)} ${receipt.purchasedAt.slice(0, 4)}`}
        amount={formatUah(amountOf(receipt))}
        note={receiptNote(receipt.items.length, sourceLabel(receipt.inputSource, receipt.scanInputType))}
        items={receipt.items.map((item) => ({
          id: item.id,
          name: item.productName?.trim() || item.rawName.trim() || "Позиція",
          quantity: item.quantity,
          unit: item.unit,
          price: item.price,
          category: categoryLabel(item.category, item.productId !== null),
        }))}
        id={receipt.id}
        kind={kind}
        anchor={anchor}
        backHref={backHref}
      />
    </>
  );
}
