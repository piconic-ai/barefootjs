/**
 * Toggle Reference Page (/components/toggle)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Toggle } from '@/components/ui/toggle'
import { TogglePlayground } from '@/components/toggle-playground'
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
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import { Toggle } from "@/components/ui/toggle"

function ToggleDemo() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Toggle>Default</Toggle>
      <Toggle variant="outline">Outline</Toggle>
      <Toggle size="sm">Small</Toggle>
      <Toggle size="lg">Large</Toggle>
      <Toggle defaultPressed>Pressed</Toggle>
      <Toggle disabled>Disabled</Toggle>
    </div>
  )
}`

const toggleProps: PropDefinition[] = [
  {
    name: 'defaultPressed',
    type: 'boolean',
    defaultValue: 'false',
    description: 'The initial pressed state for uncontrolled mode.',
  },
  {
    name: 'pressed',
    type: 'boolean',
    description: 'The controlled pressed state of the toggle. When provided, the component is in controlled mode.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the toggle is disabled.',
  },
  {
    name: 'variant',
    type: "'default' | 'outline'",
    defaultValue: "'default'",
    description: 'The visual variant of the toggle.',
  },
  {
    name: 'size',
    type: "'default' | 'sm' | 'lg'",
    defaultValue: "'default'",
    description: 'The size of the toggle.',
  },
  {
    name: 'onPressedChange',
    type: '(pressed: boolean) => void',
    description: 'Event handler called when the toggle state changes.',
  },
]

export function ToggleRefPage() {
  return (
    <DocPage slug="toggle" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Toggle"
          description="A two-state button that can be either on or off."
          {...getNavLinks('toggle')}
        />

        {/* Props Playground */}
        <TogglePlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add toggle" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="flex flex-wrap items-center gap-2">
              <Toggle>Default</Toggle>
              <Toggle variant="outline">Outline</Toggle>
              <Toggle size="sm">Small</Toggle>
              <Toggle size="lg">Large</Toggle>
              <Toggle defaultPressed>Pressed</Toggle>
              <Toggle disabled>Disabled</Toggle>
            </div>
          </Example>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={toggleProps} />
        </Section>
      </div>
    </DocPage>
  )
}
