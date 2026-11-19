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

export const MECH_CLASSES: Record<MechClassId, MechClassDefinition> = {
  striker: {
    id: 'striker',
    name: 'Striker',
    chassisCode: 'VX-04 Vanguard',
    role: 'Balanced Assault',
    description:
      'Versatile front-line combat frame combining reliable weapon output, solid armor plating, and responsive thrusters.',
    accentHex: '#F59E0B',
    baseStats: {
      attack: 16,
      defense: 12,
      fuel: 12,
      spirit: 10,
      shield: 10,
      evasion: 10,
    },
    perPointGain: {
      attack: 4,
      defense: 3,
      fuel: 3,
      spirit: 2,
      shield: 2,
      evasion: 2,
    },
    baseHp: 130,
    baseShield: 55,
    baseSp: 28,
    baseSpeed: 20,
    signatureSkillId: 'overdrive_barrage',
  },
  interceptor: {
    id: 'interceptor',
    name: 'Interceptor',
    chassisCode: 'RX-09 Kestrel',
    role: 'High-Speed Skirmisher',
    description:
      'Ultra-light recon-strike chassis built to seize first turn, evade incoming fire, and dismantle priority targets.',
    accentHex: '#38BDF8',
    baseStats: {
      attack: 15,
      defense: 8,
      fuel: 18,
      spirit: 10,
      shield: 8,
      evasion: 16,
    },
    perPointGain: {
      attack: 4,
      defense: 1,
      fuel: 4,
      spirit: 2,
      shield: 1,
      evasion: 4,
    },
    baseHp: 105,
    baseShield: 40,
    baseSp: 26,
    baseSpeed: 28,
    signatureSkillId: 'phantom_volley',
  },
  siege: {
    id: 'siege',
    name: 'Siege',
    chassisCode: 'HX-12 Bastion',
    role: 'Heavy Artillery',
    description:
      'Heavily plated fire-support dreadnought capable of absorbing sustained bombardment and unleashing squad-wide railgun fire.',
    accentHex: '#EF4444',
    baseStats: {
      attack: 18,
      defense: 17,
      fuel: 7,
      spirit: 10,
      shield: 15,
      evasion: 6,
    },
    perPointGain: {
      attack: 5,
      defense: 4,
      fuel: 1,
      spirit: 2,
      shield: 4,
      evasion: 1,
    },
    baseHp: 165,
    baseShield: 80,
    baseSp: 24,
    baseSpeed: 12,
    signatureSkillId: 'orbital_railcannon',
  },
  support: {
    id: 'support',
    name: 'Support',
    chassisCode: 'AX-07 Aegis',
    role: 'Shield & Tactical Core',
    description:
      'High-reactor command frame designed to project restorative shield pulses and keep the squad operational under heavy fire.',
    accentHex: '#10B981',
    baseStats: {
      attack: 10,
      defense: 12,
      fuel: 13,
      spirit: 18,
      shield: 15,
      evasion: 11,
    },
    perPointGain: {
      attack: 2,
      defense: 3,
      fuel: 3,
      spirit: 5,
      shield: 4,
      evasion: 2,
    },
    baseHp: 125,
    baseShield: 85,
    baseSp: 38,
    baseSpeed: 22,
    signatureSkillId: 'aegis_pulse',
  },
};

export const MECH_CLASS_LIST: MechClassDefinition[] = [
  MECH_CLASSES.striker,
  MECH_CLASSES.interceptor,
  MECH_CLASSES.siege,
  MECH_CLASSES.support,
];
