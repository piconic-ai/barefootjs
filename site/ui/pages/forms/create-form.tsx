/**
 * createForm Documentation Page
 *
 * Demonstrates schema-driven form management using createForm with Standard Schema validation.
 */

import {
  ProfileFormDemo,
  LoginFormDemo,
  NotificationsFormDemo,
  ServerErrorFormDemo,
} from '@/components/create-form-demo'
import {
  PageHeader,
  Section,
  Example,
  CodeBlock,
  type TocItem,
} from '../../components/shared/docs'
import { TableOfContents } from '@/components/table-of-contents'

// Table of contents items
const tocItems: TocItem[] = [
  { id: 'overview', title: 'Overview' },
  { id: 'installation', title: 'Installation' },
  { id: 'examples', title: 'Examples' },
  { id: 'profile-form', title: 'Profile Form', branch: 'start' },
  { id: 'login-form', title: 'Login Form', branch: 'child' },
  { id: 'notifications', title: 'Notifications', branch: 'child' },
  { id: 'server-errors', title: 'Server Errors', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

// Code examples
const profileFormCode = `import { createForm } from '@barefootjs/form'
import { z } from 'zod'

const form = createForm({
  schema: z.object({
    username: z.string().min(2).max(30),
  }),
  defaultValues: { username: '' },
  onSubmit: async (data) => {
    // Send data to your API
  },
})

const username = form.field('username')

<form onSubmit={form.handleSubmit}>
  <Input
    value={username.value()}
    onInput={username.handleInput}
    onBlur={username.handleBlur}
  />
  <p>{username.error()}</p>
  <Button disabled={form.isSubmitting()}>Submit</Button>
</form>`

const loginFormCode = `import { createForm } from '@barefootjs/form'
import { z } from 'zod'

const form = createForm({
  schema: z.object({
    email: z.string().email(),
    password: z.string().min(8),
  }),
  defaultValues: { email: '', password: '' },
  validateOn: 'blur',       // Validate when user leaves field
  revalidateOn: 'input',    // Re-validate on every keystroke after first error
  onSubmit: async (data) => { /* ... */ },
})

const email = form.field('email')
const password = form.field('password')

<form onSubmit={form.handleSubmit}>
  <Input
    value={email.value()}
    onInput={email.handleInput}
    onBlur={email.handleBlur}
  />
  <p>{email.error()}</p>
  {/* ... */}
</form>`

const notificationsFormCode = `import { createForm } from '@barefootjs/form'
import { z } from 'zod'

const form = createForm({
  schema: z.object({
    marketing: z.boolean(),
    security: z.boolean(),
  }),
  defaultValues: { marketing: false, security: true },
  onSubmit: async (data) => { /* ... */ },
})

const marketing = form.field('marketing')

// Use setValue for non-input components like Switch
<Switch
  checked={marketing.value()}
  onCheckedChange={(checked) => marketing.setValue(checked)}
/>

// Track dirty state for conditional UI
<Button disabled={!form.isDirty()}>Save</Button>
<Button onClick={() => form.reset()}>Reset</Button>`

const serverErrorCode = `import { createForm } from '@barefootjs/form'
import { z } from 'zod'

const form = createForm({
  schema: z.object({
    email: z.string().email(),
    username: z.string().min(2),
  }),
  defaultValues: { email: '', username: '' },
  onSubmit: async (data) => {
    const res = await fetch('/api/register', { ... })
    if (!res.ok) {
      const errors = await res.json()
      // Set server-side errors on specific fields
      form.setError('email', errors.email)
      return
    }
  },
})`

const installCode = `bun add @barefootjs/form zod`

export function CreateFormPage() {
  return (
    <div className="flex gap-10">
      <div className="flex-1 min-w-0 space-y-12">
        <PageHeader
          title="createForm"
          description="Schema-driven form management with Standard Schema validation. Replaces manual signal wiring with a declarative API."
        />

        {/* Preview */}
        <Example title="" code={profileFormCode}>
          <div className="max-w-sm">
            <ProfileFormDemo />
          </div>
        </Example>

        {/* Overview */}
        <Section id="overview" title="Overview">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              <code className="text-foreground">createForm</code> provides schema-driven form management using{' '}
              <a href="https://github.com/standard-schema/standard-schema" className="text-foreground underline underline-offset-4">Standard Schema</a> for validation.
              It works with any schema library that implements the Standard Schema spec (Zod, Valibot, ArkType, etc.).
            </p>
            <p className="text-muted-foreground mt-2">
              Key features:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
              <li><strong>Schema-driven validation</strong>: Define your schema once, get type-safe field access and validation</li>
              <li><strong>Configurable timing</strong>: <code className="text-foreground">validateOn</code> and <code className="text-foreground">revalidateOn</code> control when validation runs</li>
              <li><strong>Field controllers</strong>: <code className="text-foreground">form.field("name")</code> returns value, error, touched, dirty, and handlers</li>
              <li><strong>Server errors</strong>: <code className="text-foreground">form.setError()</code> for server-side validation feedback</li>
              <li><strong>Dirty tracking</strong>: <code className="text-foreground">form.isDirty()</code> compares current values against defaults</li>
            </ul>
          </div>
        </Section>

        {/* Installation */}
        <Section id="installation" title="Installation">
          <CodeBlock code={installCode} lang="bash" />
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <div id="profile-form">
              <Example title="Profile Form" code={profileFormCode}>
                <div className="max-w-sm">
                  <ProfileFormDemo />
                </div>
              </Example>
              <p className="text-sm text-muted-foreground mt-2">
                Basic usage: one field with schema validation. The form validates on submit by default.
              </p>
            </div>

            <div id="login-form">
              <Example title="Login Form" code={loginFormCode}>
                <div className="max-w-sm">
                  <LoginFormDemo />
                </div>
              </Example>
              <p className="text-sm text-muted-foreground mt-2">
                Multiple fields with <code className="text-foreground">validateOn: "blur"</code> and{' '}
                <code className="text-foreground">revalidateOn: "input"</code>.
                Errors appear when you leave a field, then clear as you type.
              </p>
            </div>

            <div id="notifications">
              <Example title="Notifications (Switch + setValue)" code={notificationsFormCode}>
                <div className="max-w-md">
                  <NotificationsFormDemo />
                </div>
              </Example>
              <p className="text-sm text-muted-foreground mt-2">
                Use <code className="text-foreground">field.setValue()</code> for non-input components.
                The submit button is disabled until the form is dirty.
              </p>
            </div>

            <div id="server-errors">
              <Example title="Server Errors (setError)" code={serverErrorCode}>
                <div className="max-w-sm">
                  <ServerErrorFormDemo />
                </div>
              </Example>
              <p className="text-sm text-muted-foreground mt-2">
                Use <code className="text-foreground">form.setError()</code> inside <code className="text-foreground">onSubmit</code> to
                display server-side validation errors on specific fields.
              </p>
            </div>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-semibold text-foreground mb-2">createForm(options)</h3>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li><code className="text-foreground">schema</code> — Standard Schema object (e.g. Zod schema)</li>
                <li><code className="text-foreground">defaultValues</code> — Initial field values</li>
                <li><code className="text-foreground">validateOn</code> — When to first validate: <code className="text-foreground">"input"</code> | <code className="text-foreground">"blur"</code> | <code className="text-foreground">"submit"</code> (default: <code className="text-foreground">"submit"</code>)</li>
                <li><code className="text-foreground">revalidateOn</code> — When to re-validate after first error: <code className="text-foreground">"input"</code> | <code className="text-foreground">"blur"</code> | <code className="text-foreground">"submit"</code> (default: <code className="text-foreground">"input"</code>)</li>
                <li><code className="text-foreground">onSubmit</code> — Async callback called with validated data</li>
              </ul>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-semibold text-foreground mb-2">Form Return</h3>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li><code className="text-foreground">field(name)</code> — Get a field controller (memoized)</li>
                <li><code className="text-foreground">handleSubmit</code> — Form submit handler (pass to <code className="text-foreground">{'<form onSubmit={...}>'}</code>)</li>
                <li><code className="text-foreground">isSubmitting()</code> — Whether submission is in progress</li>
                <li><code className="text-foreground">isDirty()</code> — Whether any field differs from defaults</li>
                <li><code className="text-foreground">isValid()</code> — Whether all fields pass validation</li>
                <li><code className="text-foreground">errors()</code> — All current errors keyed by field name</li>
                <li><code className="text-foreground">reset()</code> — Reset all fields to defaults and clear errors</li>
                <li><code className="text-foreground">setError(name, message)</code> — Set an error on a field manually</li>
              </ul>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-semibold text-foreground mb-2">Field Return</h3>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li><code className="text-foreground">value()</code> — Current field value</li>
                <li><code className="text-foreground">error()</code> — Current validation error message</li>
                <li><code className="text-foreground">touched()</code> — Whether the field has been interacted with</li>
                <li><code className="text-foreground">dirty()</code> — Whether the value differs from default</li>
                <li><code className="text-foreground">setValue(value)</code> — Set the field value directly</li>
                <li><code className="text-foreground">handleInput</code> — Input event handler (reads <code className="text-foreground">e.target.value</code>)</li>
                <li><code className="text-foreground">handleBlur</code> — Blur event handler (marks touched)</li>
              </ul>
            </div>
          </div>
        </Section>
      </div>
      <TableOfContents items={tocItems} />
    </div>
  )
}
