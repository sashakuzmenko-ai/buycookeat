"use client";

import { TelegramLink, type TelegramLinkState } from "./TelegramLink";

export interface HouseholdUserInfo {
  userId: string;
  role: string;
  isCurrentUser: boolean;
  email?: string;
}

export interface AccessCardProps {
  users: HouseholdUserInfo[];
  telegram: TelegramLinkState;
  linkedUserIds: readonly string[];
}

export function AccessCard({ users, telegram, linkedUserIds }: AccessCardProps) {
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
                  {linkedUserIds.includes(u.userId) ? "Telegram підключено" : "Telegram не підключено"}
                </span>
              </div>
            );
          })
        ) : (
          <div className="py-2 text-[14px] text-ink-2">Немає зареєстрованих користувачів</div>
        )}
      </div>

      <TelegramLink {...telegram} />

      <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
        Поки що сім&apos;я ділить один логін: усі, хто заходить під цим обліковим записом, бачать одну домогосподарство.
        Якщо нова людина зареєструється сама, вона отримає окрему сім&apos;ю. Запрошення за окремим посиланням додамо
        пізніше.
      </p>
    </section>
  );
}
