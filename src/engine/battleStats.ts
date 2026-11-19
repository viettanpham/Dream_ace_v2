import type {
  BattleEvent,
  BattleMvpAward,
  BattleRoundSnapshot,
  BattleStatsSummary,
  CombatUnit,
  RoundDamagePoint,
  SkillBreakdownStats,
  TeamBattleStats,
  UnitBattleStats,
} from '../types/game';

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
  const sideUnits = units.filter((u) => u.side === side);
  const aliveCount = sideUnits.filter((u) => u.alive).length;
  const remainingHp = sideUnits.reduce((sum, u) => sum + (u.alive ? u.hp : 0), 0);
  const totalMaxHp = sideUnits.reduce((sum, u) => sum + u.derived.maxHp, 0);
  const remainingHpPct =
    totalMaxHp > 0 ? Math.round((remainingHp / totalMaxHp) * 1000) / 10 : 0;

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
 * Pure aggregation engine over structured BattleEvent records and per-round HP snapshots.
 * Never mutates inputs; deterministic and accurate at 1x..10x speed and Auto mode.
 */
export function aggregateBattleStats(
  units: CombatUnit[],
  events: BattleEvent[],
  roundSnapshots: BattleRoundSnapshot[],
  currentRound: number
): BattleStatsSummary {
  const unitStatsMap = new Map<string, UnitBattleStats>();
  const unitSideMap = new Map<string, 'ally' | 'enemy'>();

  for (const u of units) {
    unitSideMap.set(u.id, u.side);
    unitStatsMap.set(u.id, {
      unitId: u.id,
      name: u.name,
      classId: u.classId,
      side: u.side,
      isPlayer: u.isPlayer,
      isBoss: Boolean(u.isBoss),
      alive: u.alive,
      hp: u.hp,
      maxHp: u.derived.maxHp,
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

  // Track per-round damage per side for cumulative damage chart
  const maxRound = Math.max(
    1,
    currentRound,
    ...events.map((e) => e.round),
    ...roundSnapshots.map((s) => s.round)
  );
  const roundAllyDmg = new Map<number, number>();
  const roundEnemyDmg = new Map<number, number>();

  for (const ev of events) {
    const actor = unitStatsMap.get(ev.actorId);
    const target = ev.targetId ? unitStatsMap.get(ev.targetId) : undefined;
    const skillKey = ev.skillId && ev.skillId.length > 0 ? ev.skillId : 'basic_attack';

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
          actor.spSpent += ev.spSpent ?? 0;
          if (ev.skillId) {
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
        const total = Math.max(0, ev.amount ?? 0);
        const shd = Math.max(0, ev.shieldAbsorbed ?? 0);
        const hp = Math.max(0, ev.hpDamage ?? Math.max(0, total - shd));
        const isBurnSelf = Boolean(ev.flags?.isBurn && ev.actorId === ev.targetId);

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
            const side = unitSideMap.get(ev.actorId);
            if (side === 'ally') {
              roundAllyDmg.set(ev.round, (roundAllyDmg.get(ev.round) ?? 0) + total);
            } else if (side === 'enemy') {
              roundEnemyDmg.set(ev.round, (roundEnemyDmg.get(ev.round) ?? 0) + total);
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
        const amt = Math.max(0, ev.amount ?? 0);
        if (actor && amt > 0) {
          actor.healingDone += amt;
          const sk = ensureSkillEntry(
            actor.skills,
            ev.flags?.isRegen ? ev.skillId ?? 'regen_hp' : skillKey
          );
          sk.healing += amt;
        }
        break;
      }

      case 'shield_grant': {
        const amt = Math.max(0, ev.amount ?? 0);
        if (actor && amt > 0) {
          actor.shieldGranted += amt;
          const sk = ensureSkillEntry(
            actor.skills,
            ev.skillId && ev.skillId.length > 0 ? ev.skillId : 'defend'
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
        if (actor && ev.actorId !== ev.targetId) {
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

  const allyTeam = createEmptyTeamStats('ally', units);
  const enemyTeam = createEmptyTeamStats('enemy', units);
  const unitList: UnitBattleStats[] = [];

  for (const stat of unitStatsMap.values()) {
    stat.critRate =
      stat.hits > 0 ? Math.round((stat.crits / stat.hits) * 1000) / 10 : 0;
    stat.damagePerTurn =
      stat.turnsTaken > 0
        ? Math.round((stat.damageDealt / stat.turnsTaken) * 10) / 10
        : stat.damageDealt;
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

  allyTeam.critRate =
    allyTeam.hits > 0
      ? Math.round((allyTeam.crits / allyTeam.hits) * 1000) / 10
      : 0;
  enemyTeam.critRate =
    enemyTeam.hits > 0
      ? Math.round((enemyTeam.crits / enemyTeam.hits) * 1000) / 10
      : 0;

  // Build cumulative per-round damage series (1..maxRound)
  const roundDamageSeries: RoundDamagePoint[] = [];
  let cumAlly = 0;
  let cumEnemy = 0;
  for (let r = 1; r <= maxRound; r++) {
    cumAlly += roundAllyDmg.get(r) ?? 0;
    cumEnemy += roundEnemyDmg.get(r) ?? 0;
    roundDamageSeries.push({
      round: r,
      allyCumulativeDamage: cumAlly,
      enemyCumulativeDamage: cumEnemy,
    });
  }

  // Deduplicate & order HP snapshots by round (latest snapshot for each round wins)
  const snapByRound = new Map<number, BattleRoundSnapshot>();
  for (const snap of roundSnapshots) {
    snapByRound.set(snap.round, snap);
  }
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
      const v = selector(u);
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
