# Carousel format: content/queue/NNN-slug.json

The canonical schema for the writer routine, and for anyone editing the queue by hand.
`node scripts/validate-carousel.mjs <slug>` enforces every rule below. `publish.mjs` refuses anything that fails it.

## Positioning and voice
"The price tag of the internet." Coloprice publishes independent, sourced numbers on data centres and AI compute, without operator spin. The tone is a calm data desk, in the style of Visual Capitalist or the FT, never a hype account. Write in English and use global units ($/kW/month, MW, $/GPU-hr).

## Recurring formats (`format`)

| format | Name | Main data | Typical slides |
|---|---|---|---|
| `index-weekly-move` | Coloprice Index: Weekly Move | `datasets.colo`, `coloHistory` | cover with $/kW → bar of metros → line history → stat of the biggest mover |
| `gpu-rent-check` | GPU Rent Check | `datasets.gpu`, `gpuHistory` | cover with $/GPU-hr → line history → bar ladder of chips → list of spreads |
| `megawatt-watch` | Megawatt Watch | news + `capacityWatch` + `pipeline` | cover with total MW → hbar ranking → one stat per project → pipeline list |
| `map-of-the-week` | Map of the Week | `pipeline`, facilities | map cover (dot-grid world + MW bubbles) → hbar → regional `map` slides → compare |
| `ranked` | Ranked | colo index / pipeline / gpu | cover → list top-6 or bar top-8 → stats on #1 and a surprise |
| `deal-sheet` | Deal Sheet | news + `transactions` + `capacityWatch` | cover → list of deals → one stat per deal → pipeline chart |
| `outage-files` | Outage Files | news + `incidents` | cover → stat timeline points → cause list → closing |
| `explainer` | Explainer (alternates with Outage Files) | any | cover → 3–5 stats/lists → closing |

Weekly rhythm (Mon–Fri, max 1 post/day): Mon Index · Tue GPU · Wed Megawatt Watch · Thu Map/Ranked · Fri Deal Sheet or Outage Files/Explainer. Don't repeat the format of the last published post unless the queue would otherwise be empty.

## Top-level fields

```jsonc
{
  "slug": "megawatt-watch-2026-10-28",     // kebab-case; the file is NNN-<slug>.json (NNN = next number = publishing order)
  "theme": "dark",                         // optional: dark (default) | paper | lime — see "Themes and the grid"
  "format": "megawatt-watch",              // one of the formats above
  "status": "ready",                       // "ready" = publishable, "draft" = never published
  "created": "2026-10-28",                 // Asia/Bangkok date
  "publishBy": "2026-11-04",               // news goes stale: the publisher skips the post after this date
  "topic": "internal one-liner (used in Telegram)",
  "sources": [ /* news sources, see below */ ],
  "dataHooks": [ /* Coloprice data, see below */ ],
  "slides": [ /* 3–10 slides: cover first, closing last */ ],
  "caption": "…",
  "hashtags": ["#datacenter", "#colocation", "#AIinfrastructure"],   // 3–5 (Instagram caps at 5)
  "derived": [ { "value": "480", "how": "280 + 100 + 70.8 + 22.5 + 7 = 480.3, rounded" } ]  // optional
}
```

### sources[] (every news fact)
`{ "id", "publisher", "title", "url" (direct https, the original article), "date" (YYYY-MM-DD publication date), "facts": ["…each fact used, with its numbers…"] }`

### dataHooks[] (Coloprice data, read from content/data/coloprice-latest.json)
`{ "id", "dataset" (short name shown on slides, e.g. "Coloprice GPU index"), "url" (public coloprice.com URL of the dataset), "asOf" (dataset date), "facts": ["…the exact figures used…"] }`

### The no-invented-numbers rule
Every number on a slide must appear in the `facts` of the sources or data hooks that the slide lists in `refs`, or in `derived[]`. A derived value must include the arithmetic in `how`. The validator skips years, model names (H100, Q4, TYO1) and dates written like "27 Oct" or "Jun 23". Every number in the caption must appear in the facts of some source or data hook. Never round a cited figure differently from the source unless the rounding is listed in `derived`.

## Themes and the grid
Three grounds, one brand. `theme` on the carousel sets every slide; `theme` on a slide overrides it.

| theme | Ground / ink | Lime is… | Use |
|---|---|---|---|
| `dark` | void #08090a / paper | the key figure and highlighted bars | default, the backbone of the feed |
| `paper` | #f3f4f1 / void | only a highlighter marker behind the key figure or `**marked**` words (never lime text) | alternate with dark |
| `lime` | lime / void | the ground itself | the accent tile: at most 1 cover in 5, usually only the cover (`slide.theme`) |

The profile grid shows the newest post top-left, so the FIRST post published ends up bottom-right. Plan covers in threes: alternate dark and paper and keep lime rare (launch grid: dark/paper checkerboard, lime on the diagonal). Check with `node scripts/grid-preview.mjs` (4:5 tiles; `--ratio=3:4 --guides` shows the crop the app grid uses). Keep the headline and hook figure inside the centre-safe area (the renderer's margins already do, as long as you do not move them).

## Slide types (all except `closing` need `refs: [...]`)

| type | Fields | Limits (enforced by layout check) |
|---|---|---|
| `cover` | `layout?` (below), `kicker` (format name), `headline`, `figure: {value, label}`, `deck?` | headline ≤ 2 lines at 60–92px (~45 chars); figure.value 1 line (~8 chars at full size) |
| `stat` | `label`, `value`, `unit?`, `delta?: {value, dir: up\|down\|flat}`, `context?`, `accent?` (false = white instead of lime) | value 1 line; context ≤ 6 lines. **Lime only for the key figure**: set `accent:false` on secondary stats |
| `list` | `title`, `unit?`, `rows: [{label, value, note?, delta?, highlight?}]` (2–6), `footnote?` | label and note 1 line each |
| `chart` | `kind: bar\|hbar\|line`, `title`, `unit?`, `data: [{label, value}]`, `highlight?` (index or label), `valueFormat?: {prefix, suffix, decimals, tickDecimals}`, `caption?` | bar/hbar ≤ 8 points (hbar for long labels), line ≤ 24; short bar labels |
| `compare` | `title`, `unit?`, `items: [{label, value, note?, highlight?}]` (exactly 2), `verdict?: {value, text}`, `caption?` | side by side when both values fit, else stacked; highlight at most one item |
| `map` | `title`, `unit?`, `region` (world, europe, asia, apac, north-america, latin-america, middle-east) or `bbox: [west, south, east, north]`, `points: [{label, value, lat, lon, highlight?, showLabel?}]` (2–60), `labels?` (how many to label, default 6), `maxRadius?`, `stdParallel?`, `valueFormat?`, `caption?` | bubbles are area-proportional to `value` (a number that must be in the facts); lat/lon are positions only, never printed. Dot-grid land from Natural Earth 1:110m (public domain, `assets/geo/`) |
| `quote` | `label?`, `text` (≤ 6 lines; `**words**` get the highlight), `attribution?` | a large typographic statement; no numbers unless sourced |
| `closing` | `text?`, `cta?` | no figures; the sources card is built automatically from sources/dataHooks (max 6) |

### Cover layouts (`cover.layout`)
| layout | What it is | Extra fields |
|---|---|---|
| `standard` (default) | headline, big figure, label | — |
| `poster` | one giant number filling the slide (≤ ~5 characters stay huge: `$403`, `$3.49`) | figure required |
| `split` | two tones: `split: "rows"` = headline panel on top, figure panel below; `"cols"` = headline left, figure panel right | `tones: ["dark","lime"]` (two different themes), figure required |
| `compare` | headline + two big numbers side by side | `items` (2), `verdict?` — as the `compare` slide |
| `map` | headline + dot map + hook figure | `points`, `region`/`bbox` … — as the `map` slide |
| `quote` | a large statement (≤ 4 lines) + optional small figure row | `statement` (instead of `headline`) |

Footers print the source and date of each slide automatically. The header prints the post date and the counter.

## Caption
- 60–150 words. The first line leads with the hook number (≤125 chars).
- Follow with 3–4 short lines of context.
- Include one line starting with `Data:` or `Sources:`, e.g. `Data: Coloprice GPU index, 16 Oct 2026. Sources on the last slide.`
- End with a question that invites expert comments, then the literal text "link in bio".
- No URLs and no other domains. The plain text `coloprice.com` may appear in at most one of every 3 posts (the validator checks history and queue order).
- Hashtags go in `hashtags[]`, never in the caption text.

## X (Twitter) cross-post (optional `x` field)
After a carousel is live on Instagram, `scripts/publish-x.mjs` posts it to X: a text of at most 280 weighted characters, up to 4 slide images with alt text, and one reply with the coloprice.com link. Nothing is needed in the queue file: the post is derived automatically.

- **Text** = caption line 1 (the hook) + the first caption sentence with a number that is not already in the hook + `Data: <datasets>, <publishers>`. No URL and no domain in the main post (X cuts the reach of posts with links, and a post with a URL is billed about 13 times more), no hashtags, no "link in bio".
- **Images** = the cover + the 3 most informative inner slides (chart/map, then compare/list, then the key stat), in carousel order; never the closing slide. Alt text comes from each slide's headline, figure and data.
- **Reply** = `Full table + sources: coloprice.com/<page>`: the page behind the first data hook (`data-center-pipeline.csv` → `/pipeline/`, the index JSON → `/index/`, GPU → `/gpu/`, transactions → `/transactions/`, incidents → `/incidents/`), else a `coloprice.com/...` page named on the closing slide, else the home page.

Override only when the derived version is weak:
```jsonc
"x": {
  "text": "…",            // full main-post text; same rules: ≤ 280, every number in the facts, no URL/domain
  "slides": [1, 2, 4, 6], // 1–4 slide numbers, 1-based as in out/<slug>/NN.jpg
  "replyPath": "/pipeline/", // coloprice.com page for the reply
  "skip": true            // never cross-post this one
}
```
The validator checks the `x` field when it is present (errors are prefixed `x:`). Preview any carousel with `node scripts/publish-x.mjs --dry-run --slug=<slug>`.

## Never
- Client names, Coloprice/Dream View deal pipeline, negotiations, NDAs (also checked against the `CONTENT_DENYLIST` secret).
- Investment advice or buy/sell framing. REIT and stock facts are allowed only as plain facts.
- "Guarantee" claims, or brokerage-licence talk. GPU terms are individual.
- Unsourced numbers, reposted third-party charts (rebuild them from data and credit the source), stock server-aisle photos, text-wall slides.
- Rage-bait on local opposition. Cover community impact factually or skip it.
