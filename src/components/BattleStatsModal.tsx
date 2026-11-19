import { useMemo, useState } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Flame,
  Heart,
  Shield,
  Sparkles,
  Swords,
  Users,
  X,
} from 'lucide-react';
import { aggregateBattleStats } from '../engine/battleStats';
import { getClassName, getStatsSkillLabel, useI18n } from '../i18n';
import type {
  BattleState,
  MechClassId,
  UnitBattleStats,
} from '../types/game';

interface BattleStatsModalProps {
  open: boolean;
  onClose: () => void;
  battle: BattleState;
  enrageBonusPct: number;
}

type StatsTab = 'overview' | 'units' | 'charts';
type SortColumn =
  | 'damageDealt'
  | 'damageTakenTotal'
  | 'healingDone'
  | 'shieldGranted'
  | 'critRate'
  | 'dodges'
  | 'kills'
  | 'spSpent'
  | 'damagePerTurn';
type BarMetric = 'damageDealt' | 'damageTakenTotal' | 'healingDone';

function getUnitAccentHex(u: UnitBattleStats): string {
  if (u.isPlayer) return '#22C55E';
  if (u.side === 'ally') return '#38BDF8';
  if (u.isBoss) return '#F97316';
  return '#EF4444';
}

function getClassBadgeSymbol(classId: MechClassId): string {
  switch (classId) {
    case 'striker':
      return '▲';
    case 'interceptor':
      return '◆';
    case 'siege':
      return '■';
    case 'support':
      return '✚';
  }
}

const DONUT_COLORS = [
  '#38BDF8',
  '#F59E0B',
  '#10B981',
  '#A855F7',
  '#EC4899',
  '#F97316',
  '#22D3EE',
];

export function BattleStatsModal({
  open,
  onClose,
  battle,
  enrageBonusPct,
}: BattleStatsModalProps) {
  const { lang, t } = useI18n();
  const [activeTab, setActiveTab] = useState<StatsTab>('overview');
  const [sortCol, setSortCol] = useState<SortColumn>('damageDealt');
  const [sortDesc, setSortDesc] = useState(true);
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null);
  const [barMetric, setBarMetric] = useState<BarMetric>('damageDealt');
  const [donutUnitId, setDonutUnitId] = useState<string>(() => {
    const player = battle.units.find((u) => u.isPlayer);
    return player?.id ?? battle.units[0]?.id ?? '';
  });
  const [tooltipInfo, setTooltipInfo] = useState<string | null>(null);

  const stats = useMemo(
    () =>
      aggregateBattleStats(
        battle.units,
        battle.events ?? [],
        battle.roundSnapshots ?? [],
        battle.round
      ),
    [battle.units, battle.events, battle.roundSnapshots, battle.round]
  );

  const unitById = useMemo(
    () => new Map(stats.units.map((u) => [u.unitId, u])),
    [stats.units]
  );

  const sortedUnits = useMemo(() => {
    return [...stats.units].sort((a, b) => {
      const diff = (a[sortCol] ?? 0) - (b[sortCol] ?? 0);
      if (diff !== 0) return sortDesc ? -diff : diff;
      return a.name.localeCompare(b.name);
    });
  }, [stats.units, sortCol, sortDesc]);

  const effectiveDonutUnit =
    unitById.get(donutUnitId) ??
    stats.units.find((u) => u.isPlayer) ??
    stats.units[0] ??
    null;

  if (!open) return null;

  const toggleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDesc((prev) => !prev);
    } else {
      setSortCol(col);
      setSortDesc(true);
    }
  };

  const enragePct = Math.round(enrageBonusPct * 100);
  const enrageMult = (1 + enrageBonusPct).toFixed(1);

  const totalRemainingHp = Math.max(
    1,
    stats.ally.remainingHp + stats.enemy.remainingHp
  );
  const allyMomentumPct = Math.round(
    (stats.ally.remainingHp / totalRemainingHp) * 100
  );
  const enemyMomentumPct = 100 - allyMomentumPct;

  // Chart (a): Horizontal Bar Chart sorted by selected metric
  const barUnits = [...stats.units].sort((a, b) => b[barMetric] - a[barMetric]);
  const barMax = Math.max(1, ...barUnits.map((u) => u[barMetric]));

  // Chart (b): Cumulative Damage Line Chart
  const dmgSeries = stats.roundDamageSeries;
  const maxCumDmg = Math.max(
    10,
    ...dmgSeries.map((p) =>
      Math.max(p.allyCumulativeDamage, p.enemyCumulativeDamage)
    )
  );

  // Chart (c): Team HP% per Round Line Chart
  const hpSeries = stats.roundHpSeries;

  // Chart (d): Donut Chart of Damage by Skill for Selected Unit
  const donutSlices = useMemo(() => {
    if (!effectiveDonutUnit) return [];
    const entries = Object.values(effectiveDonutUnit.skills)
      .filter((sk) => sk.damage > 0)
      .sort((a, b) => b.damage - a.damage);
    const total = entries.reduce((sum, e) => sum + e.damage, 0);
    if (total <= 0) return [];
    let running = 0;
    return entries.map((e, idx) => {
      const pct = e.damage / total;
      const start = running;
      running += pct;
      return {
        skillId: e.skillId,
        label: getStatsSkillLabel(lang, e.skillId),
        damage: e.damage,
        uses: e.uses,
        pct,
        start,
        color: DONUT_COLORS[idx % DONUT_COLORS.length],
      };
    });
  }, [effectiveDonutUnit, lang]);

  const renderLinePoints = (
    count: number,
    valueAt: (i: number) => number,
    maxVal: number,
    w: number,
    h: number,
    padX: number,
    padY: number
  ) => {
    const innerW = w - padX * 2;
    const innerH = h - padY * 2;
    return Array.from({ length: count }, (_, i) => {
      const x =
        count <= 1 ? padX + innerW / 2 : padX + (i / (count - 1)) * innerW;
      const y = padY + innerH - (Math.min(maxVal, valueAt(i)) / maxVal) * innerH;
      return { x, y };
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end md:items-center justify-center md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="battle-stats-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full md:max-w-5xl h-[92dvh] md:h-[88dvh] rounded-t-2xl md:rounded-xl border border-slate-700/90 bg-[#0B111C] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-slate-800 bg-[#090E17] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BarChart3 className="w-5 h-5 text-sky-400 shrink-0" />
            <div className="min-w-0">
              <h2
                id="battle-stats-modal-title"
                className="font-display text-xl sm:text-2xl font-bold text-slate-100 leading-tight truncate"
              >
                {t('stats.title')}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono-nums text-slate-400">
                <span>
                  {t('stats.roundsLabel')}: <strong className="text-slate-100">{stats.rounds}</strong>
                </span>
                <span>·</span>
                {enragePct > 0 ? (
                  <span className="text-orange-300 font-semibold inline-flex items-center gap-1">
                    <Flame className="w-3 h-3 text-red-400" />
                    {t('stats.enrageActive', { pct: enragePct, mult: enrageMult })}
                  </span>
                ) : (
                  <span>{t('stats.enrageInactive')}</span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="min-w-[44px] min-h-[44px] rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white inline-flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Bar: Overview | Units | Charts */}
        <div className="shrink-0 px-4 sm:px-6 pt-2.5 pb-2 border-b border-slate-800 bg-[#0A101A] flex items-center gap-2">
          {(
            [
              { id: 'overview', label: t('stats.tabOverview'), Icon: Activity },
              { id: 'units', label: t('stats.tabUnits'), Icon: Users },
              { id: 'charts', label: t('stats.tabCharts'), Icon: BarChart3 },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`min-h-[40px] px-3.5 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  active
                    ? 'bg-sky-500 text-slate-950'
                    : 'bg-slate-900 text-slate-300 border border-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5 tactical-scroll">
          {activeTab === 'overview' && (
            <>
              {/* Battle Momentum Bar */}
              <div className="rounded-lg border border-slate-800 bg-[#0D1523] p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-sky-300">
                    {t('stats.teamAlly')} ({stats.ally.remainingHp.toLocaleString()} /{' '}
                    {stats.ally.totalMaxHp.toLocaleString()} HP · {stats.ally.remainingHpPct}%)
                  </span>
                  <span className="text-slate-400 hidden sm:inline">
                    {t('stats.momentumTitle')}
                  </span>
                  <span className="text-red-300">
                    {t('stats.teamEnemy')} ({stats.enemy.remainingHp.toLocaleString()} /{' '}
                    {stats.enemy.totalMaxHp.toLocaleString()} HP · {stats.enemy.remainingHpPct}%)
                  </span>
                </div>
                <div className="h-3.5 rounded-full bg-slate-950 border border-slate-800 overflow-hidden flex">
                  <div
                    style={{ width: `${allyMomentumPct}%` }}
                    className="h-full bg-gradient-to-r from-emerald-500 to-sky-400 transition-all duration-300"
                  />
                  <div
                    style={{ width: `${enemyMomentumPct}%` }}
                    className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-300"
                  />
                </div>
              </div>

              {/* 2-Column Team Totals: Allied Wing vs Hostile Fleet */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    team: stats.ally,
                    title: t('stats.teamAlly'),
                    border: 'border-sky-500/40',
                    accent: 'text-sky-300',
                  },
                  {
                    team: stats.enemy,
                    title: t('stats.teamEnemy'),
                    border: 'border-red-500/40',
                    accent: 'text-red-300',
                  },
                ].map(({ team, title, border, accent }) => (
                  <div
                    key={team.side}
                    className={`rounded-lg border ${border} bg-[#0D1523] p-4 space-y-2`}
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <h3 className={`font-display text-xl font-bold ${accent}`}>
                        {title}
                      </h3>
                      <span className="font-mono-nums text-xs text-slate-300">
                        {team.aliveCount}/{team.totalCount}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">{t('stats.damageDealt')}</span>
                        <span className="font-mono-nums font-bold text-slate-100">
                          {team.damageDealt.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">{t('stats.damageTaken')}</span>
                        <span className="font-mono-nums font-bold text-slate-100">
                          {team.damageTakenTotal.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">{t('stats.hpDamage')}</span>
                        <span className="font-mono-nums text-red-300">
                          {team.damageTakenHp.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">{t('stats.shieldAbsorbed')}</span>
                        <span className="font-mono-nums text-sky-300">
                          {team.shieldAbsorbed.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">{t('stats.healingDone')}</span>
                        <span className="font-mono-nums text-emerald-300">
                          {team.healingDone.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">{t('stats.shieldGranted')}</span>
                        <span className="font-mono-nums text-sky-300">
                          {team.shieldGranted.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">{t('stats.hitsAndCrits')}</span>
                        <span className="font-mono-nums text-amber-300">
                          {team.hits} / {team.crits} ({team.critRate}%)
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">{t('stats.dodges')}</span>
                        <span className="font-mono-nums text-slate-200">{team.dodges}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">{t('stats.killsDeaths')}</span>
                        <span className="font-mono-nums text-slate-200">
                          {team.kills} / {team.deaths}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">{t('stats.spSpent')}</span>
                        <span className="font-mono-nums text-purple-300">
                          {team.spSpent} SP
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">{t('stats.turnsTaken')}</span>
                        <span className="font-mono-nums text-slate-200">
                          {team.turnsTaken}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">{t('stats.buffsDebuffs')}</span>
                        <span className="font-mono-nums text-slate-200">
                          {team.buffsApplied} / {team.debuffsApplied}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* MVP Badges */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                  <Award className="w-4 h-4" />
                  <span>{t('stats.mvpSection')}</span>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    {
                      label: t('stats.mvpDamage'),
                      award: stats.mvps.mostDamage,
                      suffix: ' DMG',
                      Icon: Swords,
                      color: 'text-amber-300 border-amber-500/35',
                    },
                    {
                      label: t('stats.mvpHealing'),
                      award: stats.mvps.mostHealing,
                      suffix: ' HP',
                      Icon: Heart,
                      color: 'text-emerald-300 border-emerald-500/35',
                    },
                    {
                      label: t('stats.mvpTaken'),
                      award: stats.mvps.mostDamageTaken,
                      suffix: ' DMG',
                      Icon: Shield,
                      color: 'text-sky-300 border-sky-500/35',
                    },
                    {
                      label: t('stats.mvpDodges'),
                      award: stats.mvps.mostDodges,
                      suffix: '',
                      Icon: Sparkles,
                      color: 'text-purple-300 border-purple-500/35',
                    },
                  ].map(({ label, award, suffix, Icon, color }) => {
                    const winner = award ? unitById.get(award.unitId) : null;
                    return (
                      <div
                        key={label}
                        className={`rounded-lg border bg-[#0D1523] p-3 space-y-1 ${color}`}
                      >
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{label}</span>
                        </div>
                        {winner && award ? (
                          <>
                            <div className="text-sm font-bold text-slate-100 truncate flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: getUnitAccentHex(winner) }}
                              />
                              <span className="truncate">{winner.name}</span>
                            </div>
                            <div className="font-mono-nums text-xs font-semibold">
                              {award.value.toLocaleString()}
                              {suffix}
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-slate-500">{t('stats.mvpNone')}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {activeTab === 'units' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-400">{t('stats.expandHint')}</div>
              <div className="rounded-lg border border-slate-800 bg-[#0D1523] overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-[#090E17] text-slate-400">
                      <th className="py-2.5 px-3 font-semibold">{t('stats.colUnit')}</th>
                      {(
                        [
                          ['damageDealt', t('stats.colDmg')],
                          ['damageTakenTotal', t('stats.colTaken')],
                          ['healingDone', t('stats.colHeal')],
                          ['shieldGranted', t('stats.colShd')],
                          ['critRate', t('stats.colCrit')],
                          ['dodges', t('stats.colDodge')],
                          ['kills', t('stats.colKills')],
                          ['spSpent', t('stats.colSp')],
                          ['damagePerTurn', t('stats.colDpt')],
                        ] as [SortColumn, string][]
                      ).map(([col, label]) => (
                        <th key={col} className="py-2.5 px-2 font-semibold whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => toggleSort(col)}
                            className={`inline-flex items-center gap-1 cursor-pointer hover:text-white ${
                              sortCol === col ? 'text-sky-300' : ''
                            }`}
                          >
                            <span>{label}</span>
                            {sortCol === col && (
                              <span>{sortDesc ? '↓' : '↑'}</span>
                            )}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {sortedUnits.map((u) => {
                      const isExpanded = expandedUnitId === u.unitId;
                      const accent = getUnitAccentHex(u);
                      const skillList = Object.values(u.skills).sort(
                        (a, b) => b.damage + b.healing - (a.damage + a.healing)
                      );

                      return (
                        <tr
                          key={u.unitId}
                          className="group"
                        >
                          <td colSpan={10} className="p-0">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedUnitId(isExpanded ? null : u.unitId)
                              }
                              className="w-full text-left hover:bg-slate-800/40 transition-colors cursor-pointer"
                            >
                              <div className="grid grid-cols-[minmax(150px,1.8fr)_repeat(9,minmax(54px,1fr))] items-center">
                                <div className="py-2.5 px-3 flex items-center gap-2 min-w-0">
                                  {isExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                  )}
                                  <span
                                    className="text-xs font-bold shrink-0"
                                    style={{ color: accent }}
                                    title={getClassName(lang, u.classId)}
                                  >
                                    {getClassBadgeSymbol(u.classId)}
                                  </span>
                                  <div className="min-w-0">
                                    <div
                                      className={`font-semibold truncate ${
                                        u.alive ? 'text-slate-100' : 'text-slate-500 line-through'
                                      }`}
                                    >
                                      {u.name}
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      {getClassName(lang, u.classId)}
                                    </div>
                                  </div>
                                </div>
                                <div className="py-2.5 px-2 font-mono-nums font-semibold text-amber-300">
                                  {u.damageDealt.toLocaleString()}
                                </div>
                                <div className="py-2.5 px-2 font-mono-nums text-slate-200">
                                  {u.damageTakenTotal.toLocaleString()}
                                </div>
                                <div className="py-2.5 px-2 font-mono-nums text-emerald-300">
                                  {u.healingDone.toLocaleString()}
                                </div>
                                <div className="py-2.5 px-2 font-mono-nums text-sky-300">
                                  {u.shieldGranted.toLocaleString()}
                                </div>
                                <div className="py-2.5 px-2 font-mono-nums text-slate-200">
                                  {u.critRate}%
                                </div>
                                <div className="py-2.5 px-2 font-mono-nums text-slate-200">
                                  {u.dodges}
                                </div>
                                <div className="py-2.5 px-2 font-mono-nums text-slate-200">
                                  {u.kills}/{u.deaths}
                                </div>
                                <div className="py-2.5 px-2 font-mono-nums text-purple-300">
                                  {u.spSpent}
                                </div>
                                <div className="py-2.5 px-2 font-mono-nums text-slate-200">
                                  {u.damagePerTurn}
                                </div>
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="px-4 py-3 bg-[#090F1A] border-t border-slate-800/80 space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                                  <span className="font-semibold text-slate-200">
                                    {t('stats.skillBreakdownTitle')}
                                  </span>
                                  <span className="font-mono-nums">
                                    {t('stats.hpDamage')}: {u.damageTakenHp.toLocaleString()} ·{' '}
                                    {t('stats.shieldAbsorbed')}: {u.damageTakenShield.toLocaleString()} ·{' '}
                                    {t('stats.buffsDebuffs')}: {u.buffsApplied}/{u.debuffsApplied}
                                  </span>
                                </div>
                                {skillList.length === 0 ? (
                                  <div className="text-xs text-slate-500">
                                    {t('stats.noSkillUsage')}
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {skillList.map((sk) => (
                                      <div
                                        key={sk.skillId}
                                        className="rounded border border-slate-800 bg-[#0D1523] px-3 py-2 flex items-center justify-between gap-2"
                                      >
                                        <div className="min-w-0">
                                          <div className="text-xs font-semibold text-slate-100 truncate">
                                            {getStatsSkillLabel(lang, sk.skillId)}
                                          </div>
                                          <div className="text-[10px] text-slate-400">
                                            {t('stats.uses', { count: sk.uses })}
                                            {sk.crits > 0 ? ` · ${sk.crits} CRIT` : ''}
                                          </div>
                                        </div>
                                        <div className="text-right font-mono-nums text-xs shrink-0">
                                          {sk.damage > 0 && (
                                            <div className="text-amber-300 font-semibold">
                                              {sk.damage.toLocaleString()} DMG
                                            </div>
                                          )}
                                          {sk.healing > 0 && (
                                            <div className="text-emerald-300 font-semibold">
                                              +{sk.healing.toLocaleString()} HP
                                            </div>
                                          )}
                                          {sk.shieldGranted > 0 && (
                                            <div className="text-sky-300">
                                              +{sk.shieldGranted.toLocaleString()} SHD
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'charts' && (
            <div className="space-y-5">
              {tooltipInfo && (
                <div className="rounded border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-mono-nums text-sky-200 flex items-center justify-between gap-2">
                  <span>{tooltipInfo}</span>
                  <button
                    type="button"
                    onClick={() => setTooltipInfo(null)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* (a) Horizontal Bar Chart of Units with Metric Toggle */}
              <div className="rounded-lg border border-slate-800 bg-[#0D1523] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-lg font-bold text-slate-100">
                    {t('stats.chartBarTitle')}
                  </h3>
                  <div className="inline-flex rounded border border-slate-700 bg-slate-950 p-0.5">
                    {(
                      [
                        ['damageDealt', t('stats.damageDealt')],
                        ['damageTakenTotal', t('stats.damageTaken')],
                        ['healingDone', t('stats.healingDone')],
                      ] as [BarMetric, string][]
                    ).map(([m, lbl]) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setBarMetric(m)}
                        className={`min-h-[32px] px-2.5 rounded text-xs font-semibold cursor-pointer transition-colors ${
                          barMetric === m
                            ? 'bg-sky-500 text-slate-950'
                            : 'text-slate-400 hover:text-slate-100'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  {barUnits.map((u) => {
                    const val = u[barMetric];
                    const widthPct = Math.max(val > 0 ? 4 : 0, (val / barMax) * 100);
                    const color = getUnitAccentHex(u);
                    return (
                      <button
                        key={`bar-${u.unitId}`}
                        type="button"
                        onClick={() =>
                          setTooltipInfo(
                            `${u.name}: ${val.toLocaleString()} (${getClassName(
                              lang,
                              u.classId
                            )})`
                          )
                        }
                        className="w-full text-left group cursor-pointer"
                      >
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="text-slate-200 font-medium truncate pr-2">
                            <span style={{ color }} className="mr-1.5">
                              {getClassBadgeSymbol(u.classId)}
                            </span>
                            {u.name}
                          </span>
                          <span className="font-mono-nums text-slate-300 font-semibold shrink-0">
                            {val.toLocaleString()}
                          </span>
                        </div>
                        <div className="h-3 rounded bg-slate-950 border border-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded transition-all duration-300 group-hover:brightness-115"
                            style={{ width: `${widthPct}%`, backgroundColor: color }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* (b) Cumulative Damage by Team per Round Line Chart */}
                <div className="rounded-lg border border-slate-800 bg-[#0D1523] p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-lg font-bold text-slate-100">
                      {t('stats.chartCumDmgTitle')}
                    </h3>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="inline-flex items-center gap-1 text-sky-300">
                        <span className="w-2.5 h-0.5 bg-sky-400 inline-block" />
                        {t('stats.teamAlly')}
                      </span>
                      <span className="inline-flex items-center gap-1 text-red-300">
                        <span className="w-2.5 h-0.5 bg-red-400 inline-block" />
                        {t('stats.teamEnemy')}
                      </span>
                    </div>
                  </div>
                  <svg viewBox="0 0 360 180" className="w-full h-44 select-none">
                    {[0, 0.5, 1].map((f) => {
                      const y = 18 + (1 - f) * 130;
                      return (
                        <g key={f}>
                          <line
                            x1="36"
                            y1={y}
                            x2="344"
                            y2={y}
                            stroke="#1E293B"
                            strokeDasharray="3 3"
                          />
                          <text
                            x="30"
                            y={y + 3}
                            textAnchor="end"
                            fill="#64748B"
                            fontSize="9"
                          >
                            {Math.round(maxCumDmg * f)}
                          </text>
                        </g>
                      );
                    })}
                    {(() => {
                      const allyPts = renderLinePoints(
                        dmgSeries.length,
                        (i) => dmgSeries[i].allyCumulativeDamage,
                        maxCumDmg,
                        360,
                        166,
                        36,
                        18
                      );
                      const enemyPts = renderLinePoints(
                        dmgSeries.length,
                        (i) => dmgSeries[i].enemyCumulativeDamage,
                        maxCumDmg,
                        360,
                        166,
                        36,
                        18
                      );
                      return (
                        <>
                          <polyline
                            fill="none"
                            stroke="#38BDF8"
                            strokeWidth="2.4"
                            points={allyPts.map((p) => `${p.x},${p.y}`).join(' ')}
                          />
                          <polyline
                            fill="none"
                            stroke="#EF4444"
                            strokeWidth="2.4"
                            points={enemyPts.map((p) => `${p.x},${p.y}`).join(' ')}
                          />
                          {dmgSeries.map((pt, i) => (
                            <g key={pt.round}>
                              <circle
                                cx={allyPts[i].x}
                                cy={allyPts[i].y}
                                r="4"
                                fill="#38BDF8"
                                className="cursor-pointer"
                                onClick={() =>
                                  setTooltipInfo(
                                    `${t('stats.roundShort', { round: pt.round })} — ${t(
                                      'stats.teamAlly'
                                    )}: ${pt.allyCumulativeDamage.toLocaleString()} | ${t(
                                      'stats.teamEnemy'
                                    )}: ${pt.enemyCumulativeDamage.toLocaleString()}`
                                  )
                                }
                              />
                              <circle
                                cx={enemyPts[i].x}
                                cy={enemyPts[i].y}
                                r="4"
                                fill="#EF4444"
                                className="cursor-pointer"
                                onClick={() =>
                                  setTooltipInfo(
                                    `${t('stats.roundShort', { round: pt.round })} — ${t(
                                      'stats.teamAlly'
                                    )}: ${pt.allyCumulativeDamage.toLocaleString()} | ${t(
                                      'stats.teamEnemy'
                                    )}: ${pt.enemyCumulativeDamage.toLocaleString()}`
                                  )
                                }
                              />
                              {(dmgSeries.length <= 10 ||
                                i === 0 ||
                                i === dmgSeries.length - 1 ||
                                i % Math.ceil(dmgSeries.length / 6) === 0) && (
                                <text
                                  x={allyPts[i].x}
                                  y="174"
                                  textAnchor="middle"
                                  fill="#94A3B8"
                                  fontSize="9"
                                >
                                  R{pt.round}
                                </text>
                              )}
                            </g>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                </div>

                {/* (c) Team Total HP% per Round Line Chart (Battle Momentum) */}
                <div className="rounded-lg border border-slate-800 bg-[#0D1523] p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-lg font-bold text-slate-100">
                      {t('stats.chartHpPctTitle')}
                    </h3>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="inline-flex items-center gap-1 text-emerald-300">
                        <span className="w-2.5 h-0.5 bg-emerald-400 inline-block" />
                        {t('stats.teamAlly')}
                      </span>
                      <span className="inline-flex items-center gap-1 text-orange-300">
                        <span className="w-2.5 h-0.5 bg-orange-400 inline-block" />
                        {t('stats.teamEnemy')}
                      </span>
                    </div>
                  </div>
                  <svg viewBox="0 0 360 180" className="w-full h-44 select-none">
                    {[0, 50, 100].map((pct) => {
                      const y = 18 + (1 - pct / 100) * 130;
                      return (
                        <g key={pct}>
                          <line
                            x1="36"
                            y1={y}
                            x2="344"
                            y2={y}
                            stroke="#1E293B"
                            strokeDasharray="3 3"
                          />
                          <text
                            x="30"
                            y={y + 3}
                            textAnchor="end"
                            fill="#64748B"
                            fontSize="9"
                          >
                            {pct}%
                          </text>
                        </g>
                      );
                    })}
                    {(() => {
                      const allyPts = renderLinePoints(
                        hpSeries.length,
                        (i) => hpSeries[i].allyHpPct,
                        100,
                        360,
                        166,
                        36,
                        18
                      );
                      const enemyPts = renderLinePoints(
                        hpSeries.length,
                        (i) => hpSeries[i].enemyHpPct,
                        100,
                        360,
                        166,
                        36,
                        18
                      );
                      return (
                        <>
                          <polyline
                            fill="none"
                            stroke="#10B981"
                            strokeWidth="2.4"
                            points={allyPts.map((p) => `${p.x},${p.y}`).join(' ')}
                          />
                          <polyline
                            fill="none"
                            stroke="#F97316"
                            strokeWidth="2.4"
                            points={enemyPts.map((p) => `${p.x},${p.y}`).join(' ')}
                          />
                          {hpSeries.map((pt, i) => (
                            <g key={pt.round}>
                              <circle
                                cx={allyPts[i].x}
                                cy={allyPts[i].y}
                                r="4"
                                fill="#10B981"
                                className="cursor-pointer"
                                onClick={() =>
                                  setTooltipInfo(
                                    `${t('stats.roundShort', { round: pt.round })} HP% — ${t(
                                      'stats.teamAlly'
                                    )}: ${pt.allyHpPct}% | ${t('stats.teamEnemy')}: ${
                                      pt.enemyHpPct
                                    }%`
                                  )
                                }
                              />
                              <circle
                                cx={enemyPts[i].x}
                                cy={enemyPts[i].y}
                                r="4"
                                fill="#F97316"
                                className="cursor-pointer"
                                onClick={() =>
                                  setTooltipInfo(
                                    `${t('stats.roundShort', { round: pt.round })} HP% — ${t(
                                      'stats.teamAlly'
                                    )}: ${pt.allyHpPct}% | ${t('stats.teamEnemy')}: ${
                                      pt.enemyHpPct
                                    }%`
                                  )
                                }
                              />
                              {(hpSeries.length <= 10 ||
                                i === 0 ||
                                i === hpSeries.length - 1 ||
                                i % Math.ceil(hpSeries.length / 6) === 0) && (
                                <text
                                  x={allyPts[i].x}
                                  y="174"
                                  textAnchor="middle"
                                  fill="#94A3B8"
                                  fontSize="9"
                                >
                                  R{pt.round}
                                </text>
                              )}
                            </g>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              </div>

              {/* (d) Donut Chart of Damage by Skill for Selectable Unit */}
              <div className="rounded-lg border border-slate-800 bg-[#0D1523] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-lg font-bold text-slate-100">
                    {t('stats.chartDonutTitle')}
                  </h3>
                  <select
                    value={effectiveDonutUnit?.unitId ?? ''}
                    onChange={(e) => setDonutUnitId(e.target.value)}
                    aria-label={t('stats.selectUnit')}
                    className="min-h-[38px] rounded border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 cursor-pointer"
                  >
                    {stats.units.map((u) => (
                      <option key={u.unitId} value={u.unitId} className="bg-slate-900">
                        {u.name} ({u.damageDealt.toLocaleString()} DMG)
                      </option>
                    ))}
                  </select>
                </div>

                {donutSlices.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">
                    {t('stats.noDamageYet')}
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <svg
                      viewBox="0 0 140 140"
                      className="w-36 h-36 shrink-0 select-none"
                    >
                      {(() => {
                        const r = 48;
                        const circ = 2 * Math.PI * r;
                        return donutSlices.map((sl) => (
                          <circle
                            key={sl.skillId}
                            cx="70"
                            cy="70"
                            r={r}
                            fill="transparent"
                            stroke={sl.color}
                            strokeWidth="22"
                            strokeDasharray={`${sl.pct * circ} ${circ}`}
                            strokeDashoffset={-sl.start * circ}
                            transform="rotate(-90 70 70)"
                            className="cursor-pointer hover:opacity-90"
                            onClick={() =>
                              setTooltipInfo(
                                `${sl.label}: ${sl.damage.toLocaleString()} DMG (${Math.round(
                                  sl.pct * 100
                                )}%)`
                              )
                            }
                          />
                        ));
                      })()}
                      <text
                        x="70"
                        y="67"
                        textAnchor="middle"
                        fill="#F8FAFC"
                        fontSize="13"
                        fontWeight="700"
                      >
                        {effectiveDonutUnit?.damageDealt.toLocaleString()}
                      </text>
                      <text
                        x="70"
                        y="81"
                        textAnchor="middle"
                        fill="#94A3B8"
                        fontSize="9"
                      >
                        TOTAL DMG
                      </text>
                    </svg>

                    <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {donutSlices.map((sl) => (
                        <button
                          key={`leg-${sl.skillId}`}
                          type="button"
                          onClick={() =>
                            setTooltipInfo(
                              `${sl.label}: ${sl.damage.toLocaleString()} DMG (${Math.round(
                                sl.pct * 100
                              )}%)`
                            )
                          }
                          className="rounded border border-slate-800 bg-[#0A101B] px-3 py-2 flex items-center justify-between gap-2 text-xs hover:border-slate-600 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-sm shrink-0"
                              style={{ backgroundColor: sl.color }}
                            />
                            <span className="text-slate-200 font-medium truncate">
                              {sl.label}
                            </span>
                          </div>
                          <span className="font-mono-nums text-slate-300 shrink-0">
                            {sl.damage.toLocaleString()} ({Math.round(sl.pct * 100)}%)
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
