import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Cloud,
  CloudDownload,
  CloudOff,
  CloudUpload,
  Copy,
  KeyRound,
  Loader2,
  ShieldAlert,
  Unlink,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { useCloudSaveStore } from '../store/useCloudSaveStore';
import { isBattleActive, useGameStore } from '../store/useGameStore';
import {
  CloudOverwriteConfirmDialog,
  copyTextToClipboard,
  CreateCloudSaveDialog,
  formatCloudTimeShort,
  OpenRemoteSaveDialog,
  translateCloudActionError,
} from './CloudSaveDialogs';

export function CloudSaveSection() {
  const { t } = useI18n();
  const screen = useGameStore((s) => s.screen);
  const battle = useGameStore((s) => s.battle);
  const battleActive = isBattleActive({ screen, battle });

  const saveId = useCloudSaveStore((s) => s.saveId);
  const credentials = useCloudSaveStore((s) => s.credentials);
  const status = useCloudSaveStore((s) => s.status);
  const lastSyncedAt = useCloudSaveStore((s) => s.lastSyncedAt);
  const rememberOnDevice = useCloudSaveStore((s) => s.rememberOnDevice);
  const isConfigured = useCloudSaveStore((s) => s.isConfigured);
  const syncNow = useCloudSaveStore((s) => s.syncNow);
  const downloadLinkedSave = useCloudSaveStore((s) => s.downloadLinkedSave);
  const disconnectCloud = useCloudSaveStore((s) => s.disconnectCloud);
  const setRememberOnDevice = useCloudSaveStore((s) => s.setRememberOnDevice);
  const openConflictModal = useCloudSaveStore((s) => s.openConflictModal);
  const openPinUnlockModal = useCloudSaveStore((s) => s.openPinUnlockModal);

  const configured = isConfigured();
  const linked = Boolean(saveId);
  const needsPin = linked && (!credentials || status === 'needs_pin');

  const [createOpen, setCreateOpen] = useState(false);
  const [openRemoteOpen, setOpenRemoteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCopyId = async () => {
    if (!saveId) return;
    const ok = await copyTextToClipboard(saveId);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSyncNow = async () => {
    setFeedback(null);
    setError(null);
    const res = await syncNow();
    if (res.ok) {
      setFeedback(t('cloud.syncSuccess'));
    } else if (!res.conflict && res.errorCode !== 'NEEDS_PIN') {
      setError(translateCloudActionError(res, t));
    }
  };

  const handleDownload = async () => {
    setFeedback(null);
    setError(null);
    setDownloading(true);
    try {
      const res = await downloadLinkedSave();
      if (res.ok) {
        if (!res.needsOverwriteConfirm) {
          setFeedback(t('cloud.downloadSuccess'));
        }
      } else if (res.errorCode !== 'NEEDS_PIN') {
        setError(translateCloudActionError(res, t));
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleDisconnect = async () => {
    setFeedback(null);
    setError(null);
    const res = await disconnectCloud();
    if (res.ok) {
      setFeedback(t('cloud.disconnectedNotice'));
    } else {
      setError(translateCloudActionError(res, t));
    }
  };

  const renderStatusLine = () => {
    if (needsPin) {
      return (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span
            data-testid="cloud-status-text"
            className="inline-flex items-center gap-1.5 text-amber-300 font-semibold"
          >
            <KeyRound className="w-3.5 h-3.5 shrink-0" />
            <span>{t('cloud.statusNeedsPin')}</span>
          </span>
          <button
            type="button"
            data-testid="cloud-enter-pin-btn"
            onClick={() => openPinUnlockModal(null)}
            className="text-[12px] font-semibold text-sky-300 hover:text-sky-200 underline underline-offset-2 cursor-pointer"
          >
            {t('cloud.enterPinBtn')}
          </button>
        </span>
      );
    }
    if (status === 'saving') {
      return (
        <span
          data-testid="cloud-status-text"
          className="inline-flex items-center gap-1.5 text-sky-300 font-medium"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span>{t('cloud.statusSaving')}</span>
        </span>
      );
    }
    if (status === 'offline') {
      return (
        <span
          data-testid="cloud-status-text"
          className="inline-flex items-center gap-1.5 text-amber-300 font-medium"
        >
          <CloudOff className="w-3.5 h-3.5 shrink-0" />
          <span>{t('cloud.statusOfflineHint')}</span>
        </span>
      );
    }
    if (status === 'conflict') {
      return (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span
            data-testid="cloud-status-text"
            className="inline-flex items-center gap-1.5 text-rose-300 font-semibold"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{t('cloud.statusConflict')}</span>
          </span>
          <button
            type="button"
            data-testid="cloud-open-conflict-btn"
            onClick={openConflictModal}
            className="text-[12px] font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-2 cursor-pointer"
          >
            {t('cloud.resolveConflictBtn')}
          </button>
        </span>
      );
    }
    const timeStr = lastSyncedAt ? formatCloudTimeShort(lastSyncedAt) : null;
    return (
      <span
        data-testid="cloud-status-text"
        className="inline-flex items-center gap-1.5 text-emerald-300 font-medium font-mono-nums"
      >
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>
          {timeStr
            ? t('cloud.statusSyncedAt', { time: timeStr })
            : t('cloud.statusSynced')}
        </span>
      </span>
    );
  };

  return (
    <section
      data-testid="cloud-save-section"
      className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/50 space-y-3"
    >
      <div className="space-y-0.5">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-200">
          <Cloud className="w-4 h-4 text-sky-400 shrink-0" />
          <span>{t('cloud.sectionTitle')}</span>
        </div>
        <p className="text-[12px] text-slate-400 leading-relaxed">
          {t('cloud.sectionDesc')}
        </p>
      </div>

      {!linked ? (
        /* Unlinked State */
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="cloud-create-btn"
              disabled={!configured || battleActive}
              onClick={() => {
                setFeedback(null);
                setError(null);
                setCreateOpen(true);
              }}
              className="min-h-[44px] px-3.5 rounded-lg border border-sky-500/50 bg-sky-500/15 hover:bg-sky-500/25 disabled:border-slate-700 disabled:bg-slate-800/70 disabled:text-slate-500 disabled:cursor-not-allowed text-sky-200 text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
            >
              <CloudUpload className="w-4 h-4 shrink-0" />
              <span>{t('cloud.createBtn')}</span>
            </button>

            <button
              type="button"
              data-testid="cloud-open-remote-btn"
              disabled={!configured || battleActive}
              onClick={() => {
                setFeedback(null);
                setError(null);
                setOpenRemoteOpen(true);
              }}
              className="min-h-[44px] px-3.5 rounded-lg border border-amber-500/50 bg-amber-500/15 hover:bg-amber-500/25 disabled:border-slate-700 disabled:bg-slate-800/70 disabled:text-slate-500 disabled:cursor-not-allowed text-amber-200 text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
            >
              <CloudDownload className="w-4 h-4 shrink-0" />
              <span>{t('cloud.openRemoteBtn')}</span>
            </button>
          </div>

          {!configured && (
            <div
              data-testid="cloud-not-configured-notice"
              className="text-[12px] text-slate-400 flex items-center gap-1.5"
            >
              <CloudOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>{t('cloud.notConfigured')}</span>
            </div>
          )}

          {configured && battleActive && (
            <div
              data-testid="cloud-battle-locked-notice"
              className="text-[12px] text-amber-300 flex items-center gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{t('cloud.inBattleLocked')}</span>
            </div>
          )}
        </div>
      ) : (
        /* Linked State */
        <div className="space-y-3">
          {/* Save ID + Copy & Status */}
          <div className="p-3 rounded-lg border border-slate-800 bg-[#080C14] space-y-2 text-[13px]">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex items-center gap-2">
                <span className="text-slate-400 shrink-0">
                  {t('cloud.saveIdLabel')}:
                </span>
                <span
                  data-testid="cloud-linked-save-id"
                  className="font-mono-nums font-bold tracking-wider text-sky-300 truncate select-all"
                >
                  {saveId}
                </span>
              </div>
              <button
                type="button"
                data-testid="cloud-copy-id-btn"
                onClick={handleCopyId}
                className="min-h-[34px] px-2.5 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-[12px] font-medium inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors whitespace-nowrap"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t('cloud.copiedBtn')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t('cloud.copyBtn')}</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="text-slate-400">{t('cloud.statusLabel')}:</span>
              {renderStatusLine()}
            </div>
          </div>

          {/* Primary Sync Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="cloud-sync-now-btn"
              disabled={!configured || battleActive || status === 'saving'}
              onClick={handleSyncNow}
              className="min-h-[44px] px-3.5 rounded-lg border border-sky-500/50 bg-sky-500/15 hover:bg-sky-500/25 disabled:border-slate-700 disabled:bg-slate-800/70 disabled:text-slate-500 disabled:cursor-not-allowed text-sky-200 text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
            >
              <CloudUpload className="w-4 h-4 shrink-0" />
              <span>
                {battleActive ? t('cloud.inBattleLocked') : t('cloud.syncNowBtn')}
              </span>
            </button>

            <button
              type="button"
              data-testid="cloud-download-btn"
              disabled={
                !configured || battleActive || downloading || status === 'saving'
              }
              onClick={handleDownload}
              className="min-h-[44px] px-3.5 rounded-lg border border-amber-500/50 bg-amber-500/15 hover:bg-amber-500/25 disabled:border-slate-700 disabled:bg-slate-800/70 disabled:text-slate-500 disabled:cursor-not-allowed text-amber-200 text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
            >
              <CloudDownload className="w-4 h-4 shrink-0" />
              <span>{t('cloud.downloadBtn')}</span>
            </button>
          </div>

          {/* Disconnect + Remember on Device */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              data-testid="cloud-disconnect-btn"
              disabled={battleActive}
              onClick={handleDisconnect}
              className="min-h-[40px] px-3 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed text-slate-300 hover:text-rose-200 text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
            >
              <Unlink className="w-3.5 h-3.5 shrink-0" />
              <span>{t('cloud.disconnectBtn')}</span>
            </button>

            <label className="inline-flex items-center gap-2 text-[12px] text-slate-300 cursor-pointer select-none min-h-[40px]">
              <input
                type="checkbox"
                data-testid="cloud-remember-checkbox"
                checked={rememberOnDevice}
                disabled={needsPin}
                onChange={(e) => void setRememberOnDevice(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-900 accent-sky-400 cursor-pointer disabled:opacity-50"
              />
              <span>{t('cloud.rememberDevice')}</span>
            </label>
          </div>

          {battleActive && (
            <div
              data-testid="cloud-battle-locked-notice"
              className="p-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 text-[12px] text-amber-200 flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{t('cloud.inBattleLocked')}</span>
            </div>
          )}

          <p className="text-[11px] text-slate-400 leading-snug">
            {t('cloud.autosaveNote')}
          </p>
        </div>
      )}

      {error && (
        <div
          role="alert"
          data-testid="cloud-section-error"
          className="p-2.5 rounded-lg border border-red-500/50 bg-red-500/15 text-[12px] text-red-200 flex items-start gap-2"
        >
          <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {feedback && (
        <div
          role="status"
          data-testid="cloud-section-feedback"
          className="p-2.5 rounded-lg border border-emerald-500/45 bg-emerald-500/15 text-[12px] text-emerald-200 flex items-start gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>{feedback}</span>
        </div>
      )}

      <CreateCloudSaveDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      <OpenRemoteSaveDialog
        open={openRemoteOpen}
        onClose={() => setOpenRemoteOpen(false)}
        onSuccess={() => setFeedback(t('cloud.downloadSuccess'))}
      />
      <CloudOverwriteConfirmDialog
        source="download_linked"
        onConfirmed={() => setFeedback(t('cloud.downloadSuccess'))}
      />
    </section>
  );
}
