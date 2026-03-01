"use client"
/**
 * CreateFormDemo Components
 *
 * Interactive demos for schema-driven form management using createForm.
 * Demonstrates Standard Schema validation with Zod.
 */

import { createMemo } from '@barefootjs/dom'
import { createForm } from '@barefootjs/form'
import { Input } from '@ui/components/ui/input'
import { Button } from '@ui/components/ui/button'
import { Switch } from '@ui/components/ui/switch'
import { z } from 'zod'

/**
 * Profile form demo — basic createForm + field usage
 */
export function ProfileFormDemo() {
  const form = createForm({
    schema: z.object({
      username: z.string().min(2, 'Username must be at least 2 characters').max(30, 'Username must be at most 30 characters'),
    }),
    defaultValues: { username: '' },
    onSubmit: async () => {
      await new Promise(resolve => setTimeout(resolve, 1000))
    },
  })

  const username = form.field('username')
  const loading = createMemo(() => form.isSubmitting())

  return (
    <form onSubmit={form.handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium leading-none">Username</label>
        <Input
          value={username.value()}
          onInput={username.handleInput}
          onBlur={username.handleBlur}
          placeholder="barefootjs"
        />
        <p className="text-sm text-muted-foreground">
          This is your public display name.
        </p>
        <p className="error-message text-sm text-destructive min-h-5">{username.error()}</p>
      </div>
      <Button type="submit" disabled={loading()}>
        <span className="button-text">{loading() ? 'Submitting...' : 'Submit'}</span>
      </Button>
    </form>
  )
}

/**
 * Login form demo — multiple fields + validateOn/revalidateOn
 */
export function LoginFormDemo() {
  const form = createForm({
    schema: z.object({
      email: z.string().email('Please enter a valid email address'),
      password: z.string().min(8, 'Password must be at least 8 characters'),
    }),
    defaultValues: { email: '', password: '' },
    validateOn: 'blur',
    revalidateOn: 'input',
    onSubmit: async () => {
      await new Promise(resolve => setTimeout(resolve, 1000))
    },
  })

  const email = form.field('email')
  const password = form.field('password')
  const loading = createMemo(() => form.isSubmitting())

  return (
    <form onSubmit={form.handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium leading-none">Email</label>
        <Input
          type="email"
          value={email.value()}
          onInput={email.handleInput}
          onBlur={email.handleBlur}
          placeholder="you@example.com"
        />
        <p className="email-error text-sm text-destructive min-h-5">{email.error()}</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium leading-none">Password</label>
        <Input
          type="password"
          value={password.value()}
          onInput={password.handleInput}
          onBlur={password.handleBlur}
          placeholder="Enter password"
        />
        <p className="password-error text-sm text-destructive min-h-5">{password.error()}</p>
      </div>
      <Button type="submit" disabled={loading()}>
        <span className="button-text">{loading() ? 'Signing in...' : 'Sign in'}</span>
      </Button>
    </form>
  )
}

/**
 * Notifications form demo — Switch + setValue
 */
export function NotificationsFormDemo() {
  const form = createForm({
    schema: z.object({
      marketing: z.boolean(),
      security: z.boolean(),
    }),
    defaultValues: { marketing: false, security: true },
    onSubmit: async () => {
      await new Promise(resolve => setTimeout(resolve, 1000))
    },
  })

  const marketing = form.field('marketing')
  const security = form.field('security')
  const loading = createMemo(() => form.isSubmitting())
  const dirty = createMemo(() => form.isDirty())

  return (
    <form onSubmit={form.handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium leading-none">Email Notifications</h4>
          <p className="text-sm text-muted-foreground mt-1">
            Configure which emails you want to receive.
          </p>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <label className="text-sm font-medium leading-none">Marketing emails</label>
              <p className="text-sm text-muted-foreground">
                Receive emails about new products and features.
              </p>
            </div>
            <Switch
              checked={marketing.value()}
              onCheckedChange={(checked) => marketing.setValue(checked)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <label className="text-sm font-medium leading-none">Security emails</label>
              <p className="text-sm text-muted-foreground">
                Receive emails about your account security.
              </p>
            </div>
            <Switch
              checked={security.value()}
              onCheckedChange={(checked) => security.setValue(checked)}
            />
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={loading() || !dirty()}>
          <span className="button-text">{loading() ? 'Saving...' : 'Save preferences'}</span>
        </Button>
        {dirty() ? (
          <Button type="button" variant="outline" onClick={() => form.reset()}>
            Reset
          </Button>
        ) : null}
      </div>
    </form>
  )
}

/**
 * Server error demo — setError for server-side validation
 */
export function ServerErrorFormDemo() {
  const form = createForm({
    schema: z.object({
      email: z.string().email('Please enter a valid email address'),
      username: z.string().min(2, 'Username must be at least 2 characters'),
    }),
    defaultValues: { email: '', username: '' },
    validateOn: 'blur',
    revalidateOn: 'input',
    onSubmit: async (data: Record<string, unknown>) => {
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Simulate server-side validation
      if (data.email === 'taken@example.com') {
        form.setError('email', 'This email is already registered')
        return
      }
      if (data.username === 'admin') {
        form.setError('username', 'This username is reserved')
        return
      }
    },
  })

  const email = form.field('email')
  const username = form.field('username')
  const loading = createMemo(() => form.isSubmitting())

  return (
    <form onSubmit={form.handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium leading-none">Email</label>
        <Input
          type="email"
          value={email.value()}
          onInput={email.handleInput}
          onBlur={email.handleBlur}
          placeholder="you@example.com"
        />
        <p className="email-error text-sm text-destructive min-h-5">{email.error()}</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium leading-none">Username</label>
        <Input
          value={username.value()}
          onInput={username.handleInput}
          onBlur={username.handleBlur}
          placeholder="Enter username"
        />
        <p className="username-error text-sm text-destructive min-h-5">{username.error()}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Try "taken@example.com" or username "admin" to see server errors.
      </p>
      <Button type="submit" disabled={loading()}>
        <span className="button-text">{loading() ? 'Registering...' : 'Register'}</span>
      </Button>
    </form>
  )
}
