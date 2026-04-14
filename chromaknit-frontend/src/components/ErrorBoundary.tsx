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
              fontFamily: '"Cormorant Garamond", serif',
              fontSize: "28px", color: "#C4707A", marginBottom: "12px",
            }}>
              something went wrong
            </h2>
            <p style={{ fontSize: "15px", color: "#8a6870", marginBottom: "24px" }}>
              try refreshing the page — your images weren't saved
            </p>
            <button
              className="btn-primary"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
            >
              refresh page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
