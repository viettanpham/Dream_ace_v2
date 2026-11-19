import type {
  MechClassDefinition,
  MechClassId,
  StatBlock,
  StatKey,
  StatMeta,
} from '../types/game';

export const STAT_KEYS: StatKey[] = [
  'attack',
  'defense',
  'fuel',
  'spirit',
  'shield',
  'evasion',
];

export const EMPTY_STAT_BLOCK: StatBlock = {
  attack: 0,
  defense: 0,
  fuel: 0,
  spirit: 0,
  shield: 0,
  evasion: 0,
};

export const STAT_META: Record<StatKey, StatMeta> = {
  attack: {
    key: 'attack',
    label: 'Attack',
    shortLabel: 'ATK',
    effectSummary: 'Increases weapon damage & skill impact',
  },
  defense: {
    key: 'defense',
    label: 'Defense',
    shortLabel: 'DEF',
    effectSummary: 'Raises Max HP & reduces incoming hull damage',
  },
  fuel: {
    key: 'fuel',
    label: 'Fuel',
    shortLabel: 'FUL',
    effectSummary: 'Primary driver of Turn Speed & thruster output',
  },
  spirit: {
    key: 'spirit',
    label: 'Spirit',
    shortLabel: 'SPR',
    effectSummary: 'Increases Max SP, Skill Power & SP recovery',
  },
  shield: {
    key: 'shield',
    label: 'Shield',
    shortLabel: 'SHD',
    effectSummary: 'Expands rechargeable Energy Barrier capacity',
  },
  evasion: {
    key: 'evasion',
    label: 'Evasion',
    shortLabel: 'EVA',
    effectSummary: 'Improves Dodge %, Crit % & Turn Speed',
  },
};

/**
 * Exact per-point stat gains per Gear class:
 * - Siege:       ATK 4, EVA 1, DEF 3, SHD 4, SPR 3, FUEL 3
 * - Striker:     ATK 3, EVA 3, DEF 3, SHD 3, SPR 3, FUEL 3
 * - Interceptor: ATK 4, DEF 2, EVA 4, SHD 2, SPR 2, FUEL 2
 * - Support:     DEF 4, FUEL 3, ATK 2, EVA 2, SHD 3, SPR 4
 */
export const MECH_CLASSES: Record<MechClassId, MechClassDefinition> = {
  striker: {
    id: 'striker',
    name: 'Striker',
    chassisCode: 'VX-04 Bomber Gear',
    role: 'Heavy Bomber',
    description:
      'Wide-winged heavy bomber outfitted with ordnance bays, balanced stat growth, and devastating splash/charge salvos.',
    accentHex: '#F59E0B',
    baseStats: {
      attack: 16,
      defense: 12,
      fuel: 12,
      spirit: 12,
      shield: 11,
      evasion: 11,
    },
    perPointGain: {
      attack: 3,
      defense: 3,
      fuel: 3,
      spirit: 3,
      shield: 3,
      evasion: 3,
    },
    baseHp: 130,
    baseShield: 55,
    baseSp: 32,
    baseSpeed: 20,
    signatureSkillId: 'str_hotload_shells',
  },
  interceptor: {
    id: 'interceptor',
    name: 'Interceptor',
    chassisCode: 'RX-09 Dart Gear',
    role: 'Fast Dart Fighter',
    description:
      'Razor-slim dart starfighter specializing in armor-piercing bursts, counters, evasion maneuvers, and sensor disruption.',
    accentHex: '#38BDF8',
    baseStats: {
      attack: 16,
      defense: 9,
      fuel: 18,
      spirit: 11,
      shield: 9,
      evasion: 17,
    },
    perPointGain: {
      attack: 4,
      defense: 2,
      fuel: 2,
      spirit: 2,
      shield: 2,
      evasion: 4,
    },
    baseHp: 108,
    baseShield: 42,
    baseSp: 30,
    baseSpeed: 28,
    signatureSkillId: 'int_sabot_burst',
  },
  siege: {
    id: 'siege',
    name: 'Siege',
    chassisCode: 'HX-12 Gunship Gear',
    role: 'Heavy Gunship',
    description:
      'Bulky armored assault gunship built around deployable siege stances, shield breakers, and spinal railcannons.',
    accentHex: '#EF4444',
    baseStats: {
      attack: 18,
      defense: 17,
      fuel: 9,
      spirit: 12,
      shield: 16,
      evasion: 6,
    },
    perPointGain: {
      attack: 4,
      defense: 3,
      fuel: 3,
      spirit: 3,
      shield: 4,
      evasion: 1,
    },
    baseHp: 165,
    baseShield: 80,
    baseSp: 30,
    baseSpeed: 13,
    signatureSkillId: 'sge_anchor_protocol',
  },
  support: {
    id: 'support',
    name: 'Support',
    chassisCode: 'AX-07 Aegis Gear',
    role: 'Repair & Shield Craft',
    description:
      'Rounded command craft equipped with nanite emitters, stealth scanners, SP conduits, and fleet-wide tactical buffs.',
    accentHex: '#10B981',
    baseStats: {
      attack: 10,
      defense: 13,
      fuel: 13,
      spirit: 18,
      shield: 15,
      evasion: 11,
    },
    perPointGain: {
      attack: 2,
      defense: 4,
      fuel: 3,
      spirit: 4,
      shield: 3,
      evasion: 2,
    },
    baseHp: 128,
    baseShield: 85,
    baseSp: 42,
    baseSpeed: 22,
    signatureSkillId: 'sup_nanite_mend',
  },
};

export const MECH_CLASS_LIST: MechClassDefinition[] = [
  MECH_CLASSES.striker,
  MECH_CLASSES.interceptor,
  MECH_CLASSES.siege,
  MECH_CLASSES.support,
];
