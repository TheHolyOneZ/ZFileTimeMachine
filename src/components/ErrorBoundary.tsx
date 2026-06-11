import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;

  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', this.props.label ?? 'unknown', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertTriangle size={32} className="text-destructive" />
          <div>
            <p className="font-medium text-foreground">
              {this.props.label ? `${this.props.label} crashed` : 'Something went wrong'}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              {this.state.error.message}
            </p>
          </div>
          <button
            onClick={this.reset}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded bg-secondary
                       hover:bg-secondary/80 border border-border transition-colors"
          >
            <RotateCcw size={13} />
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
