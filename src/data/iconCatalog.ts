/**
 * Icon Catalog Loader
 *
 * Where to add new icon rows (no code changes needed):
 * - Built-in ("sys") icons: add objects to `src/data/iconCatalog.json`.
 * - Custom ("mods") icons: add entries to `AdminConfig.iconCatalogMods`
 *   (new `id` appends with tag "mods"; existing `id` overrides `symbol`/`layers`, `color`, or `nameVi`).
 */

import rawIconCatalog from './iconCatalog.json';
import type {
  IconCatalogGroupId,
  IconCatalogKind,
  IconCatalogLayer,
  IconCatalogModRow,
  IconCatalogRow,
  IconCatalogTag,
} from '../types/game';

export const FORBIDDEN_ICON_SYMBOLS = [
  'radioactive',
  'auto_awesome',
  'auto_fix_high',
  'expand_less',
  'expand_more',
  'gps_fixed',
  'gpp_good',
] as const;

const FORBIDDEN_SYMBOL_SET = new Set<string>(FORBIDDEN_ICON_SYMBOLS);

const VALID_GROUPS = new Set<IconCatalogGroupId>([
  'BS',
  'SS',
  'BF',
  'DB',
  'DT',
  'CC',
  'EV',
  'RW',
]);

const VALID_KINDS = new Set<IconCatalogKind>(['normal', 'buff', 'debuff']);
const VALID_TAGS = new Set<IconCatalogTag>(['sys', 'mods']);
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export interface IconCatalogGroupInfo {
  id: IconCatalogGroupId;
  nameVi: string;
}

export const ICON_CATALOG_GROUPS: readonly IconCatalogGroupInfo[] = [
  { id: 'BS', nameVi: 'Chỉ số cơ bản' },
  { id: 'SS', nameVi: 'Chỉ số phụ' },
  { id: 'BF', nameVi: 'Buff' },
  { id: 'DB', nameVi: 'Debuff chỉ số' },
  { id: 'DT', nameVi: 'Sát thương theo lượt (DoT)' },
  { id: 'CC', nameVi: 'Khống chế & đặc biệt' },
  { id: 'EV', nameVi: 'Sự kiện & nhiệm vụ' },
  { id: 'RW', nameVi: 'Phần thưởng & kinh tế' },
] as const;

function assertValidSymbol(symbol: unknown, rowId: string, ctx: string): string {
  if (typeof symbol !== 'string' || symbol.trim().length === 0) {
    throw new Error(`Icon catalog row "${rowId}": ${ctx} must be a non-empty string.`);
  }
  const trimmed = symbol.trim();
  if (trimmed === 'composite') {
    throw new Error(
      `Icon catalog row "${rowId}": ${ctx} cannot be "composite"; use "layers" instead.`
    );
  }
  if (FORBIDDEN_SYMBOL_SET.has(trimmed)) {
    throw new Error(
      `Icon catalog row "${rowId}": ${ctx} uses forbidden symbol "${trimmed}".`
    );
  }
  return trimmed;
}

function assertValidHexColor(color: unknown, rowId: string, ctx: string): string {
  if (typeof color !== 'string' || !HEX_COLOR_RE.test(color)) {
    throw new Error(
      `Icon catalog row "${rowId}": invalid hex color "${String(color)}" for ${ctx} (expected #RRGGBB).`
    );
  }
  return color;
}

function validateLayers(
  layers: unknown,
  rowId: string
): IconCatalogLayer[] {
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new Error(`Icon catalog row "${rowId}": "layers" must be a non-empty array.`);
  }
  return layers.map((layer, index) => {
    if (!layer || typeof layer !== 'object') {
      throw new Error(
        `Icon catalog row "${rowId}": layer[${index}] must be an object.`
      );
    }
    const rawLayer = layer as Record<string, unknown>;
    const symbol = assertValidSymbol(rawLayer.symbol, rowId, `layer[${index}].symbol`);
    const color = assertValidHexColor(rawLayer.color, rowId, `layer[${index}].color`);
    const opacity = rawLayer.opacity;
    if (
      typeof opacity !== 'number' ||
      !Number.isFinite(opacity) ||
      opacity <= 0 ||
      opacity > 1
    ) {
      throw new Error(
        `Icon catalog row "${rowId}": layer[${index}].opacity must be a number in (0, 1].`
      );
    }
    return { symbol, color, opacity };
  });
}

export function validateIconCatalogRow(raw: unknown): IconCatalogRow {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Icon catalog row must be an object.');
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== 'string' || obj.id.trim().length < 3) {
    throw new Error(`Icon catalog row has invalid id "${String(obj.id)}".`);
  }
  const id = obj.id.trim();

  if (typeof obj.nameVi !== 'string' || obj.nameVi.trim().length === 0) {
    throw new Error(`Icon catalog row "${id}": "nameVi" must be a non-empty string.`);
  }
  const nameVi = obj.nameVi.trim();

  if (typeof obj.group !== 'string' || !VALID_GROUPS.has(obj.group as IconCatalogGroupId)) {
    throw new Error(`Icon catalog row "${id}": invalid group "${String(obj.group)}".`);
  }
  const group = obj.group as IconCatalogGroupId;
  if (!id.startsWith(group)) {
    throw new Error(
      `Icon catalog row "${id}": group "${group}" does not match id prefix.`
    );
  }

  if (typeof obj.kind !== 'string' || !VALID_KINDS.has(obj.kind as IconCatalogKind)) {
    throw new Error(
      `Icon catalog row "${id}": invalid kind "${String(obj.kind)}" (expected normal|buff|debuff).`
    );
  }
  const kind = obj.kind as IconCatalogKind;

  const color = assertValidHexColor(obj.color, id, 'color');

  const tag = (obj.tag ?? 'sys') as IconCatalogTag;
  if (!VALID_TAGS.has(tag)) {
    throw new Error(`Icon catalog row "${id}": invalid tag "${String(obj.tag)}".`);
  }

  const hasSymbol = obj.symbol !== undefined;
  const hasLayers = obj.layers !== undefined;
  if (hasSymbol && hasLayers) {
    throw new Error(
      `Icon catalog row "${id}": cannot specify both "symbol" and "layers".`
    );
  }
  if (!hasSymbol && !hasLayers) {
    throw new Error(
      `Icon catalog row "${id}": must specify either "symbol" or "layers".`
    );
  }

  if (hasLayers) {
    const layers = validateLayers(obj.layers, id);
    return {
      id,
      nameVi,
      group,
      layers,
      color,
      kind,
      tag,
    };
  }

  const symbol = assertValidSymbol(obj.symbol, id, 'symbol');
  return {
    id,
    nameVi,
    group,
    symbol,
    color,
    kind,
    tag,
  };
}

export function validateIconCatalog(rows: unknown): IconCatalogRow[] {
  if (!Array.isArray(rows)) {
    throw new Error('Icon catalog data must be an array.');
  }
  const seenIds = new Set<string>();
  const validated: IconCatalogRow[] = [];

  for (const row of rows) {
    const validRow = validateIconCatalogRow(row);
    if (seenIds.has(validRow.id)) {
      throw new Error(`Icon catalog contains duplicate id "${validRow.id}".`);
    }
    seenIds.add(validRow.id);
    validated.push(validRow);
  }

  return validated;
}

const SYS_ICON_CATALOG: readonly IconCatalogRow[] =
  validateIconCatalog(rawIconCatalog);

function cloneRow(row: IconCatalogRow): IconCatalogRow {
  if (row.layers) {
    return {
      ...row,
      layers: row.layers.map((l) => ({ ...l })),
    };
  }
  return { ...row };
}

/**
 * Returns the sys catalog merged with optional "mods" rows (from AdminConfig.iconCatalogMods).
 * - New id: validated and appended with tag "mods".
 * - Existing id: overrides symbol/layers, color, or nameVi and marks tag "mods".
 */
export function getCatalog(mods?: readonly IconCatalogModRow[] | null): IconCatalogRow[] {
  const result = SYS_ICON_CATALOG.map(cloneRow);
  if (!Array.isArray(mods) || mods.length === 0) {
    return result;
  }

  const indexById = new Map<string, number>();
  result.forEach((row, idx) => indexById.set(row.id, idx));

  for (const rawMod of mods) {
    if (!rawMod || typeof rawMod !== 'object') {
      throw new Error('Icon catalog mod row must be an object.');
    }
    if (typeof rawMod.id !== 'string' || rawMod.id.trim().length < 3) {
      throw new Error(`Icon catalog mod row has invalid id "${String(rawMod.id)}".`);
    }
    const id = rawMod.id.trim();
    const existingIdx = indexById.get(id);

    if (existingIdx !== undefined) {
      const base = result[existingIdx];
      const nextNameVi =
        rawMod.nameVi !== undefined
          ? typeof rawMod.nameVi === 'string' && rawMod.nameVi.trim().length > 0
            ? rawMod.nameVi.trim()
            : (() => {
                throw new Error(
                  `Icon catalog row "${id}": "nameVi" must be a non-empty string.`
                );
              })()
          : base.nameVi;
      const nextColor =
        rawMod.color !== undefined
          ? assertValidHexColor(rawMod.color, id, 'color')
          : base.color;

      if (rawMod.layers !== undefined) {
        const layers = validateLayers(rawMod.layers, id);
        result[existingIdx] = {
          id: base.id,
          nameVi: nextNameVi,
          group: base.group,
          layers,
          color: nextColor,
          kind: base.kind,
          tag: 'mods',
        };
      } else if (rawMod.symbol !== undefined) {
        const symbol = assertValidSymbol(rawMod.symbol, id, 'symbol');
        result[existingIdx] = {
          id: base.id,
          nameVi: nextNameVi,
          group: base.group,
          symbol,
          color: nextColor,
          kind: base.kind,
          tag: 'mods',
        };
      } else {
        result[existingIdx] = {
          ...cloneRow(base),
          nameVi: nextNameVi,
          color: nextColor,
          tag: 'mods',
        };
      }
    } else {
      const inferredGroup = id.slice(0, 2) as IconCatalogGroupId;
      const candidate: Record<string, unknown> = {
        ...rawMod,
        id,
        group: rawMod.group ?? inferredGroup,
        kind: rawMod.kind ?? 'normal',
        tag: 'mods',
      };
      const validMod = validateIconCatalogRow(candidate);
      indexById.set(validMod.id, result.length);
      result.push(validMod);
    }
  }

  return result;
}

export function getCatalogRow(
  id: string,
  mods?: readonly IconCatalogModRow[] | null
): IconCatalogRow | undefined {
  return getCatalog(mods).find((row) => row.id === id);
}
