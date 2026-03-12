/**
 * Accordion Reference Page (/components/accordion)
 *
 * Focused developer reference with interactive Props Playground.
 * Migrated from /docs/components/accordion.
 */

import { AccordionSingleOpenDemo, AccordionMultipleOpenDemo, AccordionAsChildDemo } from '@/components/accordion-demo'
import { AccordionPlayground } from '@/components/accordion-playground'
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
  { id: 'single-open', title: 'Single Open', branch: 'start' },
  { id: 'multiple-open', title: 'Multiple Open', branch: 'child' },
  { id: 'as-child', title: 'As Child', branch: 'end' },
  { id: 'accessibility', title: 'Accessibility' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'`

const singleCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'

function AccordionSingle() {
  const [openItem, setOpenItem] = createSignal<string | null>('item-1')

  return (
    <Accordion>
      <AccordionItem value="item-1" open={openItem() === 'item-1'} onOpenChange={(v) => setOpenItem(v ? 'item-1' : null)}>
        <AccordionTrigger>Is it accessible?</AccordionTrigger>
        <AccordionContent>
          Yes. It adheres to the WAI-ARIA design pattern.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2" open={openItem() === 'item-2'} onOpenChange={(v) => setOpenItem(v ? 'item-2' : null)}>
        <AccordionTrigger>Is it styled?</AccordionTrigger>
        <AccordionContent>
          Yes. It comes with default styles that match your theme.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3" open={openItem() === 'item-3'} onOpenChange={(v) => setOpenItem(v ? 'item-3' : null)}>
        <AccordionTrigger>Is it animated?</AccordionTrigger>
        <AccordionContent>
          Yes. It's animated by default with CSS transitions.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}`

const multipleCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'

function AccordionMultiple() {
  // Each item manages its own state independently
  const [item1Open, setItem1Open] = createSignal(false)
  const [item2Open, setItem2Open] = createSignal(false)
  const [item3Open, setItem3Open] = createSignal(false)

  return (
    <Accordion>
      <AccordionItem value="item-1" open={item1Open()} onOpenChange={setItem1Open}>
        <AccordionTrigger>First Item</AccordionTrigger>
        <AccordionContent>
          Content for first item.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2" open={item2Open()} onOpenChange={setItem2Open}>
        <AccordionTrigger>Second Item</AccordionTrigger>
        <AccordionContent>
          Content for second item.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3" open={item3Open()} onOpenChange={setItem3Open}>
        <AccordionTrigger>Third Item</AccordionTrigger>
        <AccordionContent>
          Content for third item.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}`

const asChildCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'

function AccordionAsChild() {
  const [openItem, setOpenItem] = createSignal<string | null>(null)

  return (
    <Accordion>
      <AccordionItem value="custom" open={openItem() === 'custom'} onOpenChange={(v) => setOpenItem(v ? 'custom' : null)}>
        <AccordionTrigger asChild>
          <button type="button" className="...">Custom Trigger</button>
        </AccordionTrigger>
        <AccordionContent>
          This item uses a custom trigger element via asChild.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="standard" open={openItem() === 'standard'} onOpenChange={(v) => setOpenItem(v ? 'standard' : null)}>
        <AccordionTrigger>Standard Trigger</AccordionTrigger>
        <AccordionContent>
          This item uses the default button trigger.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}`

const accordionItemProps: PropDefinition[] = [
  {
    name: 'value',
    type: 'string',
    description: 'A unique identifier for the accordion item.',
  },
  {
    name: 'open',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the accordion item is open.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the accordion item is disabled.',
  },
  {
    name: 'onOpenChange',
    type: '(open: boolean) => void',
    description: 'Event handler called when the open state changes.',
  },
]

const accordionTriggerProps: PropDefinition[] = [
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the trigger is disabled.',
  },
  {
    name: 'asChild',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Render child element as trigger instead of built-in button.',
  },
]

const accordionContentProps: PropDefinition[] = []

export function AccordionRefPage() {
  return (
    <DocPage slug="accordion" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Accordion"
          description="A vertically stacked set of interactive headings that each reveal an associated section of content."
          {...getNavLinks('accordion')}
        />

        {/* Props Playground */}
        <AccordionPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add accordion" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="w-full max-w-md">
              <AccordionSingleOpenDemo />
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Single Open" code={singleCode}>
              <div className="w-full max-w-md">
                <AccordionSingleOpenDemo />
              </div>
            </Example>

            <Example title="Multiple Open" code={multipleCode}>
              <div className="w-full max-w-md">
                <AccordionMultipleOpenDemo />
              </div>
            </Example>

            <Example title="As Child" code={asChildCode}>
              <div className="w-full max-w-md">
                <AccordionAsChildDemo />
              </div>
            </Example>
          </div>
        </Section>

        {/* Accessibility */}
        <Section id="accessibility" title="Accessibility">
          <ul className="list-disc list-inside space-y-2 text-muted-foreground">
            <li><strong className="text-foreground">Keyboard Navigation</strong> - Arrow Up/Down to navigate between triggers, Home/End to jump</li>
            <li><strong className="text-foreground">Activation</strong> - Enter/Space to toggle accordion item</li>
            <li><strong className="text-foreground">ARIA</strong> - Triggers use aria-expanded, aria-controls; Content uses aria-labelledby</li>
            <li><strong className="text-foreground">Disabled State</strong> - aria-disabled on disabled triggers, skipped in keyboard navigation</li>
            <li><strong className="text-foreground">Screen Readers</strong> - State changes are announced when items are expanded/collapsed</li>
          </ul>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">AccordionItem</h3>
              <PropsTable props={accordionItemProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">AccordionTrigger</h3>
              <PropsTable props={accordionTriggerProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">AccordionContent</h3>
              <PropsTable props={accordionContentProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
