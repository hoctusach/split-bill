import { useEffect, useId, type ButtonHTMLAttributes, type ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Mark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="14" fill="#0c5f56" />
      <rect x="13" y="9" width="22" height="30" rx="3.5" fill="#f7f4ee" />
      <path d="M18 18.5h12M18 24h9M18 29.5h7" stroke="#0c5f56" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="33" cy="34" r="6.5" fill="#c4622d" />
      <circle cx="33" cy="34" r="3.2" fill="none" stroke="#f7f4ee" strokeWidth="1.4" />
    </svg>
  );
}

const buttonVariants = {
  primary: "bg-teal text-white hover:bg-[#0a514a]",
  secondary: "border border-line bg-card text-ink hover:bg-teal-soft",
  ghost: "text-teal hover:bg-teal-soft",
  danger: "bg-bad text-white hover:bg-[#841f1f]",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariants;
};

export function Button({ variant = "primary", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export const controlClass =
  "min-h-11 w-full rounded-xl border border-line bg-card px-3 text-base text-ink shadow-sm outline-none placeholder:text-muted/60 focus:border-teal focus:ring-2 focus:ring-teal/20";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs leading-5 text-muted">{hint}</span> : null}
    </label>
  );
}

export function Dialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" className="absolute inset-0 bg-ink/45" aria-label="Close dialog" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-paper px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
      >
        <h2 id={titleId} className="font-display text-2xl leading-tight text-ink">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  pending = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <p className="text-sm leading-6 text-muted">{body}</p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" disabled={pending} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-4 gap-1 rounded-xl bg-[#ebe4d9] p-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cx(
              "min-h-10 rounded-lg px-1 text-xs font-semibold",
              selected ? "bg-card text-ink shadow-sm" : "text-muted",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "bad"; children: ReactNode }) {
  return (
    <p
      className={cx(
        "rounded-2xl px-4 py-3 text-sm leading-6",
        tone === "bad" ? "bg-bad-soft text-bad" : "bg-teal-soft text-teal",
      )}
    >
      {children}
    </p>
  );
}
