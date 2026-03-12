/**
 * Tooltip Reference Page (/components/tooltip)
 *
 * Focused developer reference with interactive Props Playground.
 * Migrated from /docs/components/tooltip.
 */

import {
  TooltipBasicDemo,
  TooltipButtonDemo,
  TooltipTopDemo,
  TooltipRightDemo,
  TooltipBottomDemo,
  TooltipLeftDemo,
  TooltipDelayDemo,
  TooltipNoDelayDemo,
  TooltipIconDemo,
} from '@/components/tooltip-demo'
import { TooltipPlayground } from '@/components/tooltip-playground'
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
  { id: 'button-focus', title: 'Button Focus', branch: 'child' },
  { id: 'icon-buttons', title: 'Icon Buttons', branch: 'child' },
  { id: 'placement', title: 'Placement', branch: 'child' },
  { id: 'delay', title: 'Delay', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import { Tooltip } from "@/components/ui/tooltip"

<Tooltip content="This is a tooltip">
  <span className="underline decoration-dotted cursor-help">
    Hover me
  </span>
</Tooltip>`

const basicCode = `import { Tooltip } from "@/components/ui/tooltip"

export function TooltipBasicDemo() {
  return (
    <Tooltip content="This is a tooltip" id="tooltip-basic">
      <span className="underline decoration-dotted cursor-help">
        Hover me
      </span>
    </Tooltip>
  )
}`

const buttonCode = `import { Tooltip } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"

export function TooltipButtonDemo() {
  return (
    <Tooltip content="Keyboard accessible tooltip" id="tooltip-button">
      <Button>Hover or Focus</Button>
    </Tooltip>
  )
}`

const iconCode = `import { Tooltip } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"

export function TooltipIconDemo() {
  return (
    <div className="flex items-center gap-2">
      <Tooltip content="Bold" id="tooltip-icon-bold">
        <Button variant="outline" size="icon">
          <span className="font-bold">B</span>
        </Button>
      </Tooltip>
      <Tooltip content="Italic" id="tooltip-icon-italic">
        <Button variant="outline" size="icon">
          <span className="italic">I</span>
        </Button>
      </Tooltip>
      <Tooltip content="Underline" id="tooltip-icon-underline">
        <Button variant="outline" size="icon">
          <span className="underline">U</span>
        </Button>
      </Tooltip>
    </div>
  )
}`

const placementCode = `import { Tooltip } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"

export function TooltipPlacementDemo() {
  return (
    <div className="flex flex-wrap gap-4">
      <Tooltip content="Top placement" placement="top">
        <Button variant="outline">Top</Button>
      </Tooltip>
      <Tooltip content="Right placement" placement="right">
        <Button variant="outline">Right</Button>
      </Tooltip>
      <Tooltip content="Bottom placement" placement="bottom">
        <Button variant="outline">Bottom</Button>
      </Tooltip>
      <Tooltip content="Left placement" placement="left">
        <Button variant="outline">Left</Button>
      </Tooltip>
    </div>
  )
}`

const delayCode = `import { Tooltip } from "@/components/ui/tooltip"

export function TooltipDelayDemo() {
  return (
    <div className="flex flex-wrap gap-8">
      <Tooltip content="This tooltip has a 700ms delay" delayDuration={700}>
        <span className="underline decoration-dotted cursor-help">
          Hover me (700ms delay)
        </span>
      </Tooltip>
      <Tooltip content="This tooltip appears immediately" delayDuration={0}>
        <span className="underline decoration-dotted cursor-help">
          Hover me (no delay)
        </span>
      </Tooltip>
    </div>
  )
}`

const tooltipProps: PropDefinition[] = [
  {
    name: 'content',
    type: 'string',
    description: 'The text content displayed in the tooltip.',
  },
  {
    name: 'placement',
    type: "'top' | 'right' | 'bottom' | 'left'",
    defaultValue: "'top'",
    description: 'Position of the tooltip relative to the trigger element.',
  },
  {
    name: 'delayDuration',
    type: 'number',
    defaultValue: '0',
    description: 'Delay in milliseconds before showing the tooltip on hover.',
  },
  {
    name: 'closeDelay',
    type: 'number',
    defaultValue: '0',
    description: 'Delay in milliseconds before hiding the tooltip after mouse leave.',
  },
  {
    name: 'id',
    type: 'string',
    description: 'ID for aria-describedby accessibility linking.',
  },
]

export function TooltipRefPage() {
  return (
    <DocPage slug="tooltip" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Tooltip"
          description="A popup that displays contextual information on hover or focus."
          {...getNavLinks('tooltip')}
        />

        {/* Props Playground */}
        <TooltipPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add tooltip" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="flex gap-4">
              <TooltipBasicDemo />
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <TooltipBasicDemo />
            </Example>

            <Example title="Button Focus" code={buttonCode}>
              <TooltipButtonDemo />
            </Example>

            <Example title="Icon Buttons" code={iconCode}>
              <TooltipIconDemo />
            </Example>

            <Example title="Placement" code={placementCode}>
              <div className="flex flex-wrap gap-4 py-4">
                <TooltipTopDemo />
                <TooltipRightDemo />
                <TooltipBottomDemo />
                <TooltipLeftDemo />
              </div>
            </Example>

            <Example title="Delay" code={delayCode}>
              <div className="flex flex-wrap gap-8 py-4">
                <TooltipDelayDemo />
                <TooltipNoDelayDemo />
              </div>
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={tooltipProps} />
        </Section>
      </div>
    </DocPage>
  )
}
