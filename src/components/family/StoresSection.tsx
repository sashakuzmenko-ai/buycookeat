"use client";

import { addStore, deleteRow } from "@/app/(app)/actions";
import { Button } from "@/components/ui";

const ACCESS: Record<string, string> = {
  walk: "пішки",
  drive: "їхати",
  delivery: "доставка",
};

const FREQUENCY: Record<string, string> = {
  daily: "щодня",
  weekly: "раз на тиждень",
  rare: "зрідка",
};

export interface StoreItem {
  id: string;
  name: string;
  access: string;
  visit_frequency: string;
  phone: string | null;
  notes: string | null;
}

export interface StoresSectionProps {
  stores: StoreItem[];
}

export function StoresSection({ stores }: StoresSectionProps) {
  return (
    <section
      id="stores"
      className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface p-5 sm:p-6"
    >
      <div>
        <h2 className="text-[18px] font-bold text-ink">Наші магазини і доставки</h2>
        <p className="mt-1 text-[13px] text-ink-2">
          Порядок і частота визначають групи у списку покупок.
        </p>
      </div>

      {stores.length > 0 ? (
        <ul className="flex flex-col divide-y divide-soft">
          {stores.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="flex-1 min-w-[160px]">
                <span className="font-semibold text-ink text-[15px]">{s.name}</span>
                {(s.phone || s.notes) && (
                  <span className="ml-2 text-[12px] text-ink-2">
                    {[s.phone, s.notes].filter(Boolean).join(" · ")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-soft px-2.5 py-0.5 text-xs font-medium text-ink">
                  {ACCESS[s.access] ?? s.access}
                </span>
                <span className="rounded-full bg-soft px-2.5 py-0.5 text-xs font-medium text-ink">
                  {FREQUENCY[s.visit_frequency] ?? s.visit_frequency}
                </span>
                <form action={deleteRow}>
                  <input type="hidden" name="table" value="stores" />
                  <input type="hidden" name="id" value={s.id} />
                  <button
                    type="submit"
                    aria-label={`Видалити магазин: ${s.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-ink-2 hover:bg-soft hover:text-ink"
                  >
                    ×
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-12 bg-soft p-3 text-[14px] text-ink-2">
          Магазини ще не додані.
        </div>
      )}

      <form action={addStore} className="mt-2 flex flex-col gap-3 pt-3 border-t border-soft">
        <h3 className="text-[14px] font-bold text-ink">Додати магазин</h3>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <div className="flex flex-col gap-1">
            <label htmlFor="st-name" className="text-[13px] font-semibold text-ink-2">
              Назва <span className="text-[#8C2A18]">*</span>
            </label>
            <input
              id="st-name"
              name="name"
              required
              placeholder="напр.: Сільпо, АТБ, Ринок"
              className="h-11 rounded-12 border border-line-strong bg-surface px-3.5 text-[15px] text-ink focus:border-family focus:ring-2 focus:ring-family-tint focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="st-access" className="text-[13px] font-semibold text-ink-2">
              Як дістатись
            </label>
            <select
              id="st-access"
              name="access"
              defaultValue="walk"
              className="h-11 rounded-12 border border-line-strong bg-surface px-3 text-[15px] text-ink focus:border-family focus:ring-2 focus:ring-family-tint focus:outline-none"
            >
              <option value="walk">пішки</option>
              <option value="drive">їхати</option>
              <option value="delivery">доставка</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="st-frequency" className="text-[13px] font-semibold text-ink-2">
              Як часто
            </label>
            <select
              id="st-frequency"
              name="visit_frequency"
              defaultValue="daily"
              className="h-11 rounded-12 border border-line-strong bg-surface px-3 text-[15px] text-ink focus:border-family focus:ring-2 focus:ring-family-tint focus:outline-none"
            >
              <option value="daily">щодня</option>
              <option value="weekly">раз на тиждень</option>
              <option value="rare">зрідка</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="st-phone" className="text-[13px] font-semibold text-ink-2">
              Телефон
            </label>
            <input
              id="st-phone"
              name="phone"
              type="tel"
              placeholder="+380..."
              className="h-11 rounded-12 border border-line-strong bg-surface px-3.5 text-[15px] text-ink focus:border-family focus:ring-2 focus:ring-family-tint focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1 sm:col-span-2">
            <label htmlFor="st-notes" className="text-[13px] font-semibold text-ink-2">
              Що там купуємо
            </label>
            <input
              id="st-notes"
              name="notes"
              placeholder="напр.: овочі, сири, хліб"
              className="h-11 rounded-12 border border-line-strong bg-surface px-3.5 text-[15px] text-ink focus:border-family focus:ring-2 focus:ring-family-tint focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-1 flex justify-end">
          <Button type="submit" variant="secondary" className="text-[14px]">
            Додати магазин
          </Button>
        </div>
      </form>
    </section>
  );
}
