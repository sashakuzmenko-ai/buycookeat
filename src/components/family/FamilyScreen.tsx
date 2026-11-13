"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { FamilyMember } from "@/lib/context";
import { familyCountTitle, formatPortionsLabel } from "@/lib/family";
import { Button } from "@/components/ui";
import { MemberCard } from "./MemberCard";
import { MemberDialog } from "./MemberDialog";
import { BudgetCard } from "./BudgetCard";
import { EquipmentCard } from "./EquipmentCard";
import { AccessCard, type HouseholdUserInfo } from "./AccessCard";
import type { TelegramLinkState } from "./TelegramLink";
import { StoresSection, type StoreItem } from "./StoresSection";

export interface FamilyScreenProps {
  family: FamilyMember[];
  portions: number;
  monthlyBudget: number | null;
  equipment: { id: string; name: string }[];
  users: HouseholdUserInfo[];
  telegram: TelegramLinkState;
  linkedUserIds: readonly string[];
  stores: StoreItem[];
  notice?: ReactNode;
}

export function FamilyScreen({
  family,
  portions,
  monthlyBudget,
  equipment,
  users,
  telegram,
  linkedUserIds,
  stores,
  notice,
}: FamilyScreenProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);

  const title = familyCountTitle(family.length);
  const portionsLabel = formatPortionsLabel(portions);

  // Підсумковий опис для мобільного швидкого переходу
  const budgetSummary = monthlyBudget ? `${monthlyBudget.toLocaleString("uk-UA")} ₴` : "Не задано";
  const equipmentSummary = useMemo(() => {
    if (equipment.length === 0) return "Немає";
    const sample = equipment.slice(0, 2).map((e) => e.name.toLowerCase()).join(", ");
    return equipment.length > 2 ? `${sample}...` : sample;
  }, [equipment]);

  const storesSummary = useMemo(() => {
    if (stores.length === 0) return "Немає";
    const sample = stores.slice(0, 3).map((s) => s.name).join(", ");
    return stores.length > 3 ? `${sample}...` : sample;
  }, [stores]);

  const handleOpenAdd = () => {
    setEditingMember(null);
    setDialogOpen(true);
  };

  const handleEditMember = (member: FamilyMember) => {
    setEditingMember(member);
    setDialogOpen(true);
  };

  // Усі обмеження для мобільного списку чипів
  const allRestrictionsWithMember = useMemo(() => {
    const list: { key: string; text: string; isAllergy: boolean }[] = [];
    for (const m of family) {
      for (const r of m.restrictions ?? []) {
        const isAllergy = /алерг|allergy/i.test(r);
        list.push({
          key: `${m.id}-${r}`,
          text: `${m.name} · ${r}`,
          isAllergy,
        });
      }
    }
    return list;
  }, [family]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {notice}

      {/* Верхня панель: назва розділу, заголовок за концептом і кнопка додавання */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="text-[14px] font-semibold text-family">Сім’я</div>
          <h1 className="font-display text-[24px] md:text-[28px] font-bold text-ink leading-tight">
            {title}
          </h1>
        </div>
        <div>
          <Button
            type="button"
            module="family"
            onClick={handleOpenAdd}
            className="hidden md:inline-flex"
          >
            Додати людину
          </Button>
          <Button
            type="button"
            module="family"
            onClick={handleOpenAdd}
            className="md:hidden text-[14px]"
          >
            Додати
          </Button>
        </div>
      </div>

      {/* Картки членів сім'ї */}
      {family.length > 0 ? (
        <>
          {/* Мобільна сітка (2 колонки) за зразком MFamily.dc.html */}
          <div className="grid grid-cols-2 gap-3 md:hidden">
            {family.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                onEdit={handleEditMember}
                isMobileCompact={true}
              />
            ))}
          </div>

          {/* Десктопна сітка за зразком WebFamily.dc.html */}
          <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {family.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                onEdit={handleEditMember}
                isMobileCompact={false}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-[22px] border border-dashed border-line p-8 text-center">
          <p className="text-ink-2">У сім&apos;ї ще немає доданих людей.</p>
          <Button
            type="button"
            module="family"
            onClick={handleOpenAdd}
            className="mt-3"
          >
            Додати першу людину
          </Button>
        </div>
      )}

      {/* Смуга «Разом на один прийом їжі» */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-family-tint p-4 sm:p-5 md:px-6 md:py-4.5">
        <div className="text-[14px] md:text-[15px] font-medium text-family-ink">
          <span className="hidden sm:inline">
            Разом на один прийом їжі — на це число множаться всі рецепти та список покупок
          </span>
          <span className="sm:hidden">Разом на один прийом їжі</span>
        </div>
        <div className="font-display text-[18px] md:text-[24px] font-bold text-ink">
          {portionsLabel}
        </div>
      </div>

      {/* Мобільні чипи обмежень за концептом MFamily.dc.html */}
      {allRestrictionsWithMember.length > 0 && (
        <div className="flex flex-wrap gap-2 md:hidden">
          {allRestrictionsWithMember.map((item) => (
            <span
              key={item.key}
              className={`rounded-full px-3 py-1.5 text-[13px] ${
                item.isAllergy
                  ? "bg-[#FBE6E0] text-[#8C2A18] font-semibold border border-[#B23A24]/20"
                  : "bg-surface border border-line text-ink"
              }`}
            >
              {item.text}
            </span>
          ))}
        </div>
      )}

      {/* Мобільний список швидкого переходу до налаштувань за концептом MFamily.dc.html */}
      <section className="rounded-[18px] border border-line bg-surface px-4 md:hidden">
        <a
          href="#budget"
          className="flex min-h-[52px] items-center gap-2.5 border-b border-soft text-[15px] text-ink no-underline"
        >
          <span className="flex-grow font-semibold">Бюджет на місяць</span>
          <span className="font-mono text-[14px] text-ink-2">{budgetSummary}</span>
          <span aria-hidden="true" className="text-ink-2">›</span>
        </a>
        <a
          href="#equipment"
          className="flex min-h-[52px] items-center gap-2.5 border-b border-soft text-[15px] text-ink no-underline"
        >
          <span className="flex-grow font-semibold">Техніка на кухні</span>
          <span className="text-[14px] text-ink-2">{equipmentSummary}</span>
          <span aria-hidden="true" className="text-ink-2">›</span>
        </a>
        <a
          href="#stores"
          className="flex min-h-[52px] items-center gap-2.5 border-b border-soft text-[15px] text-ink no-underline"
        >
          <span className="flex-grow font-semibold">Наші магазини</span>
          <span className="text-[14px] text-ink-2">{storesSummary}</span>
          <span aria-hidden="true" className="text-ink-2">›</span>
        </a>
        <a
          href="#access"
          className="flex min-h-[52px] items-center gap-2.5 text-[15px] text-ink no-underline"
        >
          <span className="flex-grow font-semibold">Telegram-бот</span>
          <span className="text-[14px] text-ink-2">{telegram.linked ? "підключено" : "не підключено"}</span>
          <span aria-hidden="true" className="text-ink-2">›</span>
        </a>
      </section>

      {/* Основна сітка блоків: Бюджет, Техніка, Доступ за концептом WebFamily.dc.html */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 items-start">
        <BudgetCard initialMonthlyBudget={monthlyBudget} />
        <EquipmentCard equipment={equipment} />
        <AccessCard users={users} telegram={telegram} linkedUserIds={linkedUserIds} />
      </div>

      {/* Блок магазинів (залишається робочим на сторінці) */}
      <StoresSection stores={stores} />

      {/* Модальне вікно додавання / редагування людини */}
      <MemberDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        member={editingMember}
      />
    </div>
  );
}
