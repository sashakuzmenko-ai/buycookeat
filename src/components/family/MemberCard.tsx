"use client";

import { useTransition } from "react";
import type { FamilyMember } from "@/lib/context";
import {
  calculatePortionWidthPercent,
  formatMemberRole,
  formatPortionFactor,
  isAllergy,
} from "@/lib/family";
import { adjustPortionFactor } from "@/app/(app)/settings/actions";

export interface MemberCardProps {
  member: FamilyMember;
  onEdit: (member: FamilyMember) => void;
  isMobileCompact?: boolean;
}

export function MemberCard({ member, onEdit, isMobileCompact = false }: MemberCardProps) {
  const [isPending, startTransition] = useTransition();
  const initial = member.name.trim().charAt(0).toUpperCase() || "?";
  const role = formatMemberRole(member);
  const factorStr = formatPortionFactor(member.portion_factor);
  const widthPercent = `${calculatePortionWidthPercent(member.portion_factor)}%`;

  const handleStep = (direction: "inc" | "dec") => {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", member.id);
      fd.append("direction", direction);
      await adjustPortionFactor(fd);
    });
  };

  // Компактний вигляд для мобільних пристроїв (390 px) за зразком MFamily.dc.html
  if (isMobileCompact) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onEdit(member)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onEdit(member);
          }
        }}
        className="flex cursor-pointer flex-col gap-2.5 rounded-[20px] border border-line bg-surface p-3.5 transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-family"
      >
        <div className="flex items-center gap-2.5">
          <div
            aria-hidden="true"
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-family-tint font-display text-[16px] font-bold text-family"
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold text-ink">{member.name}</div>
            <div className="truncate text-[12px] text-ink-2">{role}</div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[12px] text-ink-2">
            <span>Порція</span>
            <span className="font-mono font-semibold text-ink">{factorStr}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-family-tint">
            <div
              className="h-1.5 rounded-full bg-family transition-all"
              style={{ width: widthPercent }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Повнорозмірна картка для комп'ютера за зразком WebFamily.dc.html
  return (
    <section className="flex flex-col gap-4 rounded-[22px] border border-line bg-surface p-5 transition-colors hover:border-line-strong">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-family-tint font-display text-[22px] font-bold text-family"
          >
            {initial}
          </div>
          <div>
            <h2 className="text-[18px] font-bold text-ink leading-tight">{member.name}</h2>
            <div className="text-[13px] text-ink-2">{role}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onEdit(member)}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg px-2.5 py-1 text-xs font-semibold text-ink-2 hover:bg-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-family cursor-pointer"
          aria-label={`Редагувати: ${member.name}`}
        >
          Змінити
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-ink-2">Порція</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isPending || member.portion_factor <= 0.1}
              onClick={() => handleStep("dec")}
              aria-label={`Зменшити порцію: ${member.name}`}
              className="flex h-11 w-11 items-center justify-center rounded-12 border border-line-strong bg-surface font-sans text-[18px] font-semibold text-ink transition-colors hover:bg-soft active:bg-track disabled:cursor-not-allowed disabled:opacity-40"
            >
              −
            </button>
            <span className="w-9 text-center font-mono text-[16px] font-semibold text-ink">
              {factorStr}
            </span>
            <button
              type="button"
              disabled={isPending || member.portion_factor >= 3.0}
              onClick={() => handleStep("inc")}
              aria-label={`Збільшити порцію: ${member.name}`}
              className="flex h-11 w-11 items-center justify-center rounded-12 border border-line-strong bg-surface font-sans text-[18px] font-semibold text-ink transition-colors hover:bg-soft active:bg-track disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>

        <div className="h-2 w-full rounded-full bg-family-tint">
          <div
            className="h-2 rounded-full bg-family transition-all"
            style={{ width: widthPercent }}
          />
        </div>
      </div>

      {member.restrictions && member.restrictions.length > 0 ? (
        <div className="flex min-h-[30px] flex-wrap gap-1.5">
          {member.restrictions.map((tag) => {
            const allergy = isAllergy(tag);
            return (
              <span
                key={tag}
                className={`rounded-full px-2.5 py-1 text-[13px] font-semibold ${
                  allergy ? "bg-recipes-tint text-recipes-ink" : "bg-soft text-ink"
                }`}
              >
                {tag}
              </span>
            );
          })}
        </div>
      ) : (
        <div className="min-h-[30px] text-[13px] text-ink-2/60 italic">Без обмежень</div>
      )}
    </section>
  );
}
