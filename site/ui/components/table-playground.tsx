"use client"
/**
 * Table Props Playground
 *
 * Interactive playground for the Table component.
 * Allows toggling caption and footer sections.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { hlPlain, hlTag } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from '@ui/components/ui/table'

type TableLayout = 'basic' | 'with-caption' | 'with-footer'

function TablePlayground(_props: {}) {
  const [layout, setLayout] = createSignal<TableLayout>('basic')

  createEffect(() => {
    const l = layout()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (!codeEl) return

    let code = `${hlPlain('&lt;')}${hlTag('Table')}${hlPlain('&gt;')}\n`

    if (l === 'with-caption') {
      code += `  ${hlPlain('&lt;')}${hlTag('TableCaption')}${hlPlain('&gt;')}A list of recent invoices.${hlPlain('&lt;/')}${hlTag('TableCaption')}${hlPlain('&gt;')}\n`
    }

    code +=
      `  ${hlPlain('&lt;')}${hlTag('TableHeader')}${hlPlain('&gt;')}\n` +
      `    ${hlPlain('&lt;')}${hlTag('TableRow')}${hlPlain('&gt;')}\n` +
      `      ${hlPlain('&lt;')}${hlTag('TableHead')}${hlPlain('&gt;')}Invoice${hlPlain('&lt;/')}${hlTag('TableHead')}${hlPlain('&gt;')}\n` +
      `      ${hlPlain('&lt;')}${hlTag('TableHead')}${hlPlain('&gt;')}Amount${hlPlain('&lt;/')}${hlTag('TableHead')}${hlPlain('&gt;')}\n` +
      `    ${hlPlain('&lt;/')}${hlTag('TableRow')}${hlPlain('&gt;')}\n` +
      `  ${hlPlain('&lt;/')}${hlTag('TableHeader')}${hlPlain('&gt;')}\n` +
      `  ${hlPlain('&lt;')}${hlTag('TableBody')}${hlPlain('&gt;')}\n` +
      `    ${hlPlain('&lt;')}${hlTag('TableRow')}${hlPlain('&gt;')}\n` +
      `      ${hlPlain('&lt;')}${hlTag('TableCell')}${hlPlain('&gt;')}INV001${hlPlain('&lt;/')}${hlTag('TableCell')}${hlPlain('&gt;')}\n` +
      `      ${hlPlain('&lt;')}${hlTag('TableCell')}${hlPlain('&gt;')}$250.00${hlPlain('&lt;/')}${hlTag('TableCell')}${hlPlain('&gt;')}\n` +
      `    ${hlPlain('&lt;/')}${hlTag('TableRow')}${hlPlain('&gt;')}\n` +
      `  ${hlPlain('&lt;/')}${hlTag('TableBody')}${hlPlain('&gt;')}\n`

    if (l === 'with-footer') {
      code +=
        `  ${hlPlain('&lt;')}${hlTag('TableFooter')}${hlPlain('&gt;')}\n` +
        `    ${hlPlain('&lt;')}${hlTag('TableRow')}${hlPlain('&gt;')}\n` +
        `      ${hlPlain('&lt;')}${hlTag('TableCell')}${hlPlain('&gt;')}Total${hlPlain('&lt;/')}${hlTag('TableCell')}${hlPlain('&gt;')}\n` +
        `      ${hlPlain('&lt;')}${hlTag('TableCell')}${hlPlain('&gt;')}$250.00${hlPlain('&lt;/')}${hlTag('TableCell')}${hlPlain('&gt;')}\n` +
        `    ${hlPlain('&lt;/')}${hlTag('TableRow')}${hlPlain('&gt;')}\n` +
        `  ${hlPlain('&lt;/')}${hlTag('TableFooter')}${hlPlain('&gt;')}\n`
    }

    code += `${hlPlain('&lt;/')}${hlTag('Table')}${hlPlain('&gt;')}`
    codeEl.innerHTML = code
  })

  const plainCode = () => {
    const l = layout()
    let code = `<Table>\n`
    if (l === 'with-caption') code += `  <TableCaption>A list of recent invoices.</TableCaption>\n`
    code +=
      `  <TableHeader>\n` +
      `    <TableRow>\n` +
      `      <TableHead>Invoice</TableHead>\n` +
      `      <TableHead>Amount</TableHead>\n` +
      `    </TableRow>\n` +
      `  </TableHeader>\n` +
      `  <TableBody>\n` +
      `    <TableRow>\n` +
      `      <TableCell>INV001</TableCell>\n` +
      `      <TableCell>$250.00</TableCell>\n` +
      `    </TableRow>\n` +
      `  </TableBody>\n`
    if (l === 'with-footer') {
      code +=
        `  <TableFooter>\n` +
        `    <TableRow>\n` +
        `      <TableCell>Total</TableCell>\n` +
        `      <TableCell>$250.00</TableCell>\n` +
        `    </TableRow>\n` +
        `  </TableFooter>\n`
    }
    code += `</Table>`
    return code
  }

  return (
    <PlaygroundLayout
      previewDataAttr="data-table-preview"
      previewContent={
        <div className="w-full max-w-md">
          <Table>
            {layout() === 'with-caption' && (
              <TableCaption>A list of recent invoices.</TableCaption>
            )}
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>INV001</TableCell>
                <TableCell>$250.00</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>INV002</TableCell>
                <TableCell>$150.00</TableCell>
              </TableRow>
            </TableBody>
            {layout() === 'with-footer' && (
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TableCell>$400.00</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      }
      controls={<>
        <PlaygroundControl label="layout">
          <Select value={layout()} onValueChange={(v: string) => setLayout(v as TableLayout)}>
            <SelectTrigger>
              <SelectValue placeholder="Select layout..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="basic">basic</SelectItem>
              <SelectItem value="with-caption">with caption</SelectItem>
              <SelectItem value="with-footer">with footer</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainCode()} />}
    />
  )
}

export { TablePlayground }
