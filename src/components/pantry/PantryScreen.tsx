"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button, FilterPill } from "@/components/ui";
import {
  type PantryItemView,
  type StorageZone,
  type MovementView,
  type StockSufficiency,
  STORAGE_ZONES,
  STORAGE_ZONE_LABELS,
  pluralizePositions,
} from "@/lib/pantry";
import { ShelfColumn } from "./ShelfColumn";
import { MovementsCard } from "./MovementsCard";
import { SufficiencyCard } from "./SufficiencyCard";
import { ItemDialog } from "./ItemDialog";

export type PantryScreenProps = {
  readonly items: readonly PantryItemView[];
  readonly products: readonly { id: string; name: string; unit: string }[];
  readonly movements: readonly MovementView[];
  readonly sufficiency: StockSufficiency;
  readonly notice?: ReactNode;
};

type FilterType = "all" | "low" | "expiring";

export function PantryScreen({
  items,
  products,
  movements,
  sufficiency,
  notice,
}: PantryScreenProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileZone, setMobileZone] = useState<StorageZone>("fridge");
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  // Стан модального вікна додавання / редагування
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PantryItemView | null>(null);
  const [dialogDefaultZone, setDialogDefaultZone] = useState<StorageZone>("pantry");

  const inStockIds = useMemo(() => new Set(items.map((i) => i.productId)), [items]);

  // Загальні лічильники для пігулок фільтрів
  const totalCount = items.length;
  const lowCount = useMemo(() => items.filter((i) => i.isLow).length, [items]);
  const expiringCount = useMemo(() => items.filter((i) => i.isExpiring).length, [items]);

  // Лічильники за зонами
  const zoneCounts = useMemo(() => {
    const counts: Record<StorageZone, number> = { fridge: 0, freezer: 0, pantry: 0 };
    for (const item of items) {
      if (counts[item.storageZone] !== undefined) {
        counts[item.storageZone] += 1;
      }
    }
    return counts;
  }, [items]);

  // Фільтрація елементів за пошуковим запитом і активним фільтром
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q)) return false;
      if (filter === "low" && !item.isLow) return false;
      if (filter === "expiring" && !item.isExpiring) return false;
      return true;
    });
  }, [items, searchQuery, filter]);

  // Розбиття відфільтрованих елементів за зонами
  const itemsByZone = useMemo(() => {
    const map: Record<StorageZone, PantryItemView[]> = {
      fridge: [],
      freezer: [],
      pantry: [],
    };
    for (const item of filteredItems) {
      if (map[item.storageZone]) {
        map[item.storageZone].push(item);
      }
    }
    return map;
  }, [filteredItems]);

  function handleOpenAdd(zone?: StorageZone) {
    setEditingItem(null);
    setDialogDefaultZone(zone ?? "pantry");
    setDialogOpen(true);
  }

  function handleOpenEdit(item: PantryItemView) {
    setEditingItem(item);
    setDialogOpen(true);
  }

  function handleCloseDialog() {
    setDialogOpen(false);
    setEditingItem(null);
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {notice}

      {/* Верхня панель: назва, лічильник позицій та кнопки дій */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold text-pantry">Склад</div>
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink md:text-[28px]">
              <span className="hidden md:inline">
                {pluralizePositions(totalCount)} вдома
              </span>
              <span className="md:hidden">
                {pluralizePositions(totalCount)}
              </span>
            </h1>
            <Link
              href="/products"
              className="text-xs font-semibold text-pantry hover:underline md:text-sm"
            >
              Довідник продуктів →
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleOpenAdd()}
            className="hidden sm:inline-flex"
          >
            Додати вручну
          </Button>

          <Link
            href="/scan?mode=inventory"
            className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-12 bg-ink px-4.5 py-2.5 font-sans text-[15px] font-semibold text-lime transition-all duration-150 hover:bg-ink-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2"
          >
            Інвентаризація голосом
          </Link>

          {/* Мобільна кнопка пошуку */}
          <button
            type="button"
            onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
            aria-label="Пошук на складі"
            className="inline-flex size-11 items-center justify-center rounded-12 border border-line-strong bg-surface text-ink transition hover:bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink md:hidden"
          >
            <svg
              aria-hidden="true"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#14201A"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Рядок дій для мобільних екранів */}
      <div className="flex sm:hidden">
        <Button
          type="button"
          variant="secondary"
          onClick={() => handleOpenAdd(mobileZone)}
          className="w-full"
        >
          + Додати вручну
        </Button>
      </div>

      {/* Пошук та фільтри: Web завжди, Mobile при кліку на іконку */}
      <div className={`flex flex-wrap items-end gap-3 ${isMobileSearchOpen ? "flex" : "hidden md:flex"}`}>
        <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
          <label htmlFor="pantry-q" className="text-[13px] font-semibold text-ink-2">
            Пошук на складі
          </label>
          <input
            id="pantry-q"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Наприклад, гречка"
            className="w-full min-h-[44px] rounded-12 border border-line-strong bg-surface px-3.5 py-2 text-[15px] text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-menu-tint"
          />
        </div>

        {/* Десктопні фільтри-пігулки */}
        <div className="hidden flex-wrap gap-2 md:flex">
          <FilterPill
            module="pantry"
            active={filter === "all"}
            count={totalCount}
            onClick={() => setFilter("all")}
          >
            Усе
          </FilterPill>
          <FilterPill
            module="pantry"
            active={filter === "low"}
            count={lowCount}
            onClick={() => setFilter(filter === "low" ? "all" : "low")}
          >
            Закінчується
          </FilterPill>
          <FilterPill
            module="pantry"
            active={filter === "expiring"}
            count={expiringCount}
            onClick={() => setFilter(filter === "expiring" ? "all" : "expiring")}
          >
            Термін до 3 днів
          </FilterPill>
        </div>
      </div>

      {/* Мобільний сегментований перемикач зон за MPantry.dc.html */}
      <div className="flex flex-col gap-3 md:hidden">
        <div
          role="group"
          aria-label="Зони складу"
          className="flex rounded-16 bg-pantry-tint p-1"
        >
          {STORAGE_ZONES.map((zone) => {
            const isSelected = mobileZone === zone;
            const label = STORAGE_ZONE_LABELS[zone];
            const count = zoneCounts[zone];
            return (
              <button
                key={zone}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setMobileZone(zone)}
                className={`flex min-h-[44px] flex-1 items-center justify-center rounded-12 px-2 text-xs font-semibold whitespace-nowrap transition-all duration-150 ${
                  isSelected
                    ? "bg-pantry text-white"
                    : "bg-transparent text-pantry-ink hover:bg-surface/50"
                }`}
              >
                {label} · {count}
              </button>
            );
          })}
        </div>

        {/* Мобільні фільтри-пігулки */}
        <div className="flex flex-wrap gap-2">
          <FilterPill
            module="pantry"
            active={filter === "low"}
            count={lowCount}
            onClick={() => setFilter(filter === "low" ? "all" : "low")}
          >
            Мало
          </FilterPill>
          <FilterPill
            module="pantry"
            active={filter === "expiring"}
            count={expiringCount}
            onClick={() => setFilter(filter === "expiring" ? "all" : "expiring")}
          >
            Термін до 3 днів
          </FilterPill>
        </div>
      </div>

      {/* Основний вміст: Полиці та Бічна панель (Рух + Прогноз) */}
      <div className="flex flex-col items-start gap-6 lg:flex-row">
        {/* Десктоп: Три колонки-полиці поруч (fridge, freezer, pantry) */}
        <div className="hidden w-full flex-1 grid-cols-3 gap-4 lg:grid">
          {STORAGE_ZONES.map((zone) => (
            <ShelfColumn
              key={zone}
              zone={zone}
              title={STORAGE_ZONE_LABELS[zone]}
              items={itemsByZone[zone]}
              totalCountInZone={zoneCounts[zone]}
              onEditItem={handleOpenEdit}
              onAddItemInZone={handleOpenAdd}
            />
          ))}
        </div>

        {/* Мобільний / планшетний вид: активна зона (перемикач на мобільному) */}
        <div className="flex w-full flex-1 flex-col gap-4 lg:hidden">
          <ShelfColumn
            zone={mobileZone}
            title={STORAGE_ZONE_LABELS[mobileZone]}
            items={itemsByZone[mobileZone]}
            totalCountInZone={zoneCounts[mobileZone]}
            onEditItem={handleOpenEdit}
            onAddItemInZone={handleOpenAdd}
          />
        </div>

        {/* Бічна панель: «Рух за сьогодні» та «На скільки вистачить» */}
        <aside className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0">
          <MovementsCard movements={movements} />
          <SufficiencyCard sufficiency={sufficiency} />
        </aside>
      </div>

      {/* Модальне вікно для додавання / редагування позиції */}
      <ItemDialog
        isOpen={dialogOpen}
        onClose={handleCloseDialog}
        item={editingItem}
        defaultZone={dialogDefaultZone}
        products={products}
        inStockIds={inStockIds}
      />
    </div>
  );
}
