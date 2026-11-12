"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { clarifyScanItem } from "@/app/(app)/scan/actions";
import { PRODUCT_CATEGORIES } from "@/lib/seed-data";
import { cleanUnit } from "@/lib/scan/products";
import type { ScanItem, ScanUnit } from "@/lib/scan-types";
import type { ScanProduct } from "./types";

const UNITS: readonly ScanUnit[] = ["г", "мл", "шт"];

export function ClarifyDialog({
  scanId,
  index,
  item,
  products,
  onClose,
}: {
  scanId: string;
  index: number;
  item: ScanItem;
  products: readonly ScanProduct[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [productId, setProductId] = useState(item.productId ?? "");
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [unit, setUnit] = useState<ScanUnit>(cleanUnit(item.unit));
  const [quantity, setQuantity] = useState(String(item.quantity).replace(".", ","));
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open) dialog?.showModal();
  }, []);

  function chooseProduct(id: string) {
    setProductId(id);
    const product = products.find((row) => row.id === id);
    if (!product) return;
    setName(product.name);
    setUnit(cleanUnit(product.unit));
    setCategory(product.category);
  }

  function save() {
    const amount = Number(quantity.replace(",", ".").trim());
    if (!(amount > 0) || !Number.isFinite(amount)) {
      setError("Вкажіть кількість більше нуля");
      return;
    }
    if (!productId && !name.trim()) {
      setError("Оберіть продукт або вкажіть назву");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await clarifyScanItem(scanId, index, {
        productId: productId || null,
        name,
        category,
        unit,
        quantity: amount,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-18 border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-ink/50"
    >
      <div className="flex items-center justify-between border-b border-line pb-4">
        <h2 className="font-display text-lg font-bold">Уточнити позицію</h2>
        <button type="button" onClick={onClose} aria-label="Закрити" className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-xl text-ink-2">
          ×
        </button>
      </div>
      {item.raw && <p className="mt-3 font-mono text-xs text-ink-2">{item.raw}</p>}
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2" htmlFor="clarify-product">
          Продукт
          <select id="clarify-product" className="input" value={productId} onChange={(event) => chooseProduct(event.target.value)}>
            <option value="">Новий продукт</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
        {!productId && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2" htmlFor="clarify-name">
              Назва
              <input id="clarify-name" className="input" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2" htmlFor="clarify-category">
              Категорія
              <select id="clarify-category" className="input" value={category} onChange={(event) => setCategory(event.target.value)}>
                {PRODUCT_CATEGORIES.map((entry) => (
                  <option key={entry}>{entry}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2" htmlFor="clarify-qty">
            Кількість
            <input id="clarify-qty" className="input font-mono" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2" htmlFor="clarify-unit">
            Одиниця
            <select id="clarify-unit" className="input" value={unit} onChange={(event) => setUnit(cleanUnit(event.target.value))}>
              {UNITS.map((entry) => (
                <option key={entry}>{entry}</option>
              ))}
            </select>
          </label>
        </div>
        {error && (
          <p role="alert" className="rounded-12 bg-recipes-tint px-3 py-2 text-sm text-recipes-ink">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-12 border border-line-strong bg-surface font-semibold">
            Скасувати
          </button>
          <button type="submit" disabled={busy} className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-12 bg-ink font-semibold text-lime disabled:opacity-50">
            {busy ? "Зберігаю…" : "Зберегти"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
