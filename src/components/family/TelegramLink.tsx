"use client";

import { useState } from "react";
import { createTelegramLink, unlinkTelegram } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui";

export type TelegramBindingView = {
  id: string;
  title: string;
  chatTypeLabel: string;
  linkedAtLabel: string;
};

export type TelegramLinkState = {
  linkedCount: number;
  bindings: TelegramBindingView[];
  code: string | null;
  expiresLabel: string | null;
  botUrl: string | null;
  botGroupUrl: string | null;
};

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      className="shrink-0"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`/start ${code}`);
        } catch {
          // Кнопка лишається; код видно на екрані.
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Скопійовано" : "Копіювати"}
    </Button>
  );
}

export function TelegramLink({ linkedCount, bindings, code, expiresLabel, botUrl, botGroupUrl }: TelegramLinkState) {
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-12 bg-soft p-3 text-[13px] leading-relaxed text-ink-2">
      <p>
        <span className="font-semibold text-ink">Telegram-бот:</span>{" "}
        {linkedCount > 0
          ? `підключено ${linkedCount} ${linkedCount === 1 ? "чат" : linkedCount < 5 ? "чати" : "чатів"}. Можна додати ще.`
          : "згенеруйте код і надішліть його боту."}{" "}
        Код одноразовий і діє 20 хвилин.
      </p>

      {bindings.length > 0 ? (
        <ul className="flex flex-col gap-2 divide-y divide-line/60">
          {bindings.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 pt-2 first:pt-0">
              <div>
                <div className="font-semibold text-ink">{row.title}</div>
                <div className="text-[12px] text-ink-2">
                  {row.chatTypeLabel} · підключено {row.linkedAtLabel}
                </div>
              </div>
              <form action={unlinkTelegram}>
                <input type="hidden" name="id" value={row.id} />
                <Button type="submit" variant="secondary" className="w-full text-[14px]">
                  Відв&apos;язати
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      {code ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[18px] font-semibold tracking-wide text-ink">{code}</span>
            <CopyCode code={code} />
          </div>
          {expiresLabel ? <p>Діє до {expiresLabel}.</p> : null}
          {botUrl ? (
            <a href={botUrl} className="font-semibold text-ink underline" target="_blank" rel="noreferrer">
              Відкрити бота з цим кодом
            </a>
          ) : (
            <p>Надішліть боту команду /start {code}. Посилання з&apos;явиться, коли буде задано токен бота.</p>
          )}
          {botGroupUrl ? (
            <div className="flex flex-col gap-1">
              <a href={botGroupUrl} className="font-semibold text-ink underline" target="_blank" rel="noreferrer">
                Додати бота в групу з цим кодом
              </a>
              <p className="text-[12px] text-ink-2">
                У групі вимкніть приватність бота в BotFather: /setprivacy → Disable — інакше бот не бачить звичайних
                повідомлень. Якщо Telegram не надішле /start автоматично, відправте в групу вручну: /start {code}.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <form action={createTelegramLink}>
        <Button type="submit" variant="secondary" className="w-full text-[14px]">
          Згенерувати код
        </Button>
      </form>
    </div>
  );
}
