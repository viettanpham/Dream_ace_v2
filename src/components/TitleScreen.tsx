import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { MECH_CLASSES } from '../data/classes';
import { useGameStore } from '../store/useGameStore';
import { MechSvg } from './MechSvg';

export function TitleScreen() {
  const player = useGameStore((s) => s.player);
  const hasSaveData = useGameStore((s) => s.hasSaveData);
  const muted = useGameStore((s) => s.muted);
  const startCampaign = useGameStore((s) => s.startCampaign);
  const resetCampaign = useGameStore((s) => s.resetCampaign);
  const toggleMute = useGameStore((s) => s.toggleMute);

  const [confirmReset, setConfirmReset] = useState(false);

  const currentClass = MECH_CLASSES[player.classId];

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        startCampaign();
      } else if (e.key.toLowerCase() === 'm') {
        toggleMute();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [startCampaign, toggleMute]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-tactical-grid flex flex-col justify-between">
      {/* Atmospheric Tactical Radar SVG Backdrop */}
      <svg
        viewBox="0 0 1200 720"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35"
        aria-hidden="true"
      >
        <g transform="translate(860, 360)">
          <circle r="140" stroke="#334155" strokeWidth="1" fill="none" />
          <circle r="240" stroke="#334155" strokeWidth="1" strokeDasharray="6 6" fill="none" />
          <circle r="340" stroke="#1E293B" strokeWidth="1" fill="none" />
          <line x1="-380" y1="0" x2="380" y2="0" stroke="#1E293B" strokeWidth="1" />
          <line x1="0" y1="-380" x2="0" y2="380" stroke="#1E293B" strokeWidth="1" />
          <g className="anim-radar">
            <path
              d="M0 0 L340 0 A340 340 0 0 0 294 -170 Z"
              fill="url(#radarGrad)"
            />
          </g>
        </g>
        <defs>
          <linearGradient id="radarGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      {/* Top Audio Control */}
      <div className="relative z-10 flex items-center justify-end px-6 pt-5">
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          className="h-10 px-3.5 inline-flex items-center gap-2 rounded border border-slate-800 bg-[#0E1520]/90 hover:bg-slate-800 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          <span>{muted ? 'Audio Muted' : 'Audio On'}</span>
        </button>
      </div>

      {/* Center Split Composition */}
      <main className="relative z-10 mx-auto w-full max-w-6xl px-6 sm:px-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        {/* Left: Title Lockup & Actions */}
        <div className="lg:col-span-7 space-y-6">
          {/* Bespoke SVG Title Lockup */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs font-medium tracking-[0.2em] text-amber-400 uppercase">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <polygon
                  points="10,1 19,6 19,14 10,19 1,14 1,6"
                  stroke="#F59E0B"
                  strokeWidth="1.6"
                />
                <polygon points="10,5 15,10 10,15 5,10" fill="#F59E0B" />
              </svg>
              <span>Tactical Mech RPG</span>
            </div>
            <h1 className="font-display text-6xl sm:text-7xl lg:text-8xl font-bold tracking-tight text-slate-50 leading-[0.92] text-balance">
              STARFRONT
            </h1>
            <p className="max-w-xl text-base text-slate-300 leading-relaxed">
              Tune your combat chassis across six core stats, switch between four specialized mech classes, and command a 4-mech squadron in speed-ordered turn-based combat.
            </p>
          </div>

          {/* Saved Campaign Readout (clean unboxed metadata) */}
          {hasSaveData && (
            <div className="flex flex-wrap items-center gap-2.5 text-sm text-slate-300 pt-1">
              <span className="text-slate-400">Saved Pilot:</span>
              <span className="font-semibold text-slate-100">{player.name || 'Vance'}</span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="font-mono-nums text-amber-400">Lv.{player.level}</span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span>{currentClass.name}</span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="font-mono-nums">{player.credits.toLocaleString()} CR</span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="font-mono-nums">{player.battlesWon} Wins</span>
            </div>
          )}

          {/* Primary Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={startCampaign}
              className="h-12 px-8 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-semibold text-sm tracking-wide rounded transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              {hasSaveData ? 'Continue Campaign' : 'Start Campaign'}
            </button>

            {hasSaveData && !confirmReset && (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="h-12 px-5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-slate-100 font-medium text-sm rounded transition-colors cursor-pointer whitespace-nowrap"
              >
                New Campaign
              </button>
            )}

            {hasSaveData && confirmReset && (
              <div className="flex items-center gap-2 bg-slate-900 border border-red-500/40 rounded px-3 py-1.5">
                <span className="text-xs text-red-300">Erase local save?</span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmReset(false);
                    resetCampaign();
                  }}
                  className="h-8 px-3 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded cursor-pointer whitespace-nowrap"
                >
                  Confirm Reset
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="h-8 px-2.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Hero Mech Centerpiece */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center">
          <div className="relative flex flex-col items-center justify-center p-6">
            <div className="absolute inset-0 rounded-full bg-sky-500/5 blur-2xl pointer-events-none" />
            <MechSvg classId={player.classId} side="ally" facing="right" size="lg" />
            <div className="mt-4 text-center space-y-1">
              <div className="font-display text-xl font-semibold tracking-wide text-slate-100">
                {currentClass.chassisCode}
              </div>
              <div className="text-xs text-slate-400">
                {currentClass.name} Class · {currentClass.role}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Flat Control Hint Line */}
      <footer className="relative z-10 px-6 pb-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
        <span>Enter or Space to Launch · 1 Attack · 2 Skill · 3 Defend · Tab Cycle Target · M Mute</span>
        <span className="text-slate-500">Progress saved automatically to localStorage</span>
      </footer>
    </div>
  );
}
