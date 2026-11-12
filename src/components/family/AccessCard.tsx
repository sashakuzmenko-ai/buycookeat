"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export interface HouseholdUserInfo {
  userId: string;
  role: string;
  isCurrentUser: boolean;
  email?: string;
}

export interface AccessCardProps {
  users: HouseholdUserInfo[];
}

export function AccessCard({ users }: AccessCardProps) {
  const [copied, setCopied] = useState(false);

  const handleInvite = async () => {
    try {
      if (typeof window !== "undefined") {
        await navigator.clipboard.writeText(window.location.origin);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <section
      id="access"
      className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-5 sm:p-6"
    >
      <h2 className="mb-2 text-[18px] font-bold text-ink">Доступ і Telegram</h2>

      <div className="flex flex-col divide-y divide-soft">
        {users.length > 0 ? (
          users.map((u) => {
            const roleDesc =
              u.role === "owner" ? "власник · керує бюджетом" : "учасник · повний доступ";
            const displayName = u.isCurrentUser
              ? `${u.email ? u.email.split("@")[0] : "Ви"} (ви)`
              : u.email
                ? u.email.split("@")[0]
                : "Користувач сім'ї";

            return (
              <div
                key={u.userId}
                className="flex min-h-[52px] items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold text-ink">
                    {displayName}
                  </div>
                  <div className="text-[12px] text-ink-2">{roleDesc}</div>
                </div>
                <span className="shrink-0 rounded-full bg-soft px-2.5 py-1 text-[11px] font-medium text-ink-2">
                  Telegram пізніше
                </span>
              </div>
            );
          })
        ) : (
          <div className="py-2 text-[14px] text-ink-2">Немає зареєстрованих користувачів</div>
        )}
      </div>

      <div className="mt-2 rounded-12 bg-soft p-3 text-[13px] leading-relaxed text-ink-2">
        <span className="font-semibold text-ink">Telegram-бот:</span> Telegram-бот буде підключено пізніше.
      </div>

      <div className="mt-2">
        <Button
          type="button"
          variant="secondary"
          onClick={handleInvite}
          className="w-full text-[14px]"
        >
          {copied ? "Посилання скопійовано!" : "Запросити за посиланням"}
        </Button>
      </div>
    </section>
  );
}
