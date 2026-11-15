import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title === "Split Bill" ? title : `${title} · Split Bill`;
  }, [title]);
}

export function TopBar({ title, backTo }: { title: string; backTo?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/95 px-3 py-2 backdrop-blur">
      <div className="flex min-h-11 items-center gap-1">
        {backTo ? (
          <Link
            to={backTo}
            className="inline-flex min-h-11 items-center rounded-xl px-2 text-sm font-semibold text-teal"
          >
            Trips
          </Link>
        ) : null}
        <h1 className="min-w-0 flex-1 truncate font-display text-xl text-ink">{title}</h1>
      </div>
    </header>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="px-4 py-12 text-sm text-muted" role="status">
      {label}
    </p>
  );
}

export function MissingTrip() {
  return (
    <div className="px-4 py-12">
      <h1 className="font-display text-3xl text-ink">Trip not on this device</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        Trips stay in this browser. If you cleared site data, import a backup from the home screen.
      </p>
      <Link to="/" className="mt-6 inline-flex min-h-11 items-center font-semibold text-teal">
        Back to trips
      </Link>
    </div>
  );
}

export function PageBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-4 py-4 ${className}`}>{children}</div>;
}
