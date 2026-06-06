/**
 * Direction Reference Page (/components/direction)
 *
 * RTL/LTR direction provider reference with interactive Props Playground.
 */

import { DirectionProvider } from '@/components/ui/direction'
import { DirectionPlayground } from '@/components/direction-playground'
import { DirectionBasicDemo, DirectionNestedDemo, DirectionFormDemo } from '@/components/direction-demo'
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
  { id: 'nested', title: 'Nested', branch: 'child' },
  { id: 'form', title: 'Form', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import { DirectionProvider } from "@/components/ui/direction"

function DirectionDemo() {
  return (
    <DirectionProvider dir="rtl">
      <p>This content will be right-to-left.</p>
    </DirectionProvider>
  )
}`

const basicCode = `import { DirectionProvider } from "@/components/ui/direction"

function BasicExample() {
  return (
    <div className="flex flex-col gap-4">
      <DirectionProvider dir="ltr">
        <div className="rounded-md border p-4">
          <p>Left-to-Right (LTR)</p>
          <p>This text flows from left to right.</p>
        </div>
      </DirectionProvider>
      <DirectionProvider dir="rtl">
        <div className="rounded-md border p-4">
          <p>Right-to-Left (RTL)</p>
          <p>هذا النص يتدفق من اليمين إلى اليسار.</p>
        </div>
      </DirectionProvider>
    </div>
  )
}`

const nestedCode = `import { DirectionProvider } from "@/components/ui/direction"

function NestedExample() {
  return (
    <DirectionProvider dir="rtl">
      <div className="rounded-md border p-4">
        <p>محتوى RTL خارجي</p>
        <DirectionProvider dir="ltr">
          <div className="rounded-md border p-3">
            <p>Nested LTR content</p>
          </div>
        </DirectionProvider>
      </div>
    </DirectionProvider>
  )
}`

const formCode = `import { DirectionProvider } from "@/components/ui/direction"

function FormExample() {
  return (
    <DirectionProvider dir="rtl">
      <div className="rounded-md border p-4 space-y-3">
        <h4>نموذج تسجيل</h4>
        <div className="grid gap-1.5">
          <label>الاسم</label>
          <input type="text" placeholder="أدخل اسمك" />
        </div>
        <div className="grid gap-1.5">
          <label>البريد الإلكتروني</label>
          <input type="email" placeholder="أدخل بريدك الإلكتروني" />
        </div>
      </div>
    </DirectionProvider>
  )
}`

const directionProviderProps: PropDefinition[] = [
  {
    name: 'dir',
    type: '"ltr" | "rtl"',
    defaultValue: '"ltr"',
    description: 'The text direction for child content.',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS class names.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'Content to render within the direction context.',
  },
]

export function DirectionRefPage() {
  return (
    <DocPage slug="direction" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Direction"
          description="A provider for setting text direction (LTR/RTL) on child content."
          {...getNavLinks('direction')}
        />

        {/* Props Playground */}
        <DirectionPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="@barefootjs/cli add direction" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <DirectionProvider dir="rtl">
              <div className="rounded-md border p-4">
                <p className="text-sm">This content will be right-to-left.</p>
              </div>
            </DirectionProvider>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <DirectionBasicDemo />
            </Example>

            <Example title="Nested" code={nestedCode}>
              <DirectionNestedDemo />
            </Example>

            <Example title="Form" code={formCode}>
              <DirectionFormDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={directionProviderProps} />
        </Section>
      </div>
    </DocPage>
  )
}
