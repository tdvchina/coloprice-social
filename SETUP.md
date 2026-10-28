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
SLIDES_BASE_URL=… node scripts/publish.mjs --dry-run
npm test
```
Реальная публикация с ноутбука — `node scripts/publish.mjs` при заполненном `.env.local` (шаблон — `.env.example`). Обычно это не нужно: публикует воркфлоу.

## Данные Coloprice (data hooks)
- **В CI** `data-hooks.mjs` читает только публичные эндпоинты coloprice.com: `/data/colocation-price-index.json`, `/data/gpu-price-index.json`, `/api/history/{colo-index,gpu-prices}.json`, `/data/data-center-pipeline.csv`, `/data/transactions.csv`, `/data/data-center-incidents.csv`. Всё под CC BY 4.0, в репозиторий `colocationindex` ничего не пишется.
- **Capacity Watch** (`capacity-watch.json`) публичного JSON-эндпоинта не имеет. Его подтягивает только локальный экспорт с `--local=…/colocationindex/src/data`, и в снимке он остаётся с исходным `asOf` и пометкой `staleNote`. Чтобы обновлять его в облаке, нужно либо иногда запускать экспорт на Mac и коммитить `content/data/coloprice-latest.json`, либо добавить в Coloprice эндпоинт `/data/capacity-watch.json` (это правка `colocationindex` — см. «Открытые вопросы»).

## Ленты новостей (config/feeds.json, проверены 28.10.2026)
DCD, Data Center Frontier, Data Center Knowledge, Data Center POST, Data Centre Review, W.Media (APAC), Capacity Media, Uptime Institute Journal, The Next Platform, ServeTheHome, The Register (On-Prem), NVIDIA Newsroom, Equinix (пресс-релизы), AWS What's New. Ленты с `kind: general` фильтруются по ключевым словам.

Не работают для ботов: RSS Digital Realty, CoreWeave, Vertiv и Supermicro (403), hpcwire (403), datacentremagazine (403), старый RSS Data Center Frontier (404). Страницы статей DCD отдают 403 и curl, и WebFetch, хотя сама лента DCD открыта. Поэтому рутина проверяет факт по второму источнику или берёт только заголовок и подзаголовок из ленты DCD.

## Ограничения API и правила
- Graph API позволяет до 50 публикаций через API за 24 часа; мы делаем 1 в день — жёстко, без флага-обхода (дата по Asia/Bangkok, `content/state.json` плюс guard по git log).
- Карусель — 2–10 слайдов, только JPEG.
- Подпись ≤ 2200 знаков, хэштегов ≤ 5 (лимит Instagram с декабря 2025; мы ставим 3–5).
- Формат очереди, 7 рубрик и правила контента описаны в [content/FORMAT.md](content/FORMAT.md). Главное: каждая цифра со слайда должна найтись в `facts` процитированного источника или данных; никаких клиентов, сделок, инвестсоветов и «гарантий».
- Идемпотентность: опубликованный slug повторно не постится никогда. Перед `media_publish` скрипт ещё сверяет первую строку подписи с последними постами аккаунта, чтобы после сбоя не задвоить пост.
