"use client";

import { useEffect, useId, useState } from "react";
import { AriaLiveRegion } from "@/components/common/AriaLiveRegion";
import type { NormalizedValidationError } from "@/schemas/validation-core";

export interface FormValidationSummaryProps {
  className?: string;
  fieldErrorCount: number;
  formErrors?: NormalizedValidationError[];
  heading?: string;
  submitAttempt: number;
}

export function formatValidationSummary(
  fieldErrorCount: number,
  formErrorCount: number
): string {
  if (fieldErrorCount > 0) {
    return `${fieldErrorCount} ${
      fieldErrorCount === 1 ? "field needs" : "fields need"
    } attention.`;
  }

  if (formErrorCount > 0) return "The form needs attention.";
  return "";
}

export function FormValidationSummary({
  className,
  fieldErrorCount,
  formErrors = [],
  heading = "Please review the form",
  submitAttempt,
}: FormValidationSummaryProps) {
  const headingId = `validation-summary-${useId()}`;
  const [announcement, setAnnouncement] = useState("");
  const summary = formatValidationSummary(fieldErrorCount, formErrors.length);

  useEffect(() => {
    if (submitAttempt > 0) setAnnouncement(summary);
  }, [submitAttempt, summary]);

  if (!summary) {
    return (
      <AriaLiveRegion
        message={announcement}
        politeness="assertive"
        role="alert"
      />
    );
  }

  return (
    <div
      className={`rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300 ${
        className ?? ""
      }`}
      aria-labelledby={headingId}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-current text-xs font-bold"
        >
          !
        </span>
        <div>
          <h3 id={headingId} className="font-semibold">
            {heading}
          </h3>
          <p>{summary}</p>
          {formErrors.length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {formErrors.map((error, index) => (
                <li key={`${error.code}-${error.message}-${index}`}>
                  {error.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <AriaLiveRegion
        message={announcement}
        politeness="assertive"
        role="alert"
      />
    </div>
  );
}
