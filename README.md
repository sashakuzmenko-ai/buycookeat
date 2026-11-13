# Cook & Eat

Сімейний застосунок для планування меню на тиждень, збереження рецептів, обліку залишків на складі, списку покупок, розподілу витрат і розпізнавання сканів (чеки, голосові повідомлення, відео полиць/холодильника, скріншоти замовлень, довільний текст) із Telegram-ботом як окремим каналом швидкого вводу.

Застосунок має вісім розділів: **Огляд**, **Меню**, **Рецепти**, **Склад**, **Магазини**, **Фінанси**, **Сім'я**, **Скан**.

## Стек і структура

- **Стек**: Next.js 16 (App Router, серверні дії), React 19, Supabase (PostgreSQL + Auth + Row Level Security), Tailwind CSS 4, OpenRouter для розпізнавання.
- **Структура проєкту**:
  - `src/app/` — маршрути сторінок, API (`/api/scan`, `/api/telegram/webhook`) та серверні дії.
  - `src/components/` — UI-компоненти розділів, дизайн-токени (`tokens.ts`) та спільні елементи інтерфейсу.
  - `src/lib/` — чиста бізнес-логіка (`menu`, `shopping`, `finance`, `pantry`, `scan`, `channels`) та клієнти Supabase.
  - `supabase/migrations/` — SQL-міграції бази даних.
  - `scripts/` — перевірочні скрипти (`check-sql.mjs` на PGlite, `check-logic.ts`).
  - `docs/design/` — концепт і специфікації інтерфейсу (джерело правди для вигляду).
  - `wiki/tasks/` — картки та історія виконання задач.

## Змінні середовища

Для локальної розробки створіть файл `.env.local`:

```env
# Supabase: публічні клієнтські ключі
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key

# Supabase: серверний секретний ключ (без префікса NEXT_PUBLIC_)
SUPABASE_SECRET_KEY=sb_secret_your-secret-key

# OpenRouter: мультимодальне розпізнавання сканів
OPENROUTER_API_KEY=sk-or-v1-your-openrouter-key
# OPENROUTER_MODEL=google/gemini-3.8-flash # необов'язково, за замовчуванням google/gemini-3.8-flash

# Telegram-бот: токен і секретний токен для webhook
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
TELEGRAM_WEBHOOK_SECRET=your-random-webhook-secret
```

> **Production у Vercel**: обов'язково налаштуйте `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN` та `TELEGRAM_WEBHOOK_SECRET`. Змінна `OPENROUTER_MODEL` необов'язкова (є значення за замовчуванням).

## Запуск і розробка

```bash
# Встановлення залежностей
npm install

# Запуск локального сервера розробки
npm run dev
```

Застосунок буде доступний за адресою [http://localhost:3000](http://localhost:3000).

### База даних і міграції

Міграції знаходяться в теці `supabase/migrations/` і виконуються **вручну в Supabase → SQL Editor** у порядку назв файлів. Процес збірки їх не застосовує.

Команда `npm run check` автоматично проганяє міграції на вбудованому рушії **PGlite** (без потреби в Docker чи сторонніх сервісах) та перевіряє політики безпеки RLS і чисту бізнес-логіку.

### Перевірки перед PR

Перед відкриттям PR обов'язково мають успішно проходити три перевірки:

```bash
npm run lint   # Перевірка стилю коду та правил через ESLint
npm run check  # Запуск check-sql.mjs на PGlite і check-logic.ts
npm run build  # Повна збірка застосунку
```

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

## Посилання

- [docs/plan.md](docs/plan.md) — план робіт та етапи проєкту.
- [docs/design/README.md](docs/design/README.md) — опис концепту та дизайн-системи.
- [AGENTS.md](AGENTS.md) — правила розробки для ШІ-агентів.
