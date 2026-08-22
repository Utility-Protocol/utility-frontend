"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { z } from "zod";
import {
  validateField as runFieldValidation,
  validateForm as runFormValidation,
  type FormValidationResult,
  type NormalizedValidationError,
} from "@/schemas/validation-core";
import { debounce, type DebouncedFunction } from "@/utils/helpers";

const DEFAULT_DEBOUNCE_MS = 300;

export interface FieldValidationState {
  dirty: boolean;
  error: NormalizedValidationError | null;
  isValid: boolean | null;
  pending: boolean;
  touched: boolean;
}

export interface UseFormValidationOptions<
  TValues extends Record<string, unknown>,
  TFormSchema extends z.ZodType,
> {
  debounceMs?: number;
  fieldSchemas: Partial<Record<keyof TValues, z.ZodType>>;
  formSchema: TFormSchema;
  initialValues: TValues;
}

type FieldDebouncer = DebouncedFunction<
  (value: unknown, requestId: number) => void
>;

function createFieldState(): FieldValidationState {
  return {
    dirty: false,
    error: null,
    isValid: null,
    pending: false,
    touched: false,
  };
}

function createInitialFieldStates<TValues extends Record<string, unknown>>(
  values: TValues
): Record<string, FieldValidationState> {
  return Object.fromEntries(
    Object.keys(values).map((field) => [field, createFieldState()])
  );
}

export function useFormValidation<
  TValues extends Record<string, unknown>,
  TFormSchema extends z.ZodType,
>({
  debounceMs = DEFAULT_DEBOUNCE_MS,
  fieldSchemas,
  formSchema,
  initialValues,
}: UseFormValidationOptions<TValues, TFormSchema>) {
  const [values, setValues] = useState<TValues>(initialValues);
  const [fieldStates, setFieldStates] = useState<
    Record<string, FieldValidationState>
  >(() => createInitialFieldStates(initialValues));
  const [formErrors, setFormErrors] = useState<NormalizedValidationError[]>([]);
  const [isFormPending, setIsFormPending] = useState(false);
  const [isFormValid, setIsFormValid] = useState<boolean | null>(null);

  const mountedRef = useRef(false);
  const valuesRef = useRef(values);
  const fieldSchemasRef = useRef(fieldSchemas);
  const formSchemaRef = useRef(formSchema);
  const fieldRequestIdsRef = useRef<Record<string, number>>({});
  const formRequestIdRef = useRef(0);
  const debouncersRef = useRef(
    new Map<string, { debounceMs: number; run: FieldDebouncer }>()
  );

  valuesRef.current = values;
  fieldSchemasRef.current = fieldSchemas;
  formSchemaRef.current = formSchema;

  const cancelFieldDebouncer = useCallback((field: string) => {
    const entry = debouncersRef.current.get(field);
    entry?.run.cancel();
    debouncersRef.current.delete(field);
  }, []);

  const cancelAllFieldDebouncers = useCallback(() => {
    for (const entry of debouncersRef.current.values()) {
      entry.run.cancel();
    }
    debouncersRef.current.clear();
  }, []);

  const updateFieldState = useCallback(
    (field: string, patch: Partial<FieldValidationState>) => {
      setFieldStates((current) => ({
        ...current,
        [field]: {
          ...(current[field] ?? createFieldState()),
          ...patch,
        },
      }));
    },
    []
  );

  const beginFieldRequest = useCallback((field: string): number => {
    const requestId = (fieldRequestIdsRef.current[field] ?? 0) + 1;
    fieldRequestIdsRef.current[field] = requestId;
    return requestId;
  }, []);

  const applyFieldValidation = useCallback(
    async (field: string, value: unknown, requestId: number) => {
      const schema = fieldSchemasRef.current[field as keyof TValues];
      if (!schema) return;

      const error = await runFieldValidation(schema, value);

      if (
        !mountedRef.current ||
        fieldRequestIdsRef.current[field] !== requestId
      ) {
        return;
      }

      updateFieldState(field, {
        error,
        isValid: error === null,
        pending: false,
      });
    },
    [updateFieldState]
  );

  const getFieldDebouncer = useCallback(
    (field: string): FieldDebouncer => {
      const existing = debouncersRef.current.get(field);
      if (existing?.debounceMs === debounceMs) return existing.run;

      existing?.run.cancel();
      const run = debounce((value: unknown, requestId: number) => {
        void applyFieldValidation(field, value, requestId);
      }, debounceMs);
      debouncersRef.current.set(field, { debounceMs, run });
      return run;
    },
    [applyFieldValidation, debounceMs]
  );

  const setFieldValue = useCallback(
    <TField extends keyof TValues>(field: TField, value: TValues[TField]) => {
      const fieldName = String(field);
      const nextValues = { ...valuesRef.current, [field]: value };
      valuesRef.current = nextValues;
      setValues(nextValues);

      formRequestIdRef.current += 1;
      setFormErrors([]);
      setIsFormPending(false);
      setIsFormValid(null);

      const schema = fieldSchemasRef.current[field];
      if (!schema) {
        updateFieldState(fieldName, {
          dirty: true,
          error: null,
          isValid: null,
          pending: false,
        });
        return;
      }

      const requestId = beginFieldRequest(fieldName);
      updateFieldState(fieldName, {
        dirty: true,
        error: null,
        isValid: null,
        pending: true,
      });
      getFieldDebouncer(fieldName)(value, requestId);
    },
    [beginFieldRequest, getFieldDebouncer, updateFieldState]
  );

  const setFieldTouched = useCallback(
    <TField extends keyof TValues>(field: TField, touched = true) => {
      updateFieldState(String(field), { touched });
    },
    [updateFieldState]
  );

  const validateField = useCallback(
    async <TField extends keyof TValues>(field: TField) => {
      const fieldName = String(field);
      const schema = fieldSchemasRef.current[field];
      if (!schema) return null;

      cancelFieldDebouncer(fieldName);
      const requestId = beginFieldRequest(fieldName);
      updateFieldState(fieldName, { pending: true });

      const error = await runFieldValidation(
        schema,
        valuesRef.current[field]
      );

      if (
        !mountedRef.current ||
        fieldRequestIdsRef.current[fieldName] !== requestId
      ) {
        return null;
      }

      updateFieldState(fieldName, {
        error,
        isValid: error === null,
        pending: false,
      });
      return error;
    },
    [beginFieldRequest, cancelFieldDebouncer, updateFieldState]
  );

  const validateForm = useCallback(async (): Promise<
    FormValidationResult<z.output<TFormSchema>> | null
  > => {
    cancelAllFieldDebouncers();
    for (const field of Object.keys(fieldRequestIdsRef.current)) {
      fieldRequestIdsRef.current[field] += 1;
    }

    const requestId = formRequestIdRef.current + 1;
    formRequestIdRef.current = requestId;
    setIsFormPending(true);
    setFieldStates((current) =>
      Object.fromEntries(
        Object.entries(current).map(([field, state]) => [
          field,
          { ...state, pending: false, touched: true },
        ])
      )
    );

    const result = await runFormValidation(
      formSchemaRef.current,
      valuesRef.current
    );

    if (!mountedRef.current || formRequestIdRef.current !== requestId) {
      return null;
    }

    setFormErrors(result.formErrors);
    setIsFormPending(false);
    setIsFormValid(result.isValid);
    setFieldStates((current) => {
      const fields = new Set([
        ...Object.keys(current),
        ...Object.keys(result.fieldErrors),
      ]);

      return Object.fromEntries(
        [...fields].map((field) => {
          const error = result.fieldErrors[field]?.[0] ?? null;
          return [
            field,
            {
              ...(current[field] ?? createFieldState()),
              error,
              isValid: error === null,
              pending: false,
              touched: true,
            },
          ];
        })
      );
    });

    return result;
  }, [cancelAllFieldDebouncers]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      formRequestIdRef.current += 1;
      for (const field of Object.keys(fieldRequestIdsRef.current)) {
        fieldRequestIdsRef.current[field] += 1;
      }
      cancelAllFieldDebouncers();
    };
  }, [cancelAllFieldDebouncers]);

  return {
    fieldStates,
    formErrors,
    isFormPending,
    isFormValid,
    setFieldTouched,
    setFieldValue,
    validateField,
    validateForm,
    values,
  };
}
