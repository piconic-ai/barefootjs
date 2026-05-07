"use client"
/**
 * CreateFormDemo Components
 *
 * Interactive demo for schema-driven form management using createForm.
 * Shows Standard Schema validation (Zod here; Valibot, ArkType, etc. work the same way).
 */

import { createForm } from '@barefootjs/form'
import { Input } from '@ui/components/ui/input'
import { Button } from '@ui/components/ui/button'
import { z } from 'zod'

/**
 * Profile form demo — basic createForm + field usage
 */
export function ProfileFormDemo() {
  const form = createForm({
    schema: z.object({
      username: z.string().min(1, 'Username is required').max(30, 'Username must be at most 30 characters'),
    }),
    defaultValues: { username: '' },
    onSubmit: async () => {
      await new Promise(resolve => setTimeout(resolve, 1000))
    },
  })

  const username = form.field('username')

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
      <Button type="submit" disabled={form.isSubmitting()}>
        {form.isSubmitting() ? 'Submitting...' : 'Submit'}
      </Button>
    </form>
  )
}
