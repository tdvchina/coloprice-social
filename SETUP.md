# Coloprice Instagram: автопостинг каруселей — настройка

Пайплайн живёт в отдельном репозитории `coloprice-social`, а не в `colocationindex`:

```
RSS отраслевых СМИ ──► content/inbox/<дата>.json ─┐
coloprice.com JSON ──► content/data/coloprice-latest.json ─┤
                                                           ▼
          carousel-writer.yml (Claude, пн–пт 09:25 по Бангкоку)
          пишет content/queue/NNN-slug.json → валидатор → рендер out/<slug>/NN.jpg → commit
                                                           ▼
          instagram-post.yml (без Claude, пн–пт 20:07 по Бангкоку)
          publish.mjs: проверки → Graph API (контейнер на слайд → карусель → publish)
          → content/state.json → Telegram
                                                           ▼
          x-post.yml (без Claude, пн–пт 22:30 по Бангкоку, ВЫКЛЮЧЕН до получения ключей X)
          publish-x.mjs: следующая карусель, уже вышедшая в Instagram → текст ≤ 280 + 4 слайда
          → ответ со ссылкой на coloprice.com → content/state.json (x) → Telegram
```

**Почему отдельный репозиторий.** Coloprice на Vercel платит за минуты сборки и выкатывается окнами деплоя. Каждая карусель — это 7–8 JPEG (~0,8 МБ). Если коммитить их в `colocationindex`, каждый коммит будит сборку. Здесь Vercel вообще не участвует: слайды раздаёт сам GitHub из публичного репозитория.

## Хостинг слайдов (SLIDES_BASE_URL)

Instagram Graph API не принимает файлы — он сам скачивает каждую картинку по публичному URL в момент создания контейнера. Требования: **JPEG**, URL доступен без авторизации, ≤ 8 МБ. В карусели 2–10 картинок, все кадрируются под соотношение сторон первой; у нас 1080×1350 (4:5) — максимум, который Instagram разрешает для ленты.

**Выбор: `raw.githubusercontent.com`.**
`SLIDES_BASE_URL=https://raw.githubusercontent.com/tdvchina/coloprice-social/main/out`

Проверено 28.10.2026 на публичном JPEG:
- ответ `200`, `content-type: image/jpeg`, `access-control-allow-origin: *`, `cache-control: max-age=300`;
- `robots.txt` отсутствует (404), то есть сборщику Meta ничего не запрещено;
- user-agent `facebookexternalhit` тоже получает `200`.

Файл доступен сразу после push, без сборки. `publish.mjs` перед публикацией проверяет HEAD-запросом каждый URL (200, `image/jpeg`, ≤ 8 МБ). С флагом `--wait` он ждёт до 10 минут.

**Условие:** репозиторий должен быть **публичным**. Для приватного raw-URL требует токен, и Meta картинку не скачает. До публикации репозитория пайплайн работает только в `--dry-run`.

**Запасной вариант без кода — GitHub Pages.** Settings → Pages → Deploy from branch → `main` / root, затем `SLIDES_BASE_URL=https://tdvchina.github.io/coloprice-social/out`. Это CDN (Fastly) с правильным content-type, но после каждого push Pages пересобирается около минуты; `--wait` это покрывает. Переключаться стоит, если Meta начнёт отдавать «Media download has failed» с raw-хоста.

**Альтернатива на будущее — Cloudflare R2** (публичный bucket + свой домен, например `img.coloprice.com`; исходящий трафик бесплатный) или **Vercel Blob**. Слайды тогда не лежат в git, но нужен шаг загрузки (ключ R2 или `BLOB_READ_WRITE_TOKEN` в секретах). У Blob есть свой счёт за хранение и трафик, отдельный от сборок. Переходить имеет смысл, если репозиторий распухнет.

**Размер репозитория.** ~0,8 МБ на карусель × ~250 постов в год ≈ 200 МБ истории в год. `prune-out.mjs` удаляет из рабочего дерева `out/<slug>/` через 14 дней после публикации (Instagram к этому моменту давно скопировал медиа), но в git-истории файлы остаются. Мягкий лимит GitHub — 1 ГБ на репозиторий, так что запаса хватит на несколько лет. Потом — R2.

## Что Артём делает руками (один раз)

### 1. Аккаунт Instagram
1. Создать аккаунт **@coloprice**: аватар — логотип из трёх столбиков, в шапке — «The price tag of the internet» и ссылка на coloprice.com (лучше на отдельную страницу `coloprice.com/ig` с UTM, см. «Открытые вопросы»).
2. Настройки → «Для профессионалов» → переключить на **Professional → Business** (категория: «Информационная компания» или «Программное обеспечение»). С личным аккаунтом и аккаунтом Creator контент через Graph API не публикуется.
3. Разогрев: первые 1–2 недели публиковать не больше 1 поста в день — это уже зашито в пайплайн. Ссылок в подписях нет вовсе, `coloprice.com` упоминается текстом не чаще чем в каждом третьем посте (урок @tdv.china от 02.07.2026).

### 2. Facebook-страница и Business Manager
1. Создать Facebook-страницу **Coloprice** (business.facebook.com → Pages → Create).
2. В Instagram: Настройки → Центр аккаунтов → привязать к этой странице.
3. В **business.facebook.com** (портфолио, где уже есть Dream View, или новое) → Business Settings → Accounts: добавить страницу Coloprice и Instagram-аккаунт @coloprice.

### 3. Meta-приложение
1. [developers.facebook.com](https://developers.facebook.com) → **Create App** → тип **Business**, привязать к тому же Business-портфолио.
2. Добавить продукт **Instagram** (сценарий «Instagram API with Facebook Login» / управление контентом).
3. Режима Development достаточно: публикуем только в собственный аккаунт, активы которого принадлежат этому же бизнесу. App Review не нужен, пока не понадобятся чужие аккаунты.

### 4. Токен системного пользователя (не истекает)
1. Business Settings → Users → **System Users** → Add → роль **Admin**.
2. **Assign assets**: приложение (Manage app), страница Coloprice (Full control), Instagram-аккаунт @coloprice (Full control).
3. **Generate New Token** → выбрать приложение → Token expiration **Never** → scopes: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `business_management` (если шаг 5 ниже вернёт пусто — добавить `pages_read_engagement` и перевыпустить). Это `IG_ACCESS_TOKEN`. Сразу сохранить в менеджер паролей и **не вставлять в чат**.
4. Проверить срок: [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/) → «Expires: Never».

### 5. IG_USER_ID (ID Instagram-аккаунта, не страницы)
В своём терминале (токен — из буфера, не из чата):
```bash
read -s TOKEN   # вставить токен, Enter
curl -s "https://graph.facebook.com/v23.0/me/accounts?fields=id,name&access_token=$TOKEN"          # → id страницы Coloprice
curl -s "https://graph.facebook.com/v23.0/<PAGE_ID>?fields=instagram_business_account&access_token=$TOKEN"
# → {"instagram_business_account":{"id":"1784…"}}  ← это IG_USER_ID
```

### 6. Публичный репозиторий на GitHub
```bash
cd "/Users/misscarol/Artem Claude/coloprice-social"
gh repo create tdvchina/coloprice-social --public --source=. --remote=origin --push
```
Перед `--public` можно пролистать `git log -p`: в репозитории только код, публичные новости (заголовок, URL, дата), открытые данные Coloprice (CC BY) и слайды. Секретов и имён клиентов нет — валидатор это стережёт.

### 7. Секреты и переменные
Значения вводить в своём терминале (`gh secret set` спросит их интерактивно), в чат не вставлять:
```bash
R=tdvchina/coloprice-social
gh secret set IG_USER_ID -R $R
gh secret set IG_ACCESS_TOKEN -R $R
gh secret set CLAUDE_CODE_OAUTH_TOKEN -R $R     # как в DV-рутинах (подписка); вместо него можно ANTHROPIC_API_KEY
gh secret set TELEGRAM_BOT_TOKEN -R $R          # бот/чат — см. «Открытые вопросы»
gh secret set TELEGRAM_CHAT_ID -R $R            # можно несколько через запятую
gh secret set CONTENT_DENYLIST -R $R            # имена клиентов/контрагентов через запятую — в постах не появятся никогда
gh variable set SLIDES_BASE_URL -R $R --body "https://raw.githubusercontent.com/tdvchina/coloprice-social/main/out"
```
`CLAUDE_CODE_OAUTH_TOKEN` — тот же, что в секретах `tdvchina/tdv-website`, или новый через `claude setup-token`. Лимит подписки общий на все рутины (см. инциденты в памяти `cloud-routines-migration`).

### 8. Включить и проверить воркфлоу
1. Actions → **Carousel writer** → Run workflow (`force` = true): пройдёт intake, обновятся данные, Claude напишет и отрендерит карусель, в Telegram придёт «🗂 в очереди новая карусель…».
2. Actions → **Instagram post** → Run workflow с `dry_run` = true: проверка валидатора, доступности слайдов по `SLIDES_BASE_URL` и подписи без отправки в Meta.
3. Тот же запуск с `dry_run` = false — первая реальная публикация. В Telegram придёт «📸 … опубликована карусель … <permalink>», в репозиторий — коммит `social: published <slug>`.
4. Дальше всё идёт по расписанию: writer — пн–пт 09:25, пост — пн–пт 20:07 по Бангкоку (это 09:07 в Нью-Йорке и 14:07 в Лондоне), 5 постов в неделю.
5. Проверить, что cron действительно стреляет сам (первые 2–3 дня). На свежих **приватных** репозиториях GitHub-cron у нас не стрелял вообще. На публичных обычно работает, но если тики пропадают — завести задания в cron-job.org на `workflow_dispatch` по схеме DV (`/api/trigger-workflow`). GitHub отключает cron в публичных репозиториях после 60 дней без коммитов; ежедневные авто-коммиты этому не дают случиться.

## Токены Meta: что живёт сколько
| Токен | Срок | Что делать |
|---|---|---|
| User token из Graph API Explorer | ~1 час | только поиграться |
| Long-lived user token | **60 дней**, потом умирает | не использовать для автоматики — так в сентябре 2026 встали IG и Threads у Dream View |
| Instagram Login token (`graph.instagram.com`) | 60 дней, продлевается, пока живой | альтернатива без Facebook-страницы: `IG_GRAPH_HOST=graph.instagram.com` + рефреш раз в ~50 дней |
| **System User token, «Never»** | **не истекает** | наш вариант. Умирает только при отзыве, удалении системного пользователя или смене прав |

Ошибка `code 190` («session has been invalidated…») означает, что токен недействителен (истёк или отозван), пароль тут ни при чём — нужно выпустить новый токен системного пользователя. `code 200` или `code 10` — проблема с правами или блок доступа к API в кабинете Meta. `publish.mjs` различает эти случаи и пишет в Telegram, что именно чинить.

## Запуск локально
```bash
npm ci
npm run intake                      # RSS → content/inbox/<сегодня>.json (--check-feeds — здоровье лент)
npm run data -- --local="/Users/misscarol/Artem Claude/colocationindex/src/data"   # + capacity-watch
node scripts/validate-carousel.mjs --all
node scripts/render-carousel.mjs <slug>            # → out/<slug>/01.jpg…
npm run queue                                      # что в очереди и что опубликовано
npm run grid                                       # превью сетки профиля → out/grid-preview.jpg
npm run pdf -- <slug>                              # PDF для LinkedIn → out/<slug>/<slug>.pdf (--all — все)
SLIDES_BASE_URL=… node scripts/publish.mjs --dry-run
node scripts/publish-x.mjs --dry-run                # X: точный текст, слайды, alt-тексты и ответ (ключи не нужны)
npm test
```
Реальная публикация с ноутбука — `node scripts/publish.mjs` при заполненном `.env.local` (шаблон — `.env.example`). Обычно это не нужно: публикует воркфлоу.

## Дизайн: темы, шаблоны, сетка профиля
- **Темы** (`theme` у карусели или у слайда): `dark` — основа ленты; `paper` — светлый фон #f3f4f1, лайм только маркером-выделителем под ключевой цифрой; `lime` — лаймовая плитка-акцент, не чаще 1 обложки из 5. Логотип на светлых фонах — в тёмной плашке (фавикон), чтобы лаймовый столбик не терялся.
- **Обложки** (`cover.layout`): `standard`, `poster` (одна гигантская цифра), `split` (два тона: `rows` — заголовок сверху/цифра снизу, `cols` — заголовок слева/панель с цифрой справа), `compare` (две цифры рядом), `map` (точечная карта мира с пузырями МВт), `quote` (типографское утверждение). Новые типы слайдов: `compare`, `map`, `quote`. Схема — [content/FORMAT.md](content/FORMAT.md).
- **Карта** — равнопромежуточная проекция и маска суши Natural Earth 1:110m (public domain, `assets/geo/`, лицензия там же). Никаких тайлов и чужих карт, всё рисуется локально.
- **Сетка профиля**: новый пост встаёт в левый верхний угол, поэтому первый опубликованный оказывается справа внизу. `npm run grid` собирает `out/grid-preview.jpg` (плитки 4:5); `--ratio=3:4 --guides` показывает обрезку сетки приложения и безопасную зону.

### Стартовая сетка (9 постов, по одному в день, 001 → 009)
Порядок публикации = номер файла в `content/queue/`. Все девять — `publishBy: 2026-11-25`, так что publisher не отбросит их как просроченные минимум до этой даты.

| | столбец 1 | столбец 2 | столбец 3 |
|---|---|---|---|
| ряд 1 (новые) | 009 метод индекса — dark/lime split | 008 Index — paper compare | 007 Map — dark map |
| ряд 2 | 006 Outage — paper split cols | 005 Ranked — **lime** poster | 004 Explainer — paper quote |
| ряд 3 (первые) | 003 GPU — dark poster | 002 Deal Sheet — paper | 001 Megawatt Watch — dark/lime split |

Тёмные и светлые плитки идут шахматкой, лайм — по диагонали. `coloprice.com` в подписи — у 003, 006, 009 (раз в три поста).

## LinkedIn: PDF-карусели
Покупатели и брокеры сидят в LinkedIn, а там карусель — это «документ» (PDF). `scripts/make-pdf.mjs` склеивает слайды `out/<slug>/NN.jpg` в `out/<slug>/<slug>.pdf` без зависимостей (JPEG вкладываются как есть, страница 1080×1350). Воркфлоу `carousel-writer.yml` пересобирает PDF после каждого рендера; вручную — `npm run pdf -- --all`.

Как выложить (руками, API LinkedIn не подключён):
1. Взять PDF: из репозитория (`out/<slug>/<slug>.pdf`, кнопка Download на GitHub) или локально после `npm run pdf -- <slug>`.
2. LinkedIn → «Начать публикацию» → значок «+»/«Ещё» → **Добавить документ** → выбрать PDF.
3. Ввести **название документа** (обязательно, его видно в ленте) — заголовок обложки, например «How the Coloprice index is built».
4. Текст поста — подпись из `caption` карусели; в LinkedIn ссылку можно ставить прямо в текст (`https://coloprice.com/...`), хэштеги — 3–5 из `hashtags`.
5. Публиковать с личного профиля Артёма или со страницы Coloprice — не чаще 1 документа в день, лучше в будни утром по Европе/США.

## Данные Coloprice (data hooks)
- **В CI** `data-hooks.mjs` читает только публичные эндпоинты coloprice.com: `/data/colocation-price-index.json`, `/data/gpu-price-index.json`, `/api/history/{colo-index,gpu-prices}.json`, `/data/data-center-pipeline.csv`, `/data/transactions.csv`, `/data/data-center-incidents.csv`. Всё под CC BY 4.0, в репозиторий `colocationindex` ничего не пишется.
- **Пайплайн** в снимке хранится целиком (все страны, не топ-25): региональные суммы по урезанному списку занижали Европу.
- **Capacity Watch** (`capacity-watch.json`) публичного JSON-эндпоинта не имеет. Его подтягивает только локальный экспорт с `--local=…/colocationindex/src/data`, и в снимке он остаётся с исходным `asOf` и пометкой `staleNote`. Чтобы обновлять его в облаке, нужно либо иногда запускать экспорт на Mac и коммитить `content/data/coloprice-latest.json`, либо добавить в Coloprice эндпоинт `/data/capacity-watch.json` (это правка `colocationindex` — см. «Открытые вопросы»).

## Ленты новостей (config/feeds.json, проверены 28.10.2026)
DCD, Data Center Frontier, Data Center Knowledge, Data Center POST, Data Centre Review, W.Media (APAC), Capacity Media, Uptime Institute Journal, The Next Platform, ServeTheHome, The Register (On-Prem), NVIDIA Newsroom, Equinix (пресс-релизы), AWS What's New. Ленты с `kind: general` фильтруются по ключевым словам.

Не работают для ботов: RSS Digital Realty, CoreWeave, Vertiv и Supermicro (403), hpcwire (403), datacentremagazine (403), старый RSS Data Center Frontier (404). Страницы статей DCD отдают 403 и curl, и WebFetch, хотя сама лента DCD открыта. Поэтому рутина проверяет факт по второму источнику или берёт только заголовок и подзаголовок из ленты DCD.

## Ограничения API и правила
- Graph API позволяет до 50 публикаций через API за 24 часа; мы делаем 1 в день — жёстко, без флага-обхода (дата по Asia/Bangkok; лимит проверяют шаг-guard воркфлоу и `publish.mjs`, оба читают `content/state.json`, а не git log).
- Карусель — 2–10 слайдов, только JPEG.
- Подпись ≤ 2200 знаков, хэштегов ≤ 5 (лимит Instagram с декабря 2025; мы ставим 3–5).
- Формат очереди, 7 рубрик и правила контента описаны в [content/FORMAT.md](content/FORMAT.md). Главное: каждая цифра со слайда должна найтись в `facts` процитированного источника или данных; никаких клиентов, сделок, инвестсоветов и «гарантий».
- Идемпотентность: опубликованный slug повторно не постится никогда. Перед `media_publish` скрипт ещё сверяет первую строку подписи с последними постами аккаунта, чтобы после сбоя не задвоить пост.

## X (Twitter)

Второй канал для тех же каруселей. Воркфлоу `x-post.yml` в будни в 22:30 по Бангкоку (примерно через 2,5 часа после Instagram) берёт самую старую карусель, которая уже вышла в Instagram (`content/state.json → published`), но ещё не вышла в X (`→ x`), и публикует её так:

- **основной пост**: хук из первой строки подписи, один подтверждающий факт (предложение подписи с цифрой) и строка `Data: …`, всего ≤ 280 знаков. Ссылки в основном посте нет: X режет охват постов со ссылками, а пост с URL ещё и стоит примерно в 13 раз дороже (см. ниже). Все цифры проверяются по `facts` так же, как в валидаторе Instagram, плюс проверка `CONTENT_DENYLIST`;
- **4 картинки**: обложка и 3 самых информативных слайда (график или карта, затем сравнение или список, затем ключевая цифра), у каждой alt-текст из заголовка и цифр слайда;
- **один ответ** под постом: `Full table + sources: coloprice.com/<страница>`, где страница — та, что стоит за data hook (pipeline → `/pipeline/`, индекс → `/index/`, GPU → `/gpu/`…); по умолчанию — главная.

Переопределить текст, набор слайдов или страницу для ответа можно полем `x` в JSON карусели (схема — [content/FORMAT.md](content/FORMAT.md), раздел «X (Twitter) cross-post»). Предпросмотр: `node scripts/publish-x.mjs --dry-run` (ключи не нужны) или `--dry-run --slug=<slug>` для любой карусели.

**Лимиты** (`config/limits.json → x`): не больше 1 поста за запуск, `perDay` 2 в сутки по Бангкоку, `minHoursBetween` 4 часа, `maxAgeDays` 10 дней (старше X не догоняет, потому что `prune-out.mjs` через 14 дней убирает слайды из рабочего дерева), `reply: true`. Чтобы отказаться от платного ответа со ссылкой, достаточно поставить `"reply": false` и дать ссылку в шапке профиля.

**Идемпотентность.** Запись `state.x[slug]` появляется сразу после основного поста, ещё до ответа. Если ответ не ушёл, следующий запуск дописывает только его. Если X отклоняет пост как дубль (после сбоя), скрипт находит его среди последних постов аккаунта и чинит состояние без повтора. Коммит воркфлоу — `social: x posted <slug>`. Guard Instagram такие коммиты не путают: и он, и `publish.mjs` считают посты только по `state.json → published`, git log никто не читает.

### Что Артём делает руками (один раз)
Названия пунктов в консоли X меняются; если что-то называется иначе, ищи по смыслу.

1. **Аккаунт X.** Создать **@coloprice** (если имя занято — `@colopricecom` или `@coloprice_data`; тогда поправить `X_HANDLE` в `.env`). Аватар и шапка — как в Instagram, в bio — «The price tag of the internet», в поле Website — `coloprice.com`: ссылка в профиле бесплатна и охват не режет.
2. **Developer-аккаунт.** Войти на [console.x.com](https://console.x.com) (бывший developer.x.com) **именно под @coloprice**: Access Token, выпущенный в консоли, принадлежит аккаунту-владельцу приложения, и посты пойдут от его имени. Принять Developer Agreement и описать задачу честно, например: *«Scheduled posting of our own data-centre price charts and sourced industry figures to our own account @coloprice. No reading, analysis or resale of other users' data.»*
3. **Кредиты.** Billing → купить кредиты (минимум $5) и поставить **Spending limit** (например, $10 в месяц). Карту вводит Артём сам. Наш объём — около $5 в месяц (расчёт ниже).
4. **Приложение.** Создать App (New App). Если консоль просит Project — создать Project «Coloprice social» и приложение в нём.
5. **Права до токенов (важно).** App → **User authentication settings** → Set up:
   - **App permissions: Read and write** (без DM);
   - Type of App: **Web App, Automated App or Bot**;
   - Callback URI: `https://coloprice.com/`, Website URL: `https://coloprice.com` (они обязательны, хотя наш скрипт ими не пользуется) → Save.
   
   Это нужно сделать **до** генерации Access Token. Токен, выпущенный раньше, остаётся read-only даже после смены прав, и публикация падает с 403 (скрипт пишет об этом в Telegram). Если токен уже был выпущен, нажать **Regenerate**.
6. **Ключи.** App → Keys and tokens:
   - **API Key and Secret** (Consumer Keys) → `X_API_KEY`, `X_API_SECRET`;
   - **Access Token and Secret** → Generate (рядом должно быть «Read and Write») → `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`.
   
   Ключи показываются один раз: сразу в менеджер паролей, **в чат не вставлять**.
7. **В `.env`** (строки `X_API_KEY=` … `X_ACCESS_SECRET=` уже есть внизу файла) вставить значения после `=`, затем в своём терминале:
   ```bash
   cd "/Users/misscarol/Artem Claude/coloprice-social" && scripts/push-secrets.sh
   ```
   Скрипт копирует ключи X в секреты GitHub, если они заполнены (пустые пропускает молча), и выставляет переменную `X_HANDLE`. Значения не печатаются.
8. **Сказать Claude «включи X».** Claude выполнит `gh workflow enable "X post" -R tdvchina/coloprice-social`, запустит Actions → **X post** с `dry_run` = true (текст, слайды, alt-тексты, ответ), затем с `dry_run` = false — первый реальный пост. В Telegram придёт «🐦 Coloprice X: опубликован пост … <ссылка>», в репозиторий — коммит `social: x posted <slug>`.

До этого момента воркфлоу **выключен** в Actions. Если его включить без ключей, живой запуск всё равно сразу выходит с сообщением «X posting is not configured…» и ничего не публикует.

### Почему без библиотеки (OAuth 1.0a своими руками)
Нужны четыре вызова: загрузка медиа, alt-текст, пост и ответ. OAuth 1.0a — это ~40 строк HMAC-SHA1 на `node:crypto` (`scripts/lib/oauth1.mjs`); подпись проверяется тестом на эталонном примере из документации X. Проверено 28.10.2026: `twitter-api-v2` (1.31.0) живой и надёжный, официальный `@xdevplatform/xdk` пока 0.x. Но у публичного репозитория с ключами на запись каждая зависимость — лишняя поверхность атаки через цепочку поставок, а выигрыша на четырёх эндпоинтах нет. Если X сломает протокол загрузки, переход на `twitter-api-v2` займёт полчаса: `publish-x.mjs` обращается к API в одном месте.

### API X и цены — проверено по docs.x.com 28.10.2026
- **Эндпоинты.** Медиа — v2 chunked: `POST /2/media/upload/initialize` → `POST /2/media/upload/{id}/append` (multipart) → `POST /2/media/upload/{id}/finalize` (→ `GET /2/media/upload?command=STATUS`, если идёт обработка). Alt-текст — `POST /2/media/metadata`, пост и ответ — `POST /2/tweets`. Все принимают OAuth 1.0a user context (схема `UserToken` в OpenAPI) или OAuth 2.0 со scope `media.write`/`tweet.write`. Фолбэк на v1.1 `upload.twitter.com` не нужен. Лимит картинки — 5 МБ (наши слайды по ~0,1 МБ), в посте до 4 фото.
- **Тарифы.** С 6 февраля 2026 года X API для новых разработчиков работает по **pay-per-use**: предоплаченные кредиты, без подписки. Бесплатного уровня для новых аккаунтов в документации больше нет: бывшим пользователям Legacy Free дали разовый ваучер $10. Basic и Pro «остаются доступными» для действующих подписчиков; можно ли их купить новому аккаунту, по документации понять нельзя — **не проверено**. Есть разовые бонусы: $20 после первой покупки кредитов картой и, вдобавок, сумма первого авто-пополнения, но не больше $50. Бонусы сгорают через 3 месяца.
- **Цены с 20.04.2026:** Post: Create — **$0,015**, Post: Create **с URL — $0,20**, Media Metadata (alt-текст) — $0,005 за запрос, Owned Reads (свои посты) — $0,001, User: Read — $0,01. Отдельной цены за саму загрузку медиа в таблице нет, так что она, видимо, не тарифицируется — **не проверено**. Неудачные запросы не списываются.
- **Наш расход:** пост + 4 alt-текста + ответ со ссылкой ≈ $0,015 + $0,02 + $0,20 = **≈ $0,235 за карусель**. При 5 постах в неделю (~22 в месяц) это **≈ $5 в месяц**, без ответа со ссылкой (`reply: false`) — ≈ $0,8 в месяц.
- **Rate limits** с огромным запасом: `POST /2/tweets` — 100 за 15 минут на пользователя и 10 000 за 24 часа на приложение, загрузка медиа — сотни в 15 минут. Ограничение для нас только наше собственное: 2 поста в день.
- Источники: [Pricing](https://docs.x.com/x-api/getting-started/pricing), [Free credits](https://docs.x.com/x-api/getting-started/free-credits), [Changelog](https://docs.x.com/changelog) (запуск pay-per-use 06.02.2026, цены 16.04.2026), [Rate limits](https://docs.x.com/x-api/fundamentals/rate-limits), [Chunked upload](https://docs.x.com/x-api/media/quickstart/media-upload-chunked), [Media metadata](https://docs.x.com/x-api/media/create-media-metadata), [Create Post](https://docs.x.com/x-api/posts/create-post), [Getting access](https://docs.x.com/x-api/getting-started/getting-access). Цены меняются — актуальные всегда в Developer Console.

### Ошибки и что они значат (скрипт пишет их в Telegram)
| Ответ X | Причина | Что делать |
|---|---|---|
| 401 | ключи неверны, перевыпущены или отозваны | перевыпустить в console.x.com → `.env` → `scripts/push-secrets.sh` |
| 403 «oauth1 app permissions» | токен выпущен до включения «Read and write» | Regenerate Access Token/Secret → секреты |
| 403 «client-not-enrolled» | приложение не привязано к проекту или плану | проверить App/Project в консоли |
| 402 / «credits» | кончились кредиты или достигнут Spending limit | пополнить Billing |
| 429 | rate limit | ничего: повтор при следующем запуске, время сброса — в сообщении |
| 403 «duplicate content» | пост уже есть (повтор после сбоя) | ничего: состояние чинится само |
