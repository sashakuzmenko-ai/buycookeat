"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createStore, updateStore, deleteStore } from "@/app/(app)/shopping/actions";
import type { StoreInput } from "@/lib/prices";

export interface StoreManagementModalProps {
  readonly stores: readonly StoreInput[];
  readonly week: string;
}

const ACCESS: Record<string, string> = { walk: "пішки", drive: "їхати", delivery: "доставка" };
const FREQUENCY: Record<string, string> = { daily: "щодня", weekly: "раз на тиждень", rare: "зрідка" };

export function StoreManagementModal({ stores, week }: Readonly<StoreManagementModalProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="h-[44px] px-4 rounded-12 border border-line-strong bg-surface text-ink font-semibold text-[15px] hover:bg-soft transition cursor-pointer"
      >
        Керування магазинами
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setIsOpen(false)}
        aria-labelledby="store-dialog-title"
        className="fixed inset-0 m-auto bg-surface rounded-[20px] max-w-xl w-full max-h-[90vh] flex flex-col shadow-xl overflow-hidden border border-line p-0 backdrop:bg-ink/60 backdrop:backdrop-blur-xs"
      >
        <div className="p-5 border-b border-soft flex items-center justify-between">
          <h2 id="store-dialog-title" className="text-lg font-bold text-ink">
            Магазини та доставки
          </h2>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-ink-2 hover:bg-soft hover:text-ink text-xl transition cursor-pointer"
            aria-label="Закрити"
          >
            ×
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* List of existing stores */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-ink-2">
              Наші магазини ({stores.length})
            </div>
            {stores.length === 0 ? (
              <div className="text-sm text-ink-2">Магазинів ще не додано.</div>
            ) : (
              <ul className="divide-y divide-soft text-sm">
                {stores.map((s) => {
                  const isEditing = editingId === s.id;
                  return (
                    <li key={s.id} className="py-2.5">
                      {isEditing ? (
                        <form
                          action={async (fd) => {
                            await updateStore(fd);
                            setEditingId(null);
                          }}
                          className="space-y-2 bg-soft p-3 rounded-12"
                        >
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="week" value={week} />
                          <div>
                            <label htmlFor={`edit-store-name-${s.id}`} className="text-xs font-medium text-ink-2">
                              Назва
                            </label>
                            <input
                              id={`edit-store-name-${s.id}`}
                              name="name"
                              defaultValue={s.name}
                              required
                              className="w-full h-10 px-3 rounded-8 bg-surface border border-line text-sm"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label htmlFor={`edit-store-access-${s.id}`} className="text-xs font-medium text-ink-2">
                                Доступність
                              </label>
                              <select
                                id={`edit-store-access-${s.id}`}
                                name="access"
                                defaultValue={s.access ?? "walk"}
                                className="w-full h-10 px-2 rounded-8 bg-surface border border-line text-sm"
                              >
                                <option value="walk">пішки</option>
                                <option value="drive">їхати</option>
                                <option value="delivery">доставка</option>
                              </select>
                            </div>
                            <div>
                              <label htmlFor={`edit-store-freq-${s.id}`} className="text-xs font-medium text-ink-2">
                                Частота
                              </label>
                              <select
                                id={`edit-store-freq-${s.id}`}
                                name="visit_frequency"
                                defaultValue={s.visit_frequency ?? "daily"}
                                className="w-full h-10 px-2 rounded-8 bg-surface border border-line text-sm"
                              >
                                <option value="daily">щодня</option>
                                <option value="weekly">раз на тиждень</option>
                                <option value="rare">зрідка</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="min-h-[44px] px-3.5 rounded-12 border border-line text-xs font-medium cursor-pointer"
                            >
                              Скасувати
                            </button>
                            <button
                              type="submit"
                              className="min-h-[44px] px-3.5 rounded-12 bg-shops text-white text-xs font-semibold hover:bg-shops-ink cursor-pointer"
                            >
                              Зберегти
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-ink flex-1 truncate">
                            {s.name}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-soft text-ink-2">
                            {ACCESS[s.access ?? "walk"] ?? s.access}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-soft text-ink-2">
                            {FREQUENCY[s.visit_frequency ?? "daily"] ?? s.visit_frequency}
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingId(s.id)}
                            className="min-h-[44px] inline-flex items-center text-xs font-semibold text-shops hover:underline px-2 cursor-pointer"
                          >
                            Змінити
                          </button>
                          <form action={deleteStore}>
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="week" value={week} />
                            <button
                              type="submit"
                              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-ink-2/40 hover:text-recipes text-lg cursor-pointer"
                              aria-label={`Видалити магазин ${s.name}`}
                            >
                              ×
                            </button>
                          </form>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Add Store Form */}
          <div className="pt-3 border-t border-soft space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-ink-2">
              Додати новий магазин
            </div>
            <form action={createStore} className="space-y-3">
              <input type="hidden" name="week" value={week} />
              <div>
                <label htmlFor="new-store-name" className="text-xs font-medium text-ink-2">
                  Назва магазину
                </label>
                <input
                  id="new-store-name"
                  name="name"
                  placeholder="напр. АТБ, Сільпо, Ринок"
                  required
                  className="w-full h-11 px-3 rounded-12 bg-surface border border-line-strong text-sm focus:border-ink"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="new-store-access" className="text-xs font-medium text-ink-2">
                    Доступність
                  </label>
                  <select
                    id="new-store-access"
                    name="access"
                    defaultValue="walk"
                    className="w-full h-11 px-2 rounded-12 bg-surface border border-line-strong text-sm"
                  >
                    <option value="walk">пішки</option>
                    <option value="drive">їхати</option>
                    <option value="delivery">доставка</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="new-store-freq" className="text-xs font-medium text-ink-2">
                    Частота відвідування
                  </label>
                  <select
                    id="new-store-freq"
                    name="visit_frequency"
                    defaultValue="daily"
                    className="w-full h-11 px-2 rounded-12 bg-surface border border-line-strong text-sm"
                  >
                    <option value="daily">щодня</option>
                    <option value="weekly">раз на тиждень</option>
                    <option value="rare">зрідка</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                className="w-full h-11 min-h-[44px] rounded-12 bg-shops text-white font-semibold text-sm hover:bg-shops-ink transition cursor-pointer"
              >
                Додати магазин
              </button>
            </form>
          </div>

          <div className="pt-2 text-center">
            <Link
              href="/settings"
              className="text-xs text-shops hover:underline"
            >
              Перейти до повних налаштувань сім&apos;ї та техніки →
            </Link>
          </div>
        </div>
      </dialog>
    </>
  );
}
