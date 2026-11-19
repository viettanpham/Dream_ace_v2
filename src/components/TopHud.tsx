import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Home,
  LayoutGrid,
  Radar,
  Rocket,
  Settings,
  Sliders,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { isAnyCheatActive } from '../engine/inventory';
import { getExpForNextLevel } from '../engine/stats';
import { getClassName, useI18n } from '../i18n';
import { ENABLE_ADMIN_CP, useGameStore } from '../store/useGameStore';
import { BottomSheet } from './BottomSheet';
import { LanguageToggle } from './LanguageToggle';
import { StatBar } from './StatBar';

export function TopHud() {
  const { lang, t } = useI18n();
  const screen = useGameStore((s) => s.screen);
  const pilot = useGameStore((s) => s.pilot);
  const muted = useGameStore((s) => s.muted);
  const battleViewMode = useGameStore((s) => s.battleViewMode);
  const adminUnlocked = useGameStore((s) => s.adminUnlocked);
  const adminConfig = useGameStore((s) => s.adminConfig);
  const setScreen = useGameStore((s) => s.setScreen);
  const returnToHangar = useGameStore((s) => s.returnToHangar);
  const toggleMute = useGameStore((s) => s.toggleMute);
  const startBattle = useGameStore((s) => s.startBattle);
  const setBattleViewMode = useGameStore((s) => s.setBattleViewMode);
  const toggleAdminPanel = useGameStore((s) => s.toggleAdminPanel);
  const unlockAdminMode = useGameStore((s) => s.unlockAdminMode);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const tapCountRef = useRef(0);
  const lastTapRef = useRef(0);
  const titleNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (titleNavTimerRef.current) {
        clearTimeout(titleNavTimerRef.current);
      }
    };
  }, []);

  const handleBrandTap = () => {
    if (titleNavTimerRef.current) {
      clearTimeout(titleNavTimerRef.current);
      titleNavTimerRef.current = null;
    }

    if (!ENABLE_ADMIN_CP) {
      setScreen('TITLE');
      return;
    }

    const now = Date.now();
    if (now - lastTapRef.current > 2500) {
      tapCountRef.current = 0;
    }
    lastTapRef.current = now;
    tapCountRef.current += 1;

    if (tapCountRef.current >= 7) {
      tapCountRef.current = 0;
      unlockAdminMode(true);
      return;
    }

    // Single tap navigates to Title screen after a short multi-tap window;
    // rapid 7-taps cancel navigation so Admin unlocks in place.
    if (tapCountRef.current === 1) {
      titleNavTimerRef.current = setTimeout(() => {
        titleNavTimerRef.current = null;
        if (tapCountRef.current === 1) {
          tapCountRef.current = 0;
          setScreen('TITLE');
        }
      }, 320);
    }
  };

  const activeGear = pilot.gears[pilot.activeGearId];
  const expNeeded = getExpForNextLevel(activeGear.level);
  const cheatsActive = isAnyCheatActive(adminConfig);
  const showAdminBtn = ENABLE_ADMIN_CP && adminUnlocked;
  const effectiveDefaultMode =
    battleViewMode ??
    (typeof window !== 'undefined' && window.innerWidth < 768
      ? 'radar'
      : 'card');

  return (
    <>
      <header className="min-h-[52px] md:h-14 pt-safe shrink-0 border-b border-slate-800/90 bg-[#0A0F18]/95 px-2.5 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Brand Wordmark (Desktop & Mobile — 7-tap unlocks Admin CP) + Mobile Pilot+Gear */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            data-testid="tophud-brand-logo"
            onClick={handleBrandTap}
            className="inline-flex items-center min-h-[40px] md:min-h-0 font-display text-sm sm:text-lg md:text-2xl font-bold tracking-[0.08em] md:tracking-[0.12em] text-slate-50 hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
          >
            {t('app.title')}
          </button>

          {/* Mobile compact Pilot + Gear Lv */}
          <div className="flex md:hidden items-center gap-1 min-w-0 text-left">
            <span className="font-semibold text-xs text-slate-200 truncate max-w-[54px]">
              {pilot.name || 'Vance'}
            </span>
            <span className="font-mono-nums text-[11px] font-bold text-amber-400 whitespace-nowrap">
              {getClassName(lang, activeGear.classId).slice(0, 3).toUpperCase()}{' '}
              {t('common.levelShort')}
              {activeGear.level}
            </span>
          </div>

          {cheatsActive && (
            <button
              type="button"
              onClick={() => ENABLE_ADMIN_CP && toggleAdminPanel()}
              data-testid="cheats-active-badge"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-rose-500/70 bg-rose-500/20 text-[11px] font-bold text-rose-200 whitespace-nowrap shrink-0 cursor-pointer"
              title={t('admin.cheatsActiveBadge')}
            >
              <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
              <span className="hidden sm:inline">{t('admin.cheatsActiveBadge')}</span>
              <span className="sm:hidden">CHEAT</span>
            </button>
          )}
        </div>

        {/* Center: Desktop full info / Mobile Credits */}
        <div className="flex items-center gap-2.5 sm:gap-5 text-xs sm:text-sm text-slate-300 min-w-0">
          <div className="hidden md:flex items-center gap-2 whitespace-nowrap min-w-0">
            <span className="text-slate-400">{t('common.pilot')}:</span>
            <span className="font-semibold text-slate-100">
              {pilot.name || 'Vance'}
            </span>
            <span className="font-mono-nums font-semibold text-amber-400">
              [{getClassName(lang, activeGear.classId)} {t('common.levelShort')}
              {activeGear.level}]
            </span>
            <div className="hidden lg:block w-16">
              <StatBar
                value={activeGear.exp}
                max={expNeeded}
                valueText=""
                fillClassName="bg-amber-400"
                trackClassName="bg-slate-800"
                heightClassName="h-1.5"
                showTrail={false}
                title={`${activeGear.exp} / ${expNeeded} EXP`}
              />
            </div>
          </div>

          <div className="flex items-center gap-1 whitespace-nowrap">
            <span className="hidden md:inline text-slate-400">
              {t('common.credits')}
            </span>
            <span className="font-mono-nums text-sm font-semibold text-amber-300">
              {pilot.credits.toLocaleString()}
            </span>
            <span className="text-[11px] text-slate-400">CR</span>
          </div>

          <div
            className="hidden sm:flex items-center gap-1 whitespace-nowrap"
            title={t('common.warPoints')}
          >
            <Award className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="font-mono-nums font-semibold text-purple-300">
              {(pilot.warPoints ?? 0).toLocaleString()}
            </span>
            <span className="text-[11px] text-purple-400/80">
              {t('common.wpShort')}
            </span>
          </div>
        </div>

        {/* Right: Return (when in Battle), VI | EN Toggle, Audio (Desktop) & Settings Menu (Mobile) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {screen === 'BATTLE' && (
            <button
              type="button"
              onClick={returnToHangar}
              className="min-h-[44px] md:min-h-0 md:h-9 px-2.5 sm:px-3.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-medium text-xs rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t('nav.returnHangar')}
            </button>
          )}

          {showAdminBtn && (
            <button
              type="button"
              data-testid="tophud-admin-btn"
              onClick={toggleAdminPanel}
              className="min-h-[40px] md:min-h-0 md:h-9 px-2.5 inline-flex items-center gap-1.5 rounded border border-amber-500/60 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-bold text-xs tracking-wider cursor-pointer shrink-0"
              title={t('admin.title')}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{t('admin.btnLabel')}</span>
            </button>
          )}

          <LanguageToggle />

          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? t('common.unmuteTitle') : t('common.muteTitle')}
            title={muted ? t('common.unmuteTitle') : t('common.muteTitle')}
            className="hidden md:flex h-9 w-9 items-center justify-center rounded border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-slate-100 transition-colors cursor-pointer"
          >
            {muted ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>

          {/* Mobile settings drawer button (>= 44x44px touch target) */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label={t('mobile.settings')}
            className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Mobile Settings & Quick Actions Bottom Sheet */}
      <BottomSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={t('mobile.settingsTitle')}
        subtitle={`${pilot.name || 'Vance'} · ${getClassName(
          lang,
          activeGear.classId
        )} ${t('common.levelShort')}${activeGear.level}`}
      >
        <div className="space-y-4">
          {/* Quick Resource Readout */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/70">
              <div className="text-xs text-slate-400">{t('common.credits')}</div>
              <div className="font-mono-nums text-lg font-bold text-amber-300 mt-0.5">
                {pilot.credits.toLocaleString()} CR
              </div>
            </div>
            <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/70">
              <div className="text-xs text-slate-400">
                {t('common.warPoints')}
              </div>
              <div className="font-mono-nums text-lg font-bold text-purple-300 mt-0.5 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-purple-400" />
                {(pilot.warPoints ?? 0).toLocaleString()} {t('common.wpShort')}
              </div>
            </div>
          </div>

          {/* Primary Sortie Action when in Base */}
          {screen !== 'BATTLE' && (
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                startBattle();
              }}
              className="w-full min-h-[48px] px-4 rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Rocket className="w-4 h-4" />
              <span>{t('nav.deploy')}</span>
            </button>
          )}

          {/* Combat View Preference */}
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('battle.viewModeLabel')}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBattleViewMode('radar')}
                className={`min-h-[44px] px-3 rounded-lg border text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer ${
                  effectiveDefaultMode === 'radar'
                    ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                    : 'border-slate-700 bg-slate-900 text-slate-300'
                }`}
              >
                <Radar className="w-4 h-4" />
                <span>{t('battle.viewRadar')}</span>
              </button>
              <button
                type="button"
                onClick={() => setBattleViewMode('card')}
                className={`min-h-[44px] px-3 rounded-lg border text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer ${
                  effectiveDefaultMode === 'card'
                    ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                    : 'border-slate-700 bg-slate-900 text-slate-300'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                <span>{t('battle.viewCard')}</span>
              </button>
            </div>
          </div>

          {/* Utility Buttons */}
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className="min-h-[44px] px-3.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-200 text-sm font-medium flex items-center justify-between cursor-pointer"
            >
              <span className="inline-flex items-center gap-2.5">
                {muted ? (
                  <VolumeX className="w-4 h-4 text-slate-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                )}
                <span>
                  {muted ? t('common.audioMuted') : t('common.audioOn')}
                </span>
              </span>
            </button>

            {ENABLE_ADMIN_CP && adminUnlocked && (
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(false);
                  toggleAdminPanel();
                }}
                className="min-h-[44px] px-3.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 text-sm font-semibold flex items-center gap-2.5 cursor-pointer"
              >
                <Sliders className="w-4 h-4 text-amber-400" />
                <span>{t('admin.title')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                setScreen('TITLE');
              }}
              className="min-h-[44px] px-3.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm font-medium flex items-center gap-2.5 cursor-pointer"
            >
              <Home className="w-4 h-4 text-slate-400" />
              <span>{t('app.title')}</span>
            </button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
