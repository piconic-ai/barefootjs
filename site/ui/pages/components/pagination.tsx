/**
 * Pagination Reference Page (/components/pagination)
 *
 * Focused developer reference with interactive Props Playground.
 */

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '@/components/ui/pagination'
import { PaginationPlayground } from '@/components/pagination-playground'
import { PaginationBasicDemo, PaginationDynamicDemo } from '@/components/pagination-demo'
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
  { id: 'dynamic', title: 'Dynamic', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '@/components/ui/pagination'

function PaginationDemo() {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#" isActive>1</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">2</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">3</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="#" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}`

const basicCode = `import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '@/components/ui/pagination'

function PaginationBasic() {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#" isActive>1</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">2</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">3</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="#" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}`

const dynamicCode = `"use client"

import { createSignal } from '@barefootjs/dom'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
} from '@/components/ui/pagination'

function PaginationDynamic() {
  const [currentPage, setCurrentPage] = createSignal(1)
  const totalPages = 5

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page)
  }

  return (
    <div className="space-y-4">
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(e) => { e.preventDefault(); goToPage(currentPage() - 1) }}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#" isActive={currentPage() === 1}
              onClick={(e) => { e.preventDefault(); goToPage(1) }}>1</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#" isActive={currentPage() === 2}
              onClick={(e) => { e.preventDefault(); goToPage(2) }}>2</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#" isActive={currentPage() === 3}
              onClick={(e) => { e.preventDefault(); goToPage(3) }}>3</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#" isActive={currentPage() === 4}
              onClick={(e) => { e.preventDefault(); goToPage(4) }}>4</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#" isActive={currentPage() === 5}
              onClick={(e) => { e.preventDefault(); goToPage(5) }}>5</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(e) => { e.preventDefault(); goToPage(currentPage() + 1) }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
      <p className="text-center text-sm text-muted-foreground">
        Page {currentPage()} of {totalPages}
      </p>
    </div>
  )
}`

const paginationLinkProps: PropDefinition[] = [
  {
    name: 'isActive',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the link represents the current page. Sets aria-current="page" and applies outline variant.',
  },
  {
    name: 'size',
    type: "'default' | 'icon'",
    defaultValue: "'icon'",
    description: 'The size of the pagination link. PaginationPrevious and PaginationNext use "default".',
  },
  {
    name: 'href',
    type: 'string',
    description: 'The URL the link points to.',
  },
  {
    name: 'onClick',
    type: '(e: Event) => void',
    description: 'Click event handler. Use with e.preventDefault() for client-side navigation.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'The content of the pagination link (typically a page number).',
  },
]

export function PaginationRefPage() {
  return (
    <DocPage slug="pagination" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Pagination"
          description="Pagination with page navigation, next and previous links."
          {...getNavLinks('pagination')}
        />

        {/* Props Playground */}
        <PaginationPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add pagination" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious href="#" />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#" isActive>1</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#">2</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#">3</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext href="#" />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <PaginationBasicDemo />
            </Example>

            <Example title="Dynamic" code={dynamicCode}>
              <PaginationDynamicDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={paginationLinkProps} />
        </Section>
      </div>
    </DocPage>
  )
}
