import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render-time errors anywhere below it and shows a recovery screen
 * instead of unmounting the whole React tree (which would leave a blank page
 * until the user refreshes). Resetting clears the error and re-renders the
 * children — useful when a transient data shape from Supabase causes a throw.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to the console so the runtime-errors panel and devtools pick it up.
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
