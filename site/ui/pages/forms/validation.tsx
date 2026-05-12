/**
 * Form Validation Documentation Page
 *
 * Validation patterns expressed through createForm + a Standard Schema validator.
 */

import { Input } from '@/components/ui/input'
import {
  RequiredFieldDemo,
  EmailValidationDemo,
  PasswordConfirmationDemo,
  AsyncFieldValidationDemo,
  MultiFieldFormDemo,
} from '@/components/validation-demo'
import {
  PageHeader,
  Section,
  Example,
  type TocItem,
} from '../../components/shared/docs'
import { TableOfContents } from '@/components/table-of-contents'

const tocItems: TocItem[] = [
  { id: 'overview', title: 'Overview' },
  { id: 'examples', title: 'Examples' },
  { id: 'required-field', title: 'Required Field', branch: 'start' },
  { id: 'email-format', title: 'Email Format', branch: 'child' },
  { id: 'cross-field', title: 'Cross-Field', branch: 'child' },
  { id: 'async-availability', title: 'Async Availability', branch: 'child' },
  { id: 'multi-field', title: 'Multi-Field', branch: 'end' },
]

const requiredFieldCode = `import { createForm } from '@barefootjs/form'
import { z } from 'zod'

const form = createForm({
  schema: z.object({
    name: z.string().min(1, 'Name is required'),
  }),
  defaultValues: { name: '' },
  validateOn: 'blur',
  revalidateOn: 'input',
})

const name = form.field('name')

<Input
  value={name.value()}
  onInput={name.handleInput}
  onBlur={name.handleBlur}
/>
<p>{name.error()}</p>`

const emailValidationCode = `const form = createForm({
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
const isValid = () => email.touched() && email.error() === ''`

const passwordConfirmCode = `// Use Zod's .refine to compare two fields. The error attaches to
// \`confirmPassword\` via \`path\`, so it shows up on \`confirm.error()\`.
const form = createForm({
  schema: z
    .object({
      password: z.string().min(8, 'Password must be at least 8 characters'),
      confirmPassword: z.string().min(1, 'Please confirm your password'),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    }),
  defaultValues: { password: '', confirmPassword: '' },
  validateOn: 'blur',
  revalidateOn: 'input',
})`

const asyncValidationCode = `import { createSignal, onCleanup } from '@barefootjs/client'
import { Spinner } from '@/components/ui/spinner'

const TAKEN = new Set(['admin', 'root', 'test', 'guest'])

export function AsyncFieldValidationDemo() {
  const [username, setUsername] = createSignal('')
  const [validating, setValidating] = createSignal(false)
  // 0 neutral · 1 success · 2 warning · 3 error
  const [errorLevel, setErrorLevel] = createSignal(0)
  const [message, setMessage] = createSignal('')

  // Hue drives \`color: hsl(var(--err) 70% 45%)\` defined in globals.css.
  const errorHue = () =>
    errorLevel() === 1 ? '140' :
    errorLevel() === 2 ? '40' :
    errorLevel() === 3 ? '0' : '210'

  let timer = null
  const onInput = (e) => {
    const value = e.target.value
    setUsername(value)
    if (timer) clearTimeout(timer)
    if (!value) { setValidating(false); setErrorLevel(0); setMessage(''); return }

    setValidating(true)
    setMessage('Checking availability…')
    timer = setTimeout(() => {
      const lower = value.toLowerCase()
      if (TAKEN.has(lower)) { setErrorLevel(3); setMessage(\`"\${value}" is taken\`) }
      else                  { setErrorLevel(1); setMessage(\`"\${value}" is available\`) }
      setValidating(false)
    }, 600)
  }
  onCleanup(() => timer && clearTimeout(timer))

  return (
    <form className="space-y-3">
      <label>Username</label>
      <div className="flex items-center gap-2">
        <Input
          value={username()}
          onInput={onInput}
          aria-busy={validating() ? 'true' : 'false'}
        />
        {validating() ? <Spinner className="size-4" /> : null}
      </div>
      <p
        className="async-validation-msg text-sm"
        style={{ '--err': errorHue() }}
      >{message()}</p>
      <Button type="submit" disabled={validating() || errorLevel() === 3}>
        Create account
      </Button>
    </form>
  )
}`

const multiFieldFormCode = `const form = createForm({
  schema: z
    .object({
      name: z.string().min(2, 'Name must be at least 2 characters'),
      email: z.string().email('Invalid email format'),
      password: z.string().min(8, 'Password must be at least 8 characters'),
      confirmPassword: z.string().min(1, 'Please confirm your password'),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    }),
  defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  validateOn: 'blur',
  revalidateOn: 'input',
  onSubmit: async (data) => {
    await fetch('/api/register', { method: 'POST', body: JSON.stringify(data) })
  },
})

<form onSubmit={form.handleSubmit}>
  {/* fields ... */}
  <Button type="submit" disabled={form.isSubmitting()}>
    {form.isSubmitting() ? 'Submitting...' : 'Submit'}
  </Button>
</form>`

export function ValidationPage() {
  return (
    <div className="flex gap-10">
      <div className="flex-1 min-w-0 space-y-12">
        <PageHeader
          title="Form Validation"
          description="Schema-driven validation built on createForm. Cross-field rules use the validator's own combinators."
        />

        <Example title="" code={requiredFieldCode}>
          <div className="max-w-sm">
            <Input placeholder="Enter your name" />
            <p className="text-sm text-muted-foreground mt-2">
              See interactive examples below.
            </p>
          </div>
        </Example>

        <Section id="overview" title="Overview">
          <div className="prose prose-invert max-w-none">
            <p className="text-muted-foreground">
              Validation lives in the schema you pass to{' '}
              <a href="/docs/forms/introduction" className="text-foreground underline underline-offset-4"><code>createForm</code></a>.
              Each field exposes <code className="text-foreground">value</code>,{' '}
              <code className="text-foreground">error</code>, <code className="text-foreground">touched</code>, and the
              <code className="text-foreground"> handleInput</code>/<code className="text-foreground">handleBlur</code> handlers — wire them to the input.
              For cross-field rules use the validator's combinators (e.g. Zod's <code className="text-foreground">.refine</code>) and target a specific field via{' '}
              <code className="text-foreground">path</code>.
            </p>
          </div>
        </Section>

        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <div id="required-field">
              <Example title="Required Field" code={requiredFieldCode}>
                <div className="max-w-sm">
                  <RequiredFieldDemo />
                </div>
              </Example>
            </div>

            <div id="email-format">
              <Example title="Email Format" code={emailValidationCode}>
                <div className="max-w-sm">
                  <EmailValidationDemo />
                </div>
              </Example>
            </div>

            <div id="cross-field">
              <Example title="Cross-Field (Password Confirmation)" code={passwordConfirmCode}>
                <div className="max-w-sm">
                  <PasswordConfirmationDemo />
                </div>
              </Example>
            </div>

            <div id="async-availability">
              <Example
                title="Async Availability (Spinner + disabled + aria-busy synced)"
                code={asyncValidationCode}
              >
                <div className="max-w-sm">
                  <AsyncFieldValidationDemo />
                </div>
              </Example>
            </div>

            <div id="multi-field">
              <Example title="Multi-Field Form" code={multiFieldFormCode}>
                <div className="max-w-md">
                  <MultiFieldFormDemo />
                </div>
              </Example>
            </div>
          </div>
        </Section>
      </div>
      <TableOfContents items={tocItems} />
    </div>
  )
}
