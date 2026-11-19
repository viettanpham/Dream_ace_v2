import {
  Map,
  Rocket,
  ShoppingBag,
  Sparkles,
  User,
  Wrench,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { useGameStore } from '../store/useGameStore';
import type { BaseTab } from '../types/game';

const SIDEBAR_ITEMS: Array<{
  id: BaseTab;
  labelKey:
    | 'sidebar.gear'
    | 'sidebar.pilot'
    | 'sidebar.skill'
    | 'sidebar.shop'
    | 'sidebar.map';
  icon: typeof Wrench;
}> = [
  { id: 'gear', labelKey: 'sidebar.gear', icon: Wrench },
  { id: 'pilot', labelKey: 'sidebar.pilot', icon: User },
  { id: 'skill', labelKey: 'sidebar.skill', icon: Sparkles },
  { id: 'shop', labelKey: 'sidebar.shop', icon: ShoppingBag },
  { id: 'map', labelKey: 'sidebar.map', icon: Map },
];

export function SidebarNav() {
  const { t } = useI18n();
  const activeTab = useGameStore((s) => s.activeTab);
  const unspentPoints = useGameStore((s) => s.player.unspentPoints);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const startBattle = useGameStore((s) => s.startBattle);

  return (
    <aside className="shrink-0 border-b md:border-b-0 md:border-r border-slate-800/90 bg-[#090D15]/95 md:w-44 flex md:flex-col justify-between gap-2 p-2 md:p-3 overflow-x-auto md:overflow-visible">
      <nav
        className="flex md:flex-col gap-1.5 min-w-max md:min-w-0"
        aria-label="Base navigation"
      >
        {SIDEBAR_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`h-10 md:h-11 px-3 rounded border text-left text-sm font-medium transition-colors cursor-pointer flex items-center justify-between gap-2 whitespace-nowrap ${
                isActive
                  ? 'bg-slate-800/95 border-amber-400/75 text-slate-50 font-semibold'
                  : 'bg-transparent border-transparent text-slate-400 hover:bg-slate-900/80 hover:text-slate-100'
              }`}
            >
              <span className="inline-flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-amber-400' : 'text-slate-500'
                  }`}
                />
                <span>{t(item.labelKey)}</span>
              </span>

              {item.id === 'pilot' && unspentPoints > 0 && (
                <span className="font-mono-nums text-[11px] font-bold text-emerald-400">
                  +{unspentPoints}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Quick Sortie Launch CTA at bottom of sidebar */}
      <div className="shrink-0 md:pt-3 md:border-t md:border-slate-800/80 flex items-center">
        <button
          type="button"
          onClick={() => startBattle()}
          className="h-10 md:h-11 w-full px-3.5 inline-flex items-center justify-center gap-2 rounded bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-semibold text-xs tracking-wide transition-colors cursor-pointer whitespace-nowrap"
        >
          <Rocket className="w-4 h-4 shrink-0" />
          <span>{t('nav.deploy')}</span>
        </button>
      </div>
    </aside>
  );
}
