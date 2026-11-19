import type { SectorDefinition } from '../types/game';

export const SECTORS_CATALOG: SectorDefinition[] = [
  {
    id: 'border_outpost',
    name: 'Kestrel Relay Outpost',
    regionCode: 'Sector 04',
    difficulty: 'Standard',
    levelOffset: 0,
    enemyCount: 4,
    hasBoss: false,
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
    hasBoss: false,
    expMultiplier: 1.35,
    creditsMultiplier: 1.4,
    description:
      'High-threat orbital salvage zone guarded by veteran raiders, snipers, and repair tenders.',
  },
  {
    id: 'iron_citadel',
    name: 'Helios Spire Approach',
    regionCode: 'Sector 14',
    difficulty: 'Elite',
    levelOffset: 2,
    enemyCount: 4,
    hasBoss: true,
    expMultiplier: 1.75,
    creditsMultiplier: 1.9,
    description:
      'Heavily fortified perimeter led by a Flagship Boss Cruiser (5x bounty) escorted by elite drones and repair ships.',
  },
];

export function getSectorById(sectorId: string): SectorDefinition {
  return SECTORS_CATALOG.find((s) => s.id === sectorId) ?? SECTORS_CATALOG[0];
}

export function getNextSectorId(currentSectorId: string): string | null {
  const idx = SECTORS_CATALOG.findIndex((s) => s.id === currentSectorId);
  if (idx === -1 || idx + 1 >= SECTORS_CATALOG.length) return null;
  return SECTORS_CATALOG[idx + 1].id;
}
