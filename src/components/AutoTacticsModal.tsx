import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Plus,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { BALANCE_CONFIG } from '../data/balance';
import { getSkillById } from '../data/skills';
import { getSkillsForClass } from '../engine/skills';
import {
  TACTICS_BUFF_OPTIONS,
  TACTICS_CONDITION_KINDS,
  TACTICS_TARGET_SELECTORS,
} from '../engine/tactics';
import {
  formatTacticsRuleSentence,
  getClassName,
  getSkillName,
  getStatusLabel,
  getTacticsPresetLabel,
  getTacticsTargetLabel,
  useI18n,
} from '../i18n';
import { useGameStore } from '../store/useGameStore';
import type {
  StatusEffectType,
  TacticsConditionKind,
  TacticsPresetId,
  TacticsRule,
  TacticsTargetSelector,
} from '../types/game';

const PRESET_IDS: TacticsPresetId[] = [
  'class_default',
  'balanced',
  'focus_weak',
  'defensive',
];

function conditionNeedsNumber(kind: TacticsConditionKind): boolean {
  return (
    kind === 'my_hp_below' ||
    kind === 'my_sp_gte' ||
    kind === 'my_sp_lt' ||
    kind === 'any_ally_hp_below' ||
    kind === 'enemy_count_gte' ||
    kind === 'target_hp_below' ||
    kind === 'round_eq'
  );
}

function defaultNumberForCondition(kind: TacticsConditionKind): number {
  switch (kind) {
    case 'my_hp_below':
    case 'any_ally_hp_below':
      return 40;
    case 'target_hp_below':
      return 50;
    case 'my_sp_gte':
    case 'my_sp_lt':
      return 15;
    case 'enemy_count_gte':
      return 2;
    case 'round_eq':
      return 1;
    default:
      return 0;
  }
}

function defaultTargetForSkill(skillId: string): TacticsTargetSelector {
  const sk = getSkillById(skillId);
  if (!sk) return 'lowest_hp_enemy';
  switch (sk.targetType) {
    case 'self':
      return 'self';
    case 'single_ally':
      return 'lowest_hp_ally';
    case 'all_allies':
      return 'all_allies';
    default:
      return 'lowest_hp_enemy';
  }
}

export function AutoTacticsModal() {
  const { lang, t } = useI18n();
  const open = useGameStore((s) => s.tacticsModalOpen);
  const pilot = useGameStore((s) => s.pilot);
  const setTacticsModalOpen = useGameStore((s) => s.setTacticsModalOpen);
  const loadTacticsPreset = useGameStore((s) => s.loadTacticsPreset);
  const addTacticsRule = useGameStore((s) => s.addTacticsRule);
  const updateTacticsRule = useGameStore((s) => s.updateTacticsRule);
  const deleteTacticsRule = useGameStore((s) => s.deleteTacticsRule);
  const reorderTacticsRules = useGameStore((s) => s.reorderTacticsRules);
  const updateTacticsSafety = useGameStore((s) => s.updateTacticsSafety);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const activeGear = pilot.gears[pilot.activeGearId];
  const gearName = getClassName(lang, activeGear.classId);

  // Strictly class-allowed active skills (bar skills listed first)
  const allowedActiveSkills = useMemo(() => {
    const all = getSkillsForClass(activeGear.classId).filter(
      (s) => s.category !== 'passive'
    );
    const barSet = new Set(activeGear.equippedSkillBar);
    const onBar = activeGear.equippedSkillBar
      .map((id) => getSkillById(id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
    const others = all.filter((s) => !barSet.has(s.id));
    return [...onBar, ...others];
  }, [activeGear.classId, activeGear.equippedSkillBar]);

  if (!open) return null;

  const { rules, safety } = activeGear.tactics;
  const maxRules = BALANCE_CONFIG.maxTacticsRules;

  const handleConditionKindChange = (
    rule: TacticsRule,
    nextKind: TacticsConditionKind
  ) => {
    const nextCond: TacticsRule['condition'] = { kind: nextKind };
    if (conditionNeedsNumber(nextKind)) {
      nextCond.value = defaultNumberForCondition(nextKind);
    }
    if (nextKind === 'my_buff_not_active') {
      nextCond.buffType = rule.condition.buffType ?? 'def_up';
    }
    if (nextKind === 'skill_off_cooldown') {
      nextCond.skillId =
        rule.action.type === 'skill' && rule.action.skillId
          ? rule.action.skillId
          : activeGear.equippedSkillBar[0] ?? allowedActiveSkills[0]?.id;
    }
    updateTacticsRule(rule.id, { condition: nextCond });
  };

  const handleActionSelect = (rule: TacticsRule, rawVal: string) => {
    if (rawVal === 'attack') {
      updateTacticsRule(rule.id, {
        action: { type: 'attack' },
        targetSelector:
          rule.targetSelector === 'self' ||
          rule.targetSelector === 'lowest_hp_ally' ||
          rule.targetSelector === 'all_allies'
            ? 'lowest_hp_enemy'
            : rule.targetSelector,
      });
    } else if (rawVal === 'defend') {
      updateTacticsRule(rule.id, {
        action: { type: 'defend' },
        targetSelector: 'self',
      });
    } else if (rawVal.startsWith('skill:')) {
      const skillId = rawVal.slice('skill:'.length);
      updateTacticsRule(rule.id, {
        action: { type: 'skill', skillId },
        targetSelector: defaultTargetForSkill(skillId),
      });
    }
  };

  const getConditionOptionLabel = (kind: TacticsConditionKind): string => {
    switch (kind) {
      case 'my_hp_below':
        return t('auto.cond.my_hp_below', { value: 'X' });
      case 'my_sp_gte':
        return t('auto.cond.my_sp_gte', { value: 'X' });
      case 'my_sp_lt':
        return t('auto.cond.my_sp_lt', { value: 'X' });
      case 'any_ally_hp_below':
        return t('auto.cond.any_ally_hp_below', { value: 'X' });
      case 'enemy_count_gte':
        return t('auto.cond.enemy_count_gte', { value: 'N' });
      case 'target_hp_below':
        return t('auto.cond.target_hp_below', { value: 'X' });
      case 'round_eq':
        return t('auto.cond.round_eq', { value: 'N' });
      case 'my_buff_not_active':
        return t('auto.cond.my_buff_not_active', { buff: '...' });
      case 'skill_off_cooldown':
        return t('auto.cond.skill_off_cooldown', { skill: '...' });
      default:
        return t(`auto.cond.${kind}` as never);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auto-tactics-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) setTacticsModalOpen(false);
      }}
    >
      <div className="w-full sm:max-w-3xl max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-lg border-t sm:border border-slate-700 bg-[#0C121E] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-4 sm:px-5 py-3.5 border-b border-slate-800 flex items-start justify-between gap-3 bg-[#090E18]">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-emerald-400 shrink-0" />
              <h2
                id="auto-tactics-title"
                className="font-display text-2xl font-bold tracking-wide text-slate-50 truncate"
              >
                {t('auto.tacticsTitle', { gear: gearName })}
              </h2>
              <span className="font-mono-nums text-xs px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 shrink-0">
                {t('auto.rulesCount', { count: rules.length, max: maxRules })}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {t('auto.tacticsSubtitle')}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setTacticsModalOpen(false)}
            aria-label={t('common.close')}
            className="h-9 w-9 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Preset Strip + Add Rule */}
        <div className="shrink-0 px-4 sm:px-5 py-2.5 border-b border-slate-800/80 bg-[#0A0F1A] flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 mr-1">
              {t('auto.presetsLabel')}
            </span>
            {PRESET_IDS.map((pid) => (
              <button
                key={pid}
                type="button"
                onClick={() => loadTacticsPreset(pid)}
                className="h-7 px-2.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 hover:border-slate-500 text-[11px] font-medium text-slate-200 transition-colors cursor-pointer"
              >
                {getTacticsPresetLabel(lang, pid)}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={rules.length >= maxRules}
            onClick={addTacticsRule}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('auto.addRule')}</span>
          </button>
        </div>

        {/* Scrollable Body: Rules List + Safety Stops */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 tactical-scroll">
          {rules.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700 bg-[#080C14] p-6 text-center text-xs text-slate-400">
              {t('auto.emptyRules')}
            </div>
          ) : (
            <div className="space-y-2.5">
              {rules.map((rule, index) => {
                const actionSelectVal =
                  rule.action.type === 'skill' && rule.action.skillId
                    ? `skill:${rule.action.skillId}`
                    : rule.action.type;
                const isDragging = dragIndex === index;
                const isDragOver = dragOverIndex === index && dragIndex !== index;

                return (
                  <div
                    key={rule.id}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverIndex(index);
                    }}
                    onDragLeave={() => {
                      if (dragOverIndex === index) setDragOverIndex(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIndex !== null && dragIndex !== index) {
                        reorderTacticsRules(dragIndex, index);
                      }
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    className={`rounded-lg border p-3 transition-colors space-y-2.5 ${
                      !rule.enabled
                        ? 'border-slate-800/70 bg-[#080B12]/70 opacity-60'
                        : isDragOver
                        ? 'border-emerald-400 bg-emerald-500/10'
                        : 'border-slate-800 bg-[#090E18]'
                    } ${isDragging ? 'opacity-50' : ''}`}
                  >
                    {/* Top Line: Drag Handle + Priority # + Readable Sentence + Controls */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          title={t('auto.dragHint')}
                          className="hidden sm:inline-flex text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing shrink-0"
                        >
                          <GripVertical className="w-4 h-4" />
                        </span>

                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) =>
                            updateTacticsRule(rule.id, {
                              enabled: e.target.checked,
                            })
                          }
                          aria-label={`Enable rule #${index + 1}`}
                          className="h-4 w-4 accent-emerald-500 cursor-pointer shrink-0"
                        />

                        <span className="font-mono-nums text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 shrink-0">
                          #{index + 1}
                        </span>

                        <span className="text-xs font-medium text-slate-100 truncate">
                          {formatTacticsRuleSentence(lang, rule)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => reorderTacticsRules(index, index - 1)}
                          aria-label={t('auto.moveUp')}
                          title={t('auto.moveUp')}
                          className="h-7 w-7 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed text-slate-300 flex items-center justify-center cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={index === rules.length - 1}
                          onClick={() => reorderTacticsRules(index, index + 1)}
                          aria-label={t('auto.moveDown')}
                          title={t('auto.moveDown')}
                          className="h-7 w-7 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed text-slate-300 flex items-center justify-center cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTacticsRule(rule.id)}
                          aria-label={t('auto.deleteRule')}
                          title={t('auto.deleteRule')}
                          className="h-7 w-7 rounded border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-300 flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Controls Grid: IF (Condition + param) | DO (Action) | TARGET */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                      {/* Condition */}
                      <div className="md:col-span-5 flex items-center gap-1.5">
                        <span className="text-[10px] font-mono-nums font-bold text-slate-400 w-7 shrink-0">
                          {t('auto.colIf')}
                        </span>
                        <select
                          value={rule.condition.kind}
                          onChange={(e) =>
                            handleConditionKindChange(
                              rule,
                              e.target.value as TacticsConditionKind
                            )
                          }
                          className="flex-1 min-w-0 h-8 px-2 rounded border border-slate-700 bg-[#060910] text-xs text-slate-100 focus:outline-none focus:border-emerald-400"
                        >
                          {TACTICS_CONDITION_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                              {getConditionOptionLabel(kind)}
                            </option>
                          ))}
                        </select>

                        {conditionNeedsNumber(rule.condition.kind) && (
                          <input
                            type="number"
                            min={1}
                            max={
                              rule.condition.kind.includes('hp_below')
                                ? 99
                                : 200
                            }
                            value={rule.condition.value ?? 0}
                            onChange={(e) =>
                              updateTacticsRule(rule.id, {
                                condition: {
                                  ...rule.condition,
                                  value: Math.max(
                                    1,
                                    Math.round(Number(e.target.value) || 1)
                                  ),
                                },
                              })
                            }
                            className="w-16 h-8 px-2 rounded border border-slate-700 bg-[#060910] font-mono-nums text-xs text-slate-100 text-right focus:outline-none focus:border-emerald-400"
                          />
                        )}

                        {rule.condition.kind === 'my_buff_not_active' && (
                          <select
                            value={rule.condition.buffType ?? 'def_up'}
                            onChange={(e) =>
                              updateTacticsRule(rule.id, {
                                condition: {
                                  ...rule.condition,
                                  buffType: e.target.value as StatusEffectType,
                                },
                              })
                            }
                            className="w-32 h-8 px-1.5 rounded border border-slate-700 bg-[#060910] text-xs text-slate-100 focus:outline-none focus:border-emerald-400"
                          >
                            {TACTICS_BUFF_OPTIONS.map((b) => (
                              <option key={b} value={b}>
                                {getStatusLabel(lang, b)}
                              </option>
                            ))}
                          </select>
                        )}

                        {rule.condition.kind === 'skill_off_cooldown' && (
                          <select
                            value={
                              rule.condition.skillId ??
                              allowedActiveSkills[0]?.id ??
                              ''
                            }
                            onChange={(e) =>
                              updateTacticsRule(rule.id, {
                                condition: {
                                  ...rule.condition,
                                  skillId: e.target.value,
                                },
                              })
                            }
                            className="w-32 h-8 px-1.5 rounded border border-slate-700 bg-[#060910] text-xs text-slate-100 focus:outline-none focus:border-emerald-400"
                          >
                            {allowedActiveSkills.map((sk) => (
                              <option key={sk.id} value={sk.id}>
                                {getSkillName(lang, sk.id)}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      {/* Action */}
                      <div className="md:col-span-4 flex items-center gap-1.5">
                        <span className="text-[10px] font-mono-nums font-bold text-slate-400 shrink-0">
                          {t('auto.colDo')}
                        </span>
                        <select
                          value={actionSelectVal}
                          onChange={(e) =>
                            handleActionSelect(rule, e.target.value)
                          }
                          className="flex-1 min-w-0 h-8 px-2 rounded border border-slate-700 bg-[#060910] text-xs text-slate-100 focus:outline-none focus:border-emerald-400"
                        >
                          <option value="attack">
                            {t('auto.actionAttack')}
                          </option>
                          <option value="defend">
                            {t('auto.actionDefend')}
                          </option>
                          {allowedActiveSkills.map((sk) => {
                            const onBar = activeGear.equippedSkillBar.includes(
                              sk.id
                            );
                            return (
                              <option key={sk.id} value={`skill:${sk.id}`}>
                                {getSkillName(lang, sk.id)} ({sk.spCost} SP)
                                {onBar ? '' : ` ${t('auto.notOnBar')}`}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* Target Selector */}
                      <div className="md:col-span-3 flex items-center gap-1.5">
                        <span className="text-[10px] font-mono-nums font-bold text-slate-400 shrink-0">
                          →
                        </span>
                        <select
                          value={rule.targetSelector}
                          onChange={(e) =>
                            updateTacticsRule(rule.id, {
                              targetSelector: e.target
                                .value as TacticsTargetSelector,
                            })
                          }
                          className="flex-1 min-w-0 h-8 px-2 rounded border border-slate-700 bg-[#060910] text-xs text-slate-100 focus:outline-none focus:border-emerald-400"
                        >
                          {TACTICS_TARGET_SELECTORS.map((sel) => (
                            <option key={sel} value={sel}>
                              {getTacticsTargetLabel(lang, sel)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Safety Stops Section */}
          <div className="rounded-lg border border-slate-800 bg-[#090E18] p-3.5 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <ShieldAlert className="w-4 h-4 text-orange-400" />
              <span>{t('auto.safetyTitle')}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={safety.stopOnLowHpEnabled}
                  onChange={(e) =>
                    updateTacticsSafety({
                      stopOnLowHpEnabled: e.target.checked,
                    })
                  }
                  className="h-4 w-4 accent-emerald-500 cursor-pointer"
                />
                <span>{t('auto.safetyLowHp')}</span>
                <input
                  type="number"
                  min={5}
                  max={90}
                  value={safety.stopOnLowHpPct}
                  onChange={(e) =>
                    updateTacticsSafety({
                      stopOnLowHpPct: Math.max(
                        5,
                        Math.min(90, Math.round(Number(e.target.value) || 25))
                      ),
                    })
                  }
                  className="w-14 h-7 px-1.5 rounded border border-slate-700 bg-[#060910] font-mono-nums text-xs text-right text-slate-100"
                />
                <span>%</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={safety.stopOnEliteReady}
                  onChange={(e) =>
                    updateTacticsSafety({
                      stopOnEliteReady: e.target.checked,
                    })
                  }
                  className="h-4 w-4 accent-emerald-500 cursor-pointer"
                />
                <span>{t('auto.safetyEliteReady')}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={safety.stopOnBossPresent}
                  onChange={(e) =>
                    updateTacticsSafety({
                      stopOnBossPresent: e.target.checked,
                    })
                  }
                  className="h-4 w-4 accent-emerald-500 cursor-pointer"
                />
                <span>{t('auto.safetyBossPresent')}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={safety.autoRetreatLowHpEnabled}
                  onChange={(e) =>
                    updateTacticsSafety({
                      autoRetreatLowHpEnabled: e.target.checked,
                    })
                  }
                  className="h-4 w-4 accent-orange-500 cursor-pointer"
                />
                <span>{t('auto.safetyAutoRetreat')}</span>
                <input
                  type="number"
                  min={5}
                  max={75}
                  value={safety.autoRetreatLowHpPct}
                  onChange={(e) =>
                    updateTacticsSafety({
                      autoRetreatLowHpPct: Math.max(
                        5,
                        Math.min(75, Math.round(Number(e.target.value) || 15))
                      ),
                    })
                  }
                  className="w-14 h-7 px-1.5 rounded border border-slate-700 bg-[#060910] font-mono-nums text-xs text-right text-slate-100"
                />
                <span>%</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
