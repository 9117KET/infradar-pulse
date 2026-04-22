import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

type Variant = 'page' | 'inline' | 'silent';

interface Props {
  children: ReactNode;
  /**
   * - `page`    : full-screen recovery card (use only at the App root).
   * - `inline`  : small notice that does NOT replace the whole page — used by
   *               layouts so a single broken component cannot blank the site.
   * - `silent`  : renders a tiny placeholder; use to wrap optional widgets
   *               (e.g. WebGL globes) that should fail without disturbing the
   *               surrounding page.
   */
  variant?: Variant;
  /** Optional custom fallback to render in place of the default. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render-time errors anywhere below it. Variant controls how the
 * fallback looks so a single component error never causes the whole page to
 * appear broken to visitors (or to compliance reviewers like Paddle's).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Render error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { variant = 'page', fallback } = this.props;

    if (fallback) return <>{fallback}</>;

    if (variant === 'silent') {
      return (
        <div className="w-full h-full min-h-[120px] flex items-center justify-center text-xs text-muted-foreground p-4">
          Visualization unavailable in this browser.
        </div>
      );
    }

    if (variant === 'inline') {
      return (
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
          <div className="glass-panel rounded-xl p-6 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium">Part of this page didn't load</p>
              <p className="text-xs text-muted-foreground">
                Something on this page failed to render. The rest of the site is
                still available — try again or reload.
              </p>
              <div className="flex gap-2 pt-1">
                <Button onClick={this.handleReset} variant="outline" size="sm">
                  Try again
                </Button>
                <Button onClick={this.handleReload} size="sm" className="teal-glow">
                  Reload
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // variant === 'page'
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-16 bg-background">
        <div className="glass-panel rounded-xl p-8 sm:p-10 max-w-lg w-full text-center space-y-4">
          <h1 className="font-serif text-2xl font-bold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            We hit an unexpected error rendering this page. You can try again or
            reload the site.
          </p>
          {this.state.error?.message && (
            <pre className="text-xs text-left bg-background/40 border border-border/60 rounded-md p-3 overflow-auto max-h-40 whitespace-pre-wrap text-muted-foreground">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <Button onClick={this.handleReset} variant="outline">
              Try again
            </Button>
            <Button onClick={this.handleReload} className="teal-glow">
              Reload page
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
