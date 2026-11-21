TASK G4a-2a v3 — Battle layout. Model: Hydrogen. If this prompt looks cut off, STOP and tell me the last words you can see.

STEP A (first, before reading any code): save THIS WHOLE prompt verbatim to docs/tasks/G4a-2a.md and create docs/tasks/G4a-2a.progress.md with a checklist of items 1-5 (unticked). A previous run on another account may have been interrupted: check the repo (git status / files) for src/utils/battleLayoutPrefs.ts, the camera slot, the removed AUTO bar, sound default OFF, then tick what is already done and continue ONLY with the rest. Tick each item right after finishing it; at the end write docs/tasks/G4a-2a.report.md and print it. If interrupted or retried, read docs/tasks/G4a-2a.md and docs/tasks/G4a-2a.progress.md and continue from the first unticked item; never restart and never re-audit.

RULES: do NOT touch src/utils/battleVfx.ts or src/components/BattleVfxOverlay.tsx; CURRENT_SAVE_VERSION stays 9; do NOT change the combat log; keep everything from G4a-1 and ST1; new strings in both vi.ts and en.ts. Aim for about 40 minutes; if short on time, finish what is done, run the checks and report what is left.

STEP 0 (read-only, max 10 lines): where the "AUTO đang chạy" bar is rendered, every nested scroll container on the phone battle screen, and where the sound on/off preference is stored and its default.

1. Phone portrait (width <= 640px): the whole battle screen is ONE page-level vertical scroll. No nested scroll boxes (radar not clipped, no scroll trap). Only the small control row (speed / pause / loop / "...") is sticky. Card mode on phone: allies block above enemies block, no tabs. Tablet and desktop: keep the current side-by-side Đồng minh | Kẻ địch columns unchanged.
2. Camera slot: a reserved empty box under the player info bar (about 120px phone / 160px desktop, muted centered caption "Camera hành động"), placeholder for G4b. Add a toggle "Camera hành động" in the Effects settings (EffectsSettingsPanel), default ON, stored in a NEW util src/utils/battleLayoutPrefs.ts, localStorage key dreamAce.layout.v1 (per device, outside the save and SV1a exports). OFF = slot hidden, no gap.
3. Remove the separate "AUTO đang chạy" bar. The loop button stays outside the "..." menu and shows its running state plus battle counter in the control row.
4. Sound: default OFF (muted) when no saved sound preference exists. Saved preferences stay as they are.
5. Tests (vitest): camera slot shows by default and hides when OFF; no "AUTO đang chạy" bar; loop state visible in the control row; battleLayoutPrefs read/write/default; sound defaults to OFF with no saved preference and respects a saved one; vi and en keys exist.

CHECKS: npx vitest run, tsc --noEmit (lint_applet), production build.
REPORT (docs/tasks/G4a-2a.report.md + chat): short list of changes, files touched, test count, what you could NOT verify in a real browser (phone scroll, sticky row, radar clipping).
