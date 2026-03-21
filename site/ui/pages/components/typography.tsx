/**
 * Typography Reference Page (/components/typography)
 *
 * Focused developer reference with interactive Props Playground.
 */

import {
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyH4,
  TypographyP,
  TypographyBlockquote,
  TypographyList,
  TypographyInlineCode,
  TypographyLead,
  TypographyLarge,
  TypographySmall,
  TypographyMuted,
} from '@/components/ui/typography'
import { TypographyPlayground } from '@/components/typography-playground'
import { TypographyArticleDemo } from '@/components/typography-demo'
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
  { id: 'headings', title: 'Headings', branch: 'start' },
  { id: 'paragraph', title: 'Paragraph', branch: 'child' },
  { id: 'blockquote', title: 'Blockquote', branch: 'child' },
  { id: 'list', title: 'List', branch: 'child' },
  { id: 'inline-code', title: 'Inline Code', branch: 'child' },
  { id: 'lead', title: 'Lead', branch: 'child' },
  { id: 'text-styles', title: 'Text Styles', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import {
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyP,
  TypographyBlockquote,
  TypographyList,
  TypographyInlineCode,
  TypographyLead,
  TypographyLarge,
  TypographySmall,
  TypographyMuted,
} from "@/components/ui/typography"

function TypographyDemo() {
  return (
    <div>
      <TypographyH1>Heading 1</TypographyH1>
      <TypographyH2>Heading 2</TypographyH2>
      <TypographyH3>Heading 3</TypographyH3>
      <TypographyP>A paragraph of body text.</TypographyP>
      <TypographyLead>A lead paragraph.</TypographyLead>
      <TypographyBlockquote>A blockquote.</TypographyBlockquote>
      <TypographyList>
        <li>List item one</li>
        <li>List item two</li>
      </TypographyList>
      <TypographyInlineCode>code</TypographyInlineCode>
      <TypographyLarge>Large text</TypographyLarge>
      <TypographySmall>Small text</TypographySmall>
      <TypographyMuted>Muted text</TypographyMuted>
    </div>
  )
}`

const headingsCode = `<TypographyH1>This is H1</TypographyH1>
<TypographyH2>This is H2</TypographyH2>
<TypographyH3>This is H3</TypographyH3>
<TypographyH4>This is H4</TypographyH4>`

const paragraphCode = `<TypographyP>
  The king, seeing how the people of his kingdom were suffering,
  decided to repeal the joke tax and allow laughter to flourish
  once more.
</TypographyP>`

const blockquoteCode = `<TypographyBlockquote>
  "After all," he said, "everyone enjoys a good joke, so it's
  only fair that they should pay for the privilege."
</TypographyBlockquote>`

const listCode = `<TypographyList>
  <li>1st level of puns: 5 gold coins</li>
  <li>2nd level of jokes: 10 gold coins</li>
  <li>3rd level of one-liners: 20 gold coins</li>
</TypographyList>`

const inlineCodeCode = `<TypographyP>
  Install the package with{" "}
  <TypographyInlineCode>bun add @barefootjs/dom</TypographyInlineCode>.
</TypographyP>`

const leadCode = `<TypographyLead>
  A modal dialog that interrupts the user with important content
  and expects a response.
</TypographyLead>`

const textStylesCode = `<TypographyLarge>Are you absolutely sure?</TypographyLarge>
<TypographySmall>Email address</TypographySmall>
<TypographyMuted>Enter your email address.</TypographyMuted>`

const typographyProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'The text content to render.',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS classes.',
  },
]

export function TypographyRefPage() {
  return (
    <DocPage slug="typography" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Typography"
          description="Styled text elements for headings, paragraphs, and prose content."
          {...getNavLinks('typography')}
        />

        {/* Props Playground */}
        <TypographyPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add typography" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <TypographyArticleDemo />
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Headings" code={headingsCode} showLineNumbers={false}>
              <div className="space-y-4">
                <TypographyH1>This is H1</TypographyH1>
                <TypographyH2>This is H2</TypographyH2>
                <TypographyH3>This is H3</TypographyH3>
                <TypographyH4>This is H4</TypographyH4>
              </div>
            </Example>

            <Example title="Paragraph" code={paragraphCode} showLineNumbers={false}>
              <TypographyP>
                The king, seeing how the people of his kingdom were suffering,
                decided to repeal the joke tax and allow laughter to flourish
                once more.
              </TypographyP>
            </Example>

            <Example title="Blockquote" code={blockquoteCode} showLineNumbers={false}>
              <TypographyBlockquote>
                "After all," he said, "everyone enjoys a good joke, so it's
                only fair that they should pay for the privilege."
              </TypographyBlockquote>
            </Example>

            <Example title="List" code={listCode} showLineNumbers={false}>
              <TypographyList>
                <li>1st level of puns: 5 gold coins</li>
                <li>2nd level of jokes: 10 gold coins</li>
                <li>3rd level of one-liners: 20 gold coins</li>
              </TypographyList>
            </Example>

            <Example title="Inline Code" code={inlineCodeCode} showLineNumbers={false}>
              <TypographyP>
                Install the package with{' '}
                <TypographyInlineCode>bun add @barefootjs/dom</TypographyInlineCode>.
              </TypographyP>
            </Example>

            <Example title="Lead" code={leadCode} showLineNumbers={false}>
              <TypographyLead>
                A modal dialog that interrupts the user with important content
                and expects a response.
              </TypographyLead>
            </Example>

            <Example title="Text Styles" code={textStylesCode} showLineNumbers={false}>
              <div className="space-y-4">
                <TypographyLarge>Are you absolutely sure?</TypographyLarge>
                <TypographySmall>Email address</TypographySmall>
                <TypographyMuted>Enter your email address.</TypographyMuted>
              </div>
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <TypographyP>
              All typography components share the same props interface.
              Each renders a semantic HTML element with appropriate styling.
            </TypographyP>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium">Component</th>
                    <th className="text-left py-2 pr-4 font-medium">Element</th>
                    <th className="text-left py-2 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">TypographyH1</td><td className="py-2 pr-4">h1</td><td className="py-2">Page title, largest heading</td></tr>
                  <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">TypographyH2</td><td className="py-2 pr-4">h2</td><td className="py-2">Section heading with bottom border</td></tr>
                  <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">TypographyH3</td><td className="py-2 pr-4">h3</td><td className="py-2">Sub-section heading</td></tr>
                  <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">TypographyH4</td><td className="py-2 pr-4">h4</td><td className="py-2">Minor heading</td></tr>
                  <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">TypographyP</td><td className="py-2 pr-4">p</td><td className="py-2">Body text paragraph</td></tr>
                  <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">TypographyBlockquote</td><td className="py-2 pr-4">blockquote</td><td className="py-2">Quoted text with left border</td></tr>
                  <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">TypographyList</td><td className="py-2 pr-4">ul</td><td className="py-2">Bulleted list</td></tr>
                  <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">TypographyInlineCode</td><td className="py-2 pr-4">code</td><td className="py-2">Inline code snippet</td></tr>
                  <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">TypographyLead</td><td className="py-2 pr-4">p</td><td className="py-2">Larger introductory text</td></tr>
                  <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">TypographyLarge</td><td className="py-2 pr-4">div</td><td className="py-2">Large emphasis text</td></tr>
                  <tr className="border-b"><td className="py-2 pr-4 font-mono text-xs">TypographySmall</td><td className="py-2 pr-4">small</td><td className="py-2">Small caption text</td></tr>
                  <tr><td className="py-2 pr-4 font-mono text-xs">TypographyMuted</td><td className="py-2 pr-4">p</td><td className="py-2">Muted secondary text</td></tr>
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">Shared Props</h3>
              <PropsTable props={typographyProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
