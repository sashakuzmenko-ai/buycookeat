This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Telegram-бот

Бот приймає фото чека, голосове, відео полиці, скріншот замовлення і текст. Розпізнавання й запис ті самі, що на екрані «Скан».

1. У [@BotFather](https://t.me/BotFather) створіть бота командою `/newbot` і скопіюйте токен у `TELEGRAM_BOT_TOKEN`.
2. Для сімейного чату вимкніть приватність: `/setprivacy` → Disable, інакше бот у групі бачить лише команди.
3. Згенеруйте `TELEGRAM_WEBHOOK_SECRET` (1–256 символів: латинські літери, цифри, `_` і `-`).
4. У Supabase візьміть **secret key** (`sb_secret_…`, Settings → API Keys) і покладіть у `SUPABASE_SECRET_KEY`. Якщо нового ключа ще немає, тимчасово підійде legacy `service_role` у `SUPABASE_SERVICE_ROLE_KEY`. Обидва лише на сервері, без префікса `NEXT_PUBLIC_`.
5. Додайте ці змінні в Vercel. Поки їх немає, `POST /api/telegram/webhook` відповідає 503.
6. Після деплою зареєструйте webhook (це робить власник, не збірка):

```bash
curl -sS -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://<домен>/api/telegram/webhook\",\"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\",\"allowed_updates\":[\"message\",\"callback_query\"]}"
```

Прив'язка: у розділі «Сім'я» згенеруйте код і надішліть боту `/start код`. Код діє 20 хвилин і гаситься після використання. `getFile` у Telegram віддає файли до 20 МБ; бот відмовляє від файлів понад близько 4 МБ, бо більше не проходить через ліміт функції.
