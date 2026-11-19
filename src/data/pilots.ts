import type { MechClassId } from '../types/game';

export interface PilotNamePool {
  firstNames: string[];
  callsigns: string[];
}

export const ALLY_PILOT_POOL: PilotNamePool = {
  firstNames: [
    'Kaelen',
    'Sora',
    'Marek',
    'Lyra',
    'Dax',
    'Talia',
    'Ronan',
    'Vesper',
    'Orin',
    'Nyx',
    'Cassian',
    'Freya',
    'Juno',
    'Bram',
  ],
  callsigns: [
    'Valkyrie-2',
    'Cobalt-4',
    'Horizon-7',
    'Specter-3',
    'Atlas-9',
    'Kestrel-5',
    'Nomad-6',
    'Orion-8',
    'Zenith-3',
    'Aegis-2',
    'Falcon-4',
    'Bastion-5',
  ],
};

export interface EnemyArchetypeConfig {
  prefix: string[];
  suffixByClass: Record<MechClassId, string[]>;
}

export const ENEMY_ARCHETYPES: EnemyArchetypeConfig = {
  prefix: ['Iron', 'Crimson', 'Obsidian', 'Dread', 'Vanguard', 'Phantom', 'Void', 'Apex'],
  suffixByClass: {
    striker: ['Raider', 'Lancer', 'Trooper'],
    interceptor: ['Wasp', 'Stalker', 'Raptor'],
    siege: ['Goliath', 'Howitzer', 'Behemoth'],
    support: ['Warden', 'Conduit', 'Relayer'],
  },
};
