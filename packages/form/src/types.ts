import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Reactive, Memo } from "@barefootjs/client";

// --- Validation timing ---

/**
 * When validation runs for a field.
 *
 * - `"input"` — on every value change (the `input` event).
 * - `"blur"` — when the field loses focus (the `blur` event).
 * - `"submit"` — only when the form is submitted.
 */
export type ValidateOn = "input" | "blur" | "submit";

// --- Form options ---

/**
 * Options for {@link createForm}.
 *
 * @typeParam TSchema - A Standard Schema describing the form's shape; its
 * input type drives `defaultValues` and the available field names.
 */
export interface CreateFormOptions<
  TSchema extends StandardSchemaV1<Record<string, unknown>>,
> {
  /** Standard Schema used to validate the form's values. */
  schema: TSchema;
  /** Initial value for every field, keyed by field name. */
  defaultValues: StandardSchemaV1.InferInput<TSchema>;
  /** When a field validates for the first time. Defaults to `"submit"`. */
  validateOn?: ValidateOn;
  /** When an already-validated field re-validates. Defaults to `"input"`. */
  revalidateOn?: ValidateOn;
  /** Called with the parsed, valid output once submission succeeds. */
  onSubmit?: (
    data: StandardSchemaV1.InferOutput<TSchema>,
  ) => void | Promise<void>;
}

// --- Field return ---

/**
 * Reactive controller for a single field, returned by {@link FormReturn.field}.
 *
 * @typeParam V - The field's value type.
 */
export interface FieldReturn<V> {
  /** Current field value (signal getter) */
  value: Reactive<() => V>;
  /** Current validation error message (signal getter) */
  error: Reactive<() => string>;
  /** Whether the field has been touched (signal getter) */
  touched: Reactive<() => boolean>;
  /** Whether the field value differs from defaultValue (signal getter) */
  dirty: Reactive<() => boolean>;
  /** Set field value directly */
  setValue: (value: V) => void;
  /** Input event handler — reads e.target.value */
  handleInput: (e: Event) => void;
  /** Blur event handler — marks touched and may trigger validation */
  handleBlur: () => void;
}

// --- Form return ---

/**
 * The form controller returned by {@link createForm}: per-field accessors,
 * reactive form-level state, and submit/reset/error actions.
 *
 * @typeParam TSchema - The Standard Schema the form was created with.
 */
export interface FormReturn<
  TSchema extends StandardSchemaV1<Record<string, unknown>>,
> {
  /** Get a field controller by name (memoized) */
  field: <K extends string & keyof StandardSchemaV1.InferInput<TSchema>>(
    name: K,
  ) => FieldReturn<StandardSchemaV1.InferInput<TSchema>[K]>;
  /** Whether a submission is in progress (signal getter) */
  isSubmitting: Reactive<() => boolean>;
  /** Whether any field value differs from defaults (memo) */
  isDirty: Memo<boolean>;
  /** Whether all fields pass validation (memo) */
  isValid: Memo<boolean>;
  /** All current errors keyed by field name (memo) */
  errors: Memo<Record<string, string>>;
  /** Form submit handler — call with the submit event */
  handleSubmit: (e: Event) => Promise<void>;
  /** Reset all fields to default values and clear errors */
  reset: () => void;
  /** Manually set an error on a field (e.g. server-side errors) */
  setError: (
    name: string & keyof StandardSchemaV1.InferInput<TSchema>,
    message: string,
  ) => void;
}
