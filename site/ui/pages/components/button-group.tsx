/**
 * Button Group Reference Page (/components/button-group)
 *
 * Developer reference with interactive Props Playground.
 */

import { Button } from '@/components/ui/button'
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from '@/components/ui/button-group'
import { ButtonGroupPlayground } from '@/components/button-group-playground'
import {
  ButtonGroupBasicDemo,
  ButtonGroupSeparatorDemo,
  ButtonGroupVerticalDemo,
  ButtonGroupTextDemo,
} from '@/components/button-group-demo'
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
  { id: 'separator', title: 'Separator', branch: 'start' },
  { id: 'vertical', title: 'Vertical', branch: 'child' },
  { id: 'with-text', title: 'With Text', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"

function ButtonGroupDemo() {
  return (
    <ButtonGroup>
      <Button variant="outline">Left</Button>
      <Button variant="outline">Center</Button>
      <Button variant="outline">Right</Button>
    </ButtonGroup>
  )
}`

const separatorCode = `<ButtonGroup>
  <Button variant="outline">Save</Button>
  <ButtonGroupSeparator />
  <Button variant="outline" size="icon" aria-label="More options">
    <ChevronDownIcon />
  </Button>
</ButtonGroup>`

const verticalCode = `<ButtonGroup orientation="vertical">
  <Button variant="outline">Profile</Button>
  <Button variant="outline">Settings</Button>
  <Button variant="outline">Logout</Button>
</ButtonGroup>`

const withTextCode = `<ButtonGroup>
  <Button variant="outline" size="icon" aria-label="Decrease">
    <MinusIcon />
  </Button>
  <ButtonGroupText>
    <span>1</span>
  </ButtonGroupText>
  <Button variant="outline" size="icon" aria-label="Increase">
    <PlusIcon />
  </Button>
</ButtonGroup>`

const buttonGroupProps: PropDefinition[] = [
  {
    name: 'orientation',
    type: "'horizontal' | 'vertical'",
    defaultValue: "'horizontal'",
    description: 'The layout direction of the button group.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'The buttons to group together.',
  },
]

const buttonGroupTextProps: PropDefinition[] = [
  {
    name: 'asChild',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Render child element instead of <div>.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'The text content to display.',
  },
]

const buttonGroupSeparatorProps: PropDefinition[] = [
  {
    name: 'orientation',
    type: "'horizontal' | 'vertical'",
    defaultValue: "'vertical'",
    description: 'The separator direction.',
  },
]

export function ButtonGroupRefPage() {
  return (
    <DocPage slug="button-group" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Button Group"
          description="Container for grouping related buttons with merged borders and corners."
          {...getNavLinks('button-group')}
        />

        {/* Props Playground */}
        <ButtonGroupPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add button-group" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <ButtonGroup>
              <Button variant="outline">Left</Button>
              <Button variant="outline">Center</Button>
              <Button variant="outline">Right</Button>
            </ButtonGroup>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Separator" code={separatorCode} showLineNumbers={false}>
              <ButtonGroupSeparatorDemo />
            </Example>

            <Example title="Vertical" code={verticalCode} showLineNumbers={false}>
              <ButtonGroupVerticalDemo />
            </Example>

            <Example title="With Text" code={withTextCode} showLineNumbers={false}>
              <ButtonGroupTextDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold mb-3">ButtonGroup</h3>
              <PropsTable props={buttonGroupProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">ButtonGroupText</h3>
              <PropsTable props={buttonGroupTextProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-3">ButtonGroupSeparator</h3>
              <PropsTable props={buttonGroupSeparatorProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
