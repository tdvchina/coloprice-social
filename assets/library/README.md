# Media library

Licensed photos of data centers, grid, energy and land for Coloprice posts and the dc-network sites
(Coloprice, MegaWattlas, Watt & Rack, Compute Census, MegaWatt Acres).

- `catalog.json` — the source of truth: licence, author, source page, ready `attribution`, and where each photo may be used (`uses.site`, `uses.social`). Tied to the catalogue through `entities` (operators, facility slugs, countries, cities).
- `images/<id>.jpg` — 1600 px JPEG copies. Id prefixes: `dc-` data centers, `tx-` transmission, `sub-` substations, `gen-` generation, `bess-` storage, `land-` land, `cool-` cooling/water.
- `_staging/*.json` — harvest batches; `node scripts/library.mjs build` merges them into the catalogue and validates.

## Licence rules
| Licence | Site | Posts |
|---|---|---|
| Public domain, CC0 | yes | yes |
| CC BY 2.0–4.0 | yes | yes |
| CC BY-SA 2.0–4.0 | yes, unmodified | no — text over a photo is an adaptation, which would put the post under BY-SA |
| NC, ND, GFDL-only, unknown, "free to use" stock licences | no | no |

Always print `attribution` next to the image: in the slide footer (the renderer does it), in a `figcaption` on the sites.
No stock server-aisle shots: real, identifiable facilities and infrastructure only.

## Use
- Find: `node scripts/library.mjs find --subject=transmission --country=usa --social`
- Pick visually: `node scripts/library.mjs sheet --subject=substation --social` → `out/library-sheet.jpg`
- In a carousel: `{ "type": "photo", "image": "<id>", "headline": "…", "caption": "…", "focus": "center" }` or a cover with `"layout": "photo"`.
