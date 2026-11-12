"use client";

import React, { useState } from "react";
import { addShoppingItem } from "@/app/(app)/shopping/actions";
import type { StoreInput } from "@/lib/prices";

export function AddShoppingItemDialog({
  stores,
  week,
}: {
  stores: StoreInput[];
  week: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="h-[44px] px-[18px] rounded-12 border border-line-strong bg-surface text-ink font-semibold text-[15px] hover:bg-soft transition cursor-pointer"
      >
        Додати позицію
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-item-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs"
        >
          <div className="bg-surface rounded-[20px] max-w-md w-full shadow-xl overflow-hidden border border-line p-5">
            <div className="flex items-center justify-between pb-3 border-b border-soft mb-4">
              <h2 id="add-item-dialog-title" className="text-lg font-bold text-ink">
                Додати до списку покупок
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-ink-2 hover:bg-soft hover:text-ink text-xl transition"
                aria-label="Закрити"
              >
                ×
              </button>
            </div>

            <form
              action={async (fd) => {
                await addShoppingItem(fd);
                setIsOpen(false);
              }}
              className="space-y-4"
            >
              <input type="hidden" name="week" value={week} />
              <div>
                <label htmlFor="modal-item-title" className="block text-xs font-semibold text-ink-2 mb-1">
                  Що купити
                </label>
                <input
                  id="modal-item-title"
                  name="title"
                  placeholder="напр.: серветки, кава, фрукти"
                  required
                  autoFocus
                  className="w-full h-11 px-3 rounded-12 bg-surface border border-line-strong text-sm focus:border-ink"
                />
              </div>

              <div>
                <label htmlFor="modal-item-store" className="block text-xs font-semibold text-ink-2 mb-1">
                  Магазин (необов&apos;язково)
                </label>
                <select
                  id="modal-item-store"
                  name="store_id"
                  defaultValue=""
                  className="w-full h-11 px-3 rounded-12 bg-surface border border-line-strong text-sm focus:border-ink"
                >
                  <option value="">Без прив&apos;язки до магазину</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="h-11 px-4 rounded-12 border border-line text-sm font-semibold hover:bg-soft transition"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  className="h-11 px-5 rounded-12 bg-[#8A5600] text-white text-sm font-semibold hover:bg-[#724600] transition"
                >
                  Додати
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
