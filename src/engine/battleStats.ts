import type {
  BattleEvent,
  BattleMvpAward,
  BattleRoundSnapshot,
  BattleStatsSummary,
  CombatUnit,
  MechClassId,
  RoundDamagePoint,
  SkillBreakdownStats,
  TeamBattleStats,
  UnitBattleStats,
} from '../types/game';

const VALID_CLASSES = new Set<MechClassId>([
  'striker',
  'interceptor',
  'siege',
  'support',
]);

function safeFinite(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeNonNeg(value: unknown): number {
  const n = safeFinite(value, 0);
  return n > 0 ? n : 0;
}

function safeRoundInt(value: unknown, fallback = 1): number {
  const n = Math.floor(safeFinite(value, fallback));
  return n >= 1 ? n : fallback;
}

function safePct(numerator: number, denominator: number): number {
  const num = safeNonNeg(numerator);
  const den = safeNonNeg(denominator);
  if (den <= 0) return 0;
  const pct = Math.round((num / den) * 1000) / 10;
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
}

function ensureSkillEntry(
  skills: Record<string, SkillBreakdownStats>,
  skillKey: string
): SkillBreakdownStats {
  let entry = skills[skillKey];
  if (!entry) {
    entry = {
      skillId: skillKey,
      uses: 0,
      damage: 0,
      healing: 0,
      shieldGranted: 0,
      crits: 0,
    };
    skills[skillKey] = entry;
  }
  return entry;
}

function createEmptyTeamStats(
  side: 'ally' | 'enemy',
  units: CombatUnit[]
): TeamBattleStats {
  const sideUnits = units.filter((u) => u && u.side === side);
  const aliveCount = sideUnits.filter((u) => Boolean(u.alive)).length;
  const remainingHp = sideUnits.reduce(
    (sum, u) => sum + (u.alive ? safeNonNeg(u.hp) : 0),
    0
  );
  const totalMaxHp = sideUnits.reduce(
    (sum, u) => sum + safeNonNeg(u.derived?.maxHp),
    0
  );
  const remainingHpPct = safePct(remainingHp, totalMaxHp);

  return {
    side,
    damageDealt: 0,
    damageTakenHp: 0,
    damageTakenShield: 0,
    damageTakenTotal: 0,
    healingDone: 0,
    shieldGranted: 0,
    shieldAbsorbed: 0,
    hits: 0,
    crits: 0,
    critRate: 0,
    dodges: 0,
    kills: 0,
    deaths: 0,
    turnsTaken: 0,
    spSpent: 0,
    buffsApplied: 0,
    debuffsApplied: 0,
    aliveCount,
    totalCount: sideUnits.length,
    remainingHp,
    totalMaxHp,
    remainingHpPct,
  };
}

/**
 * Total, pure aggregation engine over structured BattleEvent records and per-round HP snapshots.
 * Never throws, never mutates inputs, never emits NaN/Infinity, and tolerates empty/malformed
 * events, unknown unit IDs, and removed/dead units.
 */
export function aggregateBattleStats(
  units: CombatUnit[] | null | undefined,
  events: BattleEvent[] | null | undefined,
  roundSnapshots: BattleRoundSnapshot[] | null | undefined,
  currentRound: number
): BattleStatsSummary {
  const safeUnits = Array.isArray(units)
    ? units.filter((u): u is CombatUnit => Boolean(u && typeof u.id === 'string' && u.id.length > 0))
    : [];
  const safeEvents = Array.isArray(events)
    ? events.filter((e): e is BattleEvent => Boolean(e && typeof e === 'object' && typeof e.type === 'string'))
    : [];
  const safeSnapshots = Array.isArray(roundSnapshots)
    ? roundSnapshots.filter((s): s is BattleRoundSnapshot => Boolean(s && typeof s === 'object'))
    : [];

  const unitStatsMap = new Map<string, UnitBattleStats>();
  const unitSideMap = new Map<string, 'ally' | 'enemy'>();

  for (const u of safeUnits) {
    const side: 'ally' | 'enemy' = u.side === 'ally' ? 'ally' : 'enemy';
    const classId: MechClassId = VALID_CLASSES.has(u.classId)
      ? u.classId
      : 'striker';
    const maxHp = safeNonNeg(u.derived?.maxHp);
    const hp = Math.min(maxHp > 0 ? maxHp : safeNonNeg(u.hp), safeNonNeg(u.hp));

    unitSideMap.set(u.id, side);
    unitStatsMap.set(u.id, {
      unitId: u.id,
      name: typeof u.name === 'string' && u.name.trim().length > 0 ? u.name : u.id,
      classId,
      side,
      isPlayer: Boolean(u.isPlayer),
      isBoss: Boolean(u.isBoss),
      alive: Boolean(u.alive),
      hp,
      maxHp,
      damageDealt: 0,
      damageTakenHp: 0,
      damageTakenShield: 0,
      damageTakenTotal: 0,
      healingDone: 0,
      shieldGranted: 0,
      shieldAbsorbed: 0,
      hits: 0,
      crits: 0,
      critRate: 0,
      dodges: 0,
      kills: 0,
      deaths: 0,
      turnsTaken: 0,
      spSpent: 0,
      buffsApplied: 0,
      debuffsApplied: 0,
      buffsReceived: 0,
      debuffsReceived: 0,
      damagePerTurn: 0,
      skills: {},
    });
  }

  // Compute maxRound iteratively (never spread huge arrays into Math.max)
  let maxRound = safeRoundInt(currentRound, 1);
  for (let i = 0; i < safeEvents.length; i++) {
    const r = safeRoundInt(safeEvents[i].round, 1);
    if (r > maxRound) maxRound = r;
  }
  for (let i = 0; i < safeSnapshots.length; i++) {
    const r = safeRoundInt(safeSnapshots[i].round, 1);
    if (r > maxRound) maxRound = r;
  }

  const roundAllyDmg = new Map<number, number>();
  const roundEnemyDmg = new Map<number, number>();

  for (let i = 0; i < safeEvents.length; i++) {
    const ev = safeEvents[i];
    const evRound = safeRoundInt(ev.round, 1);
    const actorId = typeof ev.actorId === 'string' ? ev.actorId : '';
    const targetId = typeof ev.targetId === 'string' ? ev.targetId : '';
    const actor = actorId ? unitStatsMap.get(actorId) : undefined;
    const target = targetId ? unitStatsMap.get(targetId) : undefined;
    const skillKey =
      typeof ev.skillId === 'string' && ev.skillId.length > 0
        ? ev.skillId
        : 'basic_attack';

    switch (ev.type) {
      case 'turn_start': {
        if (actor) {
          actor.turnsTaken += 1;
        }
        break;
      }

      case 'attack': {
        if (actor) {
          const sk = ensureSkillEntry(actor.skills, 'basic_attack');
          sk.uses += 1;
        }
        break;
      }

      case 'skill_cast': {
        if (actor) {
          actor.spSpent += safeNonNeg(ev.spSpent);
          if (typeof ev.skillId === 'string' && ev.skillId.length > 0) {
            const sk = ensureSkillEntry(actor.skills, ev.skillId);
            sk.uses += 1;
          }
        }
        break;
      }

      case 'defend': {
        if (actor) {
          const sk = ensureSkillEntry(actor.skills, 'defend');
          sk.uses += 1;
        }
        break;
      }

      case 'damage': {
        const total = safeNonNeg(ev.amount);
        const shd = Math.min(total, safeNonNeg(ev.shieldAbsorbed));
        const hp =
          ev.hpDamage !== undefined
            ? safeNonNeg(ev.hpDamage)
            : Math.max(0, total - shd);
        const isBurnSelf = Boolean(ev.flags?.isBurn && actorId && actorId === targetId);

        if (actor && !isBurnSelf && !ev.flags?.invincible) {
          actor.damageDealt += total;
          if (!ev.flags?.splash) {
            actor.hits += 1;
            if (ev.flags?.crit) {
              actor.crits += 1;
            }
          }
          const sk = ensureSkillEntry(actor.skills, skillKey);
          sk.damage += total;
          if (ev.flags?.crit && !ev.flags?.splash) {
            sk.crits += 1;
          }

          if (total > 0) {
            const side = unitSideMap.get(actorId);
            if (side === 'ally') {
              roundAllyDmg.set(evRound, (roundAllyDmg.get(evRound) ?? 0) + total);
            } else if (side === 'enemy') {
              roundEnemyDmg.set(evRound, (roundEnemyDmg.get(evRound) ?? 0) + total);
            }
          }
        }

        if (target && total > 0) {
          target.damageTakenHp += hp;
          target.damageTakenShield += shd;
          target.damageTakenTotal += total;
          target.shieldAbsorbed += shd;
        }
        break;
      }

      case 'dodge': {
        if (target) {
          target.dodges += 1;
        }
        break;
      }

      case 'heal': {
        const amt = safeNonNeg(ev.amount);
        if (actor && amt > 0) {
          actor.healingDone += amt;
          const healSkillKey = ev.flags?.isRegen
            ? typeof ev.skillId === 'string' && ev.skillId.length > 0
              ? ev.skillId
              : 'regen_hp'
            : skillKey;
          const sk = ensureSkillEntry(actor.skills, healSkillKey);
          sk.healing += amt;
        }
        break;
      }

      case 'shield_grant': {
        const amt = safeNonNeg(ev.amount);
        if (actor && amt > 0) {
          actor.shieldGranted += amt;
          const sk = ensureSkillEntry(
            actor.skills,
            typeof ev.skillId === 'string' && ev.skillId.length > 0
              ? ev.skillId
              : 'defend'
          );
          sk.shieldGranted += amt;
        }
        break;
      }

      case 'status_applied': {
        const isDebuff = Boolean(ev.flags?.isDebuff);
        if (actor) {
          if (isDebuff) actor.debuffsApplied += 1;
          else actor.buffsApplied += 1;
        }
        if (target) {
          if (isDebuff) target.debuffsReceived += 1;
          else target.buffsReceived += 1;
        }
        break;
      }

      case 'kill': {
        if (actor && actorId !== targetId) {
          actor.kills += 1;
        }
        if (target) {
          target.deaths += 1;
        }
        break;
      }

      case 'cleanse':
      default:
        break;
    }
  }

  const allyTeam = createEmptyTeamStats('ally', safeUnits);
  const enemyTeam = createEmptyTeamStats('enemy', safeUnits);
  const unitList: UnitBattleStats[] = [];

  for (const stat of unitStatsMap.values()) {
    stat.critRate = safePct(stat.crits, stat.hits);
    stat.damagePerTurn =
      stat.turnsTaken > 0
        ? Math.round((safeNonNeg(stat.damageDealt) / stat.turnsTaken) * 10) / 10
        : safeNonNeg(stat.damageDealt);
    if (!Number.isFinite(stat.damagePerTurn)) stat.damagePerTurn = 0;

    unitList.push(stat);

    const team = stat.side === 'ally' ? allyTeam : enemyTeam;
    team.damageDealt += stat.damageDealt;
    team.damageTakenHp += stat.damageTakenHp;
    team.damageTakenShield += stat.damageTakenShield;
    team.damageTakenTotal += stat.damageTakenTotal;
    team.healingDone += stat.healingDone;
    team.shieldGranted += stat.shieldGranted;
    team.shieldAbsorbed += stat.shieldAbsorbed;
    team.hits += stat.hits;
    team.crits += stat.crits;
    team.dodges += stat.dodges;
    team.kills += stat.kills;
    team.deaths += stat.deaths;
    team.turnsTaken += stat.turnsTaken;
    team.spSpent += stat.spSpent;
    team.buffsApplied += stat.buffsApplied;
    team.debuffsApplied += stat.debuffsApplied;
  }

  allyTeam.critRate = safePct(allyTeam.crits, allyTeam.hits);
  enemyTeam.critRate = safePct(enemyTeam.crits, enemyTeam.hits);

  // Build cumulative per-round damage series (1..maxRound)
  const roundDamageSeries: RoundDamagePoint[] = [];
  let cumAlly = 0;
  let cumEnemy = 0;
  for (let r = 1; r <= maxRound; r++) {
    cumAlly += safeNonNeg(roundAllyDmg.get(r));
    cumEnemy += safeNonNeg(roundEnemyDmg.get(r));
    roundDamageSeries.push({
      round: r,
      allyCumulativeDamage: cumAlly,
      enemyCumulativeDamage: cumEnemy,
    });
  }

  // Deduplicate & order HP snapshots by round (latest snapshot for each round wins)
  const snapByRound = new Map<number, BattleRoundSnapshot>();
  for (let i = 0; i < safeSnapshots.length; i++) {
    const snap = safeSnapshots[i];
    const r = safeRoundInt(snap.round, 1);
    const allyMax = safeNonNeg(snap.allyMaxHp);
    const allyHp = safeNonNeg(snap.allyHp);
    const enemyMax = safeNonNeg(snap.enemyMaxHp);
    const enemyHp = safeNonNeg(snap.enemyHp);
    const allyPct =
      Number.isFinite(snap.allyHpPct)
        ? Math.max(0, Math.min(100, snap.allyHpPct))
        : safePct(allyHp, allyMax);
    const enemyPct =
      Number.isFinite(snap.enemyHpPct)
        ? Math.max(0, Math.min(100, snap.enemyHpPct))
        : safePct(enemyHp, enemyMax);

    snapByRound.set(r, {
      round: r,
      allyHp,
      allyMaxHp: allyMax,
      allyHpPct: allyPct,
      enemyHp,
      enemyMaxHp: enemyMax,
      enemyHpPct: enemyPct,
    });
  }

  if (safeUnits.length > 0) {
    const currentLiveSnap: BattleRoundSnapshot = {
      round: maxRound,
      allyHp: allyTeam.remainingHp,
      allyMaxHp: allyTeam.totalMaxHp,
      allyHpPct: allyTeam.remainingHpPct,
      enemyHp: enemyTeam.remainingHp,
      enemyMaxHp: enemyTeam.totalMaxHp,
      enemyHpPct: enemyTeam.remainingHpPct,
    };
    snapByRound.set(maxRound, currentLiveSnap);
  }

  const roundHpSeries = Array.from(snapByRound.values()).sort(
    (a, b) => a.round - b.round
  );

  // MVP awards (across all participating units)
  const pickMvp = (
    selector: (u: UnitBattleStats) => number
  ): BattleMvpAward | null => {
    let best: UnitBattleStats | null = null;
    let bestVal = 0;
    for (const u of unitList) {
      const v = safeNonNeg(selector(u));
      if (v > bestVal) {
        bestVal = v;
        best = u;
      }
    }
    return best && bestVal > 0 ? { unitId: best.unitId, value: bestVal } : null;
  };

  return {
    rounds: maxRound,
    ally: allyTeam,
    enemy: enemyTeam,
    units: unitList,
    roundDamageSeries,
    roundHpSeries,
    mvps: {
      mostDamage: pickMvp((u) => u.damageDealt),
      mostHealing: pickMvp((u) => u.healingDone),
      mostDamageTaken: pickMvp((u) => u.damageTakenTotal),
      mostDodges: pickMvp((u) => u.dodges),
    },
  };
}
