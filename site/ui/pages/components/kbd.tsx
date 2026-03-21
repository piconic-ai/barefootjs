/**
 * Kbd Reference Page (/components/kbd)
 *
 * Focused developer reference with interactive Props Playground.
 */

import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { KbdPlayground } from '@/components/kbd-playground'
import { KbdDemo } from '@/components/kbd-demo'
import { KbdShortcutsDemo } from '@/components/kbd-shortcuts-demo'
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
  { id: 'kbd-group', title: 'KbdGroup', branch: 'start' },
  { id: 'shortcuts', title: 'Shortcuts', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import { Kbd, KbdGroup } from "@/components/ui/kbd"

function KbdDemo() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>

      <Kbd>Enter</Kbd>
      <Kbd>Shift</Kbd>
      <Kbd>Esc</Kbd>
    </div>
  )
}`

const kbdGroupCode = `<KbdGroup>
  <Kbd>Ctrl</Kbd>
  <Kbd>Shift</Kbd>
  <Kbd>P</Kbd>
</KbdGroup>`

const shortcutsCode = `import { Kbd, KbdGroup } from "@/components/ui/kbd"

function ShortcutsList() {
  return (
    <div className="w-full max-w-sm space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Search</span>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Copy</span>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>C</Kbd>
        </KbdGroup>
      </div>
    </div>
  )
}`

const kbdProps: PropDefinition[] = [
  {
    name: 'asChild',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Render child element with kbd styling instead of <kbd>.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'The key label content.',
  },
]

const kbdGroupProps: PropDefinition[] = [
  {
    name: 'asChild',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Render child element with group styling instead of <kbd>.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'The grouped key elements.',
  },
]

export function KbdRefPage() {
  return (
    <DocPage slug="kbd" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Kbd"
          description="Displays a keyboard key or keyboard shortcut."
          {...getNavLinks('kbd')}
        />

        {/* Props Playground */}
        <KbdPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add kbd" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <KbdDemo />
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="KbdGroup" code={kbdGroupCode} showLineNumbers={false}>
              <KbdGroup>
                <Kbd>Ctrl</Kbd>
                <Kbd>Shift</Kbd>
                <Kbd>P</Kbd>
              </KbdGroup>
            </Example>

            <Example title="Shortcuts" code={shortcutsCode}>
              <KbdShortcutsDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">Kbd</h3>
              <PropsTable props={kbdProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">KbdGroup</h3>
              <PropsTable props={kbdGroupProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
