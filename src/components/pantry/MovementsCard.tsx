import { type MovementView } from "@/lib/pantry";

export type MovementsCardProps = {
  readonly movements: readonly MovementView[];
};

export function MovementsCard({ movements }: MovementsCardProps) {
  return (
    <section className="flex flex-col gap-3.5 rounded-18 border border-line bg-surface p-5">
      <h2 className="font-bold text-lg text-ink">Рух за сьогодні</h2>

      {movements.length === 0 ? (
        <div className="py-6 text-center text-sm text-ink-2">
          Сьогодні рухів на складі ще не було
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {movements.map((m) => (
            <div key={m.id} className="flex items-start gap-3">
              <div
                style={{ backgroundColor: m.bg, color: m.fg }}
                className="flex size-8 shrink-0 items-center justify-center rounded-[10px] font-mono text-base font-semibold"
              >
                {m.sign}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{m.title}</div>
                <div className="text-[13px] leading-snug text-ink-2">{m.note}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
