# TASK G4a-2a v3 Progress

- [x] 1. Phone portrait one-page vertical scroll, no nested scroll boxes, sticky control row, Card mode stacked allies above enemies (no tabs), tablet/desktop unchanged
- [x] 2. Camera slot (120px phone / 160px desktop, "Camera hành động"), EffectsSettingsPanel toggle, `src/utils/battleLayoutPrefs.ts` (`dreamAce.layout.v1`, default ON, OFF = hidden)
- [x] 3. Remove separate "AUTO đang chạy" bar; loop button stays outside "..." menu and shows running state + battle counter in control row
- [x] 4. Sound default OFF (muted) when no saved sound preference exists; preserve saved preferences
- [x] 5. Vitest tests for camera slot, removed AUTO bar, loop state in control row, `battleLayoutPrefs`, sound default OFF & saved pref, and `vi`/`en` keys
