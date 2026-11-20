import { useEffect } from 'react';
import { X } from 'lucide-react';
import {
  getCatalog,
  ICON_CATALOG_GROUPS,
  type IconCatalogGroupInfo,
} from '../data/iconCatalog';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n/en';
import { useGameStore } from '../store/useGameStore';
import type { StatusBadgeLayout } from '../types/game';
import { CatalogIcon } from './CatalogIcon';

interface IconCatalogPreviewModalProps {
  open: boolean;
  onClose: () => void;
  badgeLayout?: StatusBadgeLayout;
}

export function IconCatalogPreviewModal({
  open,
  onClose,
  badgeLayout = 'B',
}: IconCatalogPreviewModalProps) {
  const { t } = useI18n();
  const iconCatalogMods = useGameStore(
    (s) => s.adminConfig.iconCatalogMods
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const catalog = getCatalog(iconCatalogMods);

  return (
    <div
      data-testid="icon-catalog-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t('iconCatalog.title')}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-4xl h-[92dvh] sm:h-[85dvh] rounded-t-2xl sm:rounded-xl border border-slate-700 bg-[#0A101B] text-slate-100 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-800 bg-[#0E1624] flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold tracking-wide text-slate-50 truncate">
              {t('iconCatalog.title')}
            </h2>
            <p className="text-[11px] text-slate-400 truncate">
              {t('iconCatalog.subtitle', { total: catalog.length })}
            </p>
          </div>
          <button
            type="button"
            data-testid="icon-catalog-close"
            onClick={onClose}
            aria-label={t('common.close')}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Grouped Read-Only Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto tactical-scroll p-4 space-y-5">
          {ICON_CATALOG_GROUPS.map((group: IconCatalogGroupInfo) => {
            const rows = catalog.filter((r) => r.group === group.id);
            return (
              <section
                key={group.id}
                data-testid={`icon-catalog-group-${group.id}`}
                className="space-y-2"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    {t(`iconCatalog.group.${group.id}` as TranslationKey)}
                  </h3>
                  <span className="text-[11px] font-mono-nums text-slate-400">
                    {rows.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {rows.map((row) => {
                    const isSys = row.tag === 'sys';
                    return (
                      <div
                        key={row.id}
                        data-testid={`icon-catalog-row-${row.id}`}
                        className="rounded-lg border border-slate-800/90 bg-[#0D1422] px-2.5 py-2 flex items-center gap-2.5"
                      >
                        <CatalogIcon
                          row={row}
                          size="lg"
                          badgeLayout={badgeLayout}
                          showBadges={false}
                          showArrowBadge={true}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-mono-nums text-[11px] font-bold text-slate-300">
                              {row.id}
                            </span>
                            <span
                              data-testid={`icon-catalog-tag-${row.id}`}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono-nums font-bold ${
                                isSys
                                  ? 'bg-slate-800 text-slate-300'
                                  : 'bg-purple-500/20 text-purple-200 border border-purple-400/40'
                              }`}
                            >
                              {isSys ? t('iconCatalog.tagSys') : t('iconCatalog.tagMods')}
                            </span>
                          </div>
                          <div className="text-xs text-slate-100 truncate mt-0.5">
                            {row.nameVi}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
