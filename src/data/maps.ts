import type { SectorDefinition } from '../types/game';

export const SECTORS_CATALOG: SectorDefinition[] = [
  {
    id: 'border_outpost',
    name: 'Kestrel Relay Outpost',
    regionCode: 'Sector 04',
    difficulty: 'Standard',
    levelOffset: 0,
    squadSize: 4,
    enemyCount: 4,
    hasBoss: false,
    expMultiplier: 1.0,
    creditsMultiplier: 1.0,
    description:
      '4v4 patrol skirmish against an evenly matched frontier squadron. Ideal for field-testing new stat allocations.',
  },
  {
    id: 'debris_belt',
    name: 'Caldera Fortress Belt',
    regionCode: 'Sector 09',
    difficulty: 'Hard',
    levelOffset: 1,
    squadSize: 6,
    enemyCount: 6,
    hasBoss: false,
    expMultiplier: 1.35,
    creditsMultiplier: 1.4,
    description:
      '6v6 Fortress assault zone guarded by orbital defense turrets, veteran raiders, snipers, and repair tenders.',
  },
  {
    id: 'iron_citadel',
    name: 'Helios Capital Spire',
    regionCode: 'Sector 14',
    difficulty: 'Elite',
    levelOffset: 2,
    squadSize: 8,
    enemyCount: 8,
    hasBoss: true,
    expMultiplier: 1.75,
    creditsMultiplier: 1.9,
    description:
      '8v8 Capital fleet battle led by a Flagship Boss Cruiser (5x bounty) and defense batteries.',
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
