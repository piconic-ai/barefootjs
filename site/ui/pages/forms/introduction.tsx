/**
 * Forms Introduction Page
 *
 * Entry point for the Forms patterns section. Shows the spectrum from
 * createSignal-based controlled inputs to @barefootjs/form for richer use cases.
 */

import { BasicControlledDemo } from '@/components/controlled-input-demo'
import { ProfileFormDemo } from '@/components/create-form-demo'
import {
  PageHeader,
  Section,
  Example,
  CodeBlock,
  type TocItem,
} from '../../components/shared/docs'
import { TableOfContents } from '@/components/table-of-contents'

const tocItems: TocItem[] = [
  { id: 'simple-form', title: 'Simple Form' },
  { id: 'when-to-reach-for-form', title: 'When to Reach for @barefootjs/form' },
  { id: 'features', title: 'Features' },
  { id: 'basic-example', title: 'Basic Example' },
  { id: 'next-steps', title: 'Next Steps' },
]

const controlledInputCode = `import { createSignal } from '@barefootjs/client'
import { Input } from '@/components/ui/input'

const [text, setText] = createSignal('')

<Input
  value={text()}
  onInput={(e) => setText(e.target.value)}
  placeholder="Type something..."
/>
<p>Current value: {text()}</p>`

const profileFormCode = `"use client"

import { createForm } from '@barefootjs/form'
import { z } from 'zod'

function ProfileForm() {
  const form = createForm({
    schema: z.object({
      username: z.string()
        .min(1, 'Username is required')
        .max(30, 'Username must be at most 30 characters'),
    }),
    defaultValues: { username: '' },
    onSubmit: async (data) => {
      await fetch('/api/profile', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },
  })

  const username = form.field('username')

  return (
    <form onSubmit={form.handleSubmit}>
      <label>Username</label>
      <input
        value={username.value()}
        onInput={username.handleInput}
        onBlur={username.handleBlur}
      />
      <p>{username.error()}</p>
      <button type="submit" disabled={form.isSubmitting()}>
        {form.isSubmitting() ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  )
}`

const valibotSchemaCode = `import { createForm } from '@barefootjs/form'
import * as v from 'valibot'

// Just swap the schema — everything else stays the same
const form = createForm({
  schema: v.object({
    username: v.pipe(
      v.string(),
      v.minLength(1, 'Username is required'),
      v.maxLength(30, 'Username must be at most 30 characters'),
    ),
  }),
  defaultValues: { username: '' },
  onSubmit: async (data) => { /* ... */ },
})`

const arktypeSchemaCode = `import { createForm } from '@barefootjs/form'
import { type } from 'arktype'

const form = createForm({
  schema: type({
    username: '1 <= string <= 30',
  }),
  defaultValues: { username: '' },
  onSubmit: async (data) => { /* ... */ },
})`

const installCode = `# With Zod
bun add @barefootjs/form zod

# With Valibot
bun add @barefootjs/form valibot

# With ArkType
bun add @barefootjs/form arktype`

export function FormsIntroductionPage() {
  return (
    <div className="flex gap-10">
      <div className="flex-1 min-w-0 space-y-12">
        <PageHeader
          title="Introduction"
          description="Forms in BarefootJS — start with createSignal for the simple cases, reach for @barefootjs/form when things get more involved."
        />

        {/* Simple Form */}
        <Section id="simple-form" title="Simple Form">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              For a small form, the built-in primitives are usually enough. Pair{' '}
              <code className="text-foreground">createSignal</code> with{' '}
              <code className="text-foreground">value</code> and{' '}
              <code className="text-foreground">onInput</code> for two-way binding — no extra dependencies required.
            </p>
          </div>

          <Example title="Controlled input with createSignal" code={controlledInputCode}>
            <div className="max-w-sm">
              <BasicControlledDemo />
            </div>
          </Example>
        </Section>

        {/* When to Reach for @barefootjs/form */}
        <Section id="when-to-reach-for-form" title="When to Reach for @barefootjs/form">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              Wiring signals by hand stays pleasant for a single input, but starts to add up once a form needs:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
              <li>Schema-based validation across multiple fields</li>
              <li>Per-field <code className="text-foreground">touched</code> / <code className="text-foreground">dirty</code> state</li>
              <li>Different timing for first validation vs. revalidation (blur vs. input)</li>
              <li>Server-side errors mapped back onto specific fields</li>
              <li>Submission state, reset, and clean default-value tracking</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              At that point, <code className="text-foreground">@barefootjs/form</code> bundles all of it behind a small, declarative API.
            </p>
          </div>
        </Section>

        {/* Features */}
        <Section id="features" title="Features">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              <code className="text-foreground">@barefootjs/form</code> is built around{' '}
              <a
                href="https://github.com/standard-schema/standard-schema"
                className="text-foreground underline underline-offset-4"
              >
                Standard Schema
              </a>
              , so any compliant validator works out of the box — swap the schema and the rest of the component stays exactly the same.
            </p>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-semibold text-foreground mb-2">Validator-agnostic via Standard Schema</h3>
              <p className="text-sm text-muted-foreground">
                Use Zod, Valibot, ArkType, or any other Standard Schema implementation. Migrate between them without touching component code.
              </p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-semibold text-foreground mb-2">Configurable validation timing</h3>
              <p className="text-sm text-muted-foreground">
                <code className="text-foreground">validateOn</code> picks when validation first runs (<code className="text-foreground">"submit"</code> | <code className="text-foreground">"blur"</code> | <code className="text-foreground">"input"</code>);{' '}
                <code className="text-foreground">revalidateOn</code> picks how it behaves after the first error.
              </p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-semibold text-foreground mb-2">Field controllers</h3>
              <p className="text-sm text-muted-foreground">
                <code className="text-foreground">form.field(name)</code> returns a memoized controller exposing{' '}
                <code className="text-foreground">value()</code>, <code className="text-foreground">error()</code>,{' '}
                <code className="text-foreground">touched()</code>, <code className="text-foreground">dirty()</code>, and matching handlers.
              </p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-semibold text-foreground mb-2">Server errors and dirty tracking</h3>
              <p className="text-sm text-muted-foreground">
                <code className="text-foreground">form.setError()</code> surfaces server-side errors on specific fields;{' '}
                <code className="text-foreground">form.isDirty()</code> compares current values against defaults.
              </p>
            </div>
          </div>

          <div className="mt-6">
            <h4 className="text-sm font-medium text-foreground mb-2">Installation</h4>
            <CodeBlock code={installCode} lang="bash" />
          </div>
        </Section>

        {/* Basic Example */}
        <Section id="basic-example" title="Basic Example">
          <Example title="Profile form with Zod" code={profileFormCode}>
            <div className="max-w-sm">
              <ProfileFormDemo />
            </div>
          </Example>

          <div className="mt-6 space-y-4">
            <h4 className="text-sm font-medium text-foreground">Same component, different validator</h4>
            <p className="text-sm text-muted-foreground">
              Because <code className="text-foreground">createForm</code> accepts any{' '}
              <a
                href="https://github.com/standard-schema/standard-schema"
                className="text-foreground underline underline-offset-4"
              >
                Standard Schema
              </a>{' '}
              validator, swapping the schema definition is the only change needed.
            </p>

            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Valibot</p>
              <CodeBlock code={valibotSchemaCode} lang="tsx" />
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">ArkType</p>
              <CodeBlock code={arktypeSchemaCode} lang="tsx" />
            </div>
          </div>
        </Section>

        {/* Next Steps */}
        <Section id="next-steps" title="Next Steps">
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>
              <a href="/docs/forms/validation" className="text-foreground underline underline-offset-4">Validation</a>{' '}
              — error timing, multi-field forms, and custom rules.
            </li>
            <li>
              <a href="/docs/forms/field-arrays" className="text-foreground underline underline-offset-4">Field Arrays</a>{' '}
              — dynamic add / remove / reorder for repeated fields.
            </li>
          </ul>
        </Section>
      </div>
      <TableOfContents items={tocItems} />
    </div>
  )
}
