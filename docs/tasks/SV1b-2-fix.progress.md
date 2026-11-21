# TASK SV1b-2-fix Progress

- [x] 1. Security: never store PIN anywhere; migrate & purge `dreamAce.cloudSave.link.v1` -> `dreamAce.cloud.v1` (`{saveId, lastKnownRev, lastSyncedAt}`), default "Nhớ trên máy này" OFF, store non-extractable AES-GCM `CryptoKey` + `verifier` + `salt` in IndexedDB when ON, add key-based upload/download helper in `src/engine/cloudSave.ts`
- [x] 2. Reload unlock flow: linked `saveId` with no key enters `"Cần nhập PIN"` (`needs_pin`) state, pauses autosave, provides one PIN unlock dialog (`"Sai PIN"` on wrong PIN, unlocks & resumes sync on valid PIN)
- [x] 3. Overwrite confirmation: `"Mở save từ xa"`, `"Tải từ mây"`, and `"Lấy bản trên mây"` show `"Ghi đè save trên máy?"` with `[Xuất save (SV1a) trước] [Ghi đè] [Hủy]` whenever a local save exists (reusing SV1a export)
- [x] 4. Offline retry backoff (`30s`, `2m`, `5m` staying at `5m`, reset on success; `online` event retries at once), defer all uploads during active battle (disable `[Lưu lên mây ngay]` with `"Đang trong trận"`), and use ONE shared exported `isBattleActive` helper across `useGameStore`, `useCloudSaveStore`, `CloudSaveSection`, and `CloudSaveDialogs`
- [x] 5. Tests (`vitest`, fake timers) covering all required cases + rewrite old localStorage PIN test + `cloud.*` vi/en parity test + full checks (`vitest`, `tsc`/`lint_applet`, build) and `docs/tasks/SV1b-2-fix.report.md`
