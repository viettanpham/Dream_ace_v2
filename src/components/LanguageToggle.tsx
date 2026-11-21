import { useI18n } from '../i18n';

export function LanguageToggle() {
  const { lang, setLanguage } = useI18n();

  return (
    <div
      className="inline-flex items-center p-0.5 rounded border border-slate-800 bg-slate-900/90"
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => setLanguage('vi')}
        aria-pressed={lang === 'vi'}
        className={`h-8 px-2.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
          lang === 'vi'
            ? 'bg-amber-500 text-slate-950'
            : 'text-slate-400 hover:text-slate-100'
        }`}
      >
        VI
      </button>
      <button
        type="button"
        onClick={() => setLanguage('en')}
        aria-pressed={lang === 'en'}
        className={`h-8 px-2.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
          lang === 'en'
            ? 'bg-amber-500 text-slate-950'
            : 'text-slate-400 hover:text-slate-100'
        }`}
      >
        EN
      </button>
    </div>
  );
}
