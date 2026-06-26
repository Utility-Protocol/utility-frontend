"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Generic error boundary. Catches errors thrown during render (including a
 * Suspense resource's rejected promise) and renders a fallback. Remounting it
 * with a new `key` clears the error — the retry mechanism the boundaries use.
 */

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: (error: Error) => ReactNode;
  /** Invoked when an error is first caught (e.g. to set a cascade flag). */
  onError?: (error: Error) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onError?.(error);
  }

  render(): ReactNode {
    if (this.state.error) return this.props.fallback(this.state.error);
    return this.props.children;
  }
}
