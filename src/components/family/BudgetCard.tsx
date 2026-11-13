"use client";

import { useState, useTransition } from "react";
import { dailyBudgetUah } from "@/lib/family";
import { togglePaceAlert, updateMonthlyBudget } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui";

export interface BudgetCardProps {
  initialMonthlyBudget: number | null;
  initialPaceAlertEnabled?: boolean;
}

export function BudgetCard({
  initialMonthlyBudget,
  initialPaceAlertEnabled = false,
}: BudgetCardProps) {
  const [isPending, startTransition] = useTransition();
  const [budgetInput, setBudgetInput] = useState(
    initialMonthlyBudget != null && initialMonthlyBudget > 0
      ? initialMonthlyBudget.toLocaleString("uk-UA")
      : ""
  );
  const [savedSuccess, setSavedSuccess] = useState(false);

  const [paceAlertEnabled, setPaceAlertEnabled] = useState(initialPaceAlertEnabled);
  const [isAlertPending, startAlertTransition] = useTransition();

  // Парсинг для живого розрахунку щоденного бюджету
  const numericVal = parseFloat(budgetInput.replace(/\s/g, "").replace(",", "."));
  const daily = !isNaN(numericVal) && numericVal > 0 ? dailyBudgetUah(numericVal) : null;

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      await updateMonthlyBudget(formData);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    });
  };

  const handleTogglePaceAlert = (nextChecked: boolean) => {
    setPaceAlertEnabled(nextChecked);
    startAlertTransition(async () => {
      const fd = new FormData();
      fd.set("enabled", nextChecked ? "true" : "false");
      await togglePaceAlert(fd);
    });
  };

  return (
    <section
      id="budget"
      className="flex flex-col gap-3.5 rounded-[18px] border border-line bg-surface p-5 sm:p-6"
    >
      <h2 className="text-[18px] font-bold text-ink">Бюджет на їжу</h2>

      <form action={handleSubmit} className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fam-budget" className="text-[13px] font-semibold text-ink-2">
            На місяць, ₴
          </label>
          <div className="flex gap-2">
            <input
              id="fam-budget"
              name="monthly_budget"
              type="text"
              inputMode="numeric"
              value={budgetInput}
              onChange={(e) => {
                setBudgetInput(e.target.value);
                setSavedSuccess(false);
              }}
              placeholder="напр.: 18 000"
              className="h-12 w-full rounded-12 border border-line-strong bg-surface px-3.5 font-mono text-[18px] font-semibold text-ink focus:border-family focus:ring-2 focus:ring-family-tint focus:outline-none"
            />
            <Button
              type="submit"
              module="family"
              disabled={isPending}
              className="shrink-0 px-4"
            >
              {isPending ? "..." : "Зберегти"}
            </Button>
          </div>
        </div>

        <div className="text-[14px] leading-relaxed text-ink-2">
          {daily != null ? (
            <>
              Це <span className="font-semibold text-ink">{daily.toLocaleString("uk-UA")} ₴</span> на день. Від цієї суми рахуються темп і прогноз у «Фінансах».
            </>
          ) : (
            "Вкажіть суму, щоб бачити темп витрат і прогноз на день у «Фінансах»."
          )}
        </div>

        {savedSuccess && (
          <div className="rounded-12 bg-family-tint px-3 py-1.5 text-xs font-semibold text-family-ink">
            Бюджет збережено
          </div>
        )}
      </form>

      <div className="flex flex-col gap-1 border-t border-soft pt-1">
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-[14px] text-ink select-none">
          <input
            type="checkbox"
            name="pace_alert_enabled"
            checked={paceAlertEnabled}
            disabled={isAlertPending}
            onChange={(e) => handleTogglePaceAlert(e.target.checked)}
            className="h-5 w-5 rounded m-0 accent-family cursor-pointer"
            style={{ accentColor: "var(--color-family, #7A3E78)" }}
          />
          <span>Попереджати в Telegram, коли темп вищий за план</span>
        </label>
        <div className="text-[13px] leading-relaxed text-ink-2 pl-[30px]">
          Повідомлення надсилається в прив’язані Telegram-чати і не частіше разу на день.
        </div>
      </div>
    </section>
  );
}
