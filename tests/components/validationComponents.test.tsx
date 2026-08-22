import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  FormValidationSummary,
  ValidationField,
  ValidationMessage,
  formatValidationSummary,
} from "@/components/forms";
import type { FieldValidationState } from "@/hooks/useFormValidation";

const inputClassName =
  "rounded border border-border px-3 py-2 data-[validation-state=invalid]:border-red-500 data-[validation-state=valid]:border-green-600";

function renderField(state?: FieldValidationState, announceError = true) {
  return render(
    <ValidationField
      label="Email address"
      name="email"
      hint="Use your operator email."
      state={state}
      announceError={announceError}
      validMessage="Email is available."
    >
      {(inputProps) => (
        <input {...inputProps} className={inputClassName} type="email" />
      )}
    </ValidationField>
  );
}

describe("ValidationMessage", () => {
  it("uses text and an icon so the error state is not color-only", () => {
    render(
      <ValidationMessage status="error">
        Enter a valid email address.
      </ValidationMessage>
    );

    expect(screen.getByText("Error:")).toBeInTheDocument();
    expect(screen.getByText("!", { selector: "[aria-hidden='true']" })).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
  });
});

describe("ValidationField", () => {
  it("renders a pristine field without validation ARIA state", () => {
    renderField();

    const input = screen.getByRole("textbox", { name: "Email address" });
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).toHaveAttribute("data-validation-state", "pristine");
    expect(input.getAttribute("aria-describedby")).toContain("-hint");
    expect(screen.queryByText("Error:")).not.toBeInTheDocument();
    expect(screen.queryByText("Valid")).not.toBeInTheDocument();
  });

  it("wires an invalid input to its visible error and polite announcement", () => {
    renderField({
      dirty: true,
      error: {
        code: "invalid_format",
        message: "Enter a valid email address.",
        path: [],
      },
      isValid: false,
      pending: false,
      touched: true,
    });

    const input = screen.getByRole("textbox", { name: "Email address" });
    const error = screen.getByText("Enter a valid email address.");
    const describedBy = input.getAttribute("aria-describedby") ?? "";

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("data-validation-state", "invalid");
    expect(describedBy).toContain(error.closest("p")?.id);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Email address: Enter a valid email address."
    );
  });

  it("can suppress a field announcement when a form summary is announcing", () => {
    renderField(
      {
        dirty: true,
        error: { code: "custom", message: "Required.", path: [] },
        isValid: false,
        pending: false,
        touched: true,
      },
      false
    );

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByText("Required.")).toBeVisible();
  });

  it("shows pending and valid states with distinct text indicators", () => {
    const { rerender } = render(
      <ValidationField
        label="Username"
        state={{
          dirty: true,
          error: null,
          isValid: null,
          pending: true,
          touched: true,
        }}
      >
        {(inputProps) => <input {...inputProps} />}
      </ValidationField>
    );

    expect(screen.getByText("Validating")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "data-validation-state",
      "pending"
    );

    rerender(
      <ValidationField
        label="Username"
        state={{
          dirty: true,
          error: null,
          isValid: true,
          pending: false,
          touched: true,
        }}
      >
        {(inputProps) => <input {...inputProps} />}
      </ValidationField>
    );

    expect(screen.getByText("Valid")).toBeInTheDocument();
    expect(screen.getByText("✓", { selector: "[aria-hidden='true']" })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "data-validation-state",
      "valid"
    );
  });
});

describe("FormValidationSummary", () => {
  it("formats concise singular and plural announcements", () => {
    expect(formatValidationSummary(1, 0)).toBe("1 field needs attention.");
    expect(formatValidationSummary(3, 0)).toBe("3 fields need attention.");
    expect(formatValidationSummary(0, 1)).toBe("The form needs attention.");
  });

  it("announces one assertive summary for a submit attempt", async () => {
    render(
      <FormValidationSummary
        fieldErrorCount={3}
        formErrors={[
          {
            code: "custom",
            message: "The selected dates overlap.",
            path: [],
          },
        ]}
        submitAttempt={1}
      />
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "3 fields need attention."
    );
    expect(screen.getByText("The selected dates overlap.")).toBeVisible();
  });
});
