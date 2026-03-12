/**
 * Breadcrumb Reference Page (/components/breadcrumb)
 *
 * Focused developer reference with interactive Props Playground.
 * Migrated from /docs/components/breadcrumb.
 */

import {
  BreadcrumbBasicDemo,
  BreadcrumbEllipsisDemo,
  BreadcrumbCustomSeparatorDemo,
} from '@/components/breadcrumb-demo'
import { BreadcrumbPlayground } from '@/components/breadcrumb-playground'
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
  { id: 'ellipsis', title: 'Ellipsis', branch: 'child' },
  { id: 'custom-separator', title: 'Custom Separator', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from '@/components/ui/breadcrumb'`

const basicCode = `import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

function BreadcrumbBasic() {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Home</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Documents</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Current Document</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}`

const ellipsisCode = `import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from '@/components/ui/breadcrumb'

function BreadcrumbWithEllipsis() {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Home</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbEllipsis />
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Components</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Breadcrumb</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}`

const customSeparatorCode = `import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

function BreadcrumbCustomSeparator() {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Home</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator>/</BreadcrumbSeparator>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Components</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator>/</BreadcrumbSeparator>
        <BreadcrumbItem>
          <BreadcrumbPage>Breadcrumb</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}`

// Props definitions
const breadcrumbProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'ReactNode',
    description: 'The breadcrumb content (typically BreadcrumbList).',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS classes.',
  },
]

const breadcrumbListProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'ReactNode',
    description: 'The list items (BreadcrumbItem, BreadcrumbSeparator).',
  },
]

const breadcrumbItemProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'ReactNode',
    description: 'The item content (BreadcrumbLink or BreadcrumbPage).',
  },
]

const breadcrumbLinkProps: PropDefinition[] = [
  {
    name: 'href',
    type: 'string',
    description: 'The URL for the link.',
  },
  {
    name: 'asChild',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Render child element with link styling instead of <a>.',
  },
  {
    name: 'children',
    type: 'ReactNode',
    description: 'The link text.',
  },
]

const breadcrumbPageProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'ReactNode',
    description: 'The current page text.',
  },
]

const breadcrumbSeparatorProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'ReactNode',
    description: 'Custom separator content. Defaults to ChevronRightIcon.',
  },
]

export function BreadcrumbRefPage() {
  return (
    <DocPage slug="breadcrumb" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Breadcrumb"
          description="Displays the path to the current resource using a hierarchy of links."
          {...getNavLinks('breadcrumb')}
        />

        {/* Props Playground */}
        <BreadcrumbPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add breadcrumb" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <BreadcrumbBasicDemo />
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <BreadcrumbBasicDemo />
            </Example>

            <Example title="Ellipsis" code={ellipsisCode}>
              <BreadcrumbEllipsisDemo />
            </Example>

            <Example title="Custom Separator" code={customSeparatorCode}>
              <BreadcrumbCustomSeparatorDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">Breadcrumb</h3>
              <PropsTable props={breadcrumbProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">BreadcrumbList</h3>
              <PropsTable props={breadcrumbListProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">BreadcrumbItem</h3>
              <PropsTable props={breadcrumbItemProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">BreadcrumbLink</h3>
              <PropsTable props={breadcrumbLinkProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">BreadcrumbPage</h3>
              <PropsTable props={breadcrumbPageProps} />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">BreadcrumbSeparator</h3>
              <PropsTable props={breadcrumbSeparatorProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
