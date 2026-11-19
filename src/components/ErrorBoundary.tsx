import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Check, Copy, RotateCcw, X } from 'lucide-react';
import { translate } from '../i18n';
import { useGameStore } from '../store/useGameStore';

export interface ErrorBoundaryProps {
  children: ReactNode;
  variant?: 'global' | 'panel';
  title?: string;
  onClose?: () => void;
  onReloadBattle?: () => void;
  resetKey?: string | number | boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
  copied: boolean;
}

function buildErrorReport(error: Error | null, componentStack: string): string {
  const name = error?.name || 'Error';
  const message = error?.message || 'Unknown error';
  const stack = error?.stack || '';
  const parts = [`${name}: ${message}`];
  if (stack) parts.push(stack);
  if (componentStack) parts.push(`Component Stack:${componentStack}`);
  return parts.join('\n\n');
}

async function copyTextSafe(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    if (typeof document !== 'undefined') {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    }
  } catch {
    // Ignore copy failure
  }
  return false;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      componentStack: '',
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const label = this.props.title || this.props.variant || 'panel';
    console.error(`[ErrorBoundary:${label}] Caught render error:`, error, errorInfo);
    this.setState({
      componentStack: errorInfo.componentStack ?? '',
    });
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.hasError &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({
        hasError: false,
        error: null,
        componentStack: '',
        copied: false,
      });
    }
  }

  componentWillUnmount(): void {
    if (this.copyTimer) {
      clearTimeout(this.copyTimer);
      this.copyTimer = null;
    }
  }

  private handleClose = () => {
    this.setState({
      hasError: false,
      error: null,
      componentStack: '',
      copied: false,
    });
    this.props.onClose?.();
  };

  private handleReload = () => {
    this.setState({
      hasError: false,
      error: null,
      componentStack: '',
      copied: false,
    });
    if (this.props.onReloadBattle) {
      this.props.onReloadBattle();
    } else if (typeof window !== 'undefined' && window.location) {
      window.location.reload();
    }
  };

  private handleCopy = async () => {
    const report = buildErrorReport(
      this.state.error,
      this.state.componentStack
    );
    const ok = await copyTextSafe(report);
    if (ok) {
      this.setState({ copied: true });
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => {
        this.setState({ copied: false });
      }, 2000);
    }
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const lang = (() => {
      try {
        return useGameStore.getState().language === 'en' ? 'en' : 'vi';
      } catch {
        return 'vi' as const;
      }
    })();

    const isGlobal = this.props.variant === 'global';
    const heading =
      this.props.title ||
      translate(lang, isGlobal ? 'error.title' : 'error.panelTitle');
    const description = translate(
      lang,
      isGlobal ? 'error.globalDescription' : 'error.description'
    );
    const errorText = this.state.error?.message || 'Unknown error';

    const card = (
      <div
        role="alertdialog"
        aria-modal="true"
        data-testid="error-boundary-fallback"
        className="w-full max-w-md rounded-xl border border-red-500/60 bg-[#0D1320] text-slate-100 p-5 shadow-2xl space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/15 border border-red-500/40 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="font-display text-lg font-bold text-red-200 leading-tight">
              {heading}
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        <pre className="rounded-lg border border-slate-800 bg-[#070B12] px-3 py-2 text-[11px] font-mono text-red-300 overflow-x-auto max-h-32 whitespace-pre-wrap break-words">
          {errorText}
        </pre>

        <div className="flex flex-wrap items-center gap-2">
          {this.props.onClose && (
            <button
              type="button"
              data-testid="error-boundary-close"
              onClick={this.handleClose}
              className="flex-1 min-h-[42px] px-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>{translate(lang, 'error.closeBtn')}</span>
            </button>
          )}

          <button
            type="button"
            data-testid="error-boundary-reload"
            onClick={this.handleReload}
            className="flex-1 min-h-[42px] px-3 rounded-lg border border-amber-500/60 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 font-semibold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>
              {translate(
                lang,
                this.props.onReloadBattle
                  ? 'error.reloadBattleBtn'
                  : 'error.reloadAppBtn'
              )}
            </span>
          </button>

          <button
            type="button"
            data-testid="error-boundary-copy"
            onClick={this.handleCopy}
            className="min-h-[42px] px-3 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {this.state.copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>{translate(lang, 'error.copiedBtn')}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>{translate(lang, 'error.copyErrorBtn')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    );

    if (isGlobal) {
      return (
        <div className="h-[100dvh] w-full bg-[#080C12] flex items-center justify-center p-4">
          {card}
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
        {card}
      </div>
    );
  }
}
