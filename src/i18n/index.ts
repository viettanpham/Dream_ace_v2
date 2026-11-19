import { useCallback } from 'react';
import { AFFIX_SUFFIX_MAP, getItemTemplate } from '../data/items';
import { useGameStore } from '../store/useGameStore';
import type {
  AutoStopReason,
  BattleSkillUsability,
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
  SkillCategory,
  SkillTargetType,
  StatKey,
  StatusEffectType,
  TacticsCondition,
  TacticsPresetId,
  TacticsRule,
  TacticsTargetSelector,
  TeamColorRole,
} from '../types/game';
import { BALANCE_CONFIG } from '../data/balance';
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

export function getSkillCategoryLabel(
  lang: Language,
  category: SkillCategory
): string {
  return translate(lang, `skill.category.${category}` as TranslationKey);
}

export function getSkillTargetLabel(
  lang: Language,
  targetType: SkillTargetType
): string {
  return translate(lang, `skill.target.${targetType}` as TranslationKey);
}

export function getBattleSkillReason(
  lang: Language,
  usability: BattleSkillUsability
): string | null {
  if (usability.canUse) return null;
  return translate(lang, `battle.skillReason.${usability.reason}` as TranslationKey, {
    turns: usability.cooldownRemaining,
    cost: usability.spCost,
  });
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

export function getStatusDesc(
  lang: Language,
  status: StatusEffectType
): string {
  return translate(lang, `status.${status}.desc` as TranslationKey);
}

export function getArchetypeLabel(
  lang: Language,
  archetype: EnemyArchetype
): string {
  return translate(lang, `archetype.${archetype}` as TranslationKey);
}

export function getTeamTagLabel(lang: Language, role: TeamColorRole): string {
  if (role === 'me' || role === 'ally') {
    return translate(lang, 'queue.teamTag.ally');
  }
  if (role === 'boss') {
    return translate(lang, 'queue.teamTag.boss');
  }
  return translate(lang, 'queue.teamTag.enemy');
}

export function getAutoStopReasonLabel(
  lang: Language,
  reason: AutoStopReason
): string {
  return translate(lang, `auto.repeatReason.${reason}` as TranslationKey, {
    max: BALANCE_CONFIG.maxInventorySize,
  });
}

export function getTacticsPresetLabel(
  lang: Language,
  presetId: TacticsPresetId
): string {
  return translate(lang, `auto.preset.${presetId}` as TranslationKey);
}

export function getTacticsTargetLabel(
  lang: Language,
  selector: TacticsTargetSelector
): string {
  return translate(lang, `auto.target.${selector}` as TranslationKey);
}

export function formatTacticsConditionText(
  lang: Language,
  cond: TacticsCondition
): string {
  const buffLabel = cond.buffType ? getStatusLabel(lang, cond.buffType) : '';
  const skillLabel = cond.skillId ? getSkillName(lang, cond.skillId) : '—';
  return translate(lang, `auto.cond.${cond.kind}` as TranslationKey, {
    value: cond.value ?? 0,
    buff: buffLabel,
    skill: skillLabel,
  });
}

export function formatTacticsRuleSentence(
  lang: Language,
  rule: TacticsRule
): string {
  const ifWord = translate(lang, 'auto.colIf');
  const condStr = formatTacticsConditionText(lang, rule.condition);
  const actionStr =
    rule.action.type === 'defend'
      ? translate(lang, 'auto.actionDefend')
      : rule.action.type === 'skill' && rule.action.skillId
      ? getSkillName(lang, rule.action.skillId)
      : translate(lang, 'auto.actionAttack');
  const targetStr = getTacticsTargetLabel(lang, rule.targetSelector);
  return `${ifWord} ${condStr} → ${actionStr} → ${targetStr}`;
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
  const autoPrefix =
    entry.autoRuleNumber !== undefined
      ? entry.autoRuleNumber > 0
        ? `[AUTO #${entry.autoRuleNumber}] `
        : '[AUTO] '
      : '';
  return `${autoPrefix}${formatCombatLogBody(lang, entry)}`;
}

function formatCombatLogBody(
  lang: Language,
  entry: CombatLogEntry
): string {
  const p = entry.params;

  switch (entry.templateKey) {
    case 'log.battleStart': {
      const sectorId = String(p.sectorId ?? 'border_outpost');
      const diff = String(p.difficulty ?? 'Standard') as SectorDifficulty;
      return translate(lang, 'log.battleStart', {
        sector: getSectorName(lang, sectorId),
        difficulty: getDifficultyLabel(lang, diff),
      });
    }

    case 'log.defend': {
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

    case 'log.healSquad': {
      const skillId = String(p.skillId ?? 'sup_aegis_field');
      return translate(lang, 'log.healSquad', {
        actor: String(p.actor ?? ''),
        skill: getSkillName(lang, skillId),
        spCost: Number(p.spCost ?? 0),
        total: Number(p.total ?? 0),
      });
    }

    case 'log.healSingle': {
      const skillId = String(p.skillId ?? 'sup_nanite_mend');
      return translate(lang, 'log.healSingle', {
        actor: String(p.actor ?? ''),
        target: String(p.target ?? ''),
        skill: getSkillName(lang, skillId),
        amount: Number(p.amount ?? 0),
      });
    }

    case 'log.energize': {
      const skillId = String(p.skillId ?? 'sup_flux_transfer');
      return translate(lang, 'log.energize', {
        actor: String(p.actor ?? ''),
        target: String(p.target ?? ''),
        skill: getSkillName(lang, skillId),
        amount: Number(p.amount ?? 0),
      });
    }

    case 'log.evade': {
      const actionText = formatActionParam(lang, p);
      return translate(lang, 'log.evade', {
        target: String(p.target ?? ''),
        actor: String(p.actor ?? ''),
        action: actionText,
      });
    }

    case 'log.damage': {
      const actionText = formatActionParam(lang, p);
      const shd = Number(p.shieldAbsorbed ?? 0);
      const hp = Number(p.hullDamage ?? 0);
      const breakdown =
        shd > 0 && hp > 0
          ? translate(lang, 'log.breakdownBoth', { shield: shd, hp })
          : shd > 0
          ? translate(lang, 'log.breakdownShield', { shield: shd })
          : translate(lang, 'log.breakdownHp', { hp });
      const critTag = Number(p.isCrit ?? 0)
        ? translate(lang, 'log.critTag')
        : '';
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

    case 'log.destroyed': {
      const classId = String(p.classId ?? 'striker') as MechClassId;
      return translate(lang, 'log.destroyed', {
        target: String(p.target ?? ''),
        className: getClassName(lang, classId),
      });
    }

    case 'log.statusApplied': {
      const status = String(p.status ?? 'burn') as StatusEffectType;
      return translate(lang, 'log.statusApplied', {
        target: String(p.target ?? ''),
        status: getStatusLabel(lang, status),
        turns: Number(p.turns ?? 2),
      });
    }

    case 'log.burnTick':
      return translate(lang, 'log.burnTick', {
        target: String(p.target ?? ''),
        damage: Number(p.damage ?? 0),
      });

    case 'log.regenTick':
      return translate(lang, 'log.regenTick', {
        target: String(p.target ?? ''),
        amount: Number(p.amount ?? 0),
      });

    case 'log.statusCleansed':
      return translate(lang, 'log.statusCleansed', {
        actor: String(p.actor ?? ''),
      });

    case 'log.splashDamage':
      return translate(lang, 'log.splashDamage', {
        actor: String(p.actor ?? ''),
        target: String(p.target ?? ''),
        damage: Number(p.damage ?? 0),
      });

    case 'log.retreat':
      return translate(lang, 'log.retreat', {
        actor: String(p.actor ?? ''),
      });

    case 'log.buffApplied': {
      const skillId = String(p.skillId ?? 'gen_hull_brace');
      return translate(lang, 'log.buffApplied', {
        actor: String(p.actor ?? ''),
        skill: getSkillName(lang, skillId),
        spCost: Number(p.spCost ?? 0),
      });
    }

    case 'log.stanceToggle': {
      const skillId = String(p.skillId ?? 'sge_anchor_protocol');
      return translate(lang, 'log.stanceToggle', {
        actor: String(p.actor ?? ''),
        skill: getSkillName(lang, skillId),
        state: String(p.state ?? 'ON'),
      });
    }

    case 'log.charging': {
      const skillId = String(p.skillId ?? 'str_solar_capacitor');
      return translate(lang, 'log.charging', {
        actor: String(p.actor ?? ''),
        skill: getSkillName(lang, skillId),
      });
    }

    case 'log.counterAttack':
      return translate(lang, 'log.counterAttack', {
        target: String(p.target ?? ''),
        actor: String(p.actor ?? ''),
        damage: Number(p.damage ?? 0),
      });

    case 'log.scanReveal': {
      const skillId = String(p.skillId ?? 'sup_lidar_sweep');
      return translate(lang, 'log.scanReveal', {
        actor: String(p.actor ?? ''),
        skill: getSkillName(lang, skillId),
        revealed: Number(p.revealed ?? 0),
      });
    }

    case 'log.invincibleBlock':
      return translate(lang, 'log.invincibleBlock', {
        target: String(p.target ?? ''),
        actor: String(p.actor ?? ''),
      });

    case 'log.silencedBlocked':
      return translate(lang, 'log.silencedBlocked', {
        actor: String(p.actor ?? ''),
      });

    default:
      return '';
  }
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
