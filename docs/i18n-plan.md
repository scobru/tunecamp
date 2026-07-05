# TuneCamp Internationalization (i18n) — Agile Plan

**Goal:** Ship TuneCamp with full UI support for at least **two languages — English (`en`) and Italian (`it`)** — with an architecture that lets us add more locales later without touching component code.

**Status:** Proposed
**Owner:** _TBD_
**Target:** 3 sprints (~6 weeks, 1 dev part-time)

---

## 1. Context & Current State

- The webapp is **React 18 + Vite + TypeScript**, with Zustand stores, TanStack Query and React Router (`webapp/src`, ~113 `.tsx` files, 42 pages, 69 components).
- **No i18n framework is installed today.** All UI copy is hardcoded inline in JSX.
- Copy is currently a **mix of English and Italian** (e.g. the admin Setup Wizard was Italian; now translated to English). This inconsistency is exactly what this plan fixes structurally.
- Docs already ship an Italian mirror under `docs/it/`, so bilingual intent exists — we now bring it to the product UI.

**Design principle:** English is the **source/default locale** (fallback). Italian is the first translated target. Every string lives in a resource file keyed by a stable ID, never inline.

---

## 2. Recommended Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **`react-i18next` + `i18next`** | De-facto standard for React, hooks-based (`useTranslation`), plays well with Vite, supports interpolation/plurals/namespaces, lazy-loading. |
| Language detection | `i18next-browser-languagedetector` | Reads `localStorage` → browser `navigator.language`, with a sane fallback chain. |
| Format (dates/numbers/currency) | `Intl` (built-in) via i18next `Intl` formatters | No extra dependency; currency matters for the Store. |
| Storage of user choice | `localStorage` key `tc_lang` **+** persisted per-user via existing settings API (optional, Sprint 3) | Anonymous users get a local preference; logged-in users can persist. |

> Rejected alternatives: `react-intl` (heavier, more boilerplate), `lingui` (great but adds a compile step + macro tooling we don't need yet).

**Resource file layout:**
```
webapp/src/i18n/
  index.ts                 # i18next init + config
  locales/
    en/
      common.json          # buttons, generic labels, nav
      admin.json           # admin panels + setup wizard
      auth.json            # login / register / password
      player.json          # player, now-playing, queue
      store.json           # store, checkout, payments
      errors.json          # error + toast messages
    it/
      common.json
      admin.json
      ...
```
Namespaces keep bundles small and let us lazy-load per route.

---

## 3. Epics

### EPIC A — i18n Foundation
Install and wire the framework; app renders through the translation layer with English as the only (fully-covered) locale. No visible change yet.

### EPIC B — String Extraction & English Catalog
Replace every hardcoded UI string with a `t('key')` call and populate the `en` catalog. This is the bulk of the work and is done **incrementally, namespace by namespace**, so it never blocks a release.

### EPIC C — Italian Translation
Produce the `it` catalog for every extracted key. Native/fluent review pass. Currency, dates, and pluralization verified.

### EPIC D — Language Switcher & Persistence
User-facing language selector (header/settings), detection, persistence, `<html lang>` sync, and (optional) per-user server-side preference.

### EPIC E — QA, Guardrails & Docs
Lint rule to block new hardcoded strings, a "missing key" report, pseudo-localization test, and contributor docs so the two-language guarantee doesn't rot.

---

## 4. Sprint Breakdown

### Sprint 1 — Foundation + First Vertical Slice
**Objective:** Framework live in production behind English; prove the pattern end-to-end on 2–3 high-value surfaces.

- [ ] **A1** Add deps (`i18next`, `react-i18next`, `i18next-browser-languagedetector`); create `src/i18n/index.ts`; wrap `<App>` provider in `main.tsx`. _(2 pts)_
- [ ] **A2** Define namespace list + `en`/`it` empty scaffolding; TS types for keys (`i18next` type augmentation for autocomplete + compile-time safety). _(2 pts)_
- [ ] **B1** Extract **`common.json`** (nav, buttons: Save/Cancel/Next/Back, generic labels) — highest reuse. _(3 pts)_
- [ ] **B2** Extract **`admin.json`** starting with the **Setup Wizard** (already English, good pilot) + `auth.json`. _(5 pts)_
- [ ] **C0** Provide `it` values for everything extracted in this sprint (wizard, auth, common). _(3 pts)_
- [ ] **D1** Minimal language switcher (EN/IT toggle) in the header, wired to `i18n.changeLanguage` + `localStorage`. _(2 pts)_

**Sprint 1 acceptance:** Toggling EN↔IT instantly re-renders the header, nav, auth screens and the Setup Wizard in the chosen language; refresh preserves the choice; English remains fallback for anything not yet translated.

### Sprint 2 — Broad Extraction
**Objective:** Convert the remaining high-traffic surfaces.

- [ ] **B3** `player.json` — player, queue, now-playing. _(3 pts)_
- [ ] **B4** `store.json` — store, release/album pages, checkout, payment states; wire `Intl.NumberFormat` currency formatting. _(5 pts)_
- [ ] **B5** `errors.json` — toasts, form validation, API error surfacing. _(3 pts)_
- [ ] **B6** Remaining pages/components sweep (social, playlists, profiles, admin panels). _(8 pts, may spill)_
- [ ] **C1** Italian catalog for all Sprint-2 keys + fluency review pass. _(5 pts)_
- [ ] **D2** Date/relative-time via `Intl` locale-aware formatters (replace any hardcoded formatting). _(2 pts)_

**Sprint 2 acceptance:** ≥90% of user-visible strings route through `t()`; store prices and dates render correctly in both locales; no English leaks on the main listener + buyer flows when set to Italian.

### Sprint 3 — Hardening, Persistence & Guardrails
**Objective:** Make it durable and contributor-safe.

- [ ] **D3** Persist language per logged-in user via settings API; hydrate on login; sync `document.documentElement.lang`. _(3 pts)_
- [ ] **E1** ESLint rule (`i18next/no-literal-string` or equivalent) in `webapp/eslint.config.js`, scoped to JSX, to block new hardcoded copy. _(2 pts)_
- [ ] **E2** CI check / script that reports missing or orphaned keys across locales (fail build on missing `en`; warn on missing `it`). _(3 pts)_
- [ ] **E3** Pseudo-locale (`en-XX`) dev toggle to catch untranslated/overflowing strings visually. _(2 pts)_
- [ ] **B7** Final sweep of long tail (admin edge panels, empty states, tooltips, `aria-label`s, `<title>`/meta). _(5 pts)_
- [ ] **C2** Italian final QA pass with a native speaker (scobru); fix tone/terminology. _(3 pts)_
- [ ] **E4** Contributor docs: `docs/i18n.md` (how to add a string, how to add a locale) + note in `docs/development-guide.md`. _(2 pts)_

**Sprint 3 acceptance:** New PRs cannot introduce raw JSX strings without a lint failure; a locale can be added by dropping a folder under `locales/` and registering it; both `en` and `it` are 100% covered; language choice survives login/logout across devices for logged-in users.

---

## 5. Backlog / Later (out of scope for the 2-language MVP)

- Additional locales (ES, FR, DE) — trivial once the pipeline exists; each is "translate the catalog."
- Server-rendered / federation-facing strings and email/notification templates.
- Localizing **user-generated content** (release descriptions, bios) — explicitly **not** in scope; we localize the chrome, not the catalog content.
- Translation-management integration (Crowdin/Weblate) if community translators join.
- RTL layout support (only relevant when an RTL locale is added).

---

## 6. Key Decisions & Conventions

1. **Source locale = `en`.** All keys authored in English first; `en` is always the fallback.
2. **No inline strings.** Every user-visible string uses `t('namespace:key')`. Enforced by lint (Sprint 3).
3. **Stable, semantic keys** (`wizard.step.profile.title`), not English-text-as-key — so copy edits don't churn keys.
4. **Namespaces map to feature areas** and lazy-load per route to keep bundles small.
5. **Interpolation over concatenation** for variables/plurals (`t('store.items', { count })`), never string-building in JSX.
6. **Definition of Done for any UI PR going forward:** new strings exist in `en` **and** `it` (missing `it` = warning, missing `en` = build failure).

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Extraction is large (113 files) and can stall mid-way | Namespace-by-namespace, shippable each step; English fallback means partial extraction never breaks the UI. |
| New PRs reintroduce hardcoded strings | ESLint guardrail (E1) + DoD checklist. |
| Italian drifts out of sync with English | CI missing-key report (E2) + fallback to English so gaps degrade gracefully. |
| Currency/number/date bugs in the Store | Centralize on `Intl` formatters; explicit test cases for EUR/USD and IT date format. |
| Bundle-size regression | Namespaced lazy loading; measure with `vite build` report. |

---

## 8. First Concrete Step

Sprint 1 / A1: add the dependencies and the `src/i18n/index.ts` init, wrap the app, and migrate the **Setup Wizard** (just made English) as the pilot namespace — it's self-contained and gives us the full EN + IT round-trip to validate the whole approach before the broad sweep.
