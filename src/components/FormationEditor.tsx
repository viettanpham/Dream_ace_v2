import { useMemo, useState, type DragEvent } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  GripVertical,
  LayoutList,
  Sparkles,
} from 'lucide-react';
import { FORMATION_ROWS } from '../data/formationConfig';
import {
  createDefaultSquadFormation,
  getRowCounts,
  getRowModifier,
  sanitizeFormationConfig,
} from '../engine/formation';
import { getClassName, useI18n } from '../i18n';
import { useGameStore } from '../store/useGameStore';
import type { CombatRow, SquadFormationUnit } from '../types/game';
import { ClassIcon } from './GameIcons';

const ROW_ACCENT: Record<
  CombatRow,
  {
    border: string;
    activeBorder: string;
    badge: string;
    title: string;
    bar: string;
  }
> = {
  front: {
    border: 'border-amber-500/35 bg-[#0A101B]/95',
    activeBorder: 'border-amber-400 bg-amber-500/10',
    badge: 'border-amber-500/40 bg-amber-500/15 text-amber-200',
    title: 'text-amber-300',
    bar: 'bg-amber-400',
  },
  middle: {
    border: 'border-sky-500/35 bg-[#0A101B]/95',
    activeBorder: 'border-sky-400 bg-sky-500/10',
    badge: 'border-sky-500/40 bg-sky-500/15 text-sky-200',
    title: 'text-sky-300',
    bar: 'bg-sky-400',
  },
  back: {
    border: 'border-violet-500/35 bg-[#0A101B]/95',
    activeBorder: 'border-violet-400 bg-violet-500/10',
    badge: 'border-violet-500/40 bg-violet-500/15 text-violet-200',
    title: 'text-violet-300',
    bar: 'bg-violet-400',
  },
};

function formatSignedPct(val: number): string {
  const pct = Math.round(val * 100);
  return pct > 0 ? `+${pct}` : `${pct}`;
}

export function FormationEditor() {
  const { lang, t } = useI18n();
  const pilot = useGameStore((s) => s.pilot);
  const adminConfig = useGameStore((s) => s.adminConfig);
  const moveSquadUnitRow = useGameStore((s) => s.moveSquadUnitRow);
  const autoArrangeSquadFormation = useGameStore(
    (s) => s.autoArrangeSquadFormation
  );

  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [draggingUnitId, setDraggingUnitId] = useState<string | null>(null);
  const [dragOverRow, setDragOverRow] = useState<CombatRow | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: 'error' | 'info';
    message: string;
  } | null>(null);

  const formationConfig = useMemo(
    () => sanitizeFormationConfig(adminConfig.formation),
    [adminConfig.formation]
  );

  const squadUnits: SquadFormationUnit[] = useMemo(() => {
    if (pilot.squadFormation && pilot.squadFormation.length > 0) {
      return pilot.squadFormation.slice(0, formationConfig.maxUnitsPerSide);
    }
    return createDefaultSquadFormation(
      pilot.name,
      pilot.activeGearId,
      formationConfig
    ).slice(0, formationConfig.maxUnitsPerSide);
  }, [pilot.squadFormation, pilot.name, pilot.activeGearId, formationConfig]);

  const rowCounts = useMemo(() => getRowCounts(squadUnits), [squadUnits]);

  const selectedUnit = useMemo(
    () => squadUnits.find((u) => u.id === selectedUnitId) ?? null,
    [squadUnits, selectedUnitId]
  );

  const getRowLabel = (row: CombatRow): string => {
    if (row === 'front') return t('formation.row.front');
    if (row === 'middle') return t('formation.row.middle');
    return t('formation.row.back');
  };

  const getRowEffectSummary = (row: CombatRow): string => {
    const mod = getRowModifier(formationConfig, row);
    const parts: string[] = [];
    if (Math.abs(mod.defensePct) >= 0.005) {
      parts.push(
        t('formation.effectDef', { val: formatSignedPct(mod.defensePct) })
      );
    }
    if (Math.abs(mod.damagePct) >= 0.005) {
      parts.push(
        t('formation.effectDmg', { val: formatSignedPct(mod.damagePct) })
      );
    }
    if (Math.abs(mod.rangedDamagePct) >= 0.005) {
      parts.push(
        t('formation.effectRangedDmg', {
          val: formatSignedPct(mod.rangedDamagePct),
        })
      );
    }
    if (parts.length === 0 && row === 'middle') {
      return t('formation.effectNeutral');
    }
    const hint =
      row === 'front'
        ? t('formation.effectFrontHint')
        : row === 'middle'
        ? t('formation.effectMiddleHint')
        : t('formation.effectBackHint');
    return parts.length > 0 ? `${parts.join(' · ')} — ${hint}` : hint;
  };

  const attemptMove = (unitId: string, targetRow: CombatRow) => {
    const res = moveSquadUnitRow(unitId, targetRow);
    if (res.ok) {
      setSelectedUnitId(null);
      setFeedback(null);
      return;
    }
    if (res.reason === 'row_full') {
      setFeedback({
        kind: 'error',
        message: t('formation.rowFullError', {
          row: getRowLabel(targetRow),
          count: res.currentCount,
          cap: res.capacity,
        }),
      });
    } else if (res.reason === 'same_row') {
      setSelectedUnitId(null);
    }
  };

  const handleUnitTap = (unit: SquadFormationUnit) => {
    setFeedback(null);
    setSelectedUnitId((prev) => (prev === unit.id ? null : unit.id));
  };

  const handleRowTap = (targetRow: CombatRow) => {
    if (!selectedUnitId) return;
    attemptMove(selectedUnitId, targetRow);
  };

  const handleDragStart = (
    e: DragEvent<HTMLButtonElement>,
    unit: SquadFormationUnit
  ) => {
    setDraggingUnitId(unit.id);
    setSelectedUnitId(unit.id);
    setFeedback(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', unit.id);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, row: CombatRow) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverRow !== row) {
      setDragOverRow(row);
    }
  };

  const handleDragLeave = (row: CombatRow) => {
    if (dragOverRow === row) {
      setDragOverRow(null);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, targetRow: CombatRow) => {
    e.preventDefault();
    const droppedId =
      e.dataTransfer.getData('text/plain') || draggingUnitId || selectedUnitId;
    setDraggingUnitId(null);
    setDragOverRow(null);
    if (!droppedId) return;
    attemptMove(droppedId, targetRow);
  };

  const handleDragEnd = () => {
    setDraggingUnitId(null);
    setDragOverRow(null);
  };

  const handleAutoArrange = () => {
    autoArrangeSquadFormation();
    setSelectedUnitId(null);
    setFeedback({
      kind: 'info',
      message: t('formation.autoArrangedMsg'),
    });
  };

  return (
    <section
      aria-label={t('formation.title')}
      className="rounded-lg border border-slate-800/90 bg-[#0C121D]/95 p-4 space-y-4"
    >
      {/* Header + Auto Arrange */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <LayoutList className="w-5 h-5 text-amber-400 shrink-0" />
            <h2 className="font-display text-xl font-bold tracking-wide text-slate-100">
              {t('formation.title')}
            </h2>
            <span className="font-mono-nums text-[13px] font-semibold text-slate-300 px-2 py-0.5 rounded border border-slate-700 bg-slate-900">
              {t('formation.capacitySummary', {
                total: squadUnits.length,
                max: formationConfig.maxUnitsPerSide,
              })}
            </span>
          </div>
          <p className="text-[13px] text-slate-300 mt-1">
            {t('formation.subtitle')}
          </p>
        </div>

        <button
          type="button"
          onClick={handleAutoArrange}
          className="min-h-[44px] px-4 inline-flex items-center justify-center gap-2 rounded-lg border border-amber-400/60 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 text-sm font-semibold transition-colors cursor-pointer shrink-0"
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>{t('formation.autoArrange')}</span>
        </button>
      </div>

      {/* Live Selection Hint / Feedback Banner */}
      {feedback && (
        <div
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={`rounded-lg border px-3.5 py-2.5 flex items-center gap-2.5 text-[13px] font-medium ${
            feedback.kind === 'error'
              ? 'border-red-500/60 bg-red-500/15 text-red-200'
              : 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
          }`}
        >
          {feedback.kind === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {selectedUnit && (
        <div
          role="status"
          className="rounded-lg border border-sky-500/50 bg-sky-500/10 px-3.5 py-2.5 text-[13px] font-medium text-sky-200"
        >
          {t('formation.selectedHint', { unit: selectedUnit.name })}
        </div>
      )}

      {/* 3 Horizontal Rows (Front / Middle / Back) */}
      <div className="space-y-3">
        {FORMATION_ROWS.map((row) => {
          const unitsInRow = squadUnits
            .filter((u) => u.row === row)
            .sort((a, b) => a.formationCol - b.formationCol);
          const count = rowCounts[row];
          const capacity = formationConfig.rowCapacities[row];
          const isFull = count >= capacity;
          const isDropTarget = dragOverRow === row;
          const canTapRowToMove =
            selectedUnit !== null && selectedUnit.row !== row;
          const accent = ROW_ACCENT[row];

          return (
            <div
              key={row}
              data-formation-row={row}
              onClick={() => handleRowTap(row)}
              onDragOver={(e) => handleDragOver(e, row)}
              onDragLeave={() => handleDragLeave(row)}
              onDrop={(e) => handleDrop(e, row)}
              className={`rounded-lg border p-3.5 transition-colors space-y-2.5 ${
                isDropTarget || canTapRowToMove
                  ? accent.activeBorder
                  : accent.border
              } ${canTapRowToMove ? 'cursor-pointer' : ''}`}
            >
              {/* Row Header: Name, Effect Line, Capacity 2/3, Move Button */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${accent.bar}`}
                      aria-hidden="true"
                    />
                    <h3
                      className={`font-display text-base font-bold uppercase tracking-wide ${accent.title}`}
                    >
                      {getRowLabel(row)}
                    </h3>
                    <span
                      data-testid={`row-capacity-${row}`}
                      className={`font-mono-nums text-[13px] font-bold px-2 py-0.5 rounded border ${
                        isFull
                          ? 'border-red-500/50 bg-red-500/15 text-red-200'
                          : accent.badge
                      }`}
                    >
                      {count}/{capacity}
                    </span>
                    {isFull && (
                      <span className="font-mono-nums text-[13px] font-bold text-red-300">
                        {t('formation.rowFullBadge')}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-slate-300 leading-snug">
                    {getRowEffectSummary(row)}
                  </p>
                </div>

                {canTapRowToMove && (
                  <button
                    type="button"
                    data-testid={`move-to-${row}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRowTap(row);
                    }}
                    className={`min-h-[44px] px-3.5 inline-flex items-center gap-1.5 rounded-lg border text-[13px] font-semibold transition-colors cursor-pointer shrink-0 ${
                      isFull
                        ? 'border-red-500/50 bg-red-500/15 text-red-200 hover:bg-red-500/25'
                        : 'border-sky-400/70 bg-sky-500/20 text-sky-100 hover:bg-sky-500/30'
                    }`}
                  >
                    <ArrowRight className="w-4 h-4 shrink-0" />
                    <span>{t('formation.moveHere')}</span>
                  </button>
                )}
              </div>

              {/* Unit Chips inside this Row */}
              <div className="flex flex-wrap gap-2.5 pt-1">
                {unitsInRow.length === 0 ? (
                  <div className="w-full min-h-[44px] rounded-lg border border-dashed border-slate-700/80 bg-[#070B12]/70 px-3.5 py-2 flex items-center text-[13px] text-slate-400">
                    {t('formation.emptyRow')}
                  </div>
                ) : (
                  unitsInRow.map((unit) => {
                    const isSelected = selectedUnitId === unit.id;
                    return (
                      <button
                        key={unit.id}
                        type="button"
                        draggable
                        aria-pressed={isSelected}
                        data-testid={`formation-unit-${unit.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUnitTap(unit);
                        }}
                        onDragStart={(e) => handleDragStart(e, unit)}
                        onDragEnd={handleDragEnd}
                        className={`min-h-[44px] px-3.5 py-2 rounded-lg border inline-flex items-center gap-2.5 text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-amber-400 bg-amber-500/20 text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.4)]'
                            : 'border-slate-700/90 bg-slate-900/90 hover:border-slate-500 text-slate-100'
                        }`}
                      >
                        <GripVertical
                          className="w-4 h-4 text-slate-500 hidden sm:block shrink-0"
                          aria-hidden="true"
                        />
                        <ClassIcon
                          classId={unit.classId}
                          className="w-4 h-4 shrink-0"
                        />
                        <span className="text-sm font-semibold text-slate-100">
                          {unit.name}
                        </span>
                        <span className="text-[13px] text-slate-300">
                          {getClassName(lang, unit.classId)}
                        </span>
                        {unit.isPlayer && (
                          <span className="font-mono-nums text-[13px] font-bold text-amber-300 px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/50">
                            {t('formation.leadTag')}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
