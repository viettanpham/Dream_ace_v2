import type { SkillDefinition } from '../types/game';

export const SKILLS_CATALOG: Record<string, SkillDefinition> = {
  overdrive_barrage: {
    id: 'overdrive_barrage',
    name: 'Overdrive Barrage',
    description:
      'Focused twin-cannon burst dealing heavy damage and piercing 35% of target Defense.',
    spCost: 14,
    targetType: 'single_enemy',
    powerMultiplier: 1.75,
    defensePierce: 0.35,
    hits: 1,
    bonusCrit: 10,
    shieldRestoreRatio: 0,
    hpRestoreRatio: 0,
  },
  phantom_volley: {
    id: 'phantom_volley',
    name: 'Phantom Volley',
    description:
      'High-velocity twin strike with +25% critical chance, punishing exposed light and medium hulls.',
    spCost: 14,
    targetType: 'single_enemy',
    powerMultiplier: 0.92,
    defensePierce: 0.2,
    hits: 2,
    bonusCrit: 25,
    shieldRestoreRatio: 0,
    hpRestoreRatio: 0,
  },
  orbital_railcannon: {
    id: 'orbital_railcannon',
    name: 'Railcannon Salvo',
    description:
      'Sweeping electromagnetic barrage that strikes every hostile mech on the field.',
    spCost: 18,
    targetType: 'all_enemies',
    powerMultiplier: 1.05,
    defensePierce: 0.25,
    hits: 1,
    bonusCrit: 5,
    shieldRestoreRatio: 0,
    hpRestoreRatio: 0,
  },
  aegis_pulse: {
    id: 'aegis_pulse',
    name: 'Aegis Pulse',
    description:
      'Projects a squad-wide energy surge restoring Shield integrity and repairing hull HP for all living allies.',
    spCost: 16,
    targetType: 'all_allies',
    powerMultiplier: 0,
    defensePierce: 0,
    hits: 1,
    bonusCrit: 0,
    shieldRestoreRatio: 0.45,
    hpRestoreRatio: 0.22,
  },
};

export function getSkillById(skillId: string): SkillDefinition {
  return SKILLS_CATALOG[skillId] ?? SKILLS_CATALOG.overdrive_barrage;
}
