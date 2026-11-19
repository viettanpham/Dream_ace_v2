import { Volume2, VolumeX } from 'lucide-react';
import { MECH_CLASSES } from '../data/classes';
import { getExpForNextLevel } from '../engine/stats';
import { useGameStore } from '../store/useGameStore';

export function TopHud() {
  const screen = useGameStore((s) => s.screen);
  const player = useGameStore((s) => s.player);
  const muted = useGameStore((s) => s.muted);
  const setScreen = useGameStore((s) => s.setScreen);
  const startBattle = useGameStore((s) => s.startBattle);
  const returnToHangar = useGameStore((s) => s.returnToHangar);
  const toggleMute = useGameStore((s) => s.toggleMute);

  const expNeeded = getExpForNextLevel(player.level);
  const expPct = Math.min(100, Math.round((player.exp / expNeeded) * 100));
  const currentClass = MECH_CLASSES[player.classId];

  return (
    <header className="h-14 shrink-0 border-b border-slate-800/90 bg-[#0B1018]/95 px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Zone 1: Brand Title */}
      <button
        type="button"
        onClick={() => setScreen('TITLE')}
        className="font-display text-xl font-bold tracking-wider text-slate-100 hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
      >
        STARFRONT
      </button>

      {/* Zone 2: Pilot Readout */}
      <div className="hidden md:flex items-center gap-6 text-xs text-slate-300">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="text-slate-400">Pilot</span>
          <span className="font-semibold text-slate-100">{player.name || 'Vance'}</span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="text-slate-300">{currentClass.name}</span>
        </div>

        <div className="flex items-center gap-2.5 whitespace-nowrap">
          <span className="font-mono-nums font-semibold text-amber-400">
            Lv.{player.level}
          </span>
          <div className="w-24 h-1.5 bg-slate-800 rounded-sm overflow-hidden">
            <div
              className="h-full bg-amber-400 meter-fill"
              style={{ transform: `scaleX(${expPct / 100})` }}
            />
          </div>
          <span className="font-mono-nums text-slate-400">
            {player.exp}/{expNeeded} EXP
          </span>
        </div>

        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-slate-400">Credits</span>
          <span className="font-mono-nums font-semibold text-slate-100">
            {player.credits.toLocaleString()} CR
          </span>
        </div>

        {player.unspentPoints > 0 && (
          <span className="font-mono-nums font-semibold text-emerald-400 whitespace-nowrap">
            +{player.unspentPoints} Stat Pts
          </span>
        )}
      </div>

      {/* Zone 3: Navigation & Primary Mode Action + Audio */}
      <div className="flex items-center gap-2 shrink-0">
        {screen !== 'BATTLE' && (
          <nav className="flex items-center gap-1 mr-1" aria-label="Base sections">
            <button
              type="button"
              onClick={() => setScreen('HANGAR')}
              className={`h-9 px-3 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                screen === 'HANGAR'
                  ? 'bg-slate-800 text-slate-50 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Hangar
            </button>
            <button
              type="button"
              onClick={() => setScreen('SHOP')}
              className={`h-9 px-3 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                screen === 'SHOP'
                  ? 'bg-slate-800 text-slate-50 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Shop
            </button>
          </nav>
        )}

        {(screen === 'HANGAR' || screen === 'SHOP') && (
          <button
            type="button"
            onClick={() => startBattle()}
            className="h-9 px-4 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-semibold text-xs tracking-wide rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            Deploy to Battle
          </button>
        )}
        {screen === 'BATTLE' && (
          <button
            type="button"
            onClick={returnToHangar}
            className="h-9 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-medium text-xs rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            Return to Hangar
          </button>
        )}
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
          title={muted ? 'Unmute sound effects (M)' : 'Mute sound effects (M)'}
          className="h-9 w-9 flex items-center justify-center rounded border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-slate-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}
