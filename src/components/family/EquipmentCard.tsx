"use client";

import { useMemo, useState, useTransition } from "react";
import { DEFAULT_EQUIPMENT } from "@/lib/family";
import { addEquipment, toggleEquipment } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui";

export interface EquipmentCardProps {
  equipment: { id: string; name: string }[];
}

export function EquipmentCard({ equipment }: EquipmentCardProps) {
  const [isPending, startTransition] = useTransition();
  const [customName, setCustomName] = useState("");

  const activeNames = useMemo(
    () => new Set(equipment.map((e) => e.name.toLowerCase().trim())),
    [equipment]
  );

  // Об'єднуємо типову техніку та будь-яку додану користувачем
  const allGear = useMemo(() => {
    const list = [...DEFAULT_EQUIPMENT];
    for (const item of equipment) {
      if (!list.some((d) => d.toLowerCase() === item.name.toLowerCase())) {
        list.push(item.name as (typeof DEFAULT_EQUIPMENT)[number]);
      }
    }
    return list;
  }, [equipment]);

  const handleToggle = (name: string) => {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("name", name);
      await toggleEquipment(fd);
    });
  };

  const handleAddCustom = (formData: FormData) => {
    startTransition(async () => {
      await addEquipment(formData);
      setCustomName("");
    });
  };

  return (
    <section
      id="equipment"
      className="flex flex-col gap-3.5 rounded-[18px] border border-line bg-surface p-5 sm:p-6"
    >
      <h2 className="text-[18px] font-bold text-ink">Техніка на кухні</h2>

      <div className="flex flex-wrap gap-2">
        {allGear.map((item) => {
          const isOn = activeNames.has(item.toLowerCase().trim());
          return (
            <button
              key={item}
              type="button"
              disabled={isPending}
              aria-pressed={isOn}
              onClick={() => handleToggle(item)}
              className={`flex h-11 items-center justify-center rounded-full border px-3.5 text-[14px] font-semibold transition-colors disabled:opacity-60 ${
                isOn
                  ? "border-family bg-family text-white shadow-xs"
                  : "border-line-strong bg-surface text-ink hover:bg-soft"
              }`}
            >
              {item}
            </button>
          );
        })}
      </div>

      <div className="text-[14px] leading-relaxed text-ink-2">
        Меню пропонує лише ті рецепти, для яких техніка є.
      </div>

      <form action={handleAddCustom} className="mt-1 flex flex-col gap-2 pt-2 border-t border-soft">
        <label htmlFor="eq-custom" className="text-[13px] font-semibold text-ink-2">
          Додати іншу техніку
        </label>
        <div className="flex gap-2">
          <input
            id="eq-custom"
            name="name"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="напр.: гриль, тостер, вафельниця"
            required
            className="h-11 w-full rounded-12 border border-line-strong bg-surface px-3.5 text-[15px] text-ink focus:border-family focus:ring-2 focus:ring-family-tint focus:outline-none"
          />
          <Button type="submit" variant="secondary" disabled={isPending || !customName.trim()} className="shrink-0 px-4">
            Додати
          </Button>
        </div>
      </form>
    </section>
  );
}
