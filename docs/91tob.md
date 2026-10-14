# 91tob.com — what we know (2026-10-11)

91TOB ("火炬之光：无限BD模拟器", Torchlight of Building) is a Chinese build simulator with a server-side
Python damage engine. It is the only planner we've found that **explains every number** (formula strings,
per-layer breakdowns), so it is worth comparing against our models (`packages/dmg`) when a skill or hero we
model is supported there.

Snapshot of the site when this was written: data version `SS13.4` (`/.generated-runtime/version.json`,
generated 2026-08-19), engine `registry_version` 2026-03-21, module versions `beta_0.6`, talent season label
`Vorax_Season`. **Bing (Blast Nova) is in the catalogs but the engine does not support him yet** (user,
2026-10-11) — check `framework-support-matrix` (in the browser) before planning Bing work there.

## Access rules (read first)

- **`/api/v1/*` is behind a SafeLine WAF that blocks scripted clients.** curl got
  `403 {"detail":"当前请求已被安全策略拦截"}` ("blocked by security policy") on every API call — even
  `site-banner` — with the browser's exact headers, `sl-session` cookie and a valid bearer token.
  **Do not try to get around it** (spoofed TLS/browser fingerprints, headless browsers). Everything API-side
  goes through the user's own browser.
- Static files are not blocked: `/`, `/assets/*.js`, `/.generated-runtime/**` download fine with curl
  (a normal page load fetches them too).
- Auth: bearer JWT (24 h) in `Authorization`; refreshed via `POST /api/v1/auth/refresh` with an httpOnly
  `tlb_refresh_token` cookie; the frontend keeps the session in localStorage `web_auth_session_v1`.
  The user's account is free tier with `capabilities.can_view_trace: true`, `can_view_debug_panel: false`.
  **Never write tokens or cookies to a file or commit.** A pasted refresh token stays valid until the user
  logs out.

## Getting data in and out (browser side)

| Need | How |
|---|---|
| Put a build into 91tob | **导入 BD** (Import BD) button — takes a `bd_document_v1` JSON file. |
| Get a build out | **导出** (Export) — downloads the same `bd_document_v1` (`frontend_build.json`) |
| Screenshot import | **导入截图** / "OCR 导入中心" — in-browser OCR (opencv + onnx) for gear, talents, memories |
| Engine output with breakdowns | Click a stat on the result panel (calls `calculate` with `response_mode:"full"`, then `trace`); copy the responses from DevTools → Network. Or paste the console hook below and change any build field |

Console hook — re-sends the page's own next `calculate` request as `full` and downloads the result:

```js
(() => {
  const orig = window.fetch;
  window.fetch = async (url, opts) => {
    const res = await orig(url, opts);
    if (String(url).includes('/engine/calculate') && opts?.body) {
      window.fetch = orig;                                   // one-shot
      const body = JSON.parse(opts.body); body.response_mode = 'full';
      const full = await orig(url, { ...opts, body: JSON.stringify(body) }).then(r => r.json());
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(full)], { type: 'application/json' }));
      a.download = 'tob_full.json'; a.click();
      console.log('saved; trace_cache_id =', full.trace_cache_id);
    }
    return res;
  };
  console.log('hooked: now change something in the build');
})();
```

The full response includes the account's `user` block (email). Don't commit it; quote the parts you need.

## API (from `assets/index-*.js`; all `Authorization: Bearer`)

| Endpoint | Method | Body / notes |
|---|---|---|
| `/api/v1/engine/calculate` | POST | `{response_mode: "lean"\|"full", payload_kind: "bd_document", selected_skill_slot_id, payload: <bd_document_v1>}`; multi-skill: `aggregate_skill_slot_ids: [...]`, `aggregate_label` |
| `/api/v1/engine/trace` | POST | `{trace_cache_id, trace_field}` — the id comes from a `full` response (`trace_cache_id`, or `trace_cache_ids_by_skill_slot_id[slot]`); `trace_field` is the clicked stat's field id (exact values unverified — likely the `fields` keys, e.g. `field.panel.total_dps`) |
| `/api/v1/engine/marginal-analysis` | POST | the calculate body + `limit: 20` — per-stat marginal value |
| `/api/v1/engine/marginal-recommended-gear` | POST | gear recommendations |
| `/api/v1/framework-support-matrix` | GET | which heroes/skills the engine supports |
| `/api/v1/auth/{login,logout,me,refresh,register,change-password}`, `site-banner`, `announcement` | — | account / site chrome |
| `/api/v1/admin/*` | — | admin only. Don't touch |

## `bd_document_v1` — the import format

Import validation (`bw` / `Vm` in `assets/App-*.js`): `schema_version` must be `"bd_document_v1"`; at most one of
the Hades divinities (`hades_judgment` / `hades_infusion` / `hades_banishment`) enabled; the document is spread over
the frontend's defaults (`{...defaults, ...doc}`), so **missing sections should fall back to empty** (inferred
from the code, not tested).

| Section | Shape | Identity |
|---|---|---|
| `meta`, `module_versions`, `character.level` | build name, `beta_0.6` per module | — |
| `hero` | `selected_hero_id`, `selected_trait_option_ids_by_key {"Lv.1"\|"Lv.45"\|"Lv.60"\|"Lv.75": optionId}`, `selected_trait_nodes[]`, `memories_by_slot` | hero id = hero-catalog slug (`seething-silhouette`, `blast-nova`, …); option id = `<hero>-<icon asset name>` (`blast-nova-uibing031`) — **not** a game id |
| `skills.core_skill`, `active_skills[]`, `passive_skills[]` | `slot_id` `active-slot-N` / `passive-slot-N`, `level`, `support_skills[]` (`slot_id` `active-slot-1:support:N`, `support_kind` `support`\|`activation_medium`\|…, `effect_roll_overrides`) | `skill_id` = `active:` / `support:` / `passive:` + URL-encoded tlidb CN page URL (`https://tlidb.com/cn/Hammer_of_Ash`) — the path is tlidb's English page slug |
| `gear.items[*]` | `equip_slot`, `base_type_id`, `base_stats`, `editor_state.source_item_id` (catalog id), `affix_buckets` = `base_implicit`, `base_explicit`, `corrosion`, `dream`, `nightmare`, `craft_prefix`, `craft_suffix`, `legendary`, `special` | each affix: `group_id`, `tier_id` (`weapon-one-handed-hammer:base_affix:2:tier:1`), **Chinese `raw_text`**, `render_template`, `rolls` |
| `talents.slots.tree1..4` | `tree_slug`, `allocated_node_points_by_key {"x,y": points}`, `allocated_reflected_node_points_by_key`, `selected_core_talent_data_ids[]`; plus `prism_inventory`, `inverse_image_inventory`, `talent_catalog_fingerprint` | node key = grid `"x,y"` from talent-catalog; core talents by **native dataId** |
| `pactspirits.slots.slot1..3` | `level`, `rings.{innerRing1..6, midRing1..3}` | not inspected |
| `divinity` | `inventory[]` (`catalog_id`), `placed_slates[]`, `resolved_affix_snapshot` | not inspected |
| `combat` | player `recent` flags, `eternal_stacks`; `enemy: {}` → engine default (training dummy) | — |

## Catalogs (`/.generated-runtime/package-manifest.json`, 19 datasets, ~18 MB)

`gear-select-catalog` (1.8 MB), `gear-craft-affixes` (8.8 MB), `gear-graft-affixes`, `gear-legendary-details`
(1.9 MB), `skill-{active,passive,support,activation-medium,magnificent-support,noble-support}`,
`skill-modularization-catalog`, `skill-elixir-catalog`, `talent-catalog` (0.6 MB), `hero-catalog`,
`hero-memory-catalog` (0.8 MB), `pactspirit-catalog`, `destiny-catalog`, `divinity-talent-catalog`,
`hades-divinity-catalog`. All are scraped from **tlidb.com/cn** (each record carries its tlidb URL).

What matters for joining to our data:

- **talent-catalog** — `trees[]` `{slug, nodes[] {x, y, nodeType, rawAffix (CN), maxPoints, prerequisite,
  dataId}}`, `coreTalents[] {dataId, treeSlug, effect}`. **`dataId` is the game's native node id**
  (`10010300` = tree 10, column 01, row 03 — the same `<tree:2><col:2><row:2>00` format `bingImport`
  reads).
- **hero-catalog** — 27 heroes `{id, sourcePath (tlidb EN slug), traitStages[] {level, options[] {id, name,
  description}}}`.
- **skill-*.json** — `{name (CN), url (tlidb), skill_types, description.by_level, description_en, mechanics}`.
  No game ids; join by tlidb slug.
- **gear-select-catalog** — base items per category `{name (CN), slug (tlidb), level, baseStats}`. **No game
  ids.** Affix ids live in `gear-craft-affixes` (not inspected).

## Engine output (`engine_export_v2`, `response_mode:"full"`, ~1 MB)

`summary` (total/no-crit DPS, avg hit, attack speed, crit) · `fields` (every computed stat by field id) ·
`effects` and `field_explanations` (per-effect `raw_text` and `formula` strings, CN) ·
`views.calculation_breakdowns.damage` (`base_ranges`, `added_ranges`, `inc_total`, `more_total`, `mitigation`
layers with their multipliers) · `config.effective` (enemy defaults) · `diagnostics` (`unparsed_affixes`,
`fallback_affixes`, `inactive_affixes`, `unknown_conditions`) · `trees.engine_result` (~350 KB formula tree).

Mechanics it encoded on a bare Hammer of Ash test build (unsourced — leads, not facts):

- Hit = (weapon base + weapon-local flat adds) × skill weapon % (`(178 + 12–18) × 369%`), then
  `(1 + Σ increased) × ∏(1 + additional)`.
- Enemy default: training dummy, level 90, 30% resistance to every element and erosion, **27,273 armor** →
  30% reduction vs non-physical (`armor/(0.9·armor + 30000) × 0.6`). Same constants as aclinia's
  torchlight-of-building, so the two likely share a source.
- Hammer of Ash Demolisher charge package (`effect.actual_special…hammer_of_ash_strike_charge_package`):
  uncharged = Pummel only; charged = Pummel × 3.15 + Explosion × 3.15 × **0.9**; projectiles and explosion are
  mutually exclusive; Blast Nova's extra explosions are full independent hits, outside the first explosion's
  shotgun pool; charged share = `1 / ceil(charge recovery time / attack interval)`.
