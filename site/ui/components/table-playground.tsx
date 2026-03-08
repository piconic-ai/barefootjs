"use client"
/**
 * Table Props Playground
 *
 * Interactive playground for the Table component.
 * Allows toggling caption and footer sections independently.
 *
 * Note: Uses style-based visibility instead of conditional rendering (&&)
 * to avoid HTML table foster parenting issues where the browser moves
 * comment markers outside <table>, breaking hydration.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { hlPlain, hlTag } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'
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

function TablePlayground(_props: {}) {
  const [showCaption, setShowCaption] = createSignal(false)
  const [showFooter, setShowFooter] = createSignal(false)

  createEffect(() => {
    const caption = showCaption()
    const footer = showFooter()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (!codeEl) return

    let code = `${hlPlain('&lt;')}${hlTag('Table')}${hlPlain('&gt;')}\n`

    if (caption) {
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

    if (footer) {
      code +=
        `  ${hlPlain('&lt;')}${hlTag('TableFooter')}${hlPlain('&gt;')}\n` +
        `    ${hlPlain('&lt;')}${hlTag('TableRow')}${hlPlain('&gt;')}\n` +
        `      ${hlPlain('&lt;')}${hlTag('TableCell')}${hlPlain('&gt;')}Total${hlPlain('&lt;/')}${hlTag('TableCell')}${hlPlain('&gt;')}\n` +
        `      ${hlPlain('&lt;')}${hlTag('TableCell')}${hlPlain('&gt;')}$400.00${hlPlain('&lt;/')}${hlTag('TableCell')}${hlPlain('&gt;')}\n` +
        `    ${hlPlain('&lt;/')}${hlTag('TableRow')}${hlPlain('&gt;')}\n` +
        `  ${hlPlain('&lt;/')}${hlTag('TableFooter')}${hlPlain('&gt;')}\n`
    }

    code += `${hlPlain('&lt;/')}${hlTag('Table')}${hlPlain('&gt;')}`
    codeEl.innerHTML = code
  })

  const plainCode = () => {
    const caption = showCaption()
    const footer = showFooter()
    let code = `<Table>\n`
    if (caption) code += `  <TableCaption>A list of recent invoices.</TableCaption>\n`
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
    if (footer) {
      code +=
        `  <TableFooter>\n` +
        `    <TableRow>\n` +
        `      <TableCell>Total</TableCell>\n` +
        `      <TableCell>$400.00</TableCell>\n` +
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
            <TableCaption style={showCaption() ? undefined : 'display:none'}>A list of recent invoices.</TableCaption>
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
            <TableFooter style={showFooter() ? undefined : 'display:none'}>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell>$400.00</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      }
      controls={<>
        <PlaygroundControl label="caption">
          <Checkbox
            checked={showCaption()}
            onCheckedChange={setShowCaption}
          />
        </PlaygroundControl>
        <PlaygroundControl label="footer">
          <Checkbox
            checked={showFooter()}
            onCheckedChange={setShowFooter}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={plainCode()} />}
    />
  )
}

export { TablePlayground }
