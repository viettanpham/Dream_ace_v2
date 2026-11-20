import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Lock,
  RotateCcw,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { CURRENT_SAVE_VERSION } from '../engine/migration';
import {
  buildExportEnvelope,
  decryptEnvelope,
  formatSaveExportFilename,
  isValidSavePin,
  parseImportEnvelope,
  SaveExportException,
  summarizeSaveStateForPreview,
  validateImportSaveVersion,
  type SaveExportEnvelope,
  type SaveExportError,
  type SavePreviewSummary,
} from '../engine/saveExport';
import { getClassName, useI18n } from '../i18n';
import { useGameStore } from '../store/useGameStore';

interface PendingConfirmImport {
  envelope: SaveExportEnvelope;
  rawState: unknown;
  summary: SavePreviewSummary;
}

async function readSelectedFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

function formatExportedTimestamp(iso: string, lang: 'en' | 'vi'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return date.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function SaveTransferSection() {
  const { lang, t } = useI18n();
  const screen = useGameStore((s) => s.screen);
  const battle = useGameStore((s) => s.battle);
  const hasImportBackup = useGameStore((s) => s.hasImportBackup);
  const exportSaveStateSnapshot = useGameStore((s) => s.exportSaveStateSnapshot);
  const importSaveFromEnvelope = useGameStore((s) => s.importSaveFromEnvelope);
  const undoSaveImport = useGameStore((s) => s.undoSaveImport);

  const isBattleActive =
    screen === 'BATTLE' && Boolean(battle && !battle.summary);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [exportPin, setExportPin] = useState('');
  const [exportPinConfirm, setExportPinConfirm] = useState('');
  const [exporting, setExporting] = useState(false);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Import multi-step state
  const [pendingEncryptedEnvelope, setPendingEncryptedEnvelope] =
    useState<SaveExportEnvelope | null>(null);
  const [importPin, setImportPin] = useState('');
  const [importPinError, setImportPinError] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);

  const [pendingConfirm, setPendingConfirm] =
    useState<PendingConfirmImport | null>(null);

  const translateEnvelopeError = (err: SaveExportError): string => {
    switch (err.code) {
      case 'INVALID_JSON':
        return t('save.errInvalidJson');
      case 'INVALID_ENVELOPE':
        return t('save.errInvalidEnvelope');
      case 'WRONG_APP':
        return t('save.errWrongApp');
      case 'CHECKSUM_MISMATCH':
        return t('save.errChecksumMismatch');
      case 'INVALID_PIN':
        return t('save.errInvalidPinFormat');
      case 'WRONG_PIN':
        return t('save.errWrongPin');
      case 'VERSION_TOO_NEW':
        return t('save.errVersionTooNew', {
          found: err.foundVersion ?? '?',
          current: err.supportedVersion ?? CURRENT_SAVE_VERSION,
        });
      case 'UNSUPPORTED_CRYPTO':
        return t('save.errCryptoUnsupported');
      case 'CORRUPT':
      default:
        return t('save.errCorrupt');
    }
  };

  // Close PIN prompt / Confirm dialog with Escape key
  useEffect(() => {
    if (!pendingEncryptedEnvelope && !pendingConfirm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (pendingConfirm) {
          setPendingConfirm(null);
        } else if (pendingEncryptedEnvelope) {
          setPendingEncryptedEnvelope(null);
          setImportPin('');
          setImportPinError(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingEncryptedEnvelope, pendingConfirm]);

  const handleExport = async () => {
    setErrorMessage(null);
    setStatusMessage(null);

    const trimmedPin = exportPin.trim();
    const trimmedConfirm = exportPinConfirm.trim();

    if (trimmedPin.length > 0 || trimmedConfirm.length > 0) {
      if (!isValidSavePin(trimmedPin)) {
        setErrorMessage(t('save.errInvalidPinFormat'));
        return;
      }
      if (trimmedPin !== trimmedConfirm) {
        setErrorMessage(t('save.errPinMismatch'));
        return;
      }
    }

    setExporting(true);
    try {
      const snapshot = exportSaveStateSnapshot();
      const envelope = await buildExportEnvelope(
        snapshot,
        trimmedPin.length > 0 ? trimmedPin : undefined
      );
      const filename = formatSaveExportFilename(new Date());
      const jsonText = JSON.stringify(envelope, null, 2);

      if (
        typeof URL !== 'undefined' &&
        typeof URL.createObjectURL === 'function'
      ) {
        const blob = new Blob([jsonText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        if (typeof URL.revokeObjectURL === 'function') {
          URL.revokeObjectURL(url);
        }
      }

      setExportPin('');
      setExportPinConfirm('');
      setStatusMessage(t('save.exportSuccess', { filename }));
    } catch (err) {
      if (err instanceof SaveExportException) {
        setErrorMessage(
          translateEnvelopeError({ code: err.code, message: err.message })
        );
      } else {
        setErrorMessage(t('save.errCorrupt'));
      }
    } finally {
      setExporting(false);
    }
  };

  const openConfirmForState = (
    envelope: SaveExportEnvelope,
    rawState: unknown
  ) => {
    const summary = summarizeSaveStateForPreview(rawState, envelope.saveVersion);
    setPendingConfirm({
      envelope,
      rawState,
      summary,
    });
  };

  const handleFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMessage(null);
    setStatusMessage(null);

    if (isBattleActive) {
      setErrorMessage(t('save.errBattleActive'));
      return;
    }

    try {
      const text = await readSelectedFileText(file);
      const parsed = await parseImportEnvelope(text);
      if (!parsed.ok) {
        setErrorMessage(translateEnvelopeError(parsed.error));
        return;
      }

      const verCheck = validateImportSaveVersion(
        parsed.envelope.saveVersion,
        CURRENT_SAVE_VERSION
      );
      if (!verCheck.ok) {
        setErrorMessage(translateEnvelopeError(verCheck.error));
        return;
      }

      if (parsed.envelope.encrypted) {
        setImportPin('');
        setImportPinError(null);
        setPendingEncryptedEnvelope(parsed.envelope);
        return;
      }

      openConfirmForState(parsed.envelope, parsed.envelope.payload);
    } catch {
      setErrorMessage(t('save.errInvalidJson'));
    }
  };

  const handleDecryptSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pendingEncryptedEnvelope) return;
    setImportPinError(null);

    const trimmed = importPin.trim();
    if (!isValidSavePin(trimmed)) {
      setImportPinError(t('save.errInvalidPinFormat'));
      return;
    }

    setDecrypting(true);
    try {
      const result = await decryptEnvelope(pendingEncryptedEnvelope, trimmed);
      if (!result.ok) {
        setImportPinError(translateEnvelopeError(result.error));
        return;
      }

      const envelope = pendingEncryptedEnvelope;
      setPendingEncryptedEnvelope(null);
      setImportPin('');
      setImportPinError(null);
      openConfirmForState(envelope, result.state);
    } finally {
      setDecrypting(false);
    }
  };

  const handleConfirmReplace = () => {
    if (!pendingConfirm) return;
    const { envelope, rawState } = pendingConfirm;
    const res = importSaveFromEnvelope(rawState, envelope.saveVersion);
    setPendingConfirm(null);

    if (!res.ok) {
      if (res.code === 'BATTLE_ACTIVE') {
        setErrorMessage(t('save.errBattleActive'));
      } else if (res.code === 'VERSION_TOO_NEW') {
        setErrorMessage(
          t('save.errVersionTooNew', {
            found: envelope.saveVersion,
            current: CURRENT_SAVE_VERSION,
          })
        );
      } else {
        setErrorMessage(t('save.errCorrupt'));
      }
      return;
    }

    setStatusMessage(t('save.importSuccess'));
  };

  const handleUndoImport = () => {
    setErrorMessage(null);
    setStatusMessage(null);
    const res = undoSaveImport();
    if (res.ok) {
      setStatusMessage(t('save.undoSuccess'));
    } else {
      setErrorMessage(res.error ?? t('save.errCorrupt'));
    }
  };

  return (
    <section
      data-testid="save-transfer-section"
      className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 space-y-3"
    >
      <div className="space-y-0.5">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">
          {t('save.sectionTitle')}
        </div>
        <p className="text-[12px] text-slate-400 leading-relaxed">
          {t('save.sectionDesc')}
        </p>
      </div>

      {/* Export PIN + Confirm PIN */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <label
            htmlFor="save-export-pin"
            className="block text-[11px] font-medium text-slate-300"
          >
            {t('save.pinLabel')}
          </label>
          <input
            id="save-export-pin"
            data-testid="save-export-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={exportPin}
            onChange={(e) => {
              setExportPin(e.target.value);
              setErrorMessage(null);
            }}
            placeholder={t('save.pinPlaceholder')}
            className="w-full min-h-[40px] px-3 rounded-lg border border-slate-700 bg-[#080C14] text-[13px] font-mono-nums text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="save-export-pin-confirm"
            className="block text-[11px] font-medium text-slate-300"
          >
            {t('save.pinConfirmLabel')}
          </label>
          <input
            id="save-export-pin-confirm"
            data-testid="save-export-pin-confirm"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={exportPinConfirm}
            onChange={(e) => {
              setExportPinConfirm(e.target.value);
              setErrorMessage(null);
            }}
            placeholder={t('save.pinConfirmPlaceholder')}
            className="w-full min-h-[40px] px-3 rounded-lg border border-slate-700 bg-[#080C14] text-[13px] font-mono-nums text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
          />
        </div>
      </div>

      <p
        data-testid="save-pin-client-note"
        className="text-[11px] text-slate-400 flex items-start gap-1.5 leading-snug"
      >
        <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
        <span>{t('save.pinClientNote')}</span>
      </p>

      {/* Export + Import Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="save-export-btn"
          disabled={exporting}
          onClick={handleExport}
          className="min-h-[44px] px-3.5 rounded-lg border border-sky-500/50 bg-sky-500/15 hover:bg-sky-500/25 disabled:opacity-50 text-sky-200 text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>{t('save.exportBtn')}</span>
        </button>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            data-testid="save-import-file-input"
            disabled={isBattleActive}
            onChange={handleFileSelected}
            className="sr-only"
          />
          <button
            type="button"
            data-testid="save-import-btn"
            disabled={isBattleActive}
            onClick={() => fileInputRef.current?.click()}
            className="w-full min-h-[44px] px-3.5 rounded-lg border border-amber-500/50 bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-45 disabled:cursor-not-allowed text-amber-200 text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span>{t('save.importBtn')}</span>
          </button>
        </div>
      </div>

      {isBattleActive && (
        <div
          data-testid="save-battle-active-notice"
          className="p-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 text-[12px] text-amber-200 flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>{t('save.importDisabledInBattle')}</span>
        </div>
      )}

      {hasImportBackup && (
        <div
          data-testid="save-import-backup-bar"
          className="p-2.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 flex flex-wrap items-center justify-between gap-2"
        >
          <span className="text-[12px] text-emerald-200 leading-snug">
            {t('save.undoAvailableNote')}
          </span>
          <button
            type="button"
            data-testid="save-undo-import-btn"
            disabled={isBattleActive}
            onClick={handleUndoImport}
            className="min-h-[36px] px-3 rounded-lg border border-emerald-400/60 bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-45 disabled:cursor-not-allowed text-emerald-100 text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('save.undoBtn')}</span>
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          data-testid="save-import-error"
          className="p-2.5 rounded-lg border border-red-500/50 bg-red-500/15 text-[12px] text-red-200 flex items-start gap-2"
        >
          <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {statusMessage && (
        <div
          role="status"
          data-testid="save-status-message"
          className="p-2.5 rounded-lg border border-emerald-500/45 bg-emerald-500/15 text-[12px] text-emerald-200 flex items-start gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* PIN Prompt Dialog for Encrypted Imports */}
      {pendingEncryptedEnvelope && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-pin-prompt-title"
          data-testid="save-pin-prompt"
          className="fixed inset-0 z-[60] bg-black/75 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleDecryptSubmit}
            className="w-full max-w-sm rounded-xl border border-slate-700 bg-[#0D1420] p-4 space-y-4 shadow-2xl"
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-amber-300">
                <Lock className="w-5 h-5 shrink-0" />
                <h3
                  id="save-pin-prompt-title"
                  className="font-display text-lg font-bold text-slate-50"
                >
                  {t('save.pinPromptTitle')}
                </h3>
              </div>
              <p className="text-[13px] text-slate-300 leading-relaxed">
                {t('save.pinPromptDesc')}
              </p>
              <div className="text-[11px] font-mono-nums text-slate-400">
                {t('save.metaExportedAt')}:{' '}
                {formatExportedTimestamp(pendingEncryptedEnvelope.exportedAt, lang)}{' '}
                · v{pendingEncryptedEnvelope.saveVersion}
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="save-import-pin-input"
                className="block text-[12px] font-medium text-slate-300"
              >
                {t('save.pinPromptLabel')}
              </label>
              <input
                id="save-import-pin-input"
                data-testid="save-import-pin-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                autoFocus
                value={importPin}
                onChange={(e) => {
                  setImportPin(e.target.value);
                  setImportPinError(null);
                }}
                placeholder={t('save.pinPromptPlaceholder')}
                className="w-full min-h-[44px] px-3 rounded-lg border border-slate-700 bg-[#080C14] text-sm font-mono-nums text-slate-100 focus:outline-none focus:border-amber-400"
              />
            </div>

            {importPinError && (
              <div
                role="alert"
                data-testid="save-import-pin-error"
                className="p-2.5 rounded-lg border border-red-500/50 bg-red-500/15 text-[12px] text-red-200 flex items-start gap-2"
              >
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{importPinError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="save-import-pin-cancel"
                onClick={() => {
                  setPendingEncryptedEnvelope(null);
                  setImportPin('');
                  setImportPinError(null);
                }}
                className="min-h-[44px] px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-[13px] cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                data-testid="save-import-pin-submit"
                disabled={decrypting}
                className="min-h-[44px] px-3 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-[13px] cursor-pointer"
              >
                {t('save.pinPromptSubmit')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirmation Dialog Showing exportedAt, saveVersion, and Campaign Progress */}
      {pendingConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-import-confirm-title"
          data-testid="save-import-confirm-dialog"
          className="fixed inset-0 z-[60] bg-black/75 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-[#0D1420] p-4 space-y-4 shadow-2xl">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-amber-300">
                <Upload className="w-5 h-5 shrink-0" />
                <h3
                  id="save-import-confirm-title"
                  className="font-display text-lg font-bold text-slate-50"
                >
                  {t('save.confirmTitle')}
                </h3>
              </div>
              <p className="text-[13px] text-slate-300 leading-relaxed">
                {t('save.confirmDesc')}
              </p>
            </div>

            <div className="p-3 rounded-lg border border-slate-800 bg-[#080C14] space-y-2 text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">{t('save.metaExportedAt')}:</span>
                <span
                  data-testid="save-confirm-exported-at"
                  className="font-mono-nums text-slate-100 text-right"
                >
                  {formatExportedTimestamp(pendingConfirm.envelope.exportedAt, lang)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">{t('save.metaVersion')}:</span>
                <span
                  data-testid="save-confirm-version"
                  className="font-mono-nums font-semibold text-amber-300"
                >
                  v{pendingConfirm.envelope.saveVersion}
                </span>
              </div>

              {pendingConfirm.envelope.saveVersion < CURRENT_SAVE_VERSION && (
                <div className="text-[11px] text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded px-2 py-1">
                  {t('save.metaWillMigrate', {
                    from: pendingConfirm.envelope.saveVersion,
                    to: CURRENT_SAVE_VERSION,
                  })}
                </div>
              )}

              <div
                data-testid="save-confirm-progress"
                className="pt-2 border-t border-slate-800 space-y-1"
              >
                <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  {t('save.metaProgress')}
                </div>
                <div className="font-semibold text-slate-100">
                  {t('save.progressPilotLine', {
                    name: pendingConfirm.summary.pilotName,
                    gear: getClassName(lang, pendingConfirm.summary.activeGearId),
                    level: pendingConfirm.summary.activeGearLevel,
                    owned: pendingConfirm.summary.ownedGearsCount,
                  })}
                </div>
                <div className="font-mono-nums text-slate-300">
                  {t('save.progressStatsLine', {
                    credits: pendingConfirm.summary.credits.toLocaleString(),
                    wp: pendingConfirm.summary.warPoints.toLocaleString(),
                    wins: pendingConfirm.summary.totalWins,
                    captured: pendingConfirm.summary.capturedSectorsCount,
                    total: pendingConfirm.summary.totalSectorsCount,
                    month: pendingConfirm.summary.campaignMonth,
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="save-import-cancel-btn"
                onClick={() => setPendingConfirm(null)}
                className="min-h-[44px] px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-[13px] cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                data-testid="save-import-confirm-btn"
                onClick={handleConfirmReplace}
                className="min-h-[44px] px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-[13px] cursor-pointer"
              >
                {t('save.confirmReplaceBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
