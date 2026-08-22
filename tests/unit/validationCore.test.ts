import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  validateField,
  validateForm,
} from "@/schemas/validation-core";

describe("validateField()", () => {
  it("returns null when the field value is valid", async () => {
    const error = await validateField(z.string().email(), "operator@example.com");

    expect(error).toBeNull();
  });

  it("normalizes the first issue when the field value is invalid", async () => {
    const error = await validateField(
      z.string().min(3, "Enter at least 3 characters."),
      "ab"
    );

    expect(error).toEqual({
      code: "too_small",
      message: "Enter at least 3 characters.",
      path: [],
    });
  });

  it("supports asynchronous field refinements", async () => {
    const schema = z.string().refine(async (value) => value === "available", {
      message: "This value is already in use.",
    });

    await expect(validateField(schema, "taken")).resolves.toMatchObject({
      code: "custom",
      message: "This value is already in use.",
    });
  });
});

describe("validateForm()", () => {
  it("returns parsed data and empty error collections for a valid form", async () => {
    const schema = z.object({
      displayName: z.string().trim(),
      capacity: z.coerce.number().positive(),
    });

    const result = await validateForm(schema, {
      displayName: "  Main Grid  ",
      capacity: "42",
    });

    expect(result).toEqual({
      data: { displayName: "Main Grid", capacity: 42 },
      fieldErrors: {},
      formErrors: [],
      isValid: true,
    });
  });

  it("groups field issues and keeps pathless issues at form level", async () => {
    const schema = z
      .object({
        email: z.string().email("Enter a valid email address."),
        password: z.string().min(8, "Password must contain 8 characters."),
        confirmation: z.string(),
      })
      .superRefine((values, context) => {
        if (values.password !== values.confirmation) {
          context.addIssue({
            code: "custom",
            message: "Passwords must match.",
          });
        }
      });

    const result = await validateForm(schema, {
      email: "invalid",
      password: "short",
      confirmation: "different",
    });

    expect(result.isValid).toBe(false);
    expect(result.data).toBeNull();
    expect(result.fieldErrors.email).toEqual([
      {
        code: "invalid_format",
        message: "Enter a valid email address.",
        path: ["email"],
      },
    ]);
    expect(result.fieldErrors.password[0]).toMatchObject({
      code: "too_small",
      message: "Password must contain 8 characters.",
      path: ["password"],
    });
    expect(result.formErrors).toEqual([
      {
        code: "custom",
        message: "Passwords must match.",
        path: [],
      },
    ]);
  });

  it("uses stable keys for nested fields and array items", async () => {
    const schema = z.object({
      sites: z.array(
        z.object({
          label: z.string().min(1, "Enter a site label."),
        })
      ),
    });

    const result = await validateForm(schema, { sites: [{ label: "" }] });

    expect(result.fieldErrors["sites[0].label"]).toEqual([
      {
        code: "too_small",
        message: "Enter a site label.",
        path: ["sites", 0, "label"],
      },
    ]);
  });
});
