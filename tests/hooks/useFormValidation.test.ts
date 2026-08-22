import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useFormValidation } from "@/hooks/useFormValidation";

interface TestValues extends Record<string, unknown> {
  confirmation: string;
  username: string;
}

const formSchema = z.object({
  confirmation: z.string(),
  username: z.string().min(3, "Enter at least 3 characters."),
});

function renderValidationHook(
  options: {
    debounceMs?: number;
    usernameSchema?: z.ZodType;
  } = {}
) {
  return renderHook(() =>
    useFormValidation<TestValues, typeof formSchema>({
      debounceMs: options.debounceMs,
      fieldSchemas: {
        username:
          options.usernameSchema ??
          z.string().min(3, "Enter at least 3 characters."),
      },
      formSchema,
      initialValues: { confirmation: "", username: "" },
    })
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("useFormValidation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("debounces field validation by 300ms by default", async () => {
    const { result } = renderValidationHook();

    act(() => {
      result.current.setFieldValue("username", "ab");
    });

    expect(result.current.fieldStates.username).toMatchObject({
      dirty: true,
      error: null,
      isValid: null,
      pending: true,
      touched: false,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(result.current.fieldStates.username.error).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.fieldStates.username).toMatchObject({
      error: {
        code: "too_small",
        message: "Enter at least 3 characters.",
      },
      isValid: false,
      pending: false,
    });
  });

  it("uses a custom debounce delay and coalesces rapid changes", async () => {
    const refinement = vi.fn((value: string) => value.length >= 3);
    const { result } = renderValidationHook({
      debounceMs: 50,
      usernameSchema: z.string().refine(refinement),
    });

    act(() => {
      result.current.setFieldValue("username", "a");
      result.current.setFieldValue("username", "ab");
      result.current.setFieldValue("username", "abc");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(refinement).toHaveBeenCalledTimes(1);
    expect(refinement).toHaveBeenCalledWith("abc");
    expect(result.current.fieldStates.username.isValid).toBe(true);
  });

  it("tracks touched and dirty state independently", () => {
    const { result } = renderValidationHook();

    act(() => {
      result.current.setFieldTouched("username");
    });
    expect(result.current.fieldStates.username).toMatchObject({
      dirty: false,
      touched: true,
    });

    act(() => {
      result.current.setFieldValue("username", "operator");
    });
    expect(result.current.fieldStates.username).toMatchObject({
      dirty: true,
      touched: true,
    });
  });

  it("discards a stale async field result after a newer value validates", async () => {
    const slow = deferred<boolean>();
    const fast = deferred<boolean>();
    const schema = z.string().refine(
      (value) => (value === "slow" ? slow.promise : fast.promise),
      { message: "Username is unavailable." }
    );
    const { result } = renderValidationHook({ usernameSchema: schema });

    act(() => {
      result.current.setFieldValue("username", "slow");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    act(() => {
      result.current.setFieldValue("username", "fast");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    await act(async () => {
      fast.resolve(true);
      await fast.promise;
    });
    expect(result.current.fieldStates.username).toMatchObject({
      error: null,
      isValid: true,
      pending: false,
    });

    await act(async () => {
      slow.resolve(false);
      await slow.promise;
    });
    expect(result.current.fieldStates.username).toMatchObject({
      error: null,
      isValid: true,
      pending: false,
    });
  });

  it("runs whole-form validation and separates field and form errors", async () => {
    const crossFieldSchema = formSchema.superRefine((values, context) => {
      if (values.username !== values.confirmation) {
        context.addIssue({
          code: "custom",
          message: "Username and confirmation must match.",
        });
      }
    });
    const { result } = renderHook(() =>
      useFormValidation<TestValues, typeof crossFieldSchema>({
        fieldSchemas: {
          username: z.string().min(3, "Enter at least 3 characters."),
        },
        formSchema: crossFieldSchema,
        initialValues: { confirmation: "different", username: "ab" },
      })
    );

    await act(async () => {
      await result.current.validateForm();
    });

    expect(result.current.isFormPending).toBe(false);
    expect(result.current.isFormValid).toBe(false);
    expect(result.current.fieldStates.username).toMatchObject({
      error: { message: "Enter at least 3 characters." },
      isValid: false,
      touched: true,
    });
    expect(result.current.fieldStates.confirmation.touched).toBe(true);
    expect(result.current.formErrors).toEqual([
      {
        code: "custom",
        message: "Username and confirmation must match.",
        path: [],
      },
    ]);
  });

  it("discards a whole-form result when a field changes while it is pending", async () => {
    const check = deferred<boolean>();
    const asyncFormSchema = formSchema.refine(async () => check.promise, {
      message: "Form validation failed.",
    });
    const { result } = renderHook(() =>
      useFormValidation<TestValues, typeof asyncFormSchema>({
        fieldSchemas: { username: z.string() },
        formSchema: asyncFormSchema,
        initialValues: { confirmation: "operator", username: "operator" },
      })
    );

    let validationResult: Awaited<
      ReturnType<typeof result.current.validateForm>
    >;
    act(() => {
      void result.current.validateForm().then((value) => {
        validationResult = value;
      });
    });
    expect(result.current.isFormPending).toBe(true);

    act(() => {
      result.current.setFieldValue("username", "new-operator");
    });

    await act(async () => {
      check.resolve(false);
      await check.promise;
    });

    expect(validationResult!).toBeNull();
    expect(result.current.formErrors).toEqual([]);
    expect(result.current.isFormValid).toBeNull();
  });

  it("cancels pending debounce timers when unmounted", () => {
    const refinement = vi.fn(() => true);
    const { result, unmount } = renderValidationHook({
      usernameSchema: z.string().refine(refinement),
    });

    act(() => {
      result.current.setFieldValue("username", "operator");
    });
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    vi.advanceTimersByTime(300);

    expect(vi.getTimerCount()).toBe(0);
    expect(refinement).not.toHaveBeenCalled();
  });
});
