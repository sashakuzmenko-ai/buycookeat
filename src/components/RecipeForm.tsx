"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, Field } from "@/components/ui";
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

const controlClass =
  "h-11 min-h-[44px] w-full rounded-12 border border-line-strong bg-surface px-3.5 text-[15px] text-ink outline-none transition focus:border-recipes focus:ring-2 focus:ring-recipes-tint";

export function RecipeForm({
  action,
  products,
  initial,
}: {
  readonly action: (formData: FormData) => void;
  readonly products: readonly Product[];
  readonly initial?: RecipeFormValues;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial?.ingredients.length
      ? initial.ingredients.map((row, index) => ({
          key: index,
          product_id: row.product_id,
          quantity: String(row.quantity),
          optional: row.optional,
        }))
      : [{ key: 0, product_id: "", quantity: "", optional: false }],
  );
  const [nextKey, setNextKey] = useState(rows.length);
  const unitOf = (id: string) => products.find((product) => product.id === id)?.unit ?? "";
  const patch = (key: number, change: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));

  const payload = JSON.stringify(
    rows
      .filter((row) => row.product_id)
      .map(({ product_id, quantity, optional }) => ({ product_id, quantity, optional })),
  );

  return (
    <form action={action} className="space-y-4">
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="ingredients" value={payload} />

      <Card className="space-y-3 p-5">
        <Field label="Назва" id="title" name="title" defaultValue={initial?.title} required module="recipes" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Дорослих порцій у рецепті"
            id="base_servings"
            name="base_servings"
            inputMode="decimal"
            defaultValue={initial?.base_servings ?? 4}
            required
            module="recipes"
          />
          <Field
            label="Час приготування, хв"
            id="cook_minutes"
            name="cook_minutes"
            inputMode="numeric"
            defaultValue={initial?.cook_minutes ?? ""}
            module="recipes"
          />
        </div>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-semibold text-ink-2">Коли їмо</legend>
          <div className="flex flex-wrap gap-3">
            {MEAL_TYPES.map((meal) => (
              <label key={meal} className="flex min-h-11 items-center gap-2 text-[15px]">
                <input
                  type="checkbox"
                  name="meal_types"
                  value={meal}
                  defaultChecked={initial?.meal_types.includes(meal)}
                  className="size-[18px] accent-recipes"
                />
                {MEAL_LABELS[meal]}
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      <Card className="p-5">
        <h2 className="h2 mb-3">Інгредієнти</h2>
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.key} className="flex flex-wrap items-center gap-2">
              <select
                className={`${controlClass} min-w-0 flex-1 basis-40`}
                aria-label="Продукт"
                value={row.product_id}
                onChange={(event) => patch(row.key, { product_id: event.target.value })}
              >
                <option value="">продукт…</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              <input
                className={`${controlClass} w-28 flex-none`}
                aria-label="Кількість"
                inputMode="decimal"
                placeholder="к-сть"
                value={row.quantity}
                onChange={(event) => patch(row.key, { quantity: event.target.value })}
              />
              <span className="w-8 text-sm text-ink-2">{unitOf(row.product_id)}</span>
              <label className="flex min-h-11 items-center gap-2 text-[13px] text-ink-2">
                <input
                  type="checkbox"
                  checked={row.optional}
                  onChange={(event) => patch(row.key, { optional: event.target.checked })}
                  className="size-[18px] accent-recipes"
                />
                за бажанням
              </label>
              <Button
                type="button"
                variant="secondary"
                aria-label="Прибрати інгредієнт"
                className="size-11 px-0"
                onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
              >
                ×
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          onClick={() => {
            setRows((current) => [...current, { key: nextKey, product_id: "", quantity: "", optional: false }]);
            setNextKey((key) => key + 1);
          }}
        >
          + інгредієнт
        </Button>
        <p className="mt-2 text-[13px] text-ink-2">
          Немає потрібного продукту? Додайте його на сторінці{" "}
          <Link href="/products" className="font-semibold text-recipes">
            Продукти
          </Link>
          .
        </p>
      </Card>

      <Card className="space-y-3 p-5">
        <LabeledTextarea id="instructions" name="instructions" label="Приготування" defaultValue={initial?.instructions} />
        <Field
          label="Примітки для дітей"
          id="kid_notes"
          name="kid_notes"
          defaultValue={initial?.kid_notes}
          placeholder="напр.: без перцю, перевірити на кістки"
          module="recipes"
        />
        <Field
          label="Короткий опис"
          id="description"
          name="description"
          defaultValue={initial?.description}
          module="recipes"
        />
      </Card>

      <Button type="submit" module="recipes">
        Зберегти рецепт
      </Button>
    </form>
  );
}

function LabeledTextarea({
  id,
  name,
  label,
  defaultValue,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly defaultValue?: string;
}) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-2">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        defaultValue={defaultValue}
        rows={8}
        className="min-h-40 w-full rounded-12 border border-line-strong bg-surface px-3.5 py-2.5 text-[15px] text-ink outline-none transition focus:border-recipes focus:ring-2 focus:ring-recipes-tint"
      />
    </div>
  );
}
