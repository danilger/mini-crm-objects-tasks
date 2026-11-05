# Мини-CRM «Объекты и задачи»

Тестовое задание: React + TypeScript + Supabase. Постановщик ведёт объекты (стройки) и задачи; исполнители работают по своим задачам. Права закрыты Row Level Security и RPC-переходами статусов.

## Стек

- Vite, React, TypeScript, Tailwind CSS, React Router
- Supabase Auth + Postgres (RLS, triggers, `transition_task`)

## Быстрый старт

1. Создайте проект на [supabase.com](https://supabase.com), выключите публичную регистрацию, создайте 3 пользователей вручную.
2. В SQL Editor выполните по порядку:
   - [`supabase/migrations/20260326000000_init.sql`](supabase/migrations/20260326000000_init.sql)
   - [`supabase/seed.sql`](supabase/seed.sql) — сначала подставьте UUID из Authentication → Users
3. Скопируйте env:

```bash
cp .env.example .env
```

Заполните `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` (Project Settings → API).

```bash
npm install
npm run dev
```

## Скрипты

| Команда | Назначение |
|---------|------------|
| `npm run dev` | Локальная разработка |
| `npm run build` | Сборка в `dist/` |
| `npm run preview` | Просмотр сборки |
| `node --env-file=.env scripts/verify-rls.mjs` | Проверка RLS (нужны VERIFY_* в `.env`) |

Пример для verify:

```env
VERIFY_MANAGER_EMAIL=manager@example.com
VERIFY_MANAGER_PASSWORD=...
VERIFY_WORKER_EMAIL=worker1@example.com
VERIFY_WORKER_PASSWORD=...
```

## Роли и статусы

- `manager` — постановщик: CRUD объектов/задач, приём / возврат с проверки
- `worker` — исполнитель: свои задачи; переходы «в работу» и «на проверку»

Статусы: `new` → `in_progress` → `in_review` → `accepted`, ветка `in_review` → `rework` → `in_progress`.

Смена статуса: только `rpc('transition_task', …)`.

## Документы для сдачи

- [Объяснение для руководителя](docs/for-manager.md)
- [Решения и допущения](docs/decisions.md)

## Безопасность

- Во фронте только anon-ключ
- `service_role` не используется в приложении и не должен попадать в репозиторий
- История статусов неизменяема для клиентов API
