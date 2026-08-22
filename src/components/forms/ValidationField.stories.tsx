"use client";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { z } from "zod";
import {
  FormValidationSummary,
  ValidationField,
} from "@/components/forms";
import type { FieldValidationState } from "@/hooks/useFormValidation";
import { useFormValidation } from "@/hooks/useFormValidation";

const inputClassName =
  "w-80 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-ring data-[validation-state=invalid]:border-red-500 data-[validation-state=valid]:border-green-600";

const pristineState: FieldValidationState = {
  dirty: false,
  error: null,
  isValid: null,
  pending: false,
  touched: false,
};

const pendingState: FieldValidationState = {
  dirty: true,
  error: null,
  isValid: null,
  pending: true,
  touched: true,
};

const validState: FieldValidationState = {
  dirty: true,
  error: null,
  isValid: true,
  pending: false,
  touched: true,
};

const invalidState: FieldValidationState = {
  dirty: true,
  error: {
    code: "invalid_format",
    message: "Enter a valid email address.",
    path: [],
  },
  isValid: false,
  pending: false,
  touched: true,
};

const meta = {
  args: {
    children: (inputProps) => (
      <input
        {...inputProps}
        className={inputClassName}
        placeholder="operator@example.com"
        type="email"
      />
    ),
    hint: "Use the email associated with your operator account.",
    label: "Email address",
    name: "email",
    state: pristineState,
    validMessage: "Email format is valid.",
  },
  argTypes: {
    children: { control: false },
    state: { control: false },
  },
  component: ValidationField,
  parameters: {
    docs: {
      description: {
        component:
          "Reusable validation field wiring for labels, hints, visible status indicators, aria-invalid, aria-describedby, and polite field-error announcements.",
      },
    },
  },
  tags: ["autodocs"],
  title: "Forms/ValidationField",
} satisfies Meta<typeof ValidationField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pristine = {
  args: {
    state: pristineState,
  },
} satisfies Story;

export const TypingPending = {
  args: {
    state: pendingState,
  },
  parameters: {
    docs: {
      description: {
        story:
          "The pending state is shown while the default 300 ms debounce window or asynchronous validation is active.",
      },
    },
  },
} satisfies Story;

export const Valid = {
  args: {
    state: validState,
  },
} satisfies Story;

export const FieldInvalid = {
  args: {
    state: invalidState,
  },
} satisfies Story;

export const FormInvalid = {
  args: {
    state: invalidState,
  },
  render: (args) => (
    <div className="space-y-4">
      <ValidationField {...args} announceError={false} />
      <FormValidationSummary
        fieldErrorCount={2}
        formErrors={[
          {
            code: "custom",
            message: "The confirmation value must match.",
            path: [],
          },
        ]}
        submitAttempt={1}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "On submit, field announcements are suppressed while one assertive summary reports the total number of fields needing attention.",
      },
    },
  },
} satisfies Story;

interface DemoValues extends Record<string, unknown> {
  username: string;
}

const asyncUsernameSchema = z
  .string()
  .min(3, "Enter at least 3 characters.")
  .refine(
    async (value) => {
      await new Promise((resolve) =>
        setTimeout(resolve, value === "taken" ? 900 : 100)
      );
      return value !== "taken";
    },
    { message: "This username is already taken." }
  );

const asyncFormSchema = z.object({ username: asyncUsernameSchema });

function AsyncValidationDemo() {
  const validation = useFormValidation<DemoValues, typeof asyncFormSchema>({
    fieldSchemas: { username: asyncUsernameSchema },
    formSchema: asyncFormSchema,
    initialValues: { username: "" },
  });

  return (
    <div className="space-y-3">
      <ValidationField
        label="Username"
        name="username"
        hint='Try "taken", then replace it with "available" after validation starts.'
        state={validation.fieldStates.username}
        validMessage="Username is available."
      >
        {(inputProps) => (
          <input
            {...inputProps}
            className={inputClassName}
            onBlur={() => validation.setFieldTouched("username")}
            onChange={(event) =>
              validation.setFieldValue("username", event.target.value)
            }
            value={validation.values.username}
          />
        )}
      </ValidationField>
      <p className="max-w-sm text-xs text-muted-foreground">
        The slower result for &quot;taken&quot; is discarded if a newer value
        finishes validation first.
      </p>
    </div>
  );
}

export const AsyncStaleResult = {
  args: {
    state: pristineState,
  },
  render: () => <AsyncValidationDemo />,
  parameters: {
    docs: {
      description: {
        story:
          "Interactive async validation demonstrates the 300 ms debounce and latest-request-wins stale-result protection.",
      },
    },
  },
} satisfies Story;

export const AccessibleAnnouncement = {
  args: {
    state: invalidState,
  },
  parameters: {
    docs: {
      description: {
        story:
          "The visible error is associated through aria-describedby and mirrored into a polite, atomic live region. Inspect the Accessibility panel or use a screen reader to verify the announcement.",
      },
    },
  },
} satisfies Story;
