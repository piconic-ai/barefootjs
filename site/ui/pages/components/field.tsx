/**
 * Field Reference Page (/components/field)
 *
 * Developer reference for the Field form field wrapper component.
 * Part of the #515 page redesign initiative.
 */

import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { FieldBasicDemo, FieldErrorDemo, FieldHorizontalDemo, FieldFormDemo } from '@/components/field-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  PropsTable,
  PackageManagerTabs,
  type PropDefinition,
  type TocItem,
} from '../../components/shared/docs'
import { getNavLinks } from '../../components/shared/PageNavigation'

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'installation', title: 'Installation' },
  { id: 'usage', title: 'Usage' },
  { id: 'examples', title: 'Examples' },
  { id: 'basic', title: 'Basic', branch: 'start' },
  { id: 'error', title: 'Error', branch: 'child' },
  { id: 'horizontal', title: 'Horizontal', branch: 'child' },
  { id: 'form', title: 'Form', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

function FieldDemo() {
  return (
    <Field>
      <FieldLabel for="email">Email</FieldLabel>
      <FieldContent>
        <Input id="email" type="email" placeholder="you@example.com" />
        <FieldDescription>We'll never share your email.</FieldDescription>
      </FieldContent>
    </Field>
  )
}`

const basicCode = `import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

function FieldBasic() {
  return (
    <Field>
      <FieldLabel for="email">Email</FieldLabel>
      <FieldContent>
        <Input id="email" type="email" placeholder="you@example.com" />
        <FieldDescription>We'll never share your email.</FieldDescription>
      </FieldContent>
    </Field>
  )
}`

const errorCode = `import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

function FieldWithError() {
  const [value, setValue] = createSignal('')
  const [touched, setTouched] = createSignal(false)
  const hasError = () => touched() && value().length === 0

  return (
    <Field data-invalid={hasError() || undefined}>
      <FieldLabel for="username">Username</FieldLabel>
      <FieldContent>
        <Input
          id="username"
          aria-invalid={hasError() || undefined}
          value={value()}
          onInput={(e) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
        />
        {hasError() ? (
          <FieldError>Username is required.</FieldError>
        ) : (
          <FieldDescription>Choose a unique username.</FieldDescription>
        )}
      </FieldContent>
    </Field>
  )
}`

const horizontalCode = `import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"

function FieldHorizontal() {
  return (
    <Field orientation="horizontal">
      <Checkbox />
      <FieldContent>
        <FieldLabel>Accept terms and conditions</FieldLabel>
        <FieldDescription>You agree to our Terms of Service and Privacy Policy.</FieldDescription>
      </FieldContent>
    </Field>
  )
}`

const formCode = `import { Field, FieldContent, FieldDescription, FieldLabel, FieldSet, FieldLegend, FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

function RegistrationForm() {
  return (
    <form onSubmit={handleSubmit}>
      <FieldSet>
        <FieldLegend>Create Account</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel for="name">Full Name</FieldLabel>
            <FieldContent>
              <Input id="name" placeholder="John Doe" />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel for="email">Email</FieldLabel>
            <FieldContent>
              <Input id="email" type="email" placeholder="john@example.com" />
              <FieldDescription>We'll send a verification email.</FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>
    </form>
  )
}`

const fieldProps: PropDefinition[] = [
  {
    name: 'orientation',
    type: "'vertical' | 'horizontal'",
    defaultValue: "'vertical'",
    description: 'Layout orientation of the field.',
  },
  {
    name: 'data-invalid',
    type: "'true' | undefined",
    description: 'Set to "true" to apply error styling.',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS class names.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'The content displayed inside the field.',
  },
]

const fieldLabelProps: PropDefinition[] = [
  {
    name: 'for',
    type: 'string',
    description: 'The id of the form control this label is associated with.',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS class names.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'The content displayed inside the label.',
  },
]

const fieldContentProps: PropDefinition[] = [
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS class names.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'Wraps the input control, description, and error.',
  },
]

const fieldDescriptionProps: PropDefinition[] = [
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS class names.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'Descriptive text content.',
  },
]

const fieldErrorProps: PropDefinition[] = [
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS class names.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'Error message content. Uses role="alert" for screen readers.',
  },
]

const fieldSetProps: PropDefinition[] = [
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS class names.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'Groups multiple Field components.',
  },
]

const fieldLegendProps: PropDefinition[] = [
  {
    name: 'variant',
    type: "'legend' | 'label'",
    defaultValue: "'legend'",
    description: 'The visual variant of the legend.',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS class names.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'The content displayed inside the legend.',
  },
]

const fieldGroupProps: PropDefinition[] = [
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS class names.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'Groups multiple fields within a FieldSet.',
  },
]

export function FieldRefPage() {
  return (
    <DocPage slug="field" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Field"
          description="Form field wrapper with label, description, and error message."
          {...getNavLinks('field')}
        />

        {/* Preview */}
        <Section id="preview" title="Preview">
          <div className="max-w-sm">
            <Field>
              <FieldLabel for="preview-email">Email</FieldLabel>
              <FieldContent>
                <Input id="preview-email" type="email" placeholder="you@example.com" />
                <FieldDescription>We'll never share your email.</FieldDescription>
              </FieldContent>
            </Field>
          </div>
        </Section>

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add field" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <FieldBasicDemo />
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <FieldBasicDemo />
            </Example>

            <Example title="Error" code={errorCode}>
              <FieldErrorDemo />
            </Example>

            <Example title="Horizontal" code={horizontalCode}>
              <FieldHorizontalDemo />
            </Example>

            <Example title="Form" code={formCode}>
              <FieldFormDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold mb-3">Field</h3>
              <PropsTable props={fieldProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">FieldLabel</h3>
              <PropsTable props={fieldLabelProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">FieldContent</h3>
              <PropsTable props={fieldContentProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">FieldDescription</h3>
              <PropsTable props={fieldDescriptionProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">FieldError</h3>
              <PropsTable props={fieldErrorProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">FieldSet</h3>
              <PropsTable props={fieldSetProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">FieldLegend</h3>
              <PropsTable props={fieldLegendProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">FieldGroup</h3>
              <PropsTable props={fieldGroupProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
