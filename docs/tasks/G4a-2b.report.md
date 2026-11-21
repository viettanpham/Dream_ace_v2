# TASK G4a-2b — Completion Report

## Step 0 Facts (Pre-Change Audit Summary & Locations)
- **Desktop right sidebar heights & what previously limited Combat Log height**:
  - `battle-desktop-layout` previously used `min-h-full` instead of viewport-constrained `flex-1 min-h-0 h-full`, and the right `<aside data-testid="battle-right-sidebar">` stacked:
    1. Turn queue sidebar card (`turn-queue-sidebar`): 5 upcoming rows + empty placeholder slots when fewer units existed.
    2. Selected-unit panel (`battle-selected-unit-panel`): fixed `h-[244px]` with `overflow-y-auto`, reserving empty vertical space even when `statuses.length === 0` plus an empty lock-button spacer when `showLockTargetBtn` was false.
    3. Combat log (`battle-desktop-docked-log`): forced into whatever vertical space remained (with `min-h-[200px]` / unconstrained page height) while `<aside>`'s fixed `h-[244px]` + 5 queue rows + placeholder slots compressed the docked combat log above the fold.
- **Phone (`<= 640px`) nested scroll containers inside the 3 blocks**:
  - Turn queue strip (`turn-queue-phone-strip` / `turn-queue-phone-track`): intentional horizontal strip scroll (`overflow-x-auto overflow-y-hidden`, unchanged per rule).
  - Unit panel on phone: opens in `UnitDetailSheet` (`BottomSheet`, unchanged per rule).
  - Phone docked combat log (`battle-phone-docked-log`): previously wrapped `<CombatLogList>` inside a fixed `h-[144px]` `overflow-hidden` box whose inner `combat-log-scroll` (`overflow-y-auto overscroll-contain tactical-scroll`) and filter bar (`overflow-x-auto`) created a nested vertical/horizontal scroll box inside phone page scroll.
- **Where `"Mở hết"`, `"Thu hết"`, and `"Cửa sổ"` are implemented**:
  - `"Mở hết"` / `"Expand All"` (`data-testid="combat-log-expand-all"`) and `"Thu hết"` / `"Collapse All"` (`data-testid="combat-log-collapse-all"`): `renderCombatLogExpandButtons` in `src/components/BattleScreen.tsx`, persisted via `COMBAT_LOG_EXPAND_ALL_STORAGE_KEY` (`starfront_combat_log_expand_all_v1`) and consumed in `src/components/CombatLogList.tsx`.
  - `"Cửa sổ"` / `"Popup"` (`data-testid="combat-log-mode-toggle"`): in desktop (`battle-desktop-docked-log`) and phone (`battle-phone-docked-log`) log headers in `src/components/BattleScreen.tsx`, opening the transient non-pausing `combat-log-popup` modal / phone bottom sheet (`logSheetOpen`).

## Files Touched
- `docs/tasks/G4a-2b.md` — Verbatim task specification.
- `docs/tasks/G4a-2b.progress.md` — Checklist items 1–4 completed and ticked.
- `docs/tasks/G4a-2b.report.md` — This completion report.
- `src/i18n/vi.ts`, `src/i18n/en.ts` — Added `'log.modeLine'` (`'Dòng'` / `'Line'`) and `'log.modeExpanded'` (`'Mở rộng'` / `'Expanded'`).
- `src/utils/combatLogFormat.ts` — Added `SidebarCombatLogMode = 'line' | 'expanded'`, `LOG_MODE_STORAGE_KEY = 'dreamAce.logMode.v1'`, `readSidebarLogMode()`, and `writeSidebarLogMode()` (default `'expanded'`; outside campaign saves and SV1a/SV1b exports).
- `src/components/FixedStatusArea.tsx` — Extended `packStatusChips` to return `usedRows` and added `autoHeight?: boolean` so sidebar status chips collapse to 1 row when sufficient and cap at 2 rows (`+N` overflow opening the existing full status popover/sheet).
- `src/components/CombatLogList.tsx` — Added `inlineFlow?: boolean` so phone `Mở rộng` flows cleanly in page scroll without `flex-1 min-h-0`, `overflow-y-auto`, `overscroll-contain`, `overflow-x-auto`, jump-to-latest floating button, or scroll-to-bottom layout effects.
- `src/components/TurnQueueBar.tsx` — Enforced sidebar 32px header (`turn-queue-sidebar-header`), `h-[36px]` current actor (`turn-queue-acting-chip`, omitted on summary), `h-[26px]` upcoming rows (`maxUpcoming`: 4 in `Mở rộng`, up to 10 with `fillHeight` in `Dòng`, 0 blank placeholder rows), and `+N` overflow popover trigger beside `turn-queue-next-label`.
- `src/components/BattleScreen.tsx` —
  - Desktop right column (`battle-desktop-layout` -> `flex-1 min-h-0 h-full`, `battle-right-sidebar` -> `min-w-0 min-h-0 h-full flex flex-col gap-2 overflow-hidden`).
  - Selected-unit panel (`battle-selected-unit-panel`) uses content height with zero fixed `h-[244px]`, zero `statuses` renders 0 rows without placeholder space, and non-empty `statuses` uses `<FixedStatusArea rows={Math.min(2, Math.max(1, activeUnitRows))} autoHeight ... />`.
  - Desktop & phone combat log headers add segmented control `[Dòng | Mở rộng]` (`combat-log-mode-line` / `combat-log-mode-expanded`), show `"Mở hết / Thu hết"` only in `Mở rộng`, keep non-truncated `combat-log-header-title` + `combat-log-header-count`, and keep transient `"Cửa sổ"` button (`combat-log-mode-toggle`, unsaved).
  - Phone `battle-phone-docked-log` removes `h-[144px]` / `overflow-hidden` and renders either single-line `battle-phone-log-line` (`Dòng`) or inline `<CombatLogList inlineFlow />` (`Mở rộng`).
- `src/components/__tests__/battleLayoutG4a2b.test.tsx` — Added 6 Vitest tests for G4a-2b requirements.
- `src/components/__tests__/battleG3b.test.tsx`, `src/components/__tests__/battleG3c.test.tsx`, `src/components/__tests__/battleG3d.test.tsx`, `src/components/__tests__/st1Ui.test.tsx` — Updated superseded G3b/G3c/G3d/ST1 assertions (5 vs 4 sidebar rows, empty queue slot placeholders, `h-[244px]`, `h-[144px]`, and saving `'popup'` to `localStorage`).

## Checks & Test Count
- `npx vitest run`: **29 test files passed, 234 tests passed** (baseline before G4a-2b: 28 files / 228 tests; +6 tests in `battleLayoutG4a2b.test.tsx`).
- `tsc --noEmit` (`lint_applet`): **passed (0 errors)**.
- Production build (`compile_applet` / `vite build`): **succeeded**.

## Limits Enforced in Code
- **Desktop right column (`> 640px`)**: `battle-desktop-layout` (`flex-1 min-h-0 h-full`) + `battle-right-sidebar` (`min-w-0 min-h-0 h-full flex flex-col gap-2 overflow-hidden`).
- **Turn queue sidebar**: `turn-queue-sidebar-header` (`h-[32px] min-h-[32px] max-h-[32px]`), acting chip (`h-[36px] min-h-[36px] max-h-[36px]`), upcoming rows (`h-[26px] min-h-[26px] max-h-[26px]`), `maxUpcoming = sidebarLogMode === 'line' ? 10 : 4`, `fillHeight = sidebarLogMode === 'line'`, zero empty placeholder slots, `+N` button (`turn-queue-overflow`) opens full-queue popover.
- **Selected-unit panel**: content height (`flex flex-col gap-1.5 shrink-0`), `<FixedStatusArea rows={Math.min(2, Math.max(1, activeUnitRows))} autoHeight ... />` rendered only when `sidebarUnit.statuses.length > 0`, 0 rows / 0 extra space when empty, `+N` opens existing full list modal.
- **Combat log**:
  - `expanded` (desktop): `flex-1 min-h-[220px] flex flex-col overflow-hidden`, internal `overflow-y-auto` scroll box, non-truncated title + count, `"Mở hết / Thu hết"` shown only in `expanded`.
  - `line` (desktop): `shrink-0`, header + single-line `battle-desktop-log-line` (`truncate`), freed vertical height absorbed by `turn-queue-sidebar` (`flex-1 min-h-0`, up to 10 rows).
  - Persistence: `LOG_MODE_STORAGE_KEY = 'dreamAce.logMode.v1'` (defaults to `'expanded'`), excluded from `useGameStore` persist slice, `CURRENT_SAVE_VERSION` (remains `9`), `buildExportEnvelope` (SV1a), and `exportSaveStateSnapshot` / `cloudSave` (SV1b).
- **Phone (`<= 640px`)**: `battle-phone-docked-log` has zero `h-[144px]`, zero `overflow-hidden`, and zero nested scroll classes (`overflow-y-auto`, `overflow-x-auto`, `overscroll-contain`); `Dòng` shows single line `battle-phone-log-line`, `Mở rộng` passes `inlineFlow`, `"Cửa sổ"` opens bottom sheet without saving mode.

## What Could NOT Be Verified in a Real Browser
- Live CSS Grid/Flexbox pixel geometry and absence of page scrollbar at exact `1440x900` desktop viewport and intermediate tablet viewports (`> 640px`), because `jsdom` does not compute layout heights (`getBoundingClientRect` / `scrollHeight`).
- Live touch scrolling, text wrapping, and responsive bottom-sheet behavior in a real `<= 640px` phone browser (`390x844`).
- Real user interaction timing across visual hover tooltips (`turn-queue-popover` and `status-area-popover`) under animated battle turns.
