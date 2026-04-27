# @barefootjs/form

Signal-based form management for [BarefootJS](https://github.com/piconic-ai/barefootjs). Provides reactive per-field state (value, error, touched, dirty), configurable validation timing, and [Standard Schema](https://github.com/standard-schema/standard-schema) integration for library-agnostic validation.

## Install

```bash
bun add @barefootjs/form @barefootjs/client
```

You also need a Standard Schema–compatible validation library (e.g. [Zod](https://zod.dev/), [Valibot](https://valibot.dev/), [ArkType](https://arktype.io/)):

```bash
bun add zod
```

## Quick Start

```tsx
"use client"

import { createForm } from "@barefootjs/form"
import { z } from "zod"

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "At least 8 characters"),
})

function LoginForm() {
  const form = createForm({
    schema,
    defaultValues: { email: "", password: "" },
    onSubmit: async (data) => {
      // `data` is fully typed and validated
      await fetch("/api/login", {
        method: "POST",
        body: JSON.stringify(data),
      })
    },
  })

  const email = form.field("email")
  const password = form.field("password")

  return (
    <form onSubmit={form.handleSubmit}>
      <input
        type="email"
        value={email.value()}
        onInput={email.handleInput}
        onBlur={email.handleBlur}
      />
      {email.error() && <span>{email.error()}</span>}

      <input
        type="password"
        value={password.value()}
        onInput={password.handleInput}
        onBlur={password.handleBlur}
      />
      {password.error() && <span>{password.error()}</span>}

      <button type="submit" disabled={form.isSubmitting()}>
        {form.isSubmitting() ? "Submitting..." : "Log in"}
      </button>
    </form>
  )
}
```

## API

### `createForm(options)`

Creates a form instance with reactive state management.

```ts
const form = createForm({
  schema,                          // Standard Schema compliant
  defaultValues: { email: "", password: "" },
  validateOn: "blur",              // "input" | "blur" | "submit" (default: "submit")
  revalidateOn: "input",           // validation after first error (default: "input")
  onSubmit: async (data) => {},    // called with validated data
})
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `schema` | `StandardSchemaV1` | required | Validation schema (Zod, Valibot, ArkType, etc.) |
| `defaultValues` | `InferInput<TSchema>` | required | Initial field values |
| `validateOn` | `"input" \| "blur" \| "submit"` | `"submit"` | When to run first validation |
| `revalidateOn` | `"input" \| "blur" \| "submit"` | `"input"` | When to revalidate after first error |
| `onSubmit` | `(data) => void \| Promise<void>` | — | Called with validated data on successful submit |

### Form Return

| Property | Type | Description |
|----------|------|-------------|
| `field(name)` | `(name) => FieldReturn` | Get a field controller (memoized) |
| `isSubmitting()` | `() => boolean` | Whether submission is in progress |
| `isDirty` | `Memo<boolean>` | Whether any field differs from defaults |
| `isValid` | `Memo<boolean>` | Whether all fields pass validation |
| `errors` | `Memo<Record<string, string>>` | All current errors by field name |
| `handleSubmit(e)` | `(e: Event) => Promise<void>` | Form submit handler |
| `reset()` | `() => void` | Reset all fields to defaults |
| `setError(name, msg)` | `(name, message) => void` | Manually set a field error |

### Field Return

```ts
const email = form.field("email")
```

| Property | Type | Description |
|----------|------|-------------|
| `value()` | `() => V` | Current value (signal getter) |
| `error()` | `() => string` | Validation error message |
| `touched()` | `() => boolean` | Whether field has been blurred |
| `dirty()` | `() => boolean` | Whether value differs from default |
| `setValue(value)` | `(value: V) => void` | Set value directly |
| `handleInput(e)` | `(e: Event) => void` | Input event handler (reads `e.target.value`) |
| `handleBlur()` | `() => void` | Blur event handler |

## Validation Timing

The `validateOn` / `revalidateOn` options control when validation runs:

```ts
// Validate on blur, revalidate on input (good UX default)
createForm({ validateOn: "blur", revalidateOn: "input", ... })

// Validate only on submit
createForm({ validateOn: "submit", ... })

// Validate on every keystroke
createForm({ validateOn: "input", ... })
```

After `reset()`, the timing reverts to `validateOn` (the `revalidateOn` state is cleared).

## Server-Side Errors

Use `setError` to apply errors returned from a server:

```ts
const form = createForm({
  schema,
  defaultValues: { email: "" },
  onSubmit: async (data) => {
    const res = await fetch("/api/register", {
      method: "POST",
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const body = await res.json()
      form.setError("email", body.message)
    }
  },
})
```

## Custom Components

For components that don't use `e.target.value` (e.g. checkboxes, selects, custom widgets), use `setValue` directly:

```tsx
const active = form.field("active")

<Switch
  checked={active.value()}
  onCheckedChange={(checked) => active.setValue(checked)}
/>
```

## License

MIT
