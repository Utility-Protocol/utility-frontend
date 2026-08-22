import { z } from "zod";

export type ValidationPath = ReadonlyArray<PropertyKey>;

export interface NormalizedValidationError {
  code: string;
  message: string;
  path: ValidationPath;
}

export type FieldValidationErrors = Record<
  string,
  NormalizedValidationError[]
>;

export interface FormValidationResult<TData> {
  data: TData | null;
  fieldErrors: FieldValidationErrors;
  formErrors: NormalizedValidationError[];
  isValid: boolean;
}

function normalizeIssue(issue: z.core.$ZodIssue): NormalizedValidationError {
  return {
    code: issue.code,
    message: issue.message,
    path: [...issue.path],
  };
}

function formatFieldPath(path: ValidationPath): string {
  return path.reduce<string>((fieldPath, segment) => {
    if (typeof segment === "number") {
      return `${fieldPath}[${segment}]`;
    }

    const key = String(segment);
    return fieldPath ? `${fieldPath}.${key}` : key;
  }, "");
}

/**
 * Validate one field value with any Zod schema. Async parsing also supports
 * schemas that use asynchronous refinements or transforms.
 */
export async function validateField(
  schema: z.ZodType,
  value: unknown
): Promise<NormalizedValidationError | null> {
  const result = await schema.safeParseAsync(value);

  if (result.success) return null;

  return normalizeIssue(result.error.issues[0]);
}

/**
 * Validate a complete form and separate issues attached to field paths from
 * form-level issues, whose Zod path is empty.
 */
export async function validateForm<TSchema extends z.ZodType>(
  schema: TSchema,
  values: unknown
): Promise<FormValidationResult<z.output<TSchema>>> {
  const result = await schema.safeParseAsync(values);

  if (result.success) {
    return {
      data: result.data,
      fieldErrors: {},
      formErrors: [],
      isValid: true,
    };
  }

  const fieldErrors: FieldValidationErrors = {};
  const formErrors: NormalizedValidationError[] = [];

  for (const issue of result.error.issues) {
    const error = normalizeIssue(issue);

    if (error.path.length === 0) {
      formErrors.push(error);
      continue;
    }

    const field = formatFieldPath(error.path);
    fieldErrors[field] = [...(fieldErrors[field] ?? []), error];
  }

  return {
    data: null,
    fieldErrors,
    formErrors,
    isValid: false,
  };
}
