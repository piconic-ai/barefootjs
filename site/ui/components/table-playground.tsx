"use client"
/**
 * Table Props Playground
 *
 * Interactive playground for the Table component.
 * Allows toggling caption and footer sections independently.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type JsxTreeNode } from './shared/playground-highlight'
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

  const tree = (): JsxTreeNode => {
    const tableChildren: JsxTreeNode[] = []
    if (showCaption()) {
      tableChildren.push({ tag: 'TableCaption', children: 'A list of recent invoices.' })
    }
    tableChildren.push({
      tag: 'TableHeader', children: [{
        tag: 'TableRow', children: [
          { tag: 'TableHead', children: 'Invoice' },
          { tag: 'TableHead', children: 'Amount' },
        ],
      }],
    })
    tableChildren.push({
      tag: 'TableBody', children: [{
        tag: 'TableRow', children: [
          { tag: 'TableCell', children: 'INV001' },
          { tag: 'TableCell', children: '$250.00' },
        ],
      }],
    })
    if (showFooter()) {
      tableChildren.push({
        tag: 'TableFooter', children: [{
          tag: 'TableRow', children: [
            { tag: 'TableCell', children: 'Total' },
            { tag: 'TableCell', children: '$400.00' },
          ],
        }],
      })
    }
    return { tag: 'Table', children: tableChildren }
  }

  createEffect(() => {
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxTree(tree())
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-table-preview"
      previewContent={
        <div className="w-full max-w-md">
          <Table>
            {showCaption() && (
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
            {showFooter() && (
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
      copyButton={<CopyButton code={plainJsxTree(tree())} />}
    />
  )
}

export { TablePlayground }
