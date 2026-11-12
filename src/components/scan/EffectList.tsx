const TONES: readonly (readonly [string, string])[] = [
  ["pantry", "bg-pantry-tint text-pantry-ink"],
  ["finance", "bg-finance-tint text-finance-ink"],
  ["shops", "bg-shops-tint text-shops-ink"],
];

export type ScanEffect = { key: string; title: string; mobileTitle: string; value: string; tone: string };

function toneClass(tone: string): string {
  return TONES.find(([id]) => id === tone)?.[1] ?? "bg-soft text-ink";
}

export function EffectList({ effects, layout }: { effects: readonly ScanEffect[]; layout: "cards" | "chips" }) {
  const rows = layout === "cards" ? effects.filter((effect) => effect.key !== "shops") : effects;
  if (layout === "cards") {
    return (
      <ul className="grid grid-cols-2 gap-2.5">
        {rows.map((effect) => (
          <li key={effect.key} className="rounded-18 bg-ink-raised px-3.5 py-3">
            <div className="text-xs text-ink-muted-on-dark">{effect.mobileTitle}</div>
            <div className="font-mono text-[15px] font-semibold text-lime">{effect.value}</div>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {rows.map((effect) => (
        <li key={effect.key} className={`rounded-12 px-3 py-2 text-[13px] font-semibold ${toneClass(effect.tone)}`}>
          {effect.title}: {effect.value}
        </li>
      ))}
    </ul>
  );
}
