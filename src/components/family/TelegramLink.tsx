"use client";

import { useState } from "react";
import { createTelegramLink, unlinkTelegram } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui";

export type TelegramLinkState = {
  linked: boolean;
  code: string | null;
  expiresLabel: string | null;
  botUrl: string | null;
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

export function TelegramLink({ linked, code, expiresLabel, botUrl }: TelegramLinkState) {
  if (linked) {
    return (
      <div className="mt-2 flex flex-col gap-2 rounded-12 bg-soft p-3 text-[13px] leading-relaxed text-ink-2">
        <p>
          <span className="font-semibold text-ink">Telegram-бот:</span> чат підключено до цього акаунта.
        </p>
        <form action={unlinkTelegram}>
          <Button type="submit" variant="secondary" className="w-full text-[14px]">
            Відв&apos;язати
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-12 bg-soft p-3 text-[13px] leading-relaxed text-ink-2">
      <p>
        <span className="font-semibold text-ink">Telegram-бот:</span> згенеруйте код і надішліть його боту. Код
        одноразовий і діє 20 хвилин.
      </p>
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
        </div>
      ) : (
        <form action={createTelegramLink}>
          <Button type="submit" variant="secondary" className="w-full text-[14px]">
            Згенерувати код
          </Button>
        </form>
      )}
    </div>
  );
}
