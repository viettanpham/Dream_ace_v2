import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Cloud,
  CloudDownload,
  CloudUpload,
  Copy,
  Download,
  HardDrive,
  KeyRound,
  Lock,
  ShieldAlert,
  X,
} from 'lucide-react';
import { isValidSaveId } from '../engine/cloudSave';
import { CURRENT_SAVE_VERSION } from '../engine/migration';
import {
  buildExportEnvelope,
  formatSaveExportFilename,
  isValidSavePin,
} from '../engine/saveExport';
import { getClassName, useI18n } from '../i18n';
import type { TranslationKey } from '../i18n/en';
import {
  useCloudSaveStore,
  type CloudActionResult,
  type CloudOverwriteSource,
} from '../store/useCloudSaveStore';
import { isBattleActive, useGameStore } from '../store/useGameStore';

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function formatCloudTimeShort(iso: string | null): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatCloudDateTime(
  iso: string | null,
  lang: 'en' | 'vi'
): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', {
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

export function translateCloudActionError(
  res: Extract<CloudActionResult, { ok: false }>,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
): string {
  if (res.offline) return t('cloud.errOffline');
  switch (res.errorCode) {
    case 'CLOUD_NOT_CONFIGURED':
      return t('cloud.notConfigured');
    case 'INVALID_SAVE_ID':
      return t('cloud.errInvalidSaveId');
    case 'INVALID_PIN':
      return t('save.errInvalidPinFormat');
    case 'WRONG_PIN':
      return t('cloud.errWrongPin');
    case 'NEEDS_PIN':
      return t('cloud.statusNeedsPin');
    case 'NOT_FOUND':
      return t('cloud.errNotFound');
    case 'BATTLE_ACTIVE':
      return t('cloud.inBattleLocked');
    case 'VERSION_TOO_NEW':
      return t('save.errVersionTooNew', {
        found: res.foundVersion ?? '?',
        current: res.supportedVersion ?? CURRENT_SAVE_VERSION,
      });
    case 'UNSUPPORTED_CRYPTO':
      return t('save.errCryptoUnsupported');
    case 'CORRUPT':
      return t('save.errCorrupt');
    case 'STORE_ERROR':
      return t('cloud.errOffline');
    default:
      return res.message || t('save.errCorrupt');
  }
}

/**
 * Reuses SV1a's unencrypted JSON export helper to download a local backup before overwriting.
 */
async function triggerSv1aLocalBackupExport(): Promise<string> {
  const snapshot = useGameStore.getState().exportSaveStateSnapshot();
  const envelope = await buildExportEnvelope(snapshot);
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

  return filename;
}

interface CloudOverwriteConfirmDialogProps {
  source: CloudOverwriteSource;
  onConfirmed?: () => void;
}

export function CloudOverwriteConfirmDialog({
  source,
  onConfirmed,
}: CloudOverwriteConfirmDialogProps) {
  const { lang, t } = useI18n();
  const pendingOverwrite = useCloudSaveStore((s) => s.pendingOverwrite);
  const confirmPendingOverwrite = useCloudSaveStore(
    (s) => s.confirmPendingOverwrite
  );
  const cancelPendingOverwrite = useCloudSaveStore(
    (s) => s.cancelPendingOverwrite
  );

  const screen = useGameStore((s) => s.screen);
  const battle = useGameStore((s) => s.battle);
  const battleActive = isBattleActive({ screen, battle });

  const [exporting, setExporting] = useState(false);
  const [exportedFilename, setExportedFilename] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = Boolean(pendingOverwrite && pendingOverwrite.source === source);

  useEffect(() => {
    if (!open) return;
    setExporting(false);
    setExportedFilename(null);
    setConfirming(false);
    setError(null);
  }, [open, pendingOverwrite]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirming && !exporting) {
        e.stopPropagation();
        cancelPendingOverwrite();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, confirming, exporting, cancelPendingOverwrite]);

  if (!open || !pendingOverwrite) return null;

  const handleExportBeforeOverwrite = async () => {
    setError(null);
    setExporting(true);
    try {
      const filename = await triggerSv1aLocalBackupExport();
      setExportedFilename(filename);
    } catch {
      setError(t('save.errCorrupt'));
    } finally {
      setExporting(false);
    }
  };

  const handleConfirm = async () => {
    setError(null);
    setConfirming(true);
    try {
      const res = await confirmPendingOverwrite();
      if (!res.ok) {
        setError(translateCloudActionError(res, t));
        return;
      }
      onConfirmed?.();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloud-overwrite-dialog-title"
      data-testid="cloud-overwrite-confirm-dialog"
      className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md rounded-xl border border-amber-500/45 bg-[#0D1420] p-5 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-amber-300">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h3
              id="cloud-overwrite-dialog-title"
              className="font-display text-lg font-bold text-slate-50"
            >
              {t('cloud.overwriteTitle')}
            </h3>
          </div>
          <button
            type="button"
            disabled={confirming || exporting}
            onClick={cancelPendingOverwrite}
            aria-label={t('common.cancel')}
            className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[13px] text-slate-300 leading-relaxed">
          {t('cloud.overwriteDesc')}
        </p>

        {/* Incoming Cloud Save Summary */}
        <div className="p-3 rounded-lg border border-slate-800 bg-[#080C14] space-y-1.5 text-[12px]">
          <div className="flex items-center justify-between gap-2 text-slate-400">
            <span>{t('cloud.cloudVersionLabel')}</span>
            <span className="font-mono-nums text-sky-300 font-semibold">
              {pendingOverwrite.saveId}
            </span>
          </div>
          <div className="font-semibold text-slate-100">
            {pendingOverwrite.preview.pilotName} ·{' '}
            {getClassName(lang, pendingOverwrite.preview.activeGearId)}{' '}
            Lv.{pendingOverwrite.preview.activeGearLevel}
          </div>
          <div className="font-mono-nums text-slate-300">
            {pendingOverwrite.preview.credits.toLocaleString()} CR ·{' '}
            {pendingOverwrite.preview.ownedGearsCount}/4 Gear ·{' '}
            {formatCloudDateTime(pendingOverwrite.updatedAt, lang)}
          </div>
        </div>

        {exportedFilename && (
          <div
            role="status"
            data-testid="cloud-overwrite-exported-notice"
            className="p-2.5 rounded-lg border border-emerald-500/45 bg-emerald-500/15 text-[12px] text-emerald-200 flex items-start gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              {t('cloud.overwriteExported', { filename: exportedFilename })}
            </span>
          </div>
        )}

        {battleActive && (
          <div className="p-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 text-[12px] text-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{t('cloud.inBattleLocked')}</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            data-testid="cloud-overwrite-error"
            className="p-2.5 rounded-lg border border-red-500/50 bg-red-500/15 text-[12px] text-red-200 flex items-start gap-2"
          >
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-2">
          <button
            type="button"
            data-testid="cloud-overwrite-export-btn"
            disabled={exporting || confirming}
            onClick={handleExportBeforeOverwrite}
            className="w-full min-h-[44px] px-3.5 rounded-lg border border-sky-500/50 bg-sky-500/15 hover:bg-sky-500/25 disabled:opacity-50 text-sky-200 text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>{t('cloud.overwriteExportBtn')}</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="cloud-overwrite-cancel-btn"
              disabled={confirming || exporting}
              onClick={cancelPendingOverwrite}
              className="min-h-[44px] px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-[13px] cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              data-testid="cloud-overwrite-confirm-btn"
              disabled={confirming || exporting || battleActive}
              onClick={handleConfirm}
              className="min-h-[44px] px-3 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-45 disabled:cursor-not-allowed text-slate-950 font-bold text-[13px] cursor-pointer whitespace-nowrap"
            >
              {confirming ? t('cloud.resolvingBtn') : t('cloud.overwriteConfirmBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CreateCloudSaveDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateCloudSaveDialog({
  open,
  onClose,
}: CreateCloudSaveDialogProps) {
  const { t } = useI18n();
  const createCloudSave = useCloudSaveStore((s) => s.createCloudSave);

  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdSaveId, setCreatedSaveId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPin('');
    setPinConfirm('');
    setRemember(false);
    setSubmitting(false);
    setError(null);
    setCreatedSaveId(null);
    setCopied(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedPin = pin.trim();
    const trimmedConfirm = pinConfirm.trim();
    if (!isValidSavePin(trimmedPin)) {
      setError(t('save.errInvalidPinFormat'));
      return;
    }
    if (trimmedPin !== trimmedConfirm) {
      setError(t('save.errPinMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await createCloudSave(trimmedPin, remember);
      if (!res.ok) {
        setError(translateCloudActionError(res, t));
        return;
      }
      setCreatedSaveId(res.saveId ?? null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!createdSaveId) return;
    const ok = await copyTextToClipboard(createdSaveId);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloud-create-dialog-title"
      data-testid="cloud-create-dialog"
      className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-[#0D1420] p-5 space-y-4 shadow-2xl">
        {createdSaveId ? (
          /* Step 2: Large Save ID + Prominent "Mất PIN = mất save" Warning */
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-emerald-300">
                <Cloud className="w-5 h-5 shrink-0" />
                <h3
                  id="cloud-create-dialog-title"
                  className="font-display text-lg font-bold text-slate-50"
                >
                  {t('cloud.createdTitle')}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('common.cancel')}
                className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[13px] text-slate-300 leading-relaxed">
              {t('cloud.createdHint')}
            </p>

            {/* Large Save ID Box */}
            <div className="p-4 rounded-xl border border-sky-500/40 bg-[#080C14] flex flex-col items-center gap-3">
              <div className="text-[11px] font-medium text-slate-400">
                {t('cloud.saveIdLabel')}
              </div>
              <div
                data-testid="cloud-created-save-id"
                className="font-mono-nums text-2xl sm:text-3xl font-bold tracking-[0.14em] text-sky-300 select-all text-center"
              >
                {createdSaveId}
              </div>
              <button
                type="button"
                data-testid="cloud-created-copy-btn"
                onClick={handleCopy}
                className="min-h-[40px] px-4 rounded-lg border border-sky-500/50 bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>{t('cloud.copiedBtn')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>{t('cloud.copyBtn')}</span>
                  </>
                )}
              </button>
            </div>

            {/* Prominent Warning: Mất PIN = mất save */}
            <div
              data-testid="cloud-lost-pin-warning"
              className="p-3 rounded-lg border border-amber-500/50 bg-amber-500/10 space-y-1"
            >
              <div className="flex items-center gap-2 text-amber-300 font-bold text-[13px]">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{t('cloud.lostPinWarning')}</span>
              </div>
              <p className="text-[12px] text-amber-100/90 leading-relaxed">
                {t('cloud.lostPinDetail')}
              </p>
            </div>

            <button
              type="button"
              data-testid="cloud-created-done-btn"
              onClick={onClose}
              className="w-full min-h-[44px] px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[14px] cursor-pointer transition-colors"
            >
              {t('cloud.doneBtn')}
            </button>
          </div>
        ) : (
          /* Step 1: Enter PIN Twice */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-sky-300">
                <CloudUpload className="w-5 h-5 shrink-0" />
                <h3
                  id="cloud-create-dialog-title"
                  className="font-display text-lg font-bold text-slate-50"
                >
                  {t('cloud.createTitle')}
                </h3>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={onClose}
                aria-label={t('common.cancel')}
                className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[13px] text-slate-300 leading-relaxed">
              {t('cloud.createDesc')}
            </p>

            <div className="space-y-3">
              <div className="space-y-1">
                <label
                  htmlFor="cloud-create-pin"
                  className="block text-[12px] font-medium text-slate-300"
                >
                  {t('cloud.pinLabel')}
                </label>
                <input
                  id="cloud-create-pin"
                  data-testid="cloud-create-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={8}
                  autoFocus
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value);
                    setError(null);
                  }}
                  placeholder={t('cloud.pinPlaceholder')}
                  className="w-full min-h-[44px] px-3 rounded-lg border border-slate-700 bg-[#080C14] text-sm font-mono-nums text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="cloud-create-pin-confirm"
                  className="block text-[12px] font-medium text-slate-300"
                >
                  {t('cloud.pinConfirmLabel')}
                </label>
                <input
                  id="cloud-create-pin-confirm"
                  data-testid="cloud-create-pin-confirm"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={8}
                  value={pinConfirm}
                  onChange={(e) => {
                    setPinConfirm(e.target.value);
                    setError(null);
                  }}
                  placeholder={t('cloud.pinConfirmPlaceholder')}
                  className="w-full min-h-[44px] px-3 rounded-lg border border-slate-700 bg-[#080C14] text-sm font-mono-nums text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                />
              </div>

              <label className="flex items-center gap-2.5 text-[13px] text-slate-300 cursor-pointer select-none min-h-[36px]">
                <input
                  type="checkbox"
                  data-testid="cloud-create-remember"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-900 accent-sky-400 cursor-pointer"
                />
                <span>{t('cloud.rememberDevice')}</span>
              </label>
            </div>

            <div className="text-[12px] text-amber-300/90 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>{t('cloud.lostPinWarning')}</span>
            </div>

            {error && (
              <div
                role="alert"
                data-testid="cloud-create-error"
                className="p-2.5 rounded-lg border border-red-500/50 bg-red-500/15 text-[12px] text-red-200 flex items-start gap-2"
              >
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={submitting}
                data-testid="cloud-create-cancel-btn"
                onClick={onClose}
                className="min-h-[44px] px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-[13px] cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                data-testid="cloud-create-submit-btn"
                className="min-h-[44px] px-3 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-[13px] cursor-pointer whitespace-nowrap"
              >
                {submitting ? t('cloud.creatingBtn') : t('cloud.createSubmitBtn')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

interface OpenRemoteSaveDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function OpenRemoteSaveDialog({
  open,
  onClose,
  onSuccess,
}: OpenRemoteSaveDialogProps) {
  const { t } = useI18n();
  const openRemoteSave = useCloudSaveStore((s) => s.openRemoteSave);

  const [saveIdInput, setSaveIdInput] = useState('');
  const [pin, setPin] = useState('');
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSaveIdInput('');
    setPin('');
    setRemember(false);
    setSubmitting(false);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, submitting, onClose]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isValidSaveId(saveIdInput)) {
      setError(t('cloud.errInvalidSaveId'));
      return;
    }
    const trimmedPin = pin.trim();
    if (!isValidSavePin(trimmedPin)) {
      setError(t('save.errInvalidPinFormat'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await openRemoteSave(saveIdInput, trimmedPin, remember);
      if (!res.ok) {
        setError(translateCloudActionError(res, t));
        return;
      }
      if (!res.needsOverwriteConfirm) {
        onSuccess?.();
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cloud-open-dialog-title"
          data-testid="cloud-open-dialog"
          className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md rounded-xl border border-slate-700 bg-[#0D1420] p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-amber-300">
                <CloudDownload className="w-5 h-5 shrink-0" />
                <h3
                  id="cloud-open-dialog-title"
                  className="font-display text-lg font-bold text-slate-50"
                >
                  {t('cloud.openTitle')}
                </h3>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={onClose}
                aria-label={t('common.cancel')}
                className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[13px] text-slate-300 leading-relaxed">
              {t('cloud.openDesc')}
            </p>

            <div className="space-y-3">
              <div className="space-y-1">
                <label
                  htmlFor="cloud-open-save-id"
                  className="block text-[12px] font-medium text-slate-300"
                >
                  {t('cloud.saveIdLabel')}
                </label>
                <input
                  id="cloud-open-save-id"
                  data-testid="cloud-open-save-id"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={16}
                  autoFocus
                  value={saveIdInput}
                  onChange={(e) => {
                    setSaveIdInput(e.target.value);
                    setError(null);
                  }}
                  placeholder={t('cloud.saveIdPlaceholder')}
                  className="w-full min-h-[44px] px-3 rounded-lg border border-slate-700 bg-[#080C14] text-sm font-mono-nums tracking-wider uppercase text-slate-100 placeholder:text-slate-500 placeholder:normal-case placeholder:tracking-normal focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="cloud-open-pin"
                  className="block text-[12px] font-medium text-slate-300"
                >
                  {t('cloud.pinLabel')}
                </label>
                <input
                  id="cloud-open-pin"
                  data-testid="cloud-open-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={8}
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value);
                    setError(null);
                  }}
                  placeholder={t('cloud.pinPlaceholder')}
                  className="w-full min-h-[44px] px-3 rounded-lg border border-slate-700 bg-[#080C14] text-sm font-mono-nums text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              <label className="flex items-center gap-2.5 text-[13px] text-slate-300 cursor-pointer select-none min-h-[36px]">
                <input
                  type="checkbox"
                  data-testid="cloud-open-remember"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-900 accent-amber-400 cursor-pointer"
                />
                <span>{t('cloud.rememberDevice')}</span>
              </label>
            </div>

            {error && (
              <div
                role="alert"
                data-testid="cloud-open-error"
                className="p-2.5 rounded-lg border border-red-500/50 bg-red-500/15 text-[12px] text-red-200 flex items-start gap-2"
              >
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={submitting}
                data-testid="cloud-open-cancel-btn"
                onClick={onClose}
                className="min-h-[44px] px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-[13px] cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                data-testid="cloud-open-submit-btn"
                className="min-h-[44px] px-3 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-[13px] cursor-pointer whitespace-nowrap"
              >
                {submitting ? t('cloud.openingBtn') : t('cloud.openSubmitBtn')}
              </button>
            </div>
          </form>
        </div>
      )}

      <CloudOverwriteConfirmDialog
        source="open_remote"
        onConfirmed={onSuccess}
      />
    </>
  );
}

/**
 * Single PIN unlock dialog shown after reload when a linked Save ID exists
 * in localStorage without a stored CryptoKey in IndexedDB ("Cần nhập PIN").
 */
export function UnlockCloudPinDialog() {
  const { t } = useI18n();
  const saveId = useCloudSaveStore((s) => s.saveId);
  const credentials = useCloudSaveStore((s) => s.credentials);
  const open = useCloudSaveStore((s) => s.pinUnlockModalOpen);
  const closePinUnlockModal = useCloudSaveStore((s) => s.closePinUnlockModal);
  const unlockWithPin = useCloudSaveStore((s) => s.unlockWithPin);

  const [pin, setPin] = useState('');
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = Boolean(open && saveId && !credentials);

  useEffect(() => {
    if (!visible) return;
    setPin('');
    setRemember(false);
    setSubmitting(false);
    setError(null);
  }, [visible, saveId]);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        e.stopPropagation();
        closePinUnlockModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, submitting, closePinUnlockModal]);

  if (!visible || !saveId) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedPin = pin.trim();
    if (!isValidSavePin(trimmedPin)) {
      setError(t('save.errInvalidPinFormat'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await unlockWithPin(trimmedPin, remember);
      if (!res.ok) {
        setError(translateCloudActionError(res, t));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloud-unlock-dialog-title"
      data-testid="cloud-unlock-pin-dialog"
      className="fixed inset-0 z-[75] bg-black/80 flex items-center justify-center p-4"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-amber-500/45 bg-[#0D1420] p-5 space-y-4 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-amber-300">
            <KeyRound className="w-5 h-5 shrink-0" />
            <h3
              id="cloud-unlock-dialog-title"
              className="font-display text-lg font-bold text-slate-50"
            >
              {t('cloud.unlockTitle')}
            </h3>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={closePinUnlockModal}
            aria-label={t('common.cancel')}
            className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[13px] text-slate-300 leading-relaxed">
          {t('cloud.unlockDesc')}
        </p>

        <div className="p-2.5 rounded-lg border border-slate-800 bg-[#080C14] flex items-center justify-between text-[12px]">
          <span className="text-slate-400">{t('cloud.saveIdLabel')}</span>
          <span
            data-testid="cloud-unlock-save-id"
            className="font-mono-nums font-bold tracking-wider text-sky-300"
          >
            {saveId}
          </span>
        </div>

        <div className="space-y-2.5">
          <div className="space-y-1">
            <label
              htmlFor="cloud-unlock-pin-input"
              className="block text-[12px] font-medium text-slate-300"
            >
              {t('cloud.pinLabel')}
            </label>
            <input
              id="cloud-unlock-pin-input"
              data-testid="cloud-unlock-pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              autoFocus
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setError(null);
              }}
              placeholder={t('cloud.pinPlaceholder')}
              className="w-full min-h-[44px] px-3 rounded-lg border border-slate-700 bg-[#080C14] text-sm font-mono-nums text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          <label className="flex items-center gap-2.5 text-[13px] text-slate-300 cursor-pointer select-none min-h-[36px]">
            <input
              type="checkbox"
              data-testid="cloud-unlock-remember"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-900 accent-amber-400 cursor-pointer"
            />
            <span>{t('cloud.rememberDevice')}</span>
          </label>
        </div>

        {error && (
          <div
            role="alert"
            data-testid="cloud-unlock-error"
            className="p-2.5 rounded-lg border border-red-500/50 bg-red-500/15 text-[12px] text-red-200 flex items-start gap-2"
          >
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={submitting}
            data-testid="cloud-unlock-cancel-btn"
            onClick={closePinUnlockModal}
            className="min-h-[44px] px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-[13px] cursor-pointer"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            data-testid="cloud-unlock-submit-btn"
            className="min-h-[44px] px-3 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-[13px] cursor-pointer whitespace-nowrap"
          >
            {submitting ? t('cloud.unlockingBtn') : t('cloud.unlockSubmitBtn')}
          </button>
        </div>
      </form>
    </div>
  );
}

export function CloudConflictDialog() {
  const { lang, t } = useI18n();
  const conflict = useCloudSaveStore((s) => s.conflict);
  const open = useCloudSaveStore((s) => s.conflictModalOpen);
  const closeConflictModal = useCloudSaveStore((s) => s.closeConflictModal);
  const resolveConflictKeepLocal = useCloudSaveStore(
    (s) => s.resolveConflictKeepLocal
  );
  const resolveConflictUseCloud = useCloudSaveStore(
    (s) => s.resolveConflictUseCloud
  );

  const screen = useGameStore((s) => s.screen);
  const battle = useGameStore((s) => s.battle);
  const battleActive = isBattleActive({ screen, battle });

  const [busy, setBusy] = useState<'local' | 'cloud' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBusy(null);
    setError(null);
  }, [open, conflict]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation();
        closeConflictModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, closeConflictModal]);

  const handleKeepLocal = async () => {
    setError(null);
    setBusy('local');
    try {
      const res = await resolveConflictKeepLocal();
      if (!res.ok) {
        setError(translateCloudActionError(res, t));
      }
    } finally {
      setBusy(null);
    }
  };

  const handleUseCloud = async () => {
    setError(null);
    setBusy('cloud');
    try {
      const res = await resolveConflictUseCloud();
      if (!res.ok) {
        setError(translateCloudActionError(res, t));
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {open && conflict && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cloud-conflict-dialog-title"
          data-testid="cloud-conflict-dialog"
          className="fixed inset-0 z-[75] bg-black/80 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-amber-500/45 bg-[#0D1420] p-5 space-y-4 shadow-2xl max-h-[90dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-amber-300">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3
                  id="cloud-conflict-dialog-title"
                  className="font-display text-lg font-bold text-slate-50"
                >
                  {t('cloud.conflictTitle')}
                </h3>
              </div>
              <button
                type="button"
                disabled={busy !== null}
                onClick={closeConflictModal}
                aria-label={t('common.cancel')}
                className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[13px] text-slate-300 leading-relaxed">
              {t('cloud.conflictDesc')}
            </p>

            {/* Side-by-side Local vs Cloud comparison */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Local version */}
              <div
                data-testid="cloud-conflict-local-card"
                className="p-3.5 rounded-lg border border-slate-700 bg-[#080C14] space-y-2.5"
              >
                <div className="flex items-center gap-2 text-[13px] font-bold text-slate-100">
                  <HardDrive className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>{t('cloud.localVersionLabel')}</span>
                </div>
                <div className="text-[12px] text-slate-400">
                  {t('cloud.updatedAtLabel')}:{' '}
                  <span
                    data-testid="cloud-conflict-local-time"
                    className="font-mono-nums text-slate-200"
                  >
                    {formatCloudDateTime(conflict.localUpdatedAt, lang)}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-800 space-y-1.5 text-[12px]">
                  <div className="font-semibold text-slate-100 truncate">
                    {conflict.localSummary.pilotName} ·{' '}
                    {getClassName(lang, conflict.localSummary.activeGearId)}
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">{t('cloud.levelLabel')}</span>
                    <span className="font-mono-nums font-semibold text-amber-300">
                      Lv.{conflict.localSummary.activeGearLevel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">{t('cloud.creditsLabel')}</span>
                    <span className="font-mono-nums font-semibold text-slate-100">
                      {conflict.localSummary.credits.toLocaleString()} CR
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">{t('cloud.gearsLabel')}</span>
                    <span className="font-mono-nums font-semibold text-slate-100">
                      {conflict.localSummary.ownedGearsCount}/4 Gear
                    </span>
                  </div>
                </div>
              </div>

              {/* Cloud version */}
              <div
                data-testid="cloud-conflict-remote-card"
                className="p-3.5 rounded-lg border border-amber-500/35 bg-[#080C14] space-y-2.5"
              >
                <div className="flex items-center gap-2 text-[13px] font-bold text-slate-100">
                  <Cloud className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{t('cloud.cloudVersionLabel')}</span>
                </div>
                <div className="text-[12px] text-slate-400">
                  {t('cloud.updatedAtLabel')}:{' '}
                  <span
                    data-testid="cloud-conflict-remote-time"
                    className="font-mono-nums text-slate-200"
                  >
                    {formatCloudDateTime(conflict.remoteUpdatedAt, lang)}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-800 space-y-1.5 text-[12px]">
                  {conflict.cloudSummary ? (
                    <>
                      <div className="font-semibold text-slate-100 truncate">
                        {conflict.cloudSummary.pilotName} ·{' '}
                        {getClassName(lang, conflict.cloudSummary.activeGearId)}
                      </div>
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="text-slate-400">
                          {t('cloud.levelLabel')}
                        </span>
                        <span className="font-mono-nums font-semibold text-amber-300">
                          Lv.{conflict.cloudSummary.activeGearLevel}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="text-slate-400">
                          {t('cloud.creditsLabel')}
                        </span>
                        <span className="font-mono-nums font-semibold text-slate-100">
                          {conflict.cloudSummary.credits.toLocaleString()} CR
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="text-slate-400">
                          {t('cloud.gearsLabel')}
                        </span>
                        <span className="font-mono-nums font-semibold text-slate-100">
                          {conflict.cloudSummary.ownedGearsCount}/4 Gear
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-amber-300/90 leading-snug">
                      {t('cloud.cloudPreviewUnavailable', {
                        reason:
                          conflict.cloudLoadError ?? `rev #${conflict.remoteRev}`,
                      })}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {battleActive && (
              <div
                data-testid="cloud-conflict-battle-notice"
                className="p-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 text-[12px] text-amber-200 flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{t('cloud.inBattleLocked')}</span>
              </div>
            )}

            {error && (
              <div
                role="alert"
                data-testid="cloud-conflict-error"
                className="p-2.5 rounded-lg border border-red-500/50 bg-red-500/15 text-[12px] text-red-200 flex items-start gap-2"
              >
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="cloud-conflict-keep-local-btn"
                disabled={busy !== null || battleActive}
                onClick={handleKeepLocal}
                className="min-h-[44px] px-3.5 rounded-lg border border-sky-500/50 bg-sky-500/15 hover:bg-sky-500/25 disabled:opacity-45 disabled:cursor-not-allowed text-sky-200 font-semibold text-[13px] cursor-pointer whitespace-nowrap"
              >
                {busy === 'local'
                  ? t('cloud.resolvingBtn')
                  : battleActive
                    ? `${t('cloud.keepLocalBtn')} (${t('cloud.inBattleLocked')})`
                    : t('cloud.keepLocalBtn')}
              </button>
              <button
                type="button"
                data-testid="cloud-conflict-use-cloud-btn"
                disabled={busy !== null || battleActive}
                onClick={handleUseCloud}
                className="min-h-[44px] px-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-45 disabled:cursor-not-allowed text-slate-950 font-bold text-[13px] cursor-pointer whitespace-nowrap"
              >
                {busy === 'cloud'
                  ? t('cloud.resolvingBtn')
                  : battleActive
                    ? `${t('cloud.useCloudBtn')} (${t('cloud.inBattleLocked')})`
                    : t('cloud.useCloudBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      <CloudOverwriteConfirmDialog source="conflict_use_cloud" />
    </>
  );
}
