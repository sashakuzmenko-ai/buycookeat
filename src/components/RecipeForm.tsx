"use client";

import { useState } from "react";
import { MEAL_LABELS, MEAL_TYPES } from "@/lib/seed-data";

type Product = { id: string; name: string; unit: string };
type Row = { key: number; product_id: string; quantity: string; optional: boolean };

export type RecipeFormValues = {
  id?: string;
  title: string;
  description: string;
  instructions: string;
  base_servings: number;
  cook_minutes: number | null;
  meal_types: string[];
  kid_notes: string;
  ingredients: { product_id: string; quantity: number; optional: boolean }[];
};

export function RecipeForm({
  action,
  products,
  initial,
}: {
  action: (formData: FormData) => void;
  products: Product[];
  initial?: RecipeFormValues;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial?.ingredients.length
      ? initial.ingredients.map((r, i) => ({ key: i, product_id: r.product_id, quantity: String(r.quantity), optional: r.optional }))
      : [{ key: 0, product_id: "", quantity: "", optional: false }],
  );
  const [nextKey, setNextKey] = useState(rows.length);
  const unitOf = (id: string) => products.find((p) => p.id === id)?.unit ?? "";
  const patch = (key: number, change: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)));

  const payload = JSON.stringify(
    rows.filter((r) => r.product_id).map(({ product_id, quantity, optional }) => ({ product_id, quantity, optional })),
  );

  return (
    <form action={action} className="space-y-4">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="ingredients" value={payload} />

      <div className="card space-y-3">
        <div>
          <label className="label" htmlFor="title">Назва</label>
          <input className="input" id="title" name="title" defaultValue={initial?.title} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="base_servings">Дорослих порцій у рецепті</label>
            <input className="input" id="base_servings" name="base_servings" inputMode="decimal" defaultValue={initial?.base_servings ?? 4} required />
          </div>
          <div>
            <label className="label" htmlFor="cook_minutes">Час приготування, хв</label>
            <input className="input" id="cook_minutes" name="cook_minutes" inputMode="numeric" defaultValue={initial?.cook_minutes ?? ""} />
          </div>
        </div>
        <fieldset>
          <legend className="label">Коли їмо</legend>
          <div className="flex flex-wrap gap-3">
            {MEAL_TYPES.map((m) => (
              <label key={m} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="meal_types" value={m} defaultChecked={initial?.meal_types.includes(m)} className="size-4 accent-brand-600" />
                {MEAL_LABELS[m]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="card">
        <h2 className="h2 mb-3">Інгредієнти</h2>
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.key} className="flex flex-wrap items-center gap-2">
              <select
                className="input min-w-0 flex-1 basis-40"
                aria-label="Продукт"
                value={row.product_id}
                onChange={(e) => patch(row.key, { product_id: e.target.value })}
              >
                <option value="">продукт…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input
                className="input w-24"
                aria-label="Кількість"
                inputMode="decimal"
                placeholder="к-сть"
                value={row.quantity}
                onChange={(e) => patch(row.key, { quantity: e.target.value })}
              />
              <span className="w-6 text-sm text-stone-500">{unitOf(row.product_id)}</span>
              <label className="flex items-center gap-1 text-xs text-stone-500">
                <input type="checkbox" checked={row.optional} onChange={(e) => patch(row.key, { optional: e.target.checked })} className="size-4 accent-brand-600" />
                за бажанням
              </label>
              <button type="button" className="btn-ghost" aria-label="Прибрати інгредієнт" onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}>
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary mt-3"
          onClick={() => {
            setRows((rs) => [...rs, { key: nextKey, product_id: "", quantity: "", optional: false }]);
            setNextKey((k) => k + 1);
          }}
        >
          + інгредієнт
        </button>
        <p className="mt-2 text-xs text-stone-500">Немає потрібного продукту? Додайте його на сторінці «Продукти».</p>
      </div>

      <div className="card space-y-3">
        <div>
          <label className="label" htmlFor="instructions">Приготування</label>
          <textarea className="input min-h-40" id="instructions" name="instructions" defaultValue={initial?.instructions} />
        </div>
        <div>
          <label className="label" htmlFor="kid_notes">Примітки для дітей</label>
          <input className="input" id="kid_notes" name="kid_notes" defaultValue={initial?.kid_notes} placeholder="напр.: без перцю, перевірити на кістки" />
        </div>
        <div>
          <label className="label" htmlFor="description">Короткий опис</label>
          <input className="input" id="description" name="description" defaultValue={initial?.description} />
        </div>
      </div>

      <button className="btn">Зберегти рецепт</button>
    </form>
  );
}
