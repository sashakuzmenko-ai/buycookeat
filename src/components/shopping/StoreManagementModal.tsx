"use client";

import React, { useState } from "react";
import Link from "next/link";
import { createStore, updateStore, deleteStore } from "@/app/(app)/shopping/actions";
import type { StoreInput } from "@/lib/prices";

export interface StoreManagementModalProps {
  stores: StoreInput[];
  week: string;
}

const ACCESS: Record<string, string> = { walk: "пішки", drive: "їхати", delivery: "доставка" };
const FREQUENCY: Record<string, string> = { daily: "щодня", weekly: "раз на тиждень", rare: "зрідка" };

export function StoreManagementModal({ stores, week }: StoreManagementModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="h-[44px] px-4 rounded-12 border border-line-strong bg-surface text-ink font-semibold text-[15px] hover:bg-soft transition cursor-pointer"
      >
        Керування магазинами
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="store-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs"
        >
          <div className="bg-surface rounded-[20px] max-w-xl w-full max-h-[90vh] flex flex-col shadow-xl overflow-hidden border border-line">
            <div className="p-5 border-b border-soft flex items-center justify-between">
              <h2 id="store-dialog-title" className="text-lg font-bold text-ink">
                Магазини та доставки
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
                                <label className="text-xs font-medium text-ink-2">Назва</label>
                                <input
                                  name="name"
                                  defaultValue={s.name}
                                  required
                                  className="w-full h-10 px-3 rounded-8 bg-surface border border-line text-sm"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs font-medium text-ink-2">Доступність</label>
                                  <select
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
                                  <label className="text-xs font-medium text-ink-2">Частота</label>
                                  <select
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
                                  className="h-8 px-3 rounded-8 border border-line text-xs font-medium"
                                >
                                  Скасувати
                                </button>
                                <button
                                  type="submit"
                                  className="h-8 px-3 rounded-8 bg-[#8A5600] text-white text-xs font-semibold"
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
                                className="text-xs font-semibold text-[#8A5600] hover:underline px-1"
                              >
                                Змінити
                              </button>
                              <form action={deleteStore}>
                                <input type="hidden" name="id" value={s.id} />
                                <input type="hidden" name="week" value={week} />
                                <button
                                  type="submit"
                                  className="text-stone-400 hover:text-red-600 px-1 font-bold text-base cursor-pointer"
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
                    className="w-full h-11 rounded-12 bg-[#8A5600] text-white font-semibold text-sm hover:bg-[#724600] transition"
                  >
                    Додати магазин
                  </button>
                </form>
              </div>

              <div className="pt-2 text-center">
                <Link
                  href="/settings"
                  className="text-xs text-[#8A5600] hover:underline"
                >
                  Перейти до повних налаштувань сім&apos;ї та техніки →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
