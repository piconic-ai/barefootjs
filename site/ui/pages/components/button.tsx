/**
 * Button Reference Page (/components/button)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Button } from '@/components/ui/button'
import { PlusIcon } from '@/components/ui/icon'
import { ButtonPlayground } from '@/components/button-playground'
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
  { id: 'size', title: 'Size', branch: 'start' },
  { id: 'icon', title: 'Icon', branch: 'child' },
  { id: 'as-child', title: 'As Child', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import { Button } from "@/components/ui/button"

function ButtonDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button>Default</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
      <Button size="sm">Small</Button>
      <Button size="lg">Large</Button>
      <Button asChild>
        <a href="#">Link Button</a>
      </Button>
    </div>
  )
}`

const sizeCode = `<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>`

const iconCode = `<Button size="icon-sm" aria-label="Add">
  <PlusIcon />
</Button>
<Button size="icon" aria-label="Add">
  <PlusIcon />
</Button>
<Button size="icon-lg" aria-label="Add">
  <PlusIcon />
</Button>`

const asChildCode = `<Button asChild>
  <a href="/">Go Home</a>
</Button>`

const buttonProps: PropDefinition[] = [
  {
    name: 'variant',
    type: "'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'",
    defaultValue: "'default'",
    description: 'The visual style of the button.',
  },
  {
    name: 'size',
    type: "'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg'",
    defaultValue: "'default'",
    description: 'The size of the button.',
  },
  {
    name: 'asChild',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Render child element with button styling instead of <button>.',
  },
  {
    name: 'children',
    type: 'ReactNode',
    description: 'The content of the button.',
  },
]

export function ButtonRefPage() {
  return (
    <DocPage slug="button" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Button"
          description="Displays a button or a component that looks like a button."
          {...getNavLinks('button')}
        />

        {/* Props Playground */}
        <ButtonPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add button" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="flex flex-wrap gap-2">
              <Button>Default</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
              <Button size="sm">Small</Button>
              <Button size="lg">Large</Button>
              <Button asChild>
                <a href="#">Link Button</a>
              </Button>
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Size" code={sizeCode} showLineNumbers={false}>
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
            </Example>

            <Example title="Icon" code={iconCode}>
              <Button size="icon-sm" aria-label="Add">
                <PlusIcon />
              </Button>
              <Button size="icon" aria-label="Add">
                <PlusIcon />
              </Button>
              <Button size="icon-lg" aria-label="Add">
                <PlusIcon />
              </Button>
            </Example>

            <Example title="As Child" code={asChildCode} showLineNumbers={false}>
              <Button asChild>
                <a href="/">Go Home</a>
              </Button>
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={buttonProps} />
        </Section>
      </div>
    </DocPage>
  )
}
