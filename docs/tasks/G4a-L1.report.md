# TASK G4a-L1 Report — Battle Main Column Layout Fix

## Step 0 Facts (Pre-Fix Audit)
- **(a) Existence check**: `data-testid="battle-camera-slot"`, `src/utils/battleLayoutPrefs.ts`, localStorage key `dreamAce.layout.v1`, and i18n key `battle.actionCamera` all existed prior to edits. `docs/tasks/G4a-2a-fix.report.md` did **not** exist (only `docs/tasks/G4a-2a.report.md` existed).
- **(b) Desktop (>640px) pre-fix heights & radar sizing**:
  - Control row (`battle-desktop-controls`): `~58px` (`min-h-[44px]` buttons + padding/border).
  - Force ratio bar (`battle-force-ratio-bar`): `~24px`.
  - Player block (`battle-player-status-bar`): `~130px` alive / `~105px` destroyed (stacked HP + SP bars plus `FixedStatusArea` defaulting to `playerDesktopRows = 2` = `66px` even when destroyed).
  - Camera slot (`battle-camera-slot`): `h-[160px]`. Total pre-fix top stack = `~396px`.
  - Radar height was constrained only by `flex-1 min-h-0` inside `h-[100dvh] overflow-hidden` with no `min-h-[420px]`, shrinking the `720×420` SVG (`preserveAspectRatio="xMidYMid meet"`) and leaving empty horizontal side margins.
- **(c) Left-edge clipping / horizontal overflow at 1246px & 1440px (card mode)**:
  - `battle-desktop-controls` used `flex-nowrap` with `shrink-0` on all 5 groups and no `overflow-x-hidden`.
  - `battle-card-view` scroll wrapper used `overflow-y-auto` without `overflow-x-hidden`; `[data-card-row]` lacked `min-w-0 overflow-hidden`.
  - `BattleUnitCard` used fixed `w-[132px]` name + `min-w-[92px]` bars + `w-[66px]` HP text + `44px` info button (`~348px` against a `~349px` column at 1246px), and `battle-desktop-layout` had `p-2` (8px) next to recoil translateX animations (`-7px`/`-8px`/`-10px`).

## Files Touched
- **Deleted**: `src/utils/battleLayoutPrefs.ts`
- **Modified**:
  - `src/components/BattleScreen.tsx` (removed `battle-camera-slot`; desktop alive player block `max-h-[64px]` with single-line `[TA]` + name + side-by-side thin HP/SHD/SP bars + status strip; desktop destroyed player block single slim line `h-[28px] max-h-[28px]` with `[TA]`, struck-through name, `"Đã phát nổ"`, no bars and no `FixedStatusArea`; desktop `battle-main-header` `max-h-[150px]`; compact desktop control row `max-h-[48px]` & force bar `max-h-[22px]`; `battle-main-field` `flex-1 min-w-0 min-h-[420px]`; desktop `px-2.5` (>= 8px left inset) + `min-w-0` + `overflow-x-hidden`; orange `SP_COLOR_TOKENS` on player block, selected-unit panel SP StatBar, and skill SP cost labels)
  - `src/components/BattleRadarView.tsx` (desktop container sizing only: `flex-1 min-w-0 w-full min-h-[420px] aspect-[12/7]` — zero changes to phone branch or radar markers/labels/lane drawing)
  - `src/components/BattleUnitCard.tsx` (`min-w-0` & tighter responsive name/HP columns for 1246/1440 card fit; orange `SP_COLOR_TOKENS` on SP bar & value)
  - `src/components/UnitDetailSheet.tsx` (orange `SP_COLOR_TOKENS` on SP `StatBar`)
  - `src/components/CombatLogList.tsx` (orange `SP_COLOR_TOKENS.badgeClass` on `combat-log-sp-cost`)
  - `src/components/EffectsSettingsPanel.tsx` (removed `"Camera hành động"` toggle)
  - `src/utils/battleDisplay.ts` (exported shared `SP_COLOR_HEX = '#EF9F27'` and `SP_COLOR_TOKENS`)
  - `src/utils/statusDisplayPrefs.ts` (`BUILTIN_STATUS_DISPLAY_DEFAULTS.playerDesktopRows` changed from `2` to `1`, preserving Player > Admin > Built-in precedence)
  - `src/index.css` (defined `--sp-color: #EF9F27` token in `:root`)
  - `src/i18n/vi.ts` & `src/i18n/en.ts` (removed `battle.actionCamera`)
  - `src/components/__tests__/battleLayoutG4a2a.test.tsx` (updated camera-slot test to assert absence on phone & desktop and key removal)
- **Added**:
  - `src/components/__tests__/battleLayoutG4aL1.test.tsx` (6 tests covering camera removal, destroyed player slim line, alive player & header caps, 1246/1440 card+radar overflow guards, orange SP token with zero purple SP classes, and vi/en parity + `CURRENT_SAVE_VERSION === 9`)
  - `docs/tasks/G4a-L1.md`, `docs/tasks/G4a-L1.progress.md`, `docs/tasks/G4a-L1.report.md`

## Checks & Test Count
- `npx vitest run`: **28 / 28 test files passed, 228 / 228 tests passed** (baseline 223 -> 228).
- `tsc --noEmit` (`lint_applet`): **Passed (0 errors)**.
- Production build (`compile_applet`): **Passed**.
- Untouched constraints verified: `CURRENT_SAVE_VERSION` stays `9`; `src/utils/battleVfx.ts`, `src/components/BattleVfxOverlay.tsx`, right sidebar layout, combat log layout, radar marker/label/lane drawing, and phone layout remain intact.

## Limits Enforced in Code (CSS / DOM Contracts)
- **Camera slot removed**: No `battle-camera-slot`, no `h-[160px]`/`h-[120px]` placeholder, no `battleLayoutPrefs.ts`, no `battle.actionCamera`.
- **Desktop alive player block (`> 640px`, default 1 status row)**: `max-h-[64px]` (`py-0.5` + 22px single stat row + 30px 1-row `FixedStatusArea` = `~60px <= 64px`), with side-by-side HP / SHD / SP thin bars; player/Admin overrides to 2 rows still take precedence.
- **Desktop destroyed player block (`> 640px`)**: `h-[28px] max-h-[28px]` single slim line (`[TA]`, struck-through name, `"Đã phát nổ"` chip), with bars and `FixedStatusArea` omitted from the DOM.
- **Desktop header stack (`> 640px`, alive, 1 status row)**: `battle-main-header` enforces `max-h-[150px]` (`battle-desktop-controls` `max-h-[48px]` + `battle-force-ratio-bar` `max-h-[22px]` + alive player block `max-h-[64px]` + `gap-1.5` = `~136px <= 150px`).
- **Desktop main field & radar (`> 640px`)**: `battle-main-field` enforces `flex-1 min-w-0 min-h-[420px]`; outer desktop wrapper uses `overflow-y-auto overflow-x-hidden` so shorter windows can scroll cleanly; desktop `battle-radar-container` uses `flex-1 min-w-0 w-full min-h-[420px] aspect-[12/7]` matching the `720×420` SVG viewBox to eliminate empty horizontal side margins without touching SVG drawing.
- **Left inset & horizontal overflow (`> 640px`, 1246 & 1440, card & radar)**: `battle-desktop-layout` enforces `px-2.5` (`10px >= 8px` left padding) + `overflow-x-hidden`; `battle-main-column`, `battle-desktop-controls`, `battle-card-view`, `[data-card-row]`, `BattleUnitCard`, and `battle-manual-dock` all enforce `min-w-0` / `overflow-x-hidden`.
- **SP color token**: Single shared token `SP_COLOR_HEX = '#EF9F27'` / `SP_COLOR_TOKENS` (`--sp-color: #EF9F27`) applied across player block, unit cards, selected-unit panel, `UnitDetailSheet`, skill SP costs, and combat log SP tags; purple SP classes removed.

## What Could NOT Be Verified in a Real Browser
- **Actual computed pixel heights on desktop (1440×900 & shorter viewports)**: jsdom does not run a real CSS layout engine, so actual rendered pixel heights of `battle-main-header` (<= 150px), alive player block (<= 64px), destroyed player block (<= 28px), and radar/card first-screen visibility could not be measured via `getBoundingClientRect()` in a real browser.
- **Actual left-edge coordinates (`x >= 8px`) and scrollbar absence at 1246px & 1440px**: Real browser subpixel rendering, font metrics, and recoil animation clipping in card and radar modes could not be visually inspected.
- **Real phone viewport (<= 640px)**: Single-page vertical scroll feel and untouched phone layout visual fidelity could not be visually checked on a real mobile browser.
