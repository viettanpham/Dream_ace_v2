# TASK SV1b-2-fix Report — Cloud Save Fixes

## Summary of Changes

1. **Security — PIN never stored anywhere (`localStorage` or IndexedDB)**
   - Replaced legacy key `dreamAce.cloudSave.link.v1` with `dreamAce.cloud.v1` holding ONLY `{ saveId, lastKnownRev, lastSyncedAt }` (always written when linked, even when `"Nhớ trên máy này"` is OFF).
   - Added startup migration (`migrateAndReadCloudMeta`) that migrates `{ saveId, lastKnownRev, lastSyncedAt }` from `dreamAce.cloudSave.link.v1` and unconditionally deletes the legacy key to purge any plaintext PINs.
   - Removed raw `pin` from `useCloudSaveStore` state.
   - `"Nhớ trên máy này"` defaults to **OFF** (`false`):
     - **ON**: persists ONLY `{ saveId, key, verifier, salt }` in IndexedDB (`dreamAce.cloud.keys.v1`), where `key` is a non-extractable AES-GCM-256 `CryptoKey`.
     - **OFF**: keeps `{ key, verifier, salt }` in memory only and clears IndexedDB while preserving `{ saveId, lastKnownRev, lastSyncedAt }` in `dreamAce.cloud.v1`.
   - Added key-based helpers in `src/engine/cloudSave.ts` (`deriveCloudCredentialsForNewSave`, `deriveCloudCredentialsForExistingSave`, `uploadCloudSaveWithKey`, `downloadCloudSaveWithKey`) so uploads/downloads operate without keeping the raw PIN.

2. **Reload unlock flow (`"Cần nhập PIN"`)**
   - When reloading with a linked `saveId` in `dreamAce.cloud.v1` and no stored `CryptoKey` in IndexedDB, the store enters `status: 'needs_pin'` (`"Cần nhập PIN"`), pauses autosave (queuing `pendingSyncAfterUnlock`), and opens a single PIN unlock dialog (`UnlockCloudPinDialog`, mounted globally in `src/App.tsx`).
   - Entering a wrong PIN displays `"Sai PIN"` without unlocking; entering a valid PIN unlocks the session (optionally saving the non-extractable key to IndexedDB if `"Nhớ trên máy này"` is checked) and resumes any queued sync/download.

3. **Overwrite confirmation before replacing a local save**
   - Added `CloudOverwriteConfirmDialog` (`"Ghi đè save trên máy?"`) with `[Xuất save (SV1a) trước]`, `[Ghi đè]`, and `[Hủy]`.
   - Reuses SV1a export helpers (`buildExportEnvelope` + `formatSaveExportFilename`) to let the user download a local JSON backup before overwriting.
   - Triggered for `"Mở save từ xa"`, `"Tải từ mây"`, and Conflict `"Lấy bản trên mây"` whenever `useGameStore.getState().hasSaveData` is `true` (direct load when no local save exists).

4. **Offline retry backoff, battle upload deferral & shared `isBattleActive`**
   - Implemented strict offline retry backoff `30s -> 2m -> 5m` (stays at `5m`), resetting to `0` on successful sync, with immediate retry on the browser `'online'` event.
   - Deferred all uploads (`syncNow`, trailing 30s autosave timer, offline retry, `createCloudSave`, `resolveConflictKeepLocal`) while a battle is active; flushed automatically once the battle ends. `[Lưu lên mây ngay]` is disabled and displays `"Đang trong trận"` during battle.
   - Exported ONE shared `isBattleActive` helper from `src/store/useGameStore.ts` and reused it across `useCloudSaveStore.ts`, `CloudSaveSection.tsx`, and `CloudSaveDialogs.tsx` (removing the 3 duplicate definitions).

5. **Tests & i18n**
   - Added all new `cloud.*` strings to both `src/i18n/vi.ts` and `src/i18n/en.ts`.
   - Rewrote and expanded `src/components/__tests__/cloudSaveUi.test.tsx` (10 tests) covering: unconfigured notice, PIN-never-stored invariant across `localStorage` & IndexedDB (Nhớ OFF/ON/OFF + legacy key migration/purge), reload `"Cần nhập PIN"` unlock flow + silent IndexedDB restore, overwrite confirmation with SV1a export across all 3 entry points, conflict resolution, fake-timer offline backoff (`30s -> 2m -> 5m -> 5m` + reset + `online` immediate retry), battle upload deferral & button lock, and `cloud.*` vi/en translation parity.

## Files Touched

- `src/engine/cloudSave.ts`
- `src/store/useGameStore.ts`
- `src/store/useCloudSaveStore.ts`
- `src/components/CloudSaveDialogs.tsx`
- `src/components/CloudSaveSection.tsx`
- `src/App.tsx`
- `src/i18n/vi.ts`
- `src/i18n/en.ts`
- `src/components/__tests__/cloudSaveUi.test.tsx`
- `docs/tasks/SV1b-2-fix.md`
- `docs/tasks/SV1b-2-fix.progress.md`
- `docs/tasks/SV1b-2-fix.report.md`

Untouched per rules: `src/utils/battleVfx.ts`, `src/components/BattleVfxOverlay.tsx`, `firebase-applet-config.json`, battle layout, and `CURRENT_SAVE_VERSION` (remains `9`).

## Checks Run

- `npx vitest run`: **27 / 27 test files passed, 223 / 223 tests passed** (10 tests in `cloudSaveUi.test.tsx`).
- `tsc --noEmit` (`lint_applet`): **Passed** (0 errors).
- Production build (`compile_applet`): **Passed**.

## Not Verified in a Real Browser

- Real browser IndexedDB persistence of structured-cloned non-extractable `CryptoKey` objects across a full page reload (jsdom tests use an inspectable in-memory `CloudKeyStorage` double implementing the same contract).
- Real browser file download dialog triggered by `[Xuất save (SV1a) trước]` (`URL.createObjectURL` / `anchor.click()` was verified via Vitest spies).
- Real Clipboard API copy behavior (`navigator.clipboard.writeText`) and visual responsive layout on physical phone/desktop screens.
- Live Firebase Anonymous Auth + Firestore network requests, security rules enforcement, and real offline/online network transitions.
