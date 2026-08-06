import { Component, type ReactNode, type ErrorInfo } from "react";

interface State { error: Error | null; stack: string }

export class PageErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, stack: "" };

  static getDerivedStateFromError(error: Error): State {
    return { error, stack: "" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[PageErrorBoundary CAUGHT]", error.message);
    console.error("[PageErrorBoundary STACK]", info.componentStack);
    this.setState({ stack: info.componentStack ?? "" });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 bg-slate-50">
          <div className="bg-white border border-red-200 rounded-xl p-6 max-w-2xl w-full shadow-sm">
            <h2 className="text-sm font-bold text-red-600 mb-2">Page Error (caught by PageErrorBoundary)</h2>
            <p className="text-xs text-slate-700 font-mono whitespace-pre-wrap break-all mb-3">
              {this.state.error.message}
            </p>
            {this.state.stack && (
              <pre className="text-[10px] text-slate-500 bg-slate-50 rounded p-2 overflow-auto max-h-48 border border-slate-200 mb-3">
                {this.state.stack}
              </pre>
            )}
            <button
              onClick={() => this.setState({ error: null, stack: "" })}
              className="mt-2 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
