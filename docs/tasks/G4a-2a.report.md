# TASK G4a-2a v3 — Completion Report

## Status
All 5 items were audited against the imported codebase, verified as implemented, and finalized with `CombatUnit` type alignment in the G4a-2a test helper.

## Summary of Changes & Verified Implementation
1. **Phone Portrait Scroll & Layout (`<= 640px`)**
   - `App.tsx` unlocks viewport height/overflow (`min-h-[100dvh]`, no `overflow-hidden`) when `screen === 'BATTLE'` and `layoutMode === 'phone-portrait'`.
   - `BattleScreen.tsx` renders a single page-level vertical flow on phone portrait (`battle-phone-layout`), with only `battle-phone-controls` sticky (`sticky top-0 z-30`).
   - `BattleRadarView.tsx` uses unclipped `aspect-[380/500]` without `overflow-hidden` on `phone-portrait`.
   - Card mode on phone stacks `card-side-ally` above `card-side-enemy` with no tabs or inner scroll containers; tablet/desktop keeps the 2-column `Đồng minh | Kẻ địch` layout unchanged.
2. **Action Camera Slot & Layout Prefs**
   - `src/utils/battleLayoutPrefs.ts` stores `{ showActionCamera: true }` under `localStorage` key `dreamAce.layout.v1` (isolated from `CURRENT_SAVE_VERSION = 9` and SV1a exports).
   - `BattleScreen.tsx` renders `battle-camera-slot` directly beneath `battle-player-status-bar` (`h-[120px]` phone / `h-[160px]` desktop, centered caption `Camera hành động` / `Action Camera`); hidden with no gap when OFF.
   - `EffectsSettingsPanel.tsx` exposes the `battle-toggle-action-camera` toggle.
3. **Removed Separate AUTO Bar & Control-Row Loop State**
   - No separate `AUTO đang chạy` dock bar is rendered in `BattleScreen.tsx`.
   - `renderLoopControl` stays directly in the control row (`battle-phone-controls` / `battle-desktop-controls`) outside the `"..."` menu and displays active state (`battle-loop-active-chip`, pulsing `battle-loop-running-dot`), battle counter (`battle-loop-progress`), and stop control (`battle-loop-stop`).
4. **Sound Default OFF**
   - `src/utils/sound.ts` initializes `muted = true`.
   - `src/engine/migration.ts` (`createFreshCampaignState` and `migrateSaveData`) and `src/store/useGameStore.ts` (`onRehydrateStorage`) default `muted` to `true` when absent while preserving explicit saved `muted` preferences (`false` / `true`).
5. **Tests & Translations**
   - `src/i18n/vi.ts` and `src/i18n/en.ts` define `battle.actionCamera` and `battle.loopRunningTag`.
   - Fixed `makeUnit` in `src/components/__tests__/battleLayoutG4a2a.test.tsx` to satisfy the current `CombatUnit` interface (`callsign`, `skillLevel`, `equippedSkillIds`, `stats`, `isDefending`, `animState`).
   - `src/utils/battleVfx.ts`, `src/components/BattleVfxOverlay.tsx`, `CURRENT_SAVE_VERSION = 9`, and combat log behavior were not modified.

## Files Touched (This Session)
- `docs/tasks/G4a-2a.md` (created — verbatim prompt)
- `docs/tasks/G4a-2a.progress.md` (created & ticked 1–5)
- `docs/tasks/G4a-2a.report.md` (created — this report)
- `src/components/__tests__/battleLayoutG4a2a.test.tsx` (updated `makeUnit` to match `CombatUnit` for `tsc --noEmit`)

*(Verified pre-existing G4a-2a implementation files in repo: `src/App.tsx`, `src/utils/battleLayoutPrefs.ts`, `src/utils/sound.ts`, `src/engine/migration.ts`, `src/store/useGameStore.ts`, `src/components/BattleScreen.tsx`, `src/components/BattleRadarView.tsx`, `src/components/EffectsSettingsPanel.tsx`, `src/i18n/vi.ts`, `src/i18n/en.ts`.)*

## Checks
- `npx vitest run`: **25 test files passed, 205 tests passed**
- `tsc --noEmit` (`lint_applet`): **passed (0 errors)**
- Production build (`compile_applet` / `vite build`): **succeeded**

## What Could NOT Be Verified in a Real Browser
- Real mobile browser touch-scrolling physics and rubber-banding across the single page-level vertical scroll on iOS/Android (`<= 640px` portrait).
- Visual stickiness of `battle-phone-controls` (`sticky top-0`) during live user scrolling in a real mobile viewport.
- Visual pixel-level rendering and absence of radar SVG/overlay clipping across real phone screen aspect ratios.
