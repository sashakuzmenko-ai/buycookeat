import { type StockSufficiency } from "@/lib/pantry";

export type SufficiencyCardProps = {
  readonly sufficiency: StockSufficiency;
};

export function SufficiencyCard({ sufficiency }: SufficiencyCardProps) {
  if (!sufficiency.willRunOut || !sufficiency.message) return null;

  return (
    <section className="flex flex-col gap-2.5 rounded-18 bg-pantry-tint p-5">
      <h2 className="font-bold text-base text-ink">На скільки вистачить</h2>
      <div className="text-sm leading-relaxed text-pantry-ink">
        {sufficiency.message}
      </div>
    </section>
  );
}
