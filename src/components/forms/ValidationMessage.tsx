import type { ReactNode } from "react";

export type ValidationMessageStatus = "error" | "pending" | "valid";

export interface ValidationMessageProps {
  children?: ReactNode;
  className?: string;
  id?: string;
  status: ValidationMessageStatus;
}

const STATUS_STYLES: Record<ValidationMessageStatus, string> = {
  error: "text-red-600 dark:text-red-400",
  pending: "text-muted-foreground",
  valid: "text-green-700 dark:text-green-400",
};

const STATUS_ICONS: Record<ValidationMessageStatus, string> = {
  error: "!",
  pending: "…",
  valid: "✓",
};

const STATUS_LABELS: Record<ValidationMessageStatus, string> = {
  error: "Error:",
  pending: "Validating",
  valid: "Valid",
};

export function ValidationMessage({
  children,
  className,
  id,
  status,
}: ValidationMessageProps) {
  return (
    <p
      id={id}
      className={`flex items-start gap-1.5 text-xs ${STATUS_STYLES[status]} ${
        className ?? ""
      }`}
      data-validation-message={status}
    >
      <span
        aria-hidden="true"
        className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-current px-0.5 text-[10px] font-bold leading-none"
      >
        {STATUS_ICONS[status]}
      </span>
      <span>
        <span className="font-semibold">{STATUS_LABELS[status]}</span>
        {children ? <> {children}</> : null}
      </span>
    </p>
  );
}
