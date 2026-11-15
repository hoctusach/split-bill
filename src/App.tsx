import { Component, type ReactNode } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { ExpensePage } from "./pages/ExpensePage";
import { SettlementPage } from "./pages/SettlementPage";
import { TripListPage } from "./pages/TripListPage";
import { TripPage } from "./pages/TripPage";

interface BoundaryState {
  message: string | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { message: error instanceof Error ? error.message : "Something went wrong." };
  }

  render() {
    if (this.state.message) {
      return (
        <div className="px-5 py-12">
          <h1 className="font-display text-3xl">Split Bill hit a snag</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Your trips are still stored in this browser. Reloading usually clears a display problem.
          </p>
          <p className="mt-3 text-sm text-bad">{this.state.message}</p>
          <button
            type="button"
            className="mt-6 min-h-11 rounded-xl bg-teal px-4 text-sm font-semibold text-white"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function NotFound() {
  return (
    <div className="px-5 py-12">
      <h1 className="font-display text-3xl">Page not found</h1>
      <a href="#/" className="mt-4 inline-flex min-h-11 items-center font-semibold text-teal">
        Back to trips
      </a>
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route path="/" element={<TripListPage />} />
          <Route path="/trip/:tripId" element={<TripPage />} />
          <Route path="/trip/:tripId/expense/new" element={<ExpensePage />} />
          <Route path="/trip/:tripId/expense/:expenseId" element={<ExpensePage />} />
          <Route path="/trip/:tripId/settlement/new" element={<SettlementPage />} />
          <Route path="/trip/:tripId/settlement/:settlementId" element={<SettlementPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}
