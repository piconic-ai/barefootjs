import type { StandardSchemaV1 } from "@standard-schema/spec";
import { createSignal, createMemo, untrack } from "@barefootjs/dom";
import type { Signal, Memo } from "@barefootjs/dom";
import { validateSchema, validateField } from "./validate";
import type {
  CreateFormOptions,
  FormReturn,
  FieldReturn,
  ValidateOn,
} from "./types";

interface FieldSignals {
  value: Signal<unknown>;
  error: Signal<string>;
  touched: Signal<boolean>;
  dirty: Signal<boolean>;
}

function isPrimitive(v: unknown): boolean {
  return v === null || typeof v !== "object";
}

export function createForm<
  TSchema extends StandardSchemaV1<Record<string, unknown>>,
>(options: CreateFormOptions<TSchema>): FormReturn<TSchema> {
  type Input = StandardSchemaV1.InferInput<TSchema>;

  const {
    schema,
    defaultValues,
    validateOn = "submit",
    revalidateOn = "input",
    onSubmit,
  } = options;

  // --- Internal state ---

  const defaults = defaultValues as Record<string, unknown>;
  const defaultKeys = Object.keys(defaults);
  const fieldSignals = new Map<string, FieldSignals>();
  const fieldCache = new Map<string, FieldReturn<unknown>>();
  const validatedFields = new Set<string>();
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  // Bump when fields are added so memos that iterate fieldSignals re-run
  const [fieldVersion, setFieldVersion] = createSignal(0);

  // --- Helpers ---

  function getOrCreateFieldSignals(name: string): FieldSignals {
    let signals = fieldSignals.get(name);
    if (!signals) {
      signals = {
        value: createSignal<unknown>(defaults[name] ?? ""),
        error: createSignal(""),
        touched: createSignal(false),
        dirty: createSignal(false),
      };
      fieldSignals.set(name, signals);
      setFieldVersion((v) => v + 1);
    }
    return signals;
  }

  function getCurrentValues(): Record<string, unknown> {
    return untrack(() => {
      const values: Record<string, unknown> = {};
      for (const key of defaultKeys) {
        const signals = fieldSignals.get(key);
        values[key] = signals ? signals.value[0]() : defaults[key];
      }
      return values;
    });
  }

  function shouldValidate(name: string, trigger: ValidateOn): boolean {
    const timing = validatedFields.has(name) ? revalidateOn : validateOn;
    return timing === trigger;
  }

  async function runFieldValidation(name: string): Promise<void> {
    const values = getCurrentValues();
    const error = await validateField(schema, values, name);
    const signals = fieldSignals.get(name);
    if (signals) {
      signals.error[1](error);
    }
    validatedFields.add(name);
  }

  // --- Field API ---

  function field<K extends string & keyof Input>(
    name: K,
  ): FieldReturn<Input[K]> {
    const cached = fieldCache.get(name);
    if (cached) return cached as FieldReturn<Input[K]>;

    const signals = getOrCreateFieldSignals(name);
    const defaultValue = defaults[name] ?? "";
    const defaultIsPrimitive = isPrimitive(defaultValue);
    const serializedDefault = defaultIsPrimitive
      ? undefined
      : JSON.stringify(defaultValue);

    function checkDirty(value: unknown): boolean {
      if (defaultIsPrimitive) return value !== defaultValue;
      return JSON.stringify(value) !== serializedDefault;
    }

    const fieldReturn: FieldReturn<Input[K]> = {
      value: signals.value[0] as FieldReturn<Input[K]>['value'],
      error: signals.error[0],
      touched: signals.touched[0],
      dirty: signals.dirty[0],

      setValue(value: Input[K]) {
        signals.value[1](value);
        signals.dirty[1](checkDirty(value));
        if (shouldValidate(name, "input")) {
          runFieldValidation(name);
        }
      },

      handleInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const value = target.value as Input[K];
        fieldReturn.setValue(value);
      },

      handleBlur() {
        signals.touched[1](true);
        if (shouldValidate(name, "blur")) {
          runFieldValidation(name);
        }
      },
    };

    fieldCache.set(name, fieldReturn as FieldReturn<unknown>);
    return fieldReturn;
  }

  // --- Derived state ---

  const isDirty: Memo<boolean> = createMemo(() => {
    fieldVersion(); // track field additions
    for (const [, signals] of fieldSignals) {
      if (signals.dirty[0]()) return true;
    }
    return false;
  });

  const errors: Memo<Record<string, string>> = createMemo(() => {
    fieldVersion(); // track field additions
    const result: Record<string, string> = {};
    for (const [name, signals] of fieldSignals) {
      const err = signals.error[0]();
      if (err) result[name] = err;
    }
    return result;
  });

  const isValid: Memo<boolean> = createMemo(() => {
    const e = errors();
    for (const _ in e) return false;
    return true;
  });

  // --- Form actions ---

  async function handleSubmit(e: Event): Promise<void> {
    e.preventDefault();

    const values = getCurrentValues();

    setIsSubmitting(true);

    try {
      const validationErrors = await validateSchema(schema, values);
      const hasErrors = Object.keys(validationErrors).length > 0;

      if (hasErrors) {
        for (const [name, message] of Object.entries(validationErrors)) {
          const signals = getOrCreateFieldSignals(name);
          signals.error[1](message);
          validatedFields.add(name);
        }
        setIsSubmitting(false);
        return;
      }

      // Clear all errors on success
      for (const [, signals] of fieldSignals) {
        signals.error[1]("");
      }

      if (onSubmit) {
        try {
          await onSubmit(values as StandardSchemaV1.InferOutput<TSchema>);
        } catch {
          // onSubmit errors are silently caught to prevent unhandled rejections.
          // Use onSubmit's own try/catch to handle errors explicitly.
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function reset(): void {
    for (const [name, signals] of fieldSignals) {
      signals.value[1](defaults[name] ?? "" as unknown);
      signals.error[1]("");
      signals.touched[1](false);
      signals.dirty[1](false);
    }
    validatedFields.clear();
  }

  function setError(
    name: string & keyof Input,
    message: string,
  ): void {
    const signals = getOrCreateFieldSignals(name);
    signals.error[1](message);
    validatedFields.add(name);
  }

  return {
    field,
    isSubmitting,
    isDirty,
    isValid,
    errors,
    handleSubmit,
    reset,
    setError,
  };
}
