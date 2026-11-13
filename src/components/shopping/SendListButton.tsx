"use client";

import Link from "next/link";
import { useActionState } from "react";
import { sendShoppingListToTelegram } from "@/app/(app)/shopping/actions";
import { NEED_FAMILY_LINK } from "@/lib/shopping-telegram";

export interface SendListButtonProps {
  readonly week: string;
}

export function SendListButton({ week }: Readonly<SendListButtonProps>) {
  const [message, formAction, pending] = useActionState(sendShoppingListToTelegram, null);

  return (
    <div className="flex flex-col gap-1 items-start">
      <form action={formAction}>
        <input type="hidden" name="week" value={week} />
        <button
          type="submit"
          disabled={pending}
          className="h-[44px] min-h-[44px] px-[18px] rounded-12 bg-ink text-white font-semibold text-[15px] hover:opacity-90 transition cursor-pointer disabled:opacity-60 disabled:cursor-wait"
        >
          {pending ? "Надсилаю…" : "Надіслати список у Telegram"}
        </button>
      </form>
      {message === NEED_FAMILY_LINK ? (
        <p className="text-xs text-ink-2 max-w-sm" aria-live="polite">
          Спершу прив&apos;яжіть чат у{" "}
          <Link href="/settings#access" className="font-semibold text-shops underline underline-offset-2">
            розділі Сім&apos;я
          </Link>
          .
        </p>
      ) : message ? (
        <p className="text-xs text-ink-2 max-w-sm" aria-live="polite">
          {message}
        </p>
      ) : null}
    </div>
  );
}
