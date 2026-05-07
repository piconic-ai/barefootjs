"use client"
/**
 * ValidationDemo Components
 *
 * Validation patterns built on createForm + Zod. See `/docs/forms/introduction`
 * for the underlying API.
 */

import { createForm } from '@barefootjs/form'
import { createSignal } from '@barefootjs/client'
import { Input } from '@ui/components/ui/input'
import { Button } from '@ui/components/ui/button'
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
