"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { FamilyMember } from "@/lib/context";
import { formatPortionFactor, stepPortionFactor } from "@/lib/family";
import {
  addFamilyMember,
  deleteFamilyMember,
  updateFamilyMember,
} from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui";

export interface MemberDialogProps {
  isOpen: boolean;
  onClose: () => void;
  member: FamilyMember | null;
}

const COMMON_TAGS = [
  "Алергія: горіхи",
  "Любить гостре",
  "Менше смаженого",
  "Без грибів",
  "Без лактози",
  "Вегетаріанець",
];

interface MemberFormProps {
  member: FamilyMember | null;
  onClose: () => void;
}

function MemberForm({ member, onClose }: MemberFormProps) {
  const [isPending, startTransition] = useTransition();
  const [portionFactor, setPortionFactor] = useState(
    member ? Number(member.portion_factor) : 1.0
  );
  const [restrictionsStr, setRestrictionsStr] = useState(
    member?.restrictions ? member.restrictions.join(", ") : ""
  );

  const isEdit = Boolean(member);

  const handleStep = (direction: "inc" | "dec") => {
    setPortionFactor((prev) => stepPortionFactor(prev, direction));
  };

  const handleAddTag = (tag: string) => {
    const current = restrictionsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!current.includes(tag)) {
      setRestrictionsStr([...current, tag].join(", "));
    }
  };

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      if (isEdit) {
        await updateFamilyMember(formData);
      } else {
        await addFamilyMember(formData);
      }
      onClose();
    });
  };

  const handleDelete = () => {
    if (!member) return;
    if (confirm(`Видалити «${member.name}» зі складу сім'ї?`)) {
      startTransition(async () => {
        const fd = new FormData();
        fd.append("id", member.id);
        await deleteFamilyMember(fd);
        onClose();
      });
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[20px] font-bold text-ink">
          {isEdit ? `Змінити: ${member?.name}` : "Додати людину"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрити"
          className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-xl text-ink-2 hover:bg-soft"
        >
          ×
        </button>
      </div>

      <form action={handleSubmit} className="flex flex-col gap-4">
        {isEdit && <input type="hidden" name="id" value={member?.id} />}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="fm-name" className="text-[13px] font-semibold text-ink-2">
            Ім&apos;я <span className="text-recipes-ink">*</span>
          </label>
          <input
            id="fm-name"
            name="name"
            required
            defaultValue={member?.name ?? ""}
            placeholder="напр.: Тато, Соломія, Олена"
            className="h-11 rounded-12 border border-line-strong bg-surface px-3.5 text-[15px] text-ink focus:border-family focus:ring-2 focus:ring-family-tint focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fm-kind" className="text-[13px] font-semibold text-ink-2">
              Хто
            </label>
            <select
              id="fm-kind"
              name="kind"
              defaultValue={member?.kind ?? "adult"}
              className="h-11 rounded-12 border border-line-strong bg-surface px-3 text-[15px] text-ink focus:border-family focus:ring-2 focus:ring-family-tint focus:outline-none"
            >
              <option value="adult">Дорослий</option>
              <option value="child">Дитина</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="fm-birth" className="text-[13px] font-semibold text-ink-2">
              Дата народження
            </label>
            <input
              id="fm-birth"
              type="date"
              name="birth_date"
              defaultValue={member?.birth_date ?? ""}
              className="h-11 rounded-12 border border-line-strong bg-surface px-3 text-[15px] text-ink focus:border-family focus:ring-2 focus:ring-family-tint focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="fm-factor" className="text-[13px] font-semibold text-ink-2">
            Частка порції (0,1–3,0)
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleStep("dec")}
              aria-label="Зменшити порцію"
              className="flex h-11 w-11 items-center justify-center rounded-12 border border-line-strong bg-surface text-lg font-semibold text-ink hover:bg-soft"
            >
              −
            </button>
            <input
              id="fm-factor"
              name="portion_factor"
              type="text"
              inputMode="decimal"
              value={formatPortionFactor(portionFactor)}
              onChange={(e) => {
                const val = parseFloat(e.target.value.replace(",", "."));
                if (!isNaN(val)) setPortionFactor(val);
              }}
              className="h-11 w-24 rounded-12 border border-line-strong bg-surface text-center font-mono text-[16px] font-semibold text-ink focus:border-family focus:ring-2 focus:ring-family-tint focus:outline-none"
            />
            <button
              type="button"
              onClick={() => handleStep("inc")}
              aria-label="Збільшити порцію"
              className="flex h-11 w-11 items-center justify-center rounded-12 border border-line-strong bg-surface text-lg font-semibold text-ink hover:bg-soft"
            >
              +
            </button>
            <span className="text-xs text-ink-2">
              дорослий 1,0 · дитина 4–5 р. ≈ 0,55 · 1–2 р. ≈ 0,3
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="fm-restrictions" className="text-[13px] font-semibold text-ink-2">
            Обмеження та вподобання
          </label>
          <input
            id="fm-restrictions"
            name="restrictions"
            value={restrictionsStr}
            onChange={(e) => setRestrictionsStr(e.target.value)}
            placeholder="напр.: Алергія на горіхи, Без грибів, Любить гостре"
            className="h-11 rounded-12 border border-line-strong bg-surface px-3.5 text-[15px] text-ink focus:border-family focus:ring-2 focus:ring-family-tint focus:outline-none"
          />
          <div className="mt-1 flex flex-wrap gap-1.5">
            {COMMON_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleAddTag(tag)}
                className="rounded-full bg-soft px-2.5 py-0.5 text-xs font-medium text-ink hover:bg-line-strong"
              >
                + {tag}
              </button>
            ))}
          </div>
          <span className="text-[12px] text-ink-2">
            Алергії автоматично підсвічуються тоном попередження.
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="fm-notes" className="text-[13px] font-semibold text-ink-2">
            Нотатка або опис ролі
          </label>
          <input
            id="fm-notes"
            name="notes"
            defaultValue={member?.notes ?? ""}
            placeholder="напр.: дорослий, доросла, мама, тато"
            className="h-11 rounded-12 border border-line-strong bg-surface px-3.5 text-[15px] text-ink focus:border-family focus:ring-2 focus:ring-family-tint focus:outline-none"
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-soft">
          {isEdit ? (
            <button
              type="button"
              disabled={isPending}
              onClick={handleDelete}
              className="min-h-[44px] rounded-12 border border-recipes/30 px-3.5 py-2 text-sm font-semibold text-recipes-ink hover:bg-recipes-tint disabled:opacity-50"
            >
              Видалити
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Скасувати
            </Button>
            <Button type="submit" module="family" disabled={isPending}>
              {isEdit ? "Зберегти" : "Додати"}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}

export function MemberDialog({ isOpen, onClose, member }: MemberDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-full max-w-lg rounded-[22px] border border-line bg-surface p-6 backdrop:bg-ink/40 open:flex open:flex-col open:gap-5"
    >
      <MemberForm key={member?.id ?? "new"} member={member} onClose={onClose} />
    </dialog>
  );
}
