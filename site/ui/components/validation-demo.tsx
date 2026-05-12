"use client"
/**
 * ValidationDemo Components
 *
 * Validation patterns built on createForm + Zod. See `/docs/forms/introduction`
 * for the underlying API.
 */

import { createForm } from '@barefootjs/form'
import { createSignal, createMemo, onCleanup } from '@barefootjs/client'
import { Input } from '@ui/components/ui/input'
import { Button } from '@ui/components/ui/button'
import { Spinner } from '@ui/components/ui/spinner'
import { z } from 'zod'

/**
 * Required field validation — minimal createForm usage with one field.
 */
export function RequiredFieldDemo() {
  const form = createForm({
    schema: z.object({
      name: z.string().min(1, 'Name is required'),
    }),
    defaultValues: { name: '' },
    validateOn: 'blur',
    revalidateOn: 'input',
  })

  const name = form.field('name')

  return (
    <form className="space-y-2">
      <label className="text-sm text-muted-foreground">Name *</label>
      <Input
        value={name.value()}
        onInput={name.handleInput}
        onBlur={name.handleBlur}
        placeholder="Enter your name"
      />
      <p className="error-message text-sm text-destructive min-h-5">{name.error()}</p>
    </form>
  )
}

/**
 * Email format validation — schema rule + valid indicator from `field.error`.
 */
export function EmailValidationDemo() {
  const form = createForm({
    schema: z.object({
      email: z
        .string()
        .min(1, 'Email is required')
        .email('Invalid email format'),
    }),
    defaultValues: { email: '' },
    validateOn: 'blur',
    revalidateOn: 'input',
  })

  const email = form.field('email')
  const isValid = () => email.touched() && email.error() === ''

  return (
    <form className="space-y-2">
      <label className="text-sm text-muted-foreground">Email *</label>
      <Input
        type="email"
        value={email.value()}
        onInput={email.handleInput}
        onBlur={email.handleBlur}
        placeholder="Enter your email"
      />
      <div className="flex justify-between min-h-5">
        <p className="error-message text-sm text-destructive">{email.error()}</p>
        {isValid() ? <span className="valid-indicator text-sm text-success">Valid</span> : null}
      </div>
    </form>
  )
}

/**
 * Password confirmation — cross-field rule via Zod's `.refine`.
 */
export function PasswordConfirmationDemo() {
  const form = createForm({
    schema: z
      .object({
        password: z
          .string()
          .min(1, 'Password is required')
          .min(8, 'Password must be at least 8 characters'),
        confirmPassword: z.string().min(1, 'Please confirm your password'),
      })
      .refine((data) => data.password === data.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      }),
    defaultValues: { password: '', confirmPassword: '' },
    validateOn: 'blur',
    revalidateOn: 'input',
  })

  const password = form.field('password')
  const confirm = form.field('confirmPassword')
  const matched = () =>
    password.touched() &&
    confirm.touched() &&
    password.error() === '' &&
    confirm.error() === '' &&
    confirm.value().length > 0

  return (
    <form className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Password *</label>
        <Input
          type="password"
          value={password.value()}
          onInput={password.handleInput}
          onBlur={password.handleBlur}
          placeholder="Enter password (min 8 chars)"
        />
        <p className="password-error text-sm text-destructive min-h-5">{password.error()}</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Confirm Password *</label>
        <Input
          type="password"
          value={confirm.value()}
          onInput={confirm.handleInput}
          onBlur={confirm.handleBlur}
          placeholder="Confirm your password"
        />
        <p className="confirm-error text-sm text-destructive min-h-5">{confirm.error()}</p>
      </div>
      {matched() ? (
        <p className="match-indicator text-sm text-success">Passwords match!</p>
      ) : null}
    </form>
  )
}

/**
 * Async availability validation — three UI surfaces flip together while
 * the in-flight async check is pending:
 *
 *   1. `<Spinner>` mounts conditionally inside the input row.
 *   2. The submit `<Button>` is `disabled`.
 *   3. The `<Input>` carries `aria-busy="true"` so assistive tech reports
 *      the field as busy.
 *
 * All three are driven by the same `validating()` signal — the compiler
 * has to emit three independent reactive bindings that fire on a single
 * setter call without one masking the others.
 *
 * In addition, the error/status text uses `style={{'--err': errorHue()}}`
 * — a CSS custom property whose value comes from a signal — so the color
 * computed via `hsl(var(--err) …)` in `globals.css` tracks the validation
 * outcome (red error, amber warning, green success) without re-mounting
 * the paragraph.
 */
const TAKEN_USERNAMES = new Set(['admin', 'root', 'test', 'guest'])

export function AsyncFieldValidationDemo() {
  const [username, setUsername] = createSignal('')
  const [validating, setValidating] = createSignal(false)
  // 0 = neutral/empty, 1 = success (green), 2 = warning (amber), 3 = error (red)
  const [errorLevel, setErrorLevel] = createSignal(0)
  const [errorMessage, setErrorMessage] = createSignal('')

  // `createMemo` (not a plain arrow `const`) so the compiler can inline the
  // derived hue into the SSR template's initial `style` attribute — the
  // memo-substitution path in `buildSignalAndMemoMaps()` wraps a block-body
  // memo in an IIFE and resolves `errorLevel()` to its initial value at
  // hydrate time, keeping SSR and hydration in agreement.
  const errorHue = createMemo(() => {
    const lvl = errorLevel()
    if (lvl === 1) return '140' // green
    if (lvl === 2) return '40' // amber
    if (lvl === 3) return '0' // red
    return '210' // neutral slate
  })

  let timer: ReturnType<typeof setTimeout> | null = null
  const handleInput = (e: Event) => {
    const value = (e.target as HTMLInputElement).value
    setUsername(value)
    if (timer) clearTimeout(timer)

    if (value.length === 0) {
      setValidating(false)
      setErrorLevel(0)
      setErrorMessage('')
      return
    }

    setValidating(true)
    setErrorMessage('Checking availability…')
    setErrorLevel(0)

    timer = setTimeout(() => {
      setTimeout(() => {
        const trimmed = value.trim().toLowerCase()
        if (trimmed.length < 3) {
          setErrorLevel(3)
          setErrorMessage('Username must be at least 3 characters')
        } else if (TAKEN_USERNAMES.has(trimmed)) {
          setErrorLevel(3)
          setErrorMessage(`"${value}" is already taken`)
        } else if (/[^a-z0-9_-]/i.test(trimmed)) {
          setErrorLevel(2)
          setErrorMessage('Only letters, digits, _ and - are allowed')
        } else {
          setErrorLevel(1)
          setErrorMessage(`"${value}" is available`)
        }
        setValidating(false)
      }, 400)
    }, 200)
  }

  onCleanup(() => {
    if (timer) clearTimeout(timer)
  })

  return (
    <form className="space-y-3" data-async-validation>
      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Username *</label>
        <div className="flex items-center gap-2">
          <Input
            value={username()}
            onInput={handleInput}
            aria-busy={validating() ? 'true' : 'false'}
            placeholder="Pick a username (e.g. admin is taken)"
            data-async-input
          />
          {validating() ? (
            <Spinner className="size-4 text-muted-foreground" data-async-spinner />
          ) : null}
        </div>
        <p
          className="async-validation-msg text-sm min-h-5"
          style={{ '--err': errorHue() }}
          data-async-msg
          data-async-level={String(errorLevel())}
        >
          {errorMessage()}
        </p>
      </div>
      <Button
        type="submit"
        disabled={validating() || errorLevel() === 3}
        data-async-submit
      >
        Create account
      </Button>
    </form>
  )
}

/**
 * Multi-field form — full schema, submit handling, dependent confirm field.
 */
export function MultiFieldFormDemo() {
  const [submitted, setSubmitted] = createSignal<{ name: string; email: string } | null>(null)

  const form = createForm({
    schema: z
      .object({
        name: z
          .string()
          .min(1, 'Name is required')
          .min(2, 'Name must be at least 2 characters'),
        email: z
          .string()
          .min(1, 'Email is required')
          .email('Invalid email format'),
        password: z
          .string()
          .min(1, 'Password is required')
          .min(8, 'Password must be at least 8 characters'),
        confirmPassword: z.string().min(1, 'Please confirm your password'),
      })
      .refine((data) => data.password === data.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      }),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
    validateOn: 'blur',
    revalidateOn: 'input',
    onSubmit: async (data) => {
      setSubmitted({ name: data.name, email: data.email })
    },
  })

  const name = form.field('name')
  const email = form.field('email')
  const password = form.field('password')
  const confirm = form.field('confirmPassword')

  return (
    <div className="space-y-4">
      {submitted() ? (
        <div className="success-message p-4 bg-success/10 border border-success rounded-lg">
          <p className="text-success font-medium">Form submitted successfully!</p>
          <p className="text-sm text-muted-foreground mt-1">Name: {submitted()!.name}, Email: {submitted()!.email}</p>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Name *</label>
            <Input
              value={name.value()}
              onInput={name.handleInput}
              onBlur={name.handleBlur}
              placeholder="Enter your name (min 2 chars)"
            />
            <p className="name-error text-sm text-destructive min-h-5">{name.error()}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Email *</label>
            <Input
              type="email"
              value={email.value()}
              onInput={email.handleInput}
              onBlur={email.handleBlur}
              placeholder="Enter your email"
            />
            <p className="email-error text-sm text-destructive min-h-5">{email.error()}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Password *</label>
            <Input
              type="password"
              value={password.value()}
              onInput={password.handleInput}
              onBlur={password.handleBlur}
              placeholder="Enter password (min 8 chars)"
            />
            <p className="password-error text-sm text-destructive min-h-5">{password.error()}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Confirm Password *</label>
            <Input
              type="password"
              value={confirm.value()}
              onInput={confirm.handleInput}
              onBlur={confirm.handleBlur}
              placeholder="Confirm your password"
            />
            <p className="confirm-error text-sm text-destructive min-h-5">{confirm.error()}</p>
          </div>

          <div className="pt-2">
            <Button type="submit" disabled={form.isSubmitting()}>
              {form.isSubmitting() ? 'Submitting...' : 'Submit'}
            </Button>
          </div>

          {!form.isValid() && Object.keys(form.errors()).length > 0 ? (
            <p className="form-error text-sm text-destructive">Please fix the errors above</p>
          ) : null}
        </form>
      )}
    </div>
  )
}
