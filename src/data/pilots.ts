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
    'Starwing-5',
  ],
};

export interface EnemyArchetypeConfig {
  prefix: string[];
  suffixByClass: Record<MechClassId, string[]>;
}

/**
 * Enemy starfighter raiders and alien drones (no humanoid robots).
 */
export const ENEMY_ARCHETYPES: EnemyArchetypeConfig = {
  prefix: ['Void', 'Crimson', 'Obsidian', 'Dread', 'Nebula', 'Phantom', 'Solar', 'Xeno'],
  suffixByClass: {
    striker: ['Bomber', 'Corsair', 'Raider-Wing'],
    interceptor: ['Dart-Drone', 'Wasp-Fighter', 'Stalker-Craft'],
    siege: ['Gunship', 'Corvette', 'Dread-Cruiser'],
    support: ['Relay-Drone', 'Swarm-Probe', 'Aegis-Pod'],
  },
};
