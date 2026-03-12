/**
 * Portal Reference Page (/components/portal)
 *
 * Focused developer reference with interactive Props Playground.
 * Migrated from /docs/components/portal.
 */

import { PortalBasicDemo, PortalCustomContainerDemo } from '@/components/portal-demo'
import { PortalPlayground } from '@/components/portal-playground'
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
  { id: 'custom-container', title: 'Custom Container', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import { createPortal } from '@barefootjs/dom'

// Mount content at document.body
const portal = createPortal('<div>Portal content</div>')

// Mount at a specific container
const portal = createPortal('<div>Content</div>', containerEl)

// Cleanup
portal.unmount()`

const basicCode = `"use client"

import { createSignal, createPortal } from '@barefootjs/dom'

function PortalBasic() {
  const [open, setOpen] = createSignal(false)
  let portal = null

  const showPortal = () => {
    portal = createPortal(
      '<div class="modal">Portal content at document.body</div>'
    )
    setOpen(true)
  }

  const hidePortal = () => {
    portal?.unmount()
    portal = null
    setOpen(false)
  }

  return (
    <div>
      <button onClick={showPortal} disabled={open()}>
        Show Portal
      </button>
    </div>
  )
}`

const customContainerCode = `"use client"

import { createSignal, createPortal } from '@barefootjs/dom'

function PortalCustomContainer() {
  const [open, setOpen] = createSignal(false)
  let portal = null
  let containerRef = null

  const showPortal = () => {
    if (!containerRef) return
    portal = createPortal(
      '<div>Rendered inside custom container</div>',
      containerRef  // Custom container element
    )
    setOpen(true)
  }

  return (
    <div>
      <button onClick={showPortal}>Show in Container</button>
      <div ref={(el) => containerRef = el}>
        {/* Portal will render here */}
      </div>
    </div>
  )
}`

// Props definitions
const createPortalProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'HTMLElement | string | Renderable',
    description: 'Content to mount in the portal. Can be an HTMLElement, HTML string, or object with toString() method (like JSX).',
  },
  {
    name: 'container',
    type: 'HTMLElement',
    defaultValue: 'document.body',
    description: 'Target container element where the portal content will be mounted.',
  },
]

const portalReturnProps: PropDefinition[] = [
  {
    name: 'element',
    type: 'HTMLElement',
    description: 'Reference to the mounted DOM element.',
  },
  {
    name: 'unmount',
    type: '() => void',
    description: 'Function to remove the portal content from the DOM. Safe to call multiple times.',
  },
]

export function PortalRefPage() {
  return (
    <DocPage slug="portal" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Portal"
          description="Renders children into a different part of the DOM tree. Useful for modals, tooltips, and dropdowns."
          {...getNavLinks('portal')}
        />

        {/* Props Playground */}
        <PortalPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add portal" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="flex gap-4">
              <PortalBasicDemo />
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <PortalBasicDemo />
            </Example>

            <Example title="Custom Container" code={customContainerCode}>
              <PortalCustomContainerDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">createPortal(children, container?)</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Creates a portal to mount content at a specific container. Returns a Portal object with element reference and unmount method.
              </p>
              <h4 className="text-md font-medium text-foreground mb-3">Parameters</h4>
              <PropsTable props={createPortalProps} />
            </div>
            <div>
              <h4 className="text-md font-medium text-foreground mb-3">Return Value</h4>
              <PropsTable props={portalReturnProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
