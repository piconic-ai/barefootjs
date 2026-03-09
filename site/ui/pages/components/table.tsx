/**
 * Table Reference Page (/components/table)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from '@/components/ui/table'
import { TablePlayground } from '@/components/table-playground'
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

const usageCode = `import {
  Table, TableHeader, TableBody, TableFooter,
  TableRow, TableHead, TableCell, TableCaption,
} from "@/components/ui/table"

function TableDemo() {
  return (
    <Table>
      <TableCaption>A list of recent invoices.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">Invoice</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Method</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">INV001</TableCell>
          <TableCell>Paid</TableCell>
          <TableCell>Credit Card</TableCell>
          <TableCell className="text-right">$250.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">INV002</TableCell>
          <TableCell>Pending</TableCell>
          <TableCell>PayPal</TableCell>
          <TableCell className="text-right">$150.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">INV003</TableCell>
          <TableCell>Paid</TableCell>
          <TableCell>Bank Transfer</TableCell>
          <TableCell className="text-right">$350.00</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>Total</TableCell>
          <TableCell className="text-right">$750.00</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}`

const tableProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'Table sub-components (TableHeader, TableBody, TableFooter, TableCaption).',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS classes for the table element.',
  },
]

const tableRowProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'TableHead or TableCell elements.',
  },
  {
    name: 'data-state',
    type: "'selected'",
    description: 'Set to "selected" to highlight the row.',
  },
]

const tableCellProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'Cell content.',
  },
  {
    name: 'colSpan',
    type: 'number',
    description: 'Number of columns the cell should span.',
  },
]

export function TableRefPage() {
  return (
    <DocPage slug="table" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Table"
          description="A responsive table component with composable sub-components."
          {...getNavLinks('table')}
        />

        {/* Props Playground */}
        <TablePlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add table" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <Table>
              <TableCaption>A list of recent invoices.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">INV001</TableCell>
                  <TableCell>Paid</TableCell>
                  <TableCell>Credit Card</TableCell>
                  <TableCell className="text-right">$250.00</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">INV002</TableCell>
                  <TableCell>Pending</TableCell>
                  <TableCell>PayPal</TableCell>
                  <TableCell className="text-right">$150.00</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">INV003</TableCell>
                  <TableCell>Paid</TableCell>
                  <TableCell>Bank Transfer</TableCell>
                  <TableCell className="text-right">$350.00</TableCell>
                </TableRow>
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right">$750.00</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Example>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">Table</h3>
              <PropsTable props={tableProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">TableRow</h3>
              <PropsTable props={tableRowProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">TableCell / TableHead</h3>
              <PropsTable props={tableCellProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
