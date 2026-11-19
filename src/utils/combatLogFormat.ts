import {
  formatCombatLogMessage,
  getSkillName,
  getStatusLabel,
  translate,
} from '../i18n';
import type {
  BattleState,
  BattleStatsSummary,
  CombatLogEntry,
  CombatSide,
  Language,
  StatusEffectType,
  UnitBattleStats,
} from '../types/game';

export type CombatLogChannel = 'all' | 'ally' | 'enemy' | 'system';
export type CombatLogDisplayMode = 'docked' | 'popup';
export type CombatLogActionKind =
  | 'attack'
  | 'skill'
  | 'heal'
  | 'shield'
  | 'buff'
  | 'debuff'
  | 'kill'
  | 'move-row'
  | 'system';
export type CombatLogValueTone =
  | 'damage'
  | 'heal'
  | 'shield'
  | 'buff'
  | 'debuff'
  | 'neutral';

export const DOCKED_LOG_MAX_ENTRIES = 200;
export const POPUP_LOG_PAGE_SIZE = 200;
export const COMBAT_LOG_MODE_STORAGE_KEY = 'starfront_combat_log_mode_v1';
export const SHOW_STATUS_LABELS_STORAGE_KEY = 'starfront_show_status_labels_v1';

const DEBUFF_STATUS_TYPES = new Set<StatusEffectType>([
  'burn',
  'shield_break',
  'slow',
  'silence',
  'vulnerable',
  'def_down',
]);

export interface StructuredCombatLogRow {
  id: string;
  turnLabel: string;
  faction: 'ally' | 'enemy' | 'system';
  actorName: string;
  autoBadge: string | null;
  actionKind: CombatLogActionKind;
  actionLabel: string;
  targetName: string | null;
  valueText: string | null;
  valueTone: CombatLogValueTone;
  fallbackText: string;
}

export interface KillTimelineItem {
  id: string;
  round: number;
  turn: number;
  killerId: string;
  killerName: string;
  killerSide: CombatSide | 'system';
  victimId: string;
  victimName: string;
  victimSide: CombatSide | 'system';
}

export interface LiveBattleProgress {
  round: number;
  turn: number;
  allyAlive: number;
  allyTotal: number;
  enemyAlive: number;
  enemyTotal: number;
  allyDamageDealt: number;
  allyDamageTaken: number;
  enemyDamageDealt: number;
  enemyDamageTaken: number;
  topDamageDealers: UnitBattleStats[];
  topHealers: UnitBattleStats[];
  activeBuffsCount: number;
  activeDebuffsCount: number;
  allyActiveBuffs: number;
  allyActiveDebuffs: number;
  enemyActiveBuffs: number;
  enemyActiveDebuffs: number;
  killTimeline: KillTimelineItem[];
}

export function readCombatLogMode(): CombatLogDisplayMode {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return 'docked';
    const raw = window.localStorage.getItem(COMBAT_LOG_MODE_STORAGE_KEY);
    return raw === 'popup' ? 'popup' : 'docked';
  } catch {
    return 'docked';
  }
}

export function writeCombatLogMode(mode: CombatLogDisplayMode): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(COMBAT_LOG_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage quota or private mode failures
  }
}

export function readShowStatusLabels(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return true;
    const raw = window.localStorage.getItem(SHOW_STATUS_LABELS_STORAGE_KEY);
    if (raw === '0' || raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function writeShowStatusLabels(enabled: boolean): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(
      SHOW_STATUS_LABELS_STORAGE_KEY,
      enabled ? '1' : '0'
    );
  } catch {
    // Ignore storage quota or private mode failures
  }
}

export function isSystemOrKillLogEntry(entry: CombatLogEntry): boolean {
  return (
    !entry.actorSide ||
    entry.tag === 'SYSTEM' ||
    entry.tag === 'KO' ||
    entry.templateKey === 'log.destroyed' ||
    entry.templateKey === 'log.battleStart' ||
    entry.templateKey === 'log.retreat'
  );
}

/**
 * Filters combat log entries by channel:
 * - all: every entry
 * - ally / enemy: entries whose actor belongs to that faction
 * - system: neutral/system messages AND kills (KO / destroyed)
 */
export function filterCombatLogEntries(
  entries: CombatLogEntry[],
  channel: CombatLogChannel
): CombatLogEntry[] {
  if (channel === 'all') return entries;
  if (channel === 'ally') {
    return entries.filter((e) => e.actorSide === 'ally');
  }
  if (channel === 'enemy') {
    return entries.filter((e) => e.actorSide === 'enemy');
  }
  return entries.filter(isSystemOrKillLogEntry);
}

function getRowLabel(lang: Language, rawRow: unknown): string {
  const key =
    rawRow === 'front'
      ? 'common.frontRow'
      : rawRow === 'middle'
      ? 'common.middleRow'
      : 'common.backRow';
  return translate(lang, key);
}

/**
 * Parses a CombatLogEntry into structured display fields:
 * [turn] [faction] [actor] [action icon + skill] -> [target] [colored value]
 */
export function parseStructuredCombatLogRow(
  lang: Language,
  entry: CombatLogEntry
): StructuredCombatLogRow {
  const p = entry.params ?? {};
  const turnLabel = `R${entry.round}`;
  const faction: 'ally' | 'enemy' | 'system' =
    entry.actorSide === 'ally'
      ? 'ally'
      : entry.actorSide === 'enemy'
      ? 'enemy'
      : 'system';
  const fallbackText = formatCombatLogMessage(lang, entry);
  const autoBadge =
    entry.autoRuleNumber !== undefined
      ? entry.autoRuleNumber > 0
        ? `AUTO #${entry.autoRuleNumber}`
        : 'AUTO'
      : null;

  const actorFromParams =
    typeof p.actor === 'string' && p.actor.trim().length > 0
      ? p.actor
      : entry.actorName || '';
  const targetFromParams =
    typeof p.target === 'string' && p.target.trim().length > 0
      ? p.target
      : null;
  const skillId =
    typeof p.skillId === 'string' && p.skillId.trim().length > 0
      ? p.skillId
      : '';
  const skillLabel = skillId ? getSkillName(lang, skillId) : '';

  switch (entry.templateKey) {
    case 'log.damage': {
      const shd = Number(p.shieldAbsorbed ?? 0);
      const hp = Number(p.hullDamage ?? 0);
      const total = shd + hp;
      const isCrit = Number(p.isCrit ?? 0) > 0;
      const hitIndex = Number(p.hitIndex ?? 0);
      const totalHits = Number(p.totalHits ?? 1);
      const baseAction = skillLabel || translate(lang, 'log.primaryWeapons');
      const actionLabel =
        totalHits > 1 ? `${baseAction} (${hitIndex}/${totalHits})` : baseAction;
      const valParts = [total > 0 ? `-${total}` : '0'];
      if (shd > 0 && hp > 0) valParts.push(`(${shd} SHD)`);
      else if (shd > 0) valParts.push('SHD');
      if (isCrit) valParts.push('CRIT!');

      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: actorFromParams,
        autoBadge,
        actionKind: skillId ? 'skill' : 'attack',
        actionLabel,
        targetName: targetFromParams,
        valueText: valParts.join(' '),
        valueTone: shd > 0 && hp === 0 ? 'shield' : 'damage',
        fallbackText,
      };
    }

    case 'log.splashDamage': {
      const dmg = Number(p.damage ?? 0);
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: actorFromParams,
        autoBadge,
        actionKind: 'skill',
        actionLabel: translate(lang, 'log.actionSplash'),
        targetName: targetFromParams,
        valueText: `-${dmg}`,
        valueTone: 'damage',
        fallbackText,
      };
    }

    case 'log.counterAttack': {
      const dmg = Number(p.damage ?? 0);
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: targetFromParams ?? actorFromParams,
        autoBadge,
        actionKind: 'attack',
        actionLabel: translate(lang, 'log.actionCounter'),
        targetName: actorFromParams || null,
        valueText: `-${dmg}`,
        valueTone: 'damage',
        fallbackText,
      };
    }

    case 'log.evade': {
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: actorFromParams,
        autoBadge,
        actionKind: skillId ? 'skill' : 'attack',
        actionLabel: skillLabel || translate(lang, 'log.primaryWeapons'),
        targetName: targetFromParams,
        valueText: translate(lang, 'log.actionEvade'),
        valueTone: 'neutral',
        fallbackText,
      };
    }

    case 'log.invincibleBlock': {
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: actorFromParams,
        autoBadge,
        actionKind: 'shield',
        actionLabel: translate(lang, 'log.actionBlocked'),
        targetName: targetFromParams,
        valueText: '0 DMG',
        valueTone: 'shield',
        fallbackText,
      };
    }

    case 'log.healSingle': {
      const amount = Number(p.amount ?? 0);
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: actorFromParams,
        autoBadge,
        actionKind: 'heal',
        actionLabel: skillLabel || getSkillName(lang, 'sup_nanite_mend'),
        targetName: targetFromParams,
        valueText: `+${amount} HP`,
        valueTone: 'heal',
        fallbackText,
      };
    }

    case 'log.healSquad': {
      const total = Number(p.total ?? 0);
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: actorFromParams,
        autoBadge,
        actionKind: 'heal',
        actionLabel: skillLabel || getSkillName(lang, 'sup_aegis_field'),
        targetName: translate(lang, 'stats.teamAlly'),
        valueText: `+${total}`,
        valueTone: 'heal',
        fallbackText,
      };
    }

    case 'log.regenTick': {
      const amount = Number(p.amount ?? 0);
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: targetFromParams ?? actorFromParams,
        autoBadge,
        actionKind: 'heal',
        actionLabel: translate(lang, 'stats.regenTick'),
        targetName: null,
        valueText: `+${amount} HP`,
        valueTone: 'heal',
        fallbackText,
      };
    }

    case 'log.defend': {
      const shd = Number(p.shieldRecovered ?? 0);
      const sp = Number(p.spRecovered ?? 0);
      const parts: string[] = [];
      if (shd > 0) parts.push(`+${shd} SHD`);
      if (sp > 0) parts.push(`+${sp} SP`);
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: actorFromParams,
        autoBadge,
        actionKind: 'shield',
        actionLabel: translate(lang, 'stats.defendAction'),
        targetName: null,
        valueText: parts.join(' ') || translate(lang, 'stats.defendAction'),
        valueTone: 'shield',
        fallbackText,
      };
    }

    case 'log.energize': {
      const amount = Number(p.amount ?? 0);
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: actorFromParams,
        autoBadge,
        actionKind: 'shield',
        actionLabel: skillLabel || getSkillName(lang, 'sup_flux_transfer'),
        targetName: targetFromParams,
        valueText: `+${amount} SP`,
        valueTone: 'shield',
        fallbackText,
      };
    }

    case 'log.buffApplied': {
      const spCost = Number(p.spCost ?? 0);
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: actorFromParams,
        autoBadge,
        actionKind: 'buff',
        actionLabel: skillLabel || translate(lang, 'log.actionStatus'),
        targetName: null,
        valueText: spCost > 0 ? `-${spCost} SP` : 'BUFF',
        valueTone: 'buff',
        fallbackText,
      };
    }

    case 'log.stanceToggle': {
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: actorFromParams,
        autoBadge,
        actionKind: 'buff',
        actionLabel: skillLabel || translate(lang, 'log.actionStatus'),
        targetName: null,
        valueText: String(p.state ?? 'ON'),
        valueTone: 'buff',
        fallbackText,
      };
    }

    case 'log.charging': {
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: actorFromParams,
        autoBadge,
        actionKind: 'buff',
        actionLabel: skillLabel || getSkillName(lang, 'str_solar_capacitor'),
        targetName: null,
        valueText: getStatusLabel(lang, 'charging'),
        valueTone: 'buff',
        fallbackText,
      };
    }

    case 'log.statusCleansed': {
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: actorFromParams,
        autoBadge,
        actionKind: 'buff',
        actionLabel: translate(lang, 'log.actionCleanse'),
        targetName: null,
        valueText: translate(lang, 'log.actionCleanse'),
        valueTone: 'buff',
        fallbackText,
      };
    }

    case 'log.scanReveal': {
      const revealed = Number(p.revealed ?? 0);
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: actorFromParams,
        autoBadge,
        actionKind: 'buff',
        actionLabel: skillLabel || getSkillName(lang, 'sup_lidar_sweep'),
        targetName: null,
        valueText: revealed > 0 ? `${revealed}` : null,
        valueTone: 'buff',
        fallbackText,
      };
    }

    case 'log.statusApplied': {
      const status = String(p.status ?? 'burn') as StatusEffectType;
      const isDebuff = DEBUFF_STATUS_TYPES.has(status);
      const turns = Number(p.turns ?? 2);
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: actorFromParams || targetFromParams || '',
        autoBadge,
        actionKind: isDebuff ? 'debuff' : 'buff',
        actionLabel: getStatusLabel(lang, status),
        targetName:
          targetFromParams && targetFromParams !== actorFromParams
            ? targetFromParams
            : null,
        valueText: `${getStatusLabel(lang, status)} (${turns}t)`,
        valueTone: isDebuff ? 'debuff' : 'buff',
        fallbackText,
      };
    }

    case 'log.burnTick': {
      const dmg = Number(p.damage ?? 0);
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: targetFromParams ?? actorFromParams,
        autoBadge,
        actionKind: 'debuff',
        actionLabel: translate(lang, 'log.actionBurn'),
        targetName: null,
        valueText: `-${dmg} HP`,
        valueTone: 'damage',
        fallbackText,
      };
    }

    case 'log.silencedBlocked': {
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: actorFromParams,
        autoBadge,
        actionKind: 'debuff',
        actionLabel: getStatusLabel(lang, 'silence'),
        targetName: null,
        valueText: getStatusLabel(lang, 'silence'),
        valueTone: 'debuff',
        fallbackText,
      };
    }

    case 'log.destroyed': {
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: actorFromParams,
        autoBadge,
        actionKind: 'kill',
        actionLabel: translate(lang, 'log.actionKill'),
        targetName: targetFromParams,
        valueText: 'KO',
        valueTone: 'damage',
        fallbackText,
      };
    }

    case 'log.unitMovesRow': {
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName: actorFromParams,
        autoBadge,
        actionKind: 'move-row',
        actionLabel: translate(lang, 'log.actionMoveRow'),
        targetName: getRowLabel(lang, p.row),
        valueText: null,
        valueTone: 'neutral',
        fallbackText,
      };
    }

    case 'log.battleStart':
    case 'log.retreat':
    case 'log.wingmanChat':
    default: {
      return {
        id: entry.id,
        turnLabel,
        faction,
        actorName:
          entry.templateKey === 'log.battleStart'
            ? translate(lang, 'log.actionSystem')
            : actorFromParams,
        autoBadge,
        actionKind: 'system',
        actionLabel: fallbackText,
        targetName: null,
        valueText: null,
        valueTone: 'neutral',
        fallbackText,
      };
    }
  }
}

/**
 * Pure aggregator for the live "Diễn biến" / "Progress" view during an active battle.
 */
export function buildLiveBattleProgress(
  battle: BattleState,
  stats: BattleStatsSummary
): LiveBattleProgress {
  const units = Array.isArray(battle?.units) ? battle.units : [];
  const events = Array.isArray(battle?.events) ? battle.events : [];
  const unitMap = new Map(units.map((u) => [u.id, u]));

  let allyActiveBuffs = 0;
  let allyActiveDebuffs = 0;
  let enemyActiveBuffs = 0;
  let enemyActiveDebuffs = 0;

  for (const u of units) {
    if (!u.alive || !Array.isArray(u.statuses)) continue;
    for (const st of u.statuses) {
      const isDebuff =
        st.isDebuff !== undefined
          ? Boolean(st.isDebuff)
          : DEBUFF_STATUS_TYPES.has(st.type);
      if (u.side === 'ally') {
        if (isDebuff) allyActiveDebuffs += 1;
        else allyActiveBuffs += 1;
      } else {
        if (isDebuff) enemyActiveDebuffs += 1;
        else enemyActiveBuffs += 1;
      }
    }
  }

  const topDamageDealers = [...stats.units]
    .filter((u) => u.damageDealt > 0)
    .sort((a, b) => b.damageDealt - a.damageDealt || a.name.localeCompare(b.name))
    .slice(0, 3);

  const topHealers = [...stats.units]
    .filter((u) => u.healingDone > 0)
    .sort((a, b) => b.healingDone - a.healingDone || a.name.localeCompare(b.name))
    .slice(0, 3);

  const killTimeline: KillTimelineItem[] = [];
  for (const ev of events) {
    if (ev.type !== 'kill') continue;
    const killer = ev.actorId ? unitMap.get(ev.actorId) : undefined;
    const victim = ev.targetId ? unitMap.get(ev.targetId) : undefined;
    killTimeline.push({
      id: ev.id,
      round: ev.round,
      turn: ev.turn,
      killerId: ev.actorId ?? '',
      killerName: killer?.name ?? ev.actorId ?? '—',
      killerSide: killer?.side ?? 'system',
      victimId: ev.targetId ?? '',
      victimName: victim?.name ?? ev.targetId ?? '—',
      victimSide: victim?.side ?? 'system',
    });
  }

  return {
    round: battle?.round ?? stats.rounds ?? 1,
    turn: Math.max(0, battle?.turnCounter ?? 0),
    allyAlive: stats.ally.aliveCount,
    allyTotal: stats.ally.totalCount,
    enemyAlive: stats.enemy.aliveCount,
    enemyTotal: stats.enemy.totalCount,
    allyDamageDealt: stats.ally.damageDealt,
    allyDamageTaken: stats.ally.damageTakenTotal,
    enemyDamageDealt: stats.enemy.damageDealt,
    enemyDamageTaken: stats.enemy.damageTakenTotal,
    topDamageDealers,
    topHealers,
    activeBuffsCount: allyActiveBuffs + enemyActiveBuffs,
    activeDebuffsCount: allyActiveDebuffs + enemyActiveDebuffs,
    allyActiveBuffs,
    allyActiveDebuffs,
    enemyActiveBuffs,
    enemyActiveDebuffs,
    killTimeline,
  };
}
