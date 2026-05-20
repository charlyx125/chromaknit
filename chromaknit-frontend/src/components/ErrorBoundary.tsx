import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: "50vh", padding: "40px 20px", textAlign: "center",
        }}>
          <div>
            <h2 style={{
              fontFamily: '"Playfair Display", serif',
              fontWeight: 700,
              fontSize: "28px", color: "var(--red)", marginBottom: "12px",
            }}>
              Something went wrong
            </h2>
            <p style={{
              fontFamily: '"Cormorant Garamond", serif',
              fontStyle: "italic",
              fontSize: "17px", color: "var(--ink-soft)", marginBottom: "24px",
            }}>
              Try refreshing the page. Your images were not saved.
            </p>
            <button
              type="button"
              style={{
                fontFamily: '"Playfair Display", serif',
                fontWeight: 600,
                fontSize: "13px",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--bg)",
                background: "var(--red)",
                padding: "14px 28px",
                border: "1px solid var(--red)",
                borderRadius: "2px",
                cursor: "pointer",
              }}
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
            >
              Refresh page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
