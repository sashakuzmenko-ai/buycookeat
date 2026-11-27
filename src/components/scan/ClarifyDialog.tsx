"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { clarifyScanItem } from "@/app/(app)/scan/actions";
import { PRODUCT_CATEGORIES } from "@/lib/seed-data";
import { cleanUnit, parseExpiryDate } from "@/lib/scan/products";
import type { ScanItem, ScanUnit } from "@/lib/scan-types";
import type { ScanProduct } from "./types";

const UNITS: readonly ScanUnit[] = ["г", "мл", "шт"];
const PACKAGE_UNITS: readonly ("г" | "мл")[] = ["г", "мл"];

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
  const [label, setLabel] = useState(item.label ?? "");
  const [brand, setBrand] = useState(item.brand ?? "");
  const [packageAmount, setPackageAmount] = useState(
    item.packageAmount !== null && item.packageAmount !== undefined
      ? String(item.packageAmount).replace(".", ",")
      : "",
  );
  const [packageUnit, setPackageUnit] = useState<"г" | "мл">(
    item.packageUnit === "мл" ? "мл" : "г",
  );
  const [expiresAt, setExpiresAt] = useState(item.expiresAt ?? "");
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

    let cleanPackageAmount: number | null = null;
    let cleanPackageUnit: "г" | "мл" | null = null;
    const trimmedPkg = packageAmount.trim();
    if (trimmedPkg) {
      const parsedPkg = Number(trimmedPkg.replace(",", "."));
      if (!(parsedPkg > 0) || !Number.isFinite(parsedPkg)) {
        setError("Вкажіть коректну вагу або обсяг упаковки");
        return;
      }
      cleanPackageAmount = parsedPkg;
      cleanPackageUnit = packageUnit;
    }

    let cleanExpiresAt: string | null = null;
    const trimmedExpires = expiresAt.trim();
    if (trimmedExpires) {
      cleanExpiresAt = parseExpiryDate(trimmedExpires);
      if (!cleanExpiresAt) {
        setError("Некоректна дата придатності");
        return;
      }
    }

    setError("");
    startTransition(async () => {
      const result = await clarifyScanItem(scanId, index, {
        productId: productId || null,
        name,
        category,
        unit,
        quantity: amount,
        label: label.trim(),
        brand: brand.trim(),
        packageAmount: cleanPackageAmount,
        packageUnit: cleanPackageUnit,
        expiresAt: cleanExpiresAt,
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
      className="fixed inset-0 m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-18 border border-line bg-surface p-6 text-ink backdrop:bg-ink/50"
    >
      <div className="flex items-center justify-between border-b border-line pb-4">
        <h2 className="font-display text-lg font-bold">{item.uncertain ? "Уточнити позицію" : "Виправити позицію"}</h2>
        <button type="button" onClick={onClose} aria-label="Закрити" className="inline-flex size-11 min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-full text-xl text-ink-2 hover:bg-soft">
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
          <select id="clarify-product" className="min-h-[44px] w-full rounded-12 border border-line-strong bg-surface px-3.5 py-2 text-[15px] text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-menu-tint" value={productId} onChange={(event) => chooseProduct(event.target.value)}>
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
              <input id="clarify-name" className="min-h-[44px] w-full rounded-12 border border-line-strong bg-surface px-3.5 py-2 text-[15px] text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-menu-tint" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2" htmlFor="clarify-category">
              Категорія
              <select id="clarify-category" className="min-h-[44px] w-full rounded-12 border border-line-strong bg-surface px-3.5 py-2 text-[15px] text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-menu-tint" value={category} onChange={(event) => setCategory(event.target.value)}>
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
            <input id="clarify-qty" className="min-h-[44px] w-full rounded-12 border border-line-strong bg-surface px-3.5 py-2 font-mono text-[15px] text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-menu-tint" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2" htmlFor="clarify-unit">
            Одиниця
            <select id="clarify-unit" className="min-h-[44px] w-full rounded-12 border border-line-strong bg-surface px-3.5 py-2 text-[15px] text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-menu-tint" value={unit} onChange={(event) => setUnit(cleanUnit(event.target.value))}>
              {UNITS.map((entry) => (
                <option key={entry}>{entry}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2" htmlFor="clarify-label">
          Назва на етикетці
          <input
            id="clarify-label"
            className="min-h-[44px] w-full rounded-12 border border-line-strong bg-surface px-3.5 py-2 text-[15px] text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-menu-tint"
            value={label}
            maxLength={120}
            placeholder="Як на упаковці або в чеку"
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2" htmlFor="clarify-brand">
          Виробник
          <input
            id="clarify-brand"
            className="min-h-[44px] w-full rounded-12 border border-line-strong bg-surface px-3.5 py-2 text-[15px] text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-menu-tint"
            value={brand}
            maxLength={80}
            placeholder="Бренд чи торгова марка"
            onChange={(event) => setBrand(event.target.value)}
          />
        </label>
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2" htmlFor="clarify-pkg-amount">
            Вага/обсяг упаковки
            <input
              id="clarify-pkg-amount"
              className="min-h-[44px] w-full rounded-12 border border-line-strong bg-surface px-3.5 py-2 font-mono text-[15px] text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-menu-tint"
              inputMode="decimal"
              value={packageAmount}
              placeholder="напр. 200"
              onChange={(event) => setPackageAmount(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2" htmlFor="clarify-pkg-unit">
            Одиниця
            <select
              id="clarify-pkg-unit"
              className="min-h-[44px] w-full rounded-12 border border-line-strong bg-surface px-3.5 py-2 text-[15px] text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-menu-tint"
              value={packageUnit}
              onChange={(event) => setPackageUnit(event.target.value === "мл" ? "мл" : "г")}
            >
              {PACKAGE_UNITS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2" htmlFor="clarify-expires">
          Вжити до
          <input
            id="clarify-expires"
            type="date"
            className="min-h-[44px] w-full rounded-12 border border-line-strong bg-surface px-3.5 py-2 font-mono text-[15px] text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-menu-tint"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </label>
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
