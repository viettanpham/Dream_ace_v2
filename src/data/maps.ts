import type { SectorDefinition } from '../types/game';

export const SECTORS_CATALOG: SectorDefinition[] = [
  {
    id: 'border_outpost',
    name: 'Kestrel Relay Outpost',
    regionCode: 'Sector 04',
    difficulty: 'Standard',
    levelOffset: 0,
    enemyCount: 4,
    expMultiplier: 1.0,
    creditsMultiplier: 1.0,
    description:
      'Patrol skirmish against an evenly matched frontier squadron. Ideal for field-testing new stat allocations.',
  },
  {
    id: 'debris_belt',
    name: 'Caldera Debris Belt',
    regionCode: 'Sector 09',
    difficulty: 'Hard',
    levelOffset: 1,
    enemyCount: 4,
    expMultiplier: 1.35,
    creditsMultiplier: 1.4,
    description:
      'High-threat orbital salvage zone guarded by veteran raiders with elevated chassis tuning.',
  },
  {
    id: 'iron_citadel',
    name: 'Helios Spire Approach',
    regionCode: 'Sector 14',
    difficulty: 'Elite',
    levelOffset: 2,
    enemyCount: 4,
    expMultiplier: 1.75,
    creditsMultiplier: 1.9,
    description:
      'Heavily fortified perimeter defended by elite strike cadres. High risk, premium combat bounty.',
  },
];

export function getSectorById(sectorId: string): SectorDefinition {
  return SECTORS_CATALOG.find((s) => s.id === sectorId) ?? SECTORS_CATALOG[0];
}
