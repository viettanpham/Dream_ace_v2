import type { SkillDefinition } from '../types/game';
import { BALANCE_CONFIG } from './balance';

export const SKILLS_CATALOG: Record<string, SkillDefinition> = {
  overdrive_barrage: {
    id: 'overdrive_barrage',
    name: 'Carpet Bomb Salvo',
    description:
      'Releases incendiary armor-piercing wing bombs dealing heavy damage, bypassing 35% Defense, and inflicting Burn (2 turns).',
    spCost: 14,
    spCostPerLevel: 1,
    targetType: 'single_enemy',
    powerMultiplier: 1.75,
    powerPerLevel: 0.22,
    defensePierce: 0.35,
    hits: 1,
    bonusCrit: 10,
    shieldRestoreRatio: 0,
    hpRestoreRatio: 0,
    appliesStatus: 'burn',
    statusDuration: 2,
    statusChance: 0.85,
  },
  phantom_volley: {
    id: 'phantom_volley',
    name: 'Twin Laser Strafe',
    description:
      'High-velocity twin strafing run with +25% crit chance that damages thrusters, applying Slow (-30% Speed, 2 turns).',
    spCost: 14,
    spCostPerLevel: 1,
    targetType: 'single_enemy',
    powerMultiplier: 0.92,
    powerPerLevel: 0.14,
    defensePierce: 0.2,
    hits: 2,
    bonusCrit: 25,
    shieldRestoreRatio: 0,
    hpRestoreRatio: 0,
    appliesStatus: 'slow',
    statusDuration: 2,
    statusChance: 0.85,
  },
  orbital_railcannon: {
    id: 'orbital_railcannon',
    name: 'Spinal Railcannon',
    description:
      'Fires a sweeping spinal railgun beam striking all enemies and inflicting Shield Break (disables shields 2 turns).',
    spCost: 18,
    spCostPerLevel: 2,
    targetType: 'all_enemies',
    powerMultiplier: 1.05,
    powerPerLevel: 0.16,
    defensePierce: 0.25,
    hits: 1,
    bonusCrit: 5,
    shieldRestoreRatio: 0,
    hpRestoreRatio: 0,
    appliesStatus: 'shield_break',
    statusDuration: 2,
    statusChance: 0.75,
  },
  aegis_pulse: {
    id: 'aegis_pulse',
    name: 'Aegis Repair Beam',
    description:
      'Projects a fleet-wide repair & barrier pulse restoring Shield and Hull HP while cleansing Burn, Slow, and Shield Break.',
    spCost: 16,
    spCostPerLevel: 1,
    targetType: 'all_allies',
    powerMultiplier: 0,
    powerPerLevel: 0,
    defensePierce: 0,
    hits: 1,
    bonusCrit: 0,
    shieldRestoreRatio: 0.45,
    hpRestoreRatio: 0.22,
    cleansesStatus: true,
  },
};

export function getSkillById(skillId: string): SkillDefinition {
  return SKILLS_CATALOG[skillId] ?? SKILLS_CATALOG.overdrive_barrage;
}

export function getScaledSkillStats(skill: SkillDefinition, level: number) {
  const clampedLv = Math.max(1, Math.min(BALANCE_CONFIG.skillMaxLevel, level));
  const extraLevels = clampedLv - 1;
  return {
    level: clampedLv,
    spCost: skill.spCost + extraLevels * skill.spCostPerLevel,
    powerMultiplier:
      skill.powerMultiplier > 0
        ? Number((skill.powerMultiplier + extraLevels * skill.powerPerLevel).toFixed(2))
        : 0,
    shieldRestoreRatio:
      skill.shieldRestoreRatio > 0
        ? Number((skill.shieldRestoreRatio + extraLevels * 0.08).toFixed(2))
        : 0,
    hpRestoreRatio:
      skill.hpRestoreRatio > 0
        ? Number((skill.hpRestoreRatio + extraLevels * 0.05).toFixed(2))
        : 0,
    statusChance: skill.statusChance
      ? Math.min(1, Number((skill.statusChance + extraLevels * 0.04).toFixed(2)))
      : 0,
  };
}
