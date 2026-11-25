import { Component, type ErrorInfo, type ReactNode } from 'react';
import { TriangleAlert, RotateCcw } from 'lucide-react';

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
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex-1 grid place-items-center p-8">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 mx-auto rounded-[calc(13px*var(--rs))] bg-destructive/10 text-destructive grid place-items-center mb-4">
            <TriangleAlert size={22} />
          </div>
          <p className="text-md font-medium">{this.props.label ? `${this.props.label} stopped working` : 'Something went wrong'}</p>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed font-mono selectable break-words">{this.state.error.message}</p>
          <button
            onClick={this.reset}
            className="press mt-5 inline-flex items-center gap-2 h-8 px-3.5 rounded-[calc(9px*var(--rs))] text-sm font-medium bg-surface-raised shadow-button hover:bg-foreground/[0.06]"
          >
            <RotateCcw size={13} />
            Try again
          </button>
        </div>
      </div>
    );
  }
}
