import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });
    // Also log to the browser console so it shows up in DevTools
    console.error("[ErrorBoundary] Caught error:", error);
    console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);

    // Ship the error to the server so it gets appended to logs/client-errors.log
    try {
      void fetch("/api/client-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        keepalive: true,
        body: JSON.stringify({
          url: window.location.href,
          message: error.message || String(error),
          stack: error.stack || "",
          componentStack: errorInfo.componentStack || "",
        }),
      }).catch(() => {});
    } catch {
      // best-effort only
    }
  }

  handleReload = () => {
    this.setState({ error: null, errorInfo: null });
    window.location.reload();
  };

  handleBack = () => {
    this.setState({ error: null, errorInfo: null });
    window.history.back();
  };

  render() {
    const { error, errorInfo } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          padding: "24px",
          background: "#fff",
          color: "#111",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          overflow: "auto",
        }}
      >
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              margin: "0 0 8px",
              color: "#b91c1c",
            }}
          >
            Something went wrong
          </h1>
          <p style={{ margin: "0 0 16px", color: "#374151" }}>
            The page hit an unexpected error. The details below are intended to
            help track down the issue.
          </p>

          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <button
              onClick={this.handleBack}
              style={btnStyle("#e5e7eb", "#111")}
              data-testid="error-boundary-back"
            >
              Go back
            </button>
            <button
              onClick={this.handleReload}
              style={btnStyle("#2563eb", "#fff")}
              data-testid="error-boundary-reload"
            >
              Reload page
            </button>
          </div>

          <Section title="Error message">
            <code style={codeStyle}>{error.message || String(error)}</code>
          </Section>

          {error.stack && (
            <Section title="Stack trace">
              <pre style={preStyle}>{error.stack}</pre>
            </Section>
          )}

          {errorInfo?.componentStack && (
            <Section title="Component stack">
              <pre style={preStyle}>{errorInfo.componentStack}</pre>
            </Section>
          )}

          <p style={{ marginTop: 16, fontSize: 13, color: "#6b7280" }}>
            URL: <code style={codeStyle}>{window.location.href}</code>
          </p>
        </div>
      </div>
    );
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          fontWeight: 600,
          color: "#6b7280",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

const codeStyle: React.CSSProperties = {
  background: "#f3f4f6",
  padding: "2px 6px",
  borderRadius: 4,
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 13,
  color: "#111",
  wordBreak: "break-word",
};

const preStyle: React.CSSProperties = {
  background: "#0b1020",
  color: "#e5e7eb",
  padding: 12,
  borderRadius: 8,
  overflow: "auto",
  maxHeight: 300,
  fontSize: 12,
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    background: bg,
    color,
    border: "none",
    padding: "8px 14px",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  };
}

export default ErrorBoundary;
