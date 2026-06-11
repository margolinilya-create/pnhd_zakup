# Плейбук Claude Code: Калькулятор закупщика на фундаменте vibe

Фундамент: https://github.com/di-sukharev/vibe
Стек: Bun + Hono + Prisma + PostgreSQL (backend) · React + Vite + TanStack (web) · Zod-контракты в `packages/contracts` · **БД — Supabase (managed Postgres, Session Pooler)**.

> Инфра обновлена относительно исходного плейбука: вместо локального Docker-Postgres — **Supabase**, фронт **и backend** деплоятся на **Vercel**. Актуальные детали — `PROJECT_CONTEXT.md` §2 и `docs/LOCAL_DATABASE.md`. Команды ниже приведены под Supabase.

> **СТАТУС (2026-06): этот плейбук — исторический.** Все фазы 0–6 завершены, MVP в проде (webapp + API на Vercel, backend захостен). Текущее состояние, недавние доработки по фидбэку менеджера и процесс миграций Prisma 7 — в `PROJECT_CONTEXT.md` §2a (источник истины по «что сейчас»). Плейбук оставлен как запись интейка и порядка постройки.

Workflow: bulletproof (фазы → гейты → коммит → следующая фаза в свежем контексте).

---

## ШАГ 0. Предусловия (один раз, терминал) — ВЫПОЛНЕНО

```bash
# 1. Bun
curl -fsSL https://bun.sh/install | bash        # macOS/Linux
# Windows (PowerShell): powershell -c "irm bun.sh/install.ps1 | iex"

# 2. Claude Code
npm install -g @anthropic-ai/claude-code
```

> Docker больше не нужен (БД — Supabase). Проект Supabase `pnhd-zakup` уже создан; подключение и пароль — см. `docs/LOCAL_DATABASE.md`.

## ШАГ 1. Залить фундамент vibe в свой репозиторий — ВЫПОЛНЕНО

Репозиторий поднят на базе vibe и запушен в `margolinilya-create/pnhd_zakup` (ветка `master`). Для справки исходные команды:

```bash
git clone https://github.com/di-sukharev/vibe.git procurement-calc
cd procurement-calc
git remote remove origin
git remote add origin <URL_ТВОЕГО_РЕПОЗИТОРИЯ>
git push -u origin master
```

## ШАГ 2. Положить в репозиторий проектные файлы — ВЫПОЛНЕНО

ТЗ лежит в `specs/tz-calculator.md`, каталог `seed/` создан (`seed/README.md` — заглушка; реальные данные въедут промтом Фазы 2). Также в корне: `PROJECT_CONTEXT.md`, `claude_code_playbook.md`, `mvp_calc_v2.jsx`.

## ШАГ 3. Запустить Claude Code

```bash
cd procurement-calc
claude
```

Дальше — промты по порядку. **Один промт = одна фаза = один сеанс.** После каждой фазы: гейты → коммит → `/clear` → следующий промт.

---

# ПРОМТ 0 — Установка шаблона (онбординг vibe) — В ОСНОВНОМ ВЫПОЛНЕНО

> Bootstrap уже сделан вне этого промта: репо поднято, зависимости установлены, БД — Supabase (не Docker), фронт задеплоен на Vercel. Промт оставлен как референс; инфра-ответы интейка ниже скорректированы.
> Это адаптированный официальный install-промт из README vibe, с уже вшитыми ответами интейка — Claude Code не будет задавать вопросы, на которые мы уже ответили.

```text
Установи этот репозиторий как новый проект на базе шаблона vibe. Сначала прочитай README.md, CLAUDE.md, AGENTS.md и docs/LOCAL_DATABASE.md.

Ответы на интейк (не задавай эти вопросы повторно):
- Это НОВЫЙ проект из шаблона, не работа над шаблоном. Remote уже перенастроен на мой репозиторий — не трогай git remote.
- Имя проекта / slug: procurement-calc.
- Продукт: калькулятор закупщика швейного производства. Полное ТЗ лежит в specs/tz-calculator.md — прочитай его целиком, это источник истины по домену.
- Первый user journey: закупщик выбирает SKU, вводит размерный ряд, выбирает ткань и поставщика, получает расчёт потребности (м/кг), резерв, объём закупки с округлением до рулона и стоимость в ₽ — и сохраняет это как заказ.
- Активные поверхности: web + backend/API (full-stack). mobile и landing — отложены (поставь deferred-заметки в их README, как требует шаблон).
- Нужны: аккаунты/auth (берём JWT-auth шаблона как есть), персистентность (PostgreSQL). НЕ нужны: загрузка файлов, медиа, платежи, real-time/WebSocket.
- Роли: добавь в модель User поле role: enum(TECHNOLOGIST, PURCHASER, OPERATOR, ANALYST), дефолт PURCHASER. Полноценный RBAC сделаем в поздней фазе — сейчас только поле.
- БД — Supabase (managed Postgres), без локального Docker. Подключение через Session Pooler, строки/пароль — в backend/.env (см. docs/LOCAL_DATABASE.md). Фронт (webapp) уже задеплоен на Vercel; ~~backend пока не хостим (TBD)~~ → **backend тоже захостен на Vercel** (`pnhd-zakup-api`, сделано позже). Yandex Cloud — задокументированная альтернатива (docs/YANDEX_CLOUD.md), не настраивать.
- Expo/EAS/Maestro не настраивать.

Сделай: bun install; создай backend/.env из .env.example со сгенерированным локальным JWT_SECRET (не коммить и не печатай секрет) и строками подключения к Supabase (Session Pooler, схемы public/app_test — см. docs/LOCAL_DATABASE.md); прогони prisma:deploy против Supabase; запусти bun run typecheck и bun run test:backend; переименуй package.json под procurement-calc; зафиксируй в README выбранные поверхности и отложенные; удали Bootstrap-Only блоки из AGENTS.md и CLAUDE.md.

В конце дай отчёт: локальные URL, что запущено, какие команды я должен выполнить руками.
```

**Гейт фазы 0:** `bun run typecheck` зелёный, `bun run dev:backend` и `bun run dev:web` стартуют. Коммит: `chore: bootstrap from vibe template`.

---

# ПРОМТ 1 — Контракты + чистый движок расчёта (ядро, TDD)

```text
Фаза 1: доменное ядро. Прочитай specs/tz-calculator.md (разделы 5, 6, 7) и CLAUDE.md.

Задача: создать в packages/contracts доменные Zod-схемы и чистый движок расчёта. Движок — детерминированная чистая функция БЕЗ обращений к БД, сети или Prisma. Архитектурное требование ТЗ №1.

1) Zod-схемы (packages/contracts): Fabric (canonical_unit: 'kg'|'m', density_gsm, width_cm, pre_shrink, roll_size, roll_unit), Supplier, SupplierFabric (цена на ребре: price_rub, price_usd, roll_size override), Sku, ProductPassport (base_size, size_coefficients: Record<size, number>), PassportComponent (role, norm_base, loss_cut, loss_sew, allowed_fabric_ids[]), CalcInput (sku, size_breakdown, выбор ткань+поставщик per component, fx_rate, reserve_pct, price_currency: 'RUB'|'USD'), CalcResult (по ткани: need_kg, need_m, reserve, order_qty с округлением до рулона, rolls_count, cost_rub + расшифровка факторов по компонентам).

2) Движок (packages/contracts/src/engine/): функция computeProcurement(input, refs): CalcResult. Порядок шагов СТРОГО по разделу 6 ТЗ:
   шаг 1: по каждому компоненту raw = norm_base × Σ(size_coef[s] × qty[s])
   шаг 2: net = raw × layout_coef × (1 + loss_cut + loss_sew) × (1 + pre_shrink); layout_coef = перекос(если max доля размера > 0.5: 1 + (доля − 0.5) × 0.1) × ширина(для канона 'm': REF_WIDTH/width; для канона 'kg': 1 + max(0,(REF_WIDTH−width)/REF_WIDTH)×0.05), REF_WIDTH = 180
   шаг 3: группировка по ткани (одна ткань в нескольких ролях суммируется)
   шаг 5: резерв = need × reserve_pct
   шаг 6: order = ceil(toBuy / roll_size) × roll_size в единице рулона
   шаг 7: стоимость = order(в price_unit) × цена; USD → × fx_rate
   Конверсия: кг_на_м = width_m × density_gsm / 1000. Без промежуточных округлений — округлять только на шаге рулона.

3) TDD: сначала тесты (bun test), потом код. Обязательные кейсы:
   - золотой кейс: худи из 2 компонентов (футер + рибана), партия M40/L30/XL20 — посчитай руками и зафиксируй в тесте до грамма;
   - одна ткань в двух ролях суммируется;
   - канон 'm' vs канон 'kg' — разные ветки ширины;
   - округление до рулона (граничный случай ровно на кратности);
   - перекос >50% одного размера;
   - reserve_pct = 0;
   - детерминизм: два вызова с одинаковым входом дают побайтно одинаковый результат.

Гейты перед завершением: bun run typecheck, bun run test:contracts — всё зелёное. Самоаудит по разделу 6 ТЗ: каждый шаг формулы реализован? Не добавляй ничего сверх фазы.
```

Коммит: `feat(contracts): domain schemas + pure procurement engine with tests`.

---

# ПРОМТ 2 — Prisma-схема + сиды с реальными данными

```text
Фаза 2: модель данных и сиды. Прочитай specs/tz-calculator.md раздел 5 и packages/contracts (схемы фазы 1 — источник истины по полям).

1) Prisma-схема (backend/prisma/schema.prisma), в стиле существующих моделей шаблона:
   Fabric, Supplier, SupplierFabric (уникальный композит supplier_id+fabric_id; price_rub, price_usd, roll_size?, lead_time_days?), Sku, ProductPassport (1:1 c Sku, version int), PassportComponent (role enum: MAIN/RIB/TRIM/OTHER; allowed fabrics через join-таблицу ComponentAllowedFabric), Order (mode enum TEST/ORDER; size_breakdown Json; component_fabric_map Json; fx_rate; reserve_pct; input_snapshot Json; result Json; price_currency), ActualFact (order_id, fabric_id, actual_consumed, waste_fabric, waste_sewing, waste_natural, produced_qty). User.role — уже есть из фазы 0.
   ВАЖНО (ТЗ 12): Order хранит снимок входов (input_snapshot) и результат — иммутабельно, без пересчёта при изменении справочников.

2) Миграция против Supabase (Docker не нужен). Функция `uuidv7()` в базе уже создана (PG17-совместимость). Прим.: `prisma migrate dev` на Supabase требует shadow database (роль `postgres` через пулер не может CREATE DATABASE) — задай `shadowDatabaseUrl` на отдельную схему/проект или сгенерируй миграцию и применяй через `bun run --cwd backend prisma:deploy`. См. docs/LOCAL_DATABASE.md.

3) Сид backend/prisma/seed.ts с РЕАЛЬНЫМИ данными (из «База. тканей» и «SKU/PRODUCT_PASSPORT»):

Поставщики: SUP001 МЕДАС, SUP002 КОТОНПРОМ (страна RU).

Ткани (id, name, category, composition, density_gsm; canonical_unit='kg'; width_cm и pre_shrink — дефолты по категории: Кулирка/Футер/Пике → width 180, shrink 0.05 (Футер 0.06); Рибана/Кашкорсе → width 90, shrink 0.05; roll_size=25, roll_unit='kg' — пометь в комментарии, что это дефолты до уточнения):
FAB001 Футер 3-х нитка Начес, Футер, 70/30 хб/пэ, 320
FAB002 Футер 3-х нитка Петля, Футер, 80/20 хб/пэ, 320
FAB003 Кулирка, Кулирка, 92/8 хб/лайкра, 165
FAB004 Кулирка, Кулирка, 92/8 хб/лайкра, 180
FAB005 Кулирка, Кулирка, 92/8 хб/лайкра, 200
FAB006 Кулирка, Кулирка, 92/8 хб/лайкра, 230
FAB007 Кулирка, Кулирка, 92/8 хб/лайкра, 240
FAB008 Кулирка, Кулирка, 100% хб, 180
FAB009 Кулирка, Кулирка, 100% хб, 200
FAB010 Кулирка, Кулирка, 100% хб, 230
FAB011 Кулирка, Кулирка, 100% хб, 250
FAB012 Кулирка, Кулирка, 100% хб, 300
FAB013 Футер 2-х нитка, Футер, 92/8 хб/лайкра, 245
FAB014 Петля/Диагональ, Футер, 80/20 хб/пэ, 320
FAB015 Петля/Диагональ, Футер, 80/20 хб/пэ, 350
FAB016 Петля/Диагональ, Футер, 80/20 хб/пэ, 400
FAB017 Петля/Диагональ, Футер, 80/20 хб/пэ, 470
FAB018 Петля/Диагональ, Футер, 80/20 хб/пэ, 500
FAB020 Начёс/интерсофт, Футер, 65/35 хб/пэ, 320
FAB024 Пике, Пике, 100% хб, 190
FAB026 Пике, Пике, 100% хб, 215
FAB027 Пике, Пике, 93/7 хб/лайкра, 320
FAB033 Рибана, Рибана, состав не указан, 220
FAB034 Кашкорсе, Кашкорсе, состав не указан, 220

Рёбра SupplierFabric (fabric, supplier, price_rub, price_usd):
FAB001: SUP001 543.2/5.9; SUP002 535.4/5.8
FAB002: SUP001 580.5/6.3; SUP002 555.7/6.0
FAB003: SUP001 316.2/3.4; SUP002 317.4/3.5
FAB004: SUP002 320.0/3.5
FAB005: SUP001 371.5/4.0; SUP002 343.2/3.7
FAB006: SUP001 441.3/4.8
FAB007: SUP001 210.0/2.3
FAB008: SUP001 308.1/3.3; SUP002 300.8/3.3
FAB009: SUP001 371.5/4.0; SUP002 343.2/3.7
FAB010: SUP002 401.1/4.4
FAB011: SUP001 503.7/5.5
FAB012: SUP001 686.0/7.5; SUP002 520.7/5.7
FAB013: SUP001 458.0/5.0; SUP002 451.7/4.9
FAB014: SUP001 580.5/6.3
FAB015: SUP002 555.7/6.0
FAB016: SUP002 761.8/8.3
FAB017: SUP001 1107.3/12.0
FAB018: SUP002 991.8/10.8
FAB020: SUP002 552.0/6.0
FAB024: SUP001 443.1/4.8
FAB026: SUP002 396.5/4.3
FAB027: SUP002 1104.0/12.0
FAB033: SUP001 516.9/5.6; SUP002 1002.8/10.9
FAB034: SUP001 573.8/6.2; SUP002 1002.8/10.9

SKU + паспорта (id, name, norm_base в МЕТРАХ — но canonical у тканей 'kg', поэтому при сидировании конвертируй норматив в кг: norm_kg = norm_m × width_m × density/1000; сохрани исходные метры в комментарий поля). base_size='M', size_coefficients {XS:0.85,S:0.92,M:1.0,L:1.09,XL:1.18,XXL:1.28}, один компонент MAIN, loss_cut=0.05, loss_sew=0.02, allowed_fabrics=[привязанная ткань]:
SKU001 Футболка Classic woman, 0.80, FAB007
SKU002 Футболка Classic man, 0.80, FAB005
SKU003 Футболка Regular, 0.80, FAB013
SKU004 Футболка Free Fit, 0.90, FAB010
SKU005 Футболка Oversize, 1.00, FAB008
SKU006 Футболка OversizeCrop, 1.00, FAB009
SKU007 Лонгслив Classic woman, 0.80, FAB004
SKU008 Лонгслив Regular, 1.30, FAB005
SKU009 Лонгслив Free Fit, 1.30, FAB009
SKU010 Лонгслив Oversize, 1.40, FAB013
SKU011 Свитшот Classic, 1.30, FAB014
SKU012 Свитшот Regular, 1.30, FAB014
SKU013 Свитшот Free Fit, 1.30, FAB014
SKU015 Худи Classic, 1.40, FAB014
SKU016 Худи Regular, 1.40, FAB015
SKU017 Худи Free Fit, 1.40, FAB015
SKU018 Худи Oversize, 1.50, FAB016
SKU019 Худи Reglan, 1.50, FAB014
SKU024 Свитшот халф зип Regular, 1.20, FAB016
SKU025 Свитшот халф зип Free Fit, 1.20, FAB014
SKU026 Свитшот халф зип Oversize, 1.30, FAB014
SKU027 Свитшот халф зип Regular без пояса, 1.20, FAB014
SKU028 Свитшот халф зип Free Fit без пояса, 1.30, FAB014
SKU029 Свитшот халф зип Oversize без пояса, 1.40, FAB014
SKU030 Олимпийка Free Fit, 1.20, FAB014
SKU031 Зип худи Regular, 1.30, FAB014
SKU032 Зип худи Free Fit, 1.40, FAB015
SKU033 Зип худи Oversize, 1.40, FAB015
SKU034 Зип худи Regular капюшон-стойка, 1.40, FAB016
SKU035 Зип худи Free Fit капюшон-стойка, 1.40, FAB014
SKU036 Зип худи Oversize капюшон-стойка, 1.40, FAB014
SKU037 Брюки woman Regular, 1.20, FAB015
SKU038 Брюки woman Regular отрезной пояс, 1.30, FAB014
SKU039 Брюки man Regular, 1.20, FAB014
SKU040 Брюки man Regular отрезной пояс, 1.30, FAB014
SKU041 Брюки man Free Fit, 1.30, FAB014
SKU042 Брюки man Free Fit отрезной пояс, 1.30, FAB016
SKU043 Бомбер basic на кнопках, 1.30, FAB020
SKU044 Бомбер-zipped на молнии, 1.30, FAB014
SKU045 Шорты woman, 0.90, FAB014
SKU046 Шорты man, 1.00, FAB014

НЕ сидируй (тканей нет в базе, создай seed/UNMATCHED.md со списком): SKU014 Свитшот Oversize (Петля/Диагональ(100) 340), SKU020-023 Поло/Регбийки (Пике(100) 180), SKU047-050 Шопперы (Саржа 260/270, Канвас 260).

4) Скрипт bun run --cwd backend prisma:seed, идемпотентный (upsert по бизнес-ключам).

Гейты: миграция применяется на чистую БД; сид прогоняется дважды без дублей; typecheck зелёный. Сверь количество: 24 ткани, 2 поставщика, 36 рёбер, 42 SKU.
```

Коммит: `feat(db): prisma schema + real seed data (fabrics, suppliers, SKUs)`.

---

# ПРОМТ 3 — Backend API (CRUD + расчёт + заказы)

```text
Фаза 3: REST API. Прочитай CLAUDE.md (паттерн route → validation → guard → service → Prisma → DTO), specs/tz-calculator.md разделы 6-8, и движок из packages/contracts.

Эндпоинты (все под JWT-guard шаблона):
- CRUD: /api/fabrics, /api/suppliers, /api/supplier-fabrics, /api/skus, /api/passports (+ компоненты вложенно). Валидация входа Zod-схемами из contracts. DELETE для справочников = soft-delete (status поле), т.к. на них могут ссылаться заказы.
- POST /api/calc — принимает CalcInput, СЕРВИС собирает снимок справочников из БД и вызывает computeProcurement из packages/contracts (движок не знает про Prisma). Возвращает CalcResult. Ничего не сохраняет.
- POST /api/orders — то же + сохраняет Order c mode=TEST|ORDER, input_snapshot (полный снимок входов и использованных записей справочников) и result. После создания заказ ИММУТАБЕЛЕН (PUT/PATCH нет).
- GET /api/orders, GET /api/orders/:id.
- POST /api/orders/:id/fact — ввод факта (массив по тканям: actual_consumed, waste_*, produced_qty). GET факта и отклонение deviation = actual/plan − 1 в ответе.

Интеграционные тесты (bun run test:backend:integration, через схему `app_test` в Supabase — `TEST_SKIP_DOCKER=1`, `TEST_ALLOW_NON_TEST_DATABASE=1` уже в backend/.env): happy-path создания заказа с расчётом; иммутабельность (изменение цены ткани ПОСЛЕ заказа не меняет сохранённый result); факт + отклонение; 401 без токена.

Гейты: typecheck, test:backend, test:backend:integration — зелёные. Никакой бизнес-логики расчёта в роутах и сервисах — только вызов движка.
```

Коммит: `feat(api): reference CRUD, calc, immutable orders, facts`.

---

# ПРОМТ 4 — Frontend: справочники (полное редактирование)

```text
Фаза 4: web-экраны справочников. Прочитай web/README.md и существующие паттерны (TanStack Router/Query/Form, API-клиент шаблона).

Разделы (маршруты под auth):
- /fabrics — таблица тканей: имя, категория, состав, плотность, ширина, канон. единица, усадка, рулон. Inline-создание/редактирование через TanStack Form + Zod из contracts. Поля-дефолты (ширина, усадка, рулон) визуально помечены как «≈ требует уточнения», пока пользователь не сохранит своё значение (флаг is_default_width и т.п. — добавь в схему, миграция).
- /suppliers — поставщики + вложенная таблица их тканей с ценами ₽/$ (рёбра). Добавление ребра: выбор ткани из существующих + цены.
- /skus — список SKU; карточка SKU = паспорт: базовый размер, таблица размерных коэффициентов (редактируемая), компоненты (роль, норматив + единица, потери раскрой/пошив, допустимые ткани мультиселектом). Добавление компонента (например, рибаны к худи).
- Удаление везде = деактивация с подтверждением.

UX: русский интерфейс; оптимистичные апдейты TanStack Query; ошибки валидации под полями. Без излишеств — рабочий инструмент.

Тесты: web unit-тесты форм (валидация норматива > 0, коэффициентов > 0); один Playwright smoke: логин → создать ткань → увидеть в таблице (bun run e2e:web по контракту docs/TESTING.md).

Гейты: typecheck, test:web, e2e:web — зелёные.
```

Коммит: `feat(web): reference data management (fabrics, suppliers, SKUs, passports)`.

---

# ПРОМТ 5 — Frontend: калькулятор + заказы

```text
Фаза 5: главный экран. Прочитай specs/tz-calculator.md раздел 10 и компонент-референс из обсуждения (если приложу mvp_calc_v2.jsx — используй как референс расчётного UX, но перепиши под стек проекта: TanStack Query к /api/calc, стили проекта).

- /calc: выбор SKU → подтягиваются компоненты паспорта; per-component выбор ткани (только allowed) и поставщика (с ценами в селекте); размерный ряд XS-XXL; % резерва (0/3/5/7/10/свой); валюта расчёта (₽ из базы | $ × курс) + поле курса; кнопки Рассчитать / Очистить / Сохранить как тест / Создать заказ.
- Блок результата по каждой ткани: потребность (кг и м), резерв, закупка с округлением до рулона (кол-во рулонов), стоимость ₽; итоговая сумма. Раскрываемая «Расшифровка» по компонентам: базовый расход, перекос, ширина, потери, усадка — из result движка.
- Расчёт live (debounce на /api/calc) или по кнопке — выбери что проще с TanStack Query, но без гонок запросов.
- /orders: список заказов (режим, SKU, штук, сумма, дата), карточка заказа: снимок входов + результат, и форма ввода факта по тканям (расход, отходы по трём категориям, годные изделия) с показом отклонения план/факт в %.

Playwright e2e: логин → выбрать Худи Oversize → ввести M40/L30/XL20 → резерв 5% → рассчитать → создать заказ → открыть заказ → увидеть сохранённый результат.

Гейты: typecheck, test:web, e2e:web. После — Stage 8 bulletproof: пройди по acceptance-критериям specs/tz-calculator.md разделов 6, 7, 10 и отчитайся, что покрыто, а что отложено.
```

Коммит: `feat(web): calculator screen + orders with fact entry`.

---

# ПРОМТ 6 — Ревью в свежем контексте (Stage 9 bulletproof)

После `/clear`, новый сеанс:

```text
Ты code-reviewer со свежим взглядом, реализацию не писал. Прочитай specs/tz-calculator.md и пройди по коду проекта.

Проверь и дай отчёт со ссылками на файлы/строки:
1. Движок в packages/contracts действительно чистый? (нет импортов Prisma/fetch/env)
2. Иммутабельность заказов: можно ли изменить result существующего заказа через API? Докажи тестом.
3. Порядок округлений соответствует разделу 6 ТЗ (округление только на рулоне)?
4. Безопасность: все ли маршруты под guard; нет ли утечки JWT_SECRET; инъекции в Prisma-запросах.
5. N+1 в списках справочников и заказов.
Чини только доказанные баги (правило Stage 6), по каждому — тест, воспроизводящий проблему, потом фикс. Прогони все гейты проекта целиком: bun run typecheck && bun run test && bun run e2e:web.
```

Коммит: `fix: review findings` → squash merge в master.

---

## Что дальше (фазы v2 — промты по запросу)
- RBAC по ролям (TECHNOLOGIST редактирует справочники, PURCHASER считает, OPERATOR вводит факт, ANALYST читает всё).
- CoefficientSet: версионирование коэффициентов + аналитика план/факт с атрибуцией (раздел 9 ТЗ).
- Импорт справочников из Google Sheets (CSV-аплоад).
- Хостинг backend (Hono): фронт уже на Vercel, БД на Supabase — осталось захостить API и прописать `VITE_API_URL` + `CORS_ORIGINS`. Если встанет вопрос 152-ФЗ (данные в РФ) — миграция на Yandex Cloud по docs/YANDEX_CLOUD.md как альтернатива.

## Памятка по дисциплине (bulletproof)
- Каждая фаза — ветка feature/phase-N, после гейтов commit, затем `/clear`.
- Гейты обязательны: `bun run typecheck` · `bun run test` · `bun run e2e:web` (когда есть web).
- Если Claude Code предлагает «доделать потом» проваленный тест — не принимать, чинить в фазе.
- Заказы иммутабельны и хранят снимок — это самое важное инвариант-правило проекта.
