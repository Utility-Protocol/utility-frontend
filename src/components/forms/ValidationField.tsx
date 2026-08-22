"use client";

import { useId, type ReactNode } from "react";
import { AriaLiveRegion } from "@/components/common/AriaLiveRegion";
import type { FieldValidationState } from "@/hooks/useFormValidation";
import { ValidationMessage } from "@/components/forms/ValidationMessage";

export interface ValidationInputProps {
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "data-validation-state": "invalid" | "pending" | "pristine" | "valid";
  id: string;
  name?: string;
}

export interface ValidationFieldProps {
  announceError?: boolean;
  children: (inputProps: ValidationInputProps) => ReactNode;
  className?: string;
  hint?: ReactNode;
  id?: string;
  label: ReactNode;
  name?: string;
  state?: FieldValidationState;
  validMessage?: ReactNode;
}

const PRISTINE_STATE: FieldValidationState = {
  dirty: false,
  error: null,
  isValid: null,
  pending: false,
  touched: false,
};

export function ValidationField({
  announceError = true,
  children,
  className,
  hint,
  id,
  label,
  name,
  state = PRISTINE_STATE,
  validMessage,
}: ValidationFieldProps) {
  const generatedId = useId();
  const inputId = id ?? `validation-field-${generatedId}`;
  const hintId = `${inputId}-hint`;
  const messageId = `${inputId}-validation`;
  const labelId = `${inputId}-label`;

  const invalid = state.touched && state.error !== null;
  const valid = state.touched && state.isValid === true && !state.pending;
  const validationState = state.pending
    ? "pending"
    : invalid
      ? "invalid"
      : valid
        ? "valid"
        : "pristine";
  const describedBy = [hint ? hintId : null, validationState !== "pristine" ? messageId : null]
    .filter(Boolean)
    .join(" ") || undefined;
  const errorAnnouncement =
    announceError && invalid
      ? `${typeof label === "string" ? label : "Field"}: ${state.error?.message}`
      : "";

  return (
    <div
      className={`space-y-1.5 ${className ?? ""}`}
      data-validation-field={validationState}
    >
      <label id={labelId} htmlFor={inputId} className="block text-sm font-medium">
        {label}
      </label>

      {children({
        "aria-describedby": describedBy,
        "aria-invalid": invalid ? true : undefined,
        "data-validation-state": validationState,
        id: inputId,
        name,
      })}

      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {state.pending ? (
        <ValidationMessage id={messageId} status="pending" />
      ) : invalid ? (
        <ValidationMessage id={messageId} status="error">
          {state.error?.message}
        </ValidationMessage>
      ) : valid ? (
        <ValidationMessage id={messageId} status="valid">
          {validMessage}
        </ValidationMessage>
      ) : null}

      <AriaLiveRegion
        message={errorAnnouncement}
        politeness="polite"
        role="status"
        labelledBy={labelId}
      />
    </div>
  );
}
