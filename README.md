# CHGK — веб-платформа для игры «Что? Где? Когда?»

> Full-stack приложение для проведения игры в формате «Что? Где? Когда?»: подготовка вопросов, управление ходом игры, экран для зала и интерфейс для игроков.

## О проекте

Я делал этот проект как систему, которая помогает провести игру без ручных таблиц, таймеров и переключения презентаций. В приложении можно заранее собрать пакет вопросов, создать команды и игру, а во время эфира синхронно управлять экраном, таймерами, медиа, ответами и счетом.

Внутри проекта есть несколько частей, которые работают вместе:

- **админка** — подготовка контента, команд, игроков и игр;
- **пульт ведущего** — управление раундами, волчком, вопросами, таймерами и баллами;
- **экран для зала** — отдельный TV-интерфейс для проектора или большого экрана;
- **интерфейс игрока** — вход в игру по PIN-коду и отправка ответа;
- **backend** — REST API, WebSocket-события, PostgreSQL и хранение runtime-состояния игры.

## Что уже умеет

### Администратор

- Авторизация администратора через защищенную cookie-сессию.
- CRUD для блоков вопросов, серий, вопросов, игр, команд и игроков.
- Поддержка обычных вопросов, блица и суперблица.
- Привязка команд и блоков вопросов к конкретной игре.
- Генерация игровых секторов из выбранных блоков.
- Загрузка медиафайлов для заставок, вопросов, ответов и звуковых эффектов.
- Просмотр результатов: ответы, очки и сыгранные сектора.

### Ведущий

- Подключение к активной игре по PIN-коду.
- Запуск интро, показ правил/информации/поля.
- Запуск вращения волчка и выбор сектора.
- Открытие вопроса, показ медиа, управление «черным ящиком».
- Таймеры на 60 и 20 секунд.
- Проверка ответов, начисление и снятие очков.
- Завершение игры и показ победителя.

### Игрок

- Выбор активной игры и команды.
- Блокировка занятой команды, чтобы две команды не вошли под одним слотом.
- Отправка ответа во время обсуждения.
- Получение синхронизированного состояния игры в реальном времени.

### TV-экран

- Отдельный полноэкранный интерфейс для проектора/экрана в зале.
- Отображение интро, поля, текущего вопроса, таймера, медиа, ответов и итогового экрана.
- Синхронизация с действиями ведущего через WebSocket.

## Стек

| Слой | Технологии |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Node.js, Express, TypeScript, WebSocket (`ws`) |
| Database | PostgreSQL, `pg` |
| Validation & security | Zod, CORS, cookie-сессии, in-memory rate limiting |
| Media | Multer для загрузки файлов, статическая раздача `/uploads` |

## Архитектура

```text
chgk/
├── front/                  # Next.js-приложение
│   ├── app/admin/          # Админ-панель
│   ├── app/host/           # Пульт ведущего
│   ├── app/player/         # Интерфейс игрока
│   ├── app/tv/             # Экран для зала / проектора
│   └── app/lib/api.ts      # HTTP/WS конфигурация клиента
├── back/                   # Express + WebSocket API
│   ├── src/server.ts       # HTTP routes и WebSocket-события
│   ├── src/db.ts           # PostgreSQL repositories
│   ├── src/adminAuth.ts    # Сессии администратора
│   ├── src/config.ts       # Env-конфигурация
│   └── utils/db/           # SQL-схема БД
├── DEPLOYMENT.md           # Production checklist
└── README.md
```

### Основной поток данных

1. Администратор создает вопросы, команды и активную игру.
2. Игроки, ведущий и TV-экран подключаются к игре по PIN-коду.
3. Бэкенд выдает игровые сессии и хранит runtime-состояние текущей игры.
4. Ведущий управляет игрой через WebSocket-команды.
5. Сервер рассылает всем подключенным клиентам события `state.sync`, `spin.*`, `question.*`, `timer.*`, `score.*` и другие.
6. Результаты ответов и начисления очков сохраняются в PostgreSQL.

## Быстрый старт локально

### Требования

- Node.js 20+
- npm
- PostgreSQL 14+

### 1. Клонировать репозиторий

```bash
git clone <repo-url>
cd chgk
```

### 2. Подготовить базу данных

Создайте PostgreSQL-базу и примените схему:

```bash
psql "$DATABASE_URL" -f back/utils/db/gen_tables.sql
```

### 3. Настроить backend env

Создайте `back/.env`:

```env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgres://user:password@localhost:5432/chgk
ADMIN_LOGIN=admin
ADMIN_PASSWORD=admin
APP_SECRET=change-me
CORS_ORIGIN=http://localhost:3000
BLACK_BOX_MUSIC_PATH=/media/sfx/black_box.mp3
```

> Если пароль PostgreSQL содержит специальные символы вроде `&` или `%`, URL-encode значение или возьмите весь `DATABASE_URL` в кавычки.

### 4. Запустить backend

```bash
cd back
npm ci
npm run dev
```

Backend по умолчанию стартует на `http://localhost:4000`.

### 5. Настроить frontend env

В отдельном терминале создайте `front/.env.local`:

```env
NEXT_PUBLIC_API_BASE=http://localhost:4000
NEXT_PUBLIC_MEDIA_BASE=http://localhost:4000
```

WebSocket URL вычисляется автоматически из `NEXT_PUBLIC_API_BASE` и будет равен `ws://localhost:4000/ws`.

### 6. Запустить frontend

```bash
cd front
npm ci
npm run dev
```

Откройте `http://localhost:3000` и выберите нужную роль.

## Основные маршруты приложения

| URL | Назначение |
| --- | --- |
| `/` | Стартовый экран выбора роли |
| `/admin` | Администрирование контента и игр |
| `/host` | Пульт ведущего |
| `/player` | Вход игрока и отправка ответов |
| `/tv` | Экран для трансляции в зал |

## API и realtime

Backend предоставляет JSON API и WebSocket endpoint:

- `GET /health` — healthcheck.
- `POST /api/admin/login` / `POST /api/admin/logout` — админская авторизация.
- `/api/admin/*` — CRUD для контента, игр, команд, игроков, результатов и загрузок.
- `GET /api/games/active` — список активных игр.
- `POST /api/games/:id/join` — вход в игру по PIN-коду.
- `GET /api/games/:id/teams/status` — список команд и занятость слотов.
- `GET /api/games/:id/sectors` — сектора игры с вопросами.
- `WS /ws` — realtime-управление игрой.

Подробнее события и контракт описаны в [`back/Chgk/api-contract.md`](back/Chgk/api-contract.md).

## Скрипты

### Backend

```bash
cd back
npm run dev      # dev-сервер через ts-node/nodemon
npm run build    # компиляция TypeScript в dist/
npm start        # запуск production-сборки
npm run lint     # placeholder-команда
```

### Frontend

```bash
cd front
npm run dev      # Next.js dev server
npm run build    # production-сборка
npm start        # запуск production-сборки
npm run lint     # ESLint
```

## Деплой

Короткая схема деплоя:

1. Собрать backend и frontend через `npm run build`.
2. Применить `back/utils/db/gen_tables.sql` к PostgreSQL.
3. Передать backend переменные `DATABASE_URL`, `ADMIN_LOGIN`, `ADMIN_PASSWORD`, `APP_SECRET`, `CORS_ORIGIN`.
4. Передать frontend переменные `NEXT_PUBLIC_API_BASE` и `NEXT_PUBLIC_MEDIA_BASE`.
5. Настроить reverse proxy:
   - `/api/*`, `/ws`, `/uploads/*`, `/health` → backend;
   - все остальные маршруты → frontend.
6. Запустить оба процесса под systemd, pm2, Docker или другим supervisor.

Более подробный checklist находится в [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Что можно улучшить дальше

- Добавить Docker Compose для локального запуска фронтенда, бэкенда и PostgreSQL одной командой.
- Покрыть критичные сценарии unit/e2e-тестами.
- Перенести runtime-состояние игры из памяти в Redis для горизонтального масштабирования.
- Добавить seed-данные для демонстрационного запуска.
- Добавить CI pipeline для lint/build/test.
