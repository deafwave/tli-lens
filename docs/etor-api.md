# ETOR price API (etor-beta.710421059.xyz)

Found by reading the site's JS bundle (`/assets/index-tbGRrg4q.js`, `Prices-*.js`, `TorchlightPriceChart-*.js`) on 2026-10-10.

- Base URL: `https://etor-beta.710421059.xyz/etor-api` (the bundle also has a fallback mirror, `https://etor-zero.981001.xyz/etor-api`)
- Headers: `accept: application/json, text/plain, */*`, `x-frontend-version: 1.0.6.2`, `Referer: https://etor-beta.710421059.xyz/prices`, and a Chrome User-Agent. No auth is needed for the GET endpoints below.
- Leave out `format=protobuf` and you get JSON. The site's own frontend asks for protobuf.
- Prices are in **Flame Elementium (FE, 初火源质, item id 100300) = 1.0**. FE and Flame Sand (100200) are not in the snapshot because FE is the base currency.
- Prices are crowd-sourced: users' ETOR desktop clients report the auction-house prices they see (`POST /api/prices`, which needs an RSA signature). These are not trade-volume-weighted prices.
- Items are keyed by the game's item id (a string). Item names and categories are in Chinese and are not served by the API. They are in the static bundle `/assets/game_static_data-*.js`: the first `JSON.parse('[...]')` holds 2072 entries `{name, type, img, id, reward, url?, baseItemId?}`. English names come from `ChandlerFerry/etor-translations` `src/translations.ts` (`enData`, keyed by Chinese name) and `src/ui-translations.ts` (categories).

## Seasons

### GET /api/player/season-status
```json
{"currentSeasonId":"1501","activeSeasonIds":["1531","1501"],"upcomingSeasonIds":[],"endedSeasonIds":["1431","1401"],
 "seasonWindows":[{"seasonId":"1531","startAt":1787277600000,"endAt":0,"state":"active"},
  {"seasonId":"1501","startAt":1784253600000,"endAt":0,"state":"active"},
  {"seasonId":"1431","startAt":1778810400000,"endAt":1784167200000,"state":"ended"},
  {"seasonId":"1401","startAt":1776391200000,"endAt":1784167200000,"state":"ended"}],"serverTime":1791608652647}
```
Season table hard-coded in the bundle:

| id | key | meaning | start (UTC) |
|---|---|---|---|
| 1 | permanent | permanent/legacy realm | - |
| 1401 | s12 | SS12 standard | 2026-04-17 |
| 1431 | s12Expert | SS12 Expert mode | 2026-05-15 |
| 1501 | s13 | **SS13 standard (current)** | 2026-07-17 |
| 1531 | s13Expert | SS13 Expert mode | 2026-08-21 |
| 1601 / 1631 (guessed) | s14 / s14Expert | not in the bundle yet; `prices-snapshot/1601` returns `[]` | ~2026-10-15 |

Ended seasons are emptied (`prices-snapshot/1401` returns only a handful of rows). Their items probably carry over into `1`. To find SS14, watch `season-status.currentSeasonId` and `upcomingSeasonIds`.

## Prices (bulk)

### GET /api/prices-snapshot/{seasonId}[?fromVersion=<hex>]
**This is the bulk endpoint.** It returns every item that has a price in one call (~115 KB, 1677 items for 1501).
```json
{"success":true,"data":[{"id":"112346","price":54.619,"updatedAt":"2026-10-09T..Z"}, ...],
 "cached":false,"priceMode":"full","priceVersion":"4f53cda18c2baa0c0354bb5f","priceTotalCount":1677}
```
`fromVersion=<priceVersion>` returns a delta (`priceMode:"delta"`). `updatedAt` is the time of the last report, so check it for staleness (some items are weeks old). A price of exactly `1` (148 items) is often a stale or placeholder floor, for example the God divinities.

### GET /api/prices-t15/{seasonId}
Gives a sparkline per item. `t15` is the first point (1000 = base) followed by per-mille deltas. The site caches it for 1 h.
```json
{"success":true,"data":[{"id":"200003","t15":[698,55,53,31,-61,-177,59,...]}, ...]}
```

### GET /api/prices/{seasonId}?timestamp=&signature=
Needs an RSA signature built in the browser from a key embedded in the bundle. Not used; the snapshot covers the same data.

## Per-item history

### GET /api/chart/{seasonId}/{itemId}?interval=1d|3h|1h|15m
```json
{"seasonId":"1501","itemId":"112346","interval":"1d",
 "trend":[{"timestamp":1784246400000,"price":1693.3178,"minPrice":903.736,"maxPrice":2305.586}, ...]}
```
- `1d` covers the whole season (daily buckets in Asia/Shanghai days).
- `1h` covers about the last 7 days.
- `price` is the average for the bucket. Days with no reports are missing.

### GET /api/chart/stats/{seasonId}/{itemId}?interval=1d
```json
{"success":true,"stats":{"current":49.699,"change":-97.06,"min":28,"max":4228.476,"volume":84}}
```
`volume` is the **number of buckets that have data** (84 days, or 168 for `1h` = 7×24). It is not units traded. `change` is the % change over the window. If an item has no data you get nulls and `volume:0`.

## Other
- `GET /api/legendaryBaseIdMap`: `{"success":true,"data":{"<baseItemId>":"<legendary itemId>", ...}}`. Maps an equipment base id to a legendary id.
- `GET /api/torchlight/7881/price?seasonId=1501`, `GET /api/torchlight/7881/price-history/{seasonId}?interval=1d`: the RMB price of FE on the 7881.com RMT site (`goodsType 100001`). `trend` holds `{timestamp, price, minPrice, maxPrice, count, sampleCount}`, e.g. FE ≈ 0.0104 CNY in late Jul.
- Not price related (not explored): `/api/player/{death-leaderboard,online-count,online-history,report,online-heartbeat}`, `/api/race/{leaderboard,overview,report}`, `/api/reports/{daily,weekly,overview,season-preview,season-summary,sync}`, `/api/strategy/{leaderboard,detail,report,report-threshold,stage-options,tags,wind-detail,windboard}`.

## Coverage notes (season 1501)
- 1677 items have prices: 329 legendary gear, 192 fate cards, ~295 noble/magnificent support gems, 80 compasses, ~335 Vorax organs (core/perfect/special/common), 23 ethereal prisms, divinity pacts, embers, fossils, beacons and more.
- **Not covered:** rare or affixed gear; legendaries by roll (one price per legendary id, whatever its affixes or corruption); base active skills and most plain support skills; hero memories as items (only Memory Thread and Memory Scrap); "Divinity Slate" (神格石板 is not in the item table).
