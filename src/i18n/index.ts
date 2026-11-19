import { useCallback } from 'react';
import { AFFIX_SUFFIX_MAP, getItemTemplate } from '../data/items';
import { useGameStore } from '../store/useGameStore';
import type {
  CombatLogEntry,
  CombatLogTag,
  EnemyArchetype,
  EquipmentSlot,
  EquipValidationResult,
  ItemInstance,
  ItemRarity,
  Language,
  MechClassId,
  SectorDifficulty,
  SkillTargetType,
  StatKey,
  StatusEffectType,
} from '../types/game';
import { EN_TRANSLATIONS, type TranslationKey } from './en';
import { VI_TRANSLATIONS } from './vi';

const DICTIONARIES: Record<Language, Record<TranslationKey, string>> = {
  vi: VI_TRANSLATIONS,
  en: EN_TRANSLATIONS,
};

export function translate(
  lang: Language,
  key: TranslationKey,
  params?: Record<string, string | number>
): string {
  const dict = DICTIONARIES[lang] ?? VI_TRANSLATIONS;
  let text = dict[key] ?? EN_TRANSLATIONS[key] ?? key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export function getClassName(lang: Language, classId: MechClassId): string {
  return translate(lang, `class.${classId}.name` as TranslationKey);
}

export function getClassCode(lang: Language, classId: MechClassId): string {
  return translate(lang, `class.${classId}.code` as TranslationKey);
}

export function getClassRole(lang: Language, classId: MechClassId): string {
  return translate(lang, `class.${classId}.role` as TranslationKey);
}

export function getClassDesc(lang: Language, classId: MechClassId): string {
  return translate(lang, `class.${classId}.desc` as TranslationKey);
}

export function getStatLabel(lang: Language, key: StatKey): string {
  return translate(lang, `stat.${key}.label` as TranslationKey);
}

export function getStatShort(lang: Language, key: StatKey): string {
  return translate(lang, `stat.${key}.short` as TranslationKey);
}

export function getStatDesc(lang: Language, key: StatKey): string {
  return translate(lang, `stat.${key}.desc` as TranslationKey);
}

export function getSkillName(lang: Language, skillId: string): string {
  return translate(lang, `skill.${skillId}.name` as TranslationKey);
}

export function getSkillDesc(lang: Language, skillId: string): string {
  return translate(lang, `skill.${skillId}.desc` as TranslationKey);
}

export function getSkillTargetLabel(
  lang: Language,
  targetType: SkillTargetType,
  hits: number
): string {
  if (targetType === 'all_enemies') {
    return translate(lang, 'skill.target.all_enemies');
  }
  if (targetType === 'all_allies') {
    return translate(lang, 'skill.target.all_allies');
  }
  if (hits > 1) {
    return translate(lang, 'skill.target.multi', { hits });
  }
  return translate(lang, 'skill.target.single');
}

export function getSectorName(lang: Language, sectorId: string): string {
  return translate(lang, `sector.${sectorId}.name` as TranslationKey);
}

export function getSectorRegion(lang: Language, sectorId: string): string {
  return translate(lang, `sector.${sectorId}.region` as TranslationKey);
}

export function getSectorDesc(lang: Language, sectorId: string): string {
  return translate(lang, `sector.${sectorId}.desc` as TranslationKey);
}

export function getDifficultyLabel(
  lang: Language,
  difficulty: SectorDifficulty
): string {
  return translate(lang, `difficulty.${difficulty}` as TranslationKey);
}

export function getSlotLabel(lang: Language, slot: EquipmentSlot): string {
  return translate(lang, `slot.${slot}` as TranslationKey);
}

export function getSlotShort(lang: Language, slot: EquipmentSlot): string {
  return translate(lang, `slotShort.${slot}` as TranslationKey);
}

export function getRarityLabel(lang: Language, rarity: ItemRarity): string {
  return translate(lang, `rarity.${rarity}` as TranslationKey);
}

export function getStatusLabel(
  lang: Language,
  status: StatusEffectType
): string {
  return translate(lang, `status.${status}` as TranslationKey);
}

export function getArchetypeLabel(
  lang: Language,
  archetype: EnemyArchetype
): string {
  return translate(lang, `archetype.${archetype}` as TranslationKey);
}

/**
 * Formats randomized ItemInstance name: Template Name + Affix-based Suffix (+Enchant).
 */
export function getItemInstanceName(
  lang: Language,
  instance: ItemInstance,
  includeEnchant = false
): string {
  const tpl = getItemTemplate(instance.templateId);
  const baseName = tpl
    ? lang === 'vi'
      ? tpl.nameVi
      : tpl.nameEn
    : instance.templateId;
  const suffixMeta = instance.suffixId
    ? AFFIX_SUFFIX_MAP[instance.suffixId]
    : null;
  const suffixText = suffixMeta
    ? lang === 'vi'
      ? ` ${suffixMeta.vi}`
      : ` ${suffixMeta.en}`
    : '';
  const enchantText =
    includeEnchant && instance.enchantLevel > 0
      ? ` +${instance.enchantLevel}`
      : '';
  return `${baseName}${suffixText}${enchantText}`;
}

export function getItemInstanceDesc(
  lang: Language,
  instance: ItemInstance
): string {
  const tpl = getItemTemplate(instance.templateId);
  if (!tpl) return '';
  return lang === 'vi' ? tpl.descVi : tpl.descEn;
}

export function formatItemTraitsList(
  lang: Language,
  instance: ItemInstance
): string[] {
  const tr = instance.specialTraits;
  if (!tr) return [];
  const list: string[] = [];
  if (tr.critBonusPct) {
    list.push(translate(lang, 'trait.crit', { val: tr.critBonusPct }));
  }
  if (tr.armorPiercePct) {
    list.push(translate(lang, 'trait.pierce', { val: tr.armorPiercePct }));
  }
  if (tr.splashPct) {
    list.push(translate(lang, 'trait.splash', { val: tr.splashPct }));
  }
  if (tr.spRegenPerTurn) {
    list.push(translate(lang, 'trait.spRegen', { val: tr.spRegenPerTurn }));
  }
  if (tr.evasionMod) {
    list.push(
      translate(lang, 'trait.evasionMod', {
        val: tr.evasionMod > 0 ? `+${tr.evasionMod}` : tr.evasionMod,
      })
    );
  }
  return list;
}

export function getLogTagLabel(lang: Language, tag: CombatLogTag): string {
  return translate(lang, `log.tag.${tag}` as TranslationKey);
}

export function formatEquipValidationReason(
  lang: Language,
  validation: EquipValidationResult
): string | null {
  if (validation.canEquip) return null;
  const parts: string[] = [];
  if (validation.missingLevel !== null) {
    parts.push(translate(lang, 'common.reqLevel', { level: validation.missingLevel }));
  }
  if (validation.requiredClass !== null) {
    parts.push(
      translate(lang, 'common.reqClass', {
        className: getClassName(lang, validation.requiredClass),
      })
    );
  }
  if (validation.equippedOnOtherGear !== null) {
    parts.push(
      translate(lang, 'common.equippedOnGear', {
        gear: getClassName(lang, validation.equippedOnOtherGear),
      })
    );
  }
  return parts.join(' · ');
}

export function formatCombatLogMessage(
  lang: Language,
  entry: CombatLogEntry
): string {
  const p = entry.params;

  if (entry.templateKey === 'log.battleStart') {
    const sectorId = String(p.sectorId ?? 'border_outpost');
    const diff = String(p.difficulty ?? 'Standard') as SectorDifficulty;
    return translate(lang, 'log.battleStart', {
      sector: getSectorName(lang, sectorId),
      difficulty: getDifficultyLabel(lang, diff),
    });
  }

  if (entry.templateKey === 'log.defend') {
    const shd = Number(p.shieldRecovered ?? 0);
    const sp = Number(p.spRecovered ?? 0);
    const shieldPart =
      shd > 0 ? `, +${shd} ${getStatShort(lang, 'shield')}` : '';
    const spPart = sp > 0 ? `, +${sp} SP` : '';
    return translate(lang, 'log.defend', {
      actor: String(p.actor ?? ''),
      shieldPart,
      spPart,
    });
  }

  if (entry.templateKey === 'log.healSquad') {
    const skillId = String(p.skillId ?? 'aegis_pulse');
    return translate(lang, 'log.healSquad', {
      actor: String(p.actor ?? ''),
      skill: getSkillName(lang, skillId),
      spCost: Number(p.spCost ?? 0),
      total: Number(p.total ?? 0),
    });
  }

  if (entry.templateKey === 'log.evade') {
    const actionText = formatActionParam(lang, p);
    return translate(lang, 'log.evade', {
      target: String(p.target ?? ''),
      actor: String(p.actor ?? ''),
      action: actionText,
    });
  }

  if (entry.templateKey === 'log.damage') {
    const actionText = formatActionParam(lang, p);
    const shd = Number(p.shieldAbsorbed ?? 0);
    const hp = Number(p.hullDamage ?? 0);
    const breakdown =
      shd > 0 && hp > 0
        ? translate(lang, 'log.breakdownBoth', { shield: shd, hp })
        : shd > 0
        ? translate(lang, 'log.breakdownShield', { shield: shd })
        : translate(lang, 'log.breakdownHp', { hp });
    const critTag = Number(p.isCrit ?? 0) ? translate(lang, 'log.critTag') : '';
    const defendTag = Number(p.isDefending ?? 0)
      ? translate(lang, 'log.defendTag')
      : '';

    return translate(lang, 'log.damage', {
      actor: String(p.actor ?? ''),
      action: actionText,
      target: String(p.target ?? ''),
      breakdown,
      critTag,
      defendTag,
    });
  }

  if (entry.templateKey === 'log.destroyed') {
    const classId = String(p.classId ?? 'striker') as MechClassId;
    return translate(lang, 'log.destroyed', {
      target: String(p.target ?? ''),
      className: getClassName(lang, classId),
    });
  }

  if (entry.templateKey === 'log.statusApplied') {
    const status = String(p.status ?? 'burn') as StatusEffectType;
    return translate(lang, 'log.statusApplied', {
      target: String(p.target ?? ''),
      status: getStatusLabel(lang, status),
      turns: Number(p.turns ?? 2),
    });
  }

  if (entry.templateKey === 'log.burnTick') {
    return translate(lang, 'log.burnTick', {
      target: String(p.target ?? ''),
      damage: Number(p.damage ?? 0),
    });
  }

  if (entry.templateKey === 'log.statusCleansed') {
    return translate(lang, 'log.statusCleansed', {
      actor: String(p.actor ?? ''),
    });
  }

  if (entry.templateKey === 'log.splashDamage') {
    return translate(lang, 'log.splashDamage', {
      actor: String(p.actor ?? ''),
      target: String(p.target ?? ''),
      damage: Number(p.damage ?? 0),
    });
  }

  if (entry.templateKey === 'log.retreat') {
    return translate(lang, 'log.retreat', {
      actor: String(p.actor ?? ''),
    });
  }

  return '';
}

function formatActionParam(
  lang: Language,
  params: Record<string, string | number>
): string {
  const skillId = params.skillId ? String(params.skillId) : '';
  const hitIndex = Number(params.hitIndex ?? 0);
  const totalHits = Number(params.totalHits ?? 1);

  if (!skillId) {
    return translate(lang, 'log.primaryWeapons');
  }
  const base = getSkillName(lang, skillId);
  return totalHits > 1 ? `${base} (${hitIndex}/${totalHits})` : base;
}

export function useI18n() {
  const lang = useGameStore((s) => s.language);
  const setLanguage = useGameStore((s) => s.setLanguage);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      translate(lang, key, params),
    [lang]
  );

  return { lang, t, setLanguage };
}
