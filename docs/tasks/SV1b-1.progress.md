# TASK SV1b-1 Progress

- [x] 1. Firebase access (`src/engine/cloudStore.ts` adapter interface + Firestore impl + in-memory mock, `signInAnonymously`, `isCloudConfigured()` safe offline fallback)
- [x] 2. `src/engine/cloudSave.ts` (Save ID Crockford base32 10 chars `XXXXX-XXXXX`, PIN 4-8 digits, reuse SV1a PBKDF2-SHA256 100k iterations, random salt, fresh IV per upload, verifier = base64 SHA-256 of derived key bits, wrong PIN = `"Sai PIN"`)
- [x] 3. Doc `saves/{saveId}` schema, gzip via `CompressionStream` + encrypt, > 900 KB chunking in `saves/{saveId}/chunks/{n}` in one transaction, optimistic `rev` conflict handling, SV1a migration path on download, refuse `schemaVersion > CURRENT_SAVE_VERSION`
- [x] 4. `firestore.rules` merged with generated file (get not list on `saves/{saveId}` for signed-in users, create if absent, update only if verifier unchanged & `rev == old rev + 1`, chunks read for signed-in & write only in same commit via `getAfter`, no client delete, temporary model comment, do not deploy)
- [x] 5. Vitest unit tests (mock adapter, no network) covering all required cases + full checks (`vitest`, `tsc`/`lint_applet`, build) and `docs/tasks/SV1b-1.report.md`
