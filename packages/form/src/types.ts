import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Reactive, Memo } from "@barefootjs/dom";

// --- Validation timing ---

export type ValidateOn = "input" | "blur" | "submit";

// --- Form options ---

export interface CreateFormOptions<
  TSchema extends StandardSchemaV1<Record<string, unknown>>,
> {
  schema: TSchema;
  defaultValues: StandardSchemaV1.InferInput<TSchema>;
  validateOn?: ValidateOn;
  revalidateOn?: ValidateOn;
  onSubmit?: (
    data: StandardSchemaV1.InferOutput<TSchema>,
  ) => void | Promise<void>;
}

// --- Field return ---

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
