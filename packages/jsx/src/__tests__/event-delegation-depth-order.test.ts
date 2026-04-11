/**
 * BarefootJS Compiler - Event delegation depth ordering (#774)
 *
 * When parent and child elements both handle the same event inside a .map() loop,
 * the delegation handler must check child (deeper) elements before parent (shallower)
 * elements. Otherwise target.closest() for the parent always matches first, preventing
 * the child handler from ever executing.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('event delegation depth ordering (#774)', () => {
  test('child onClick is checked before parent onClick in keyed dynamic loop', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/dom'

      interface Row { id: string; name: string }

      export function Table() {
        const [rows, setRows] = createSignal<Row[]>([])
        const handleRowClick = (row: Row) => console.log('row', row.id)
        const handleDelete = (row: Row) => setRows(r => r.filter(x => x.id !== row.id))

        return (
          <table>
            <tbody>
              {rows().map(row => (
                <tr key={row.id} onClick={() => handleRowClick(row)}>
                  <td>{row.name}</td>
                  <td><button onClick={() => handleDelete(row)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    `
    const result = compileJSXSync(source, 'Table.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // Should have event delegation with closest checks
    expect(content).toContain(".addEventListener('click', (e) => {")
    expect(content).toContain('target.closest')

    // Child handler (handleDelete / button) must appear before parent handler
    // (handleRowClick / tr) in the delegation handler.
    const deletePos = content.indexOf('handleDelete(row)')
    const rowClickPos = content.indexOf('handleRowClick(row)')
    expect(deletePos).not.toBe(-1)
    expect(rowClickPos).not.toBe(-1)
    expect(deletePos).toBeLessThan(rowClickPos)
  })

  test('child onClick is checked before parent onClick in static array loop', () => {
    const source = `
      'use client'

      export function List() {
        const items = [{ id: '1', label: 'A' }, { id: '2', label: 'B' }]
        const handleItemClick = (id: string) => console.log('item', id)
        const handleAction = (id: string) => console.log('action', id)

        return (
          <ul>
            {items.map(item => (
              <li onClick={() => handleItemClick(item.id)}>
                <span>{item.label}</span>
                <button onClick={() => handleAction(item.id)}>Action</button>
              </li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSXSync(source, 'List.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    expect(content).toContain(".addEventListener('click', (e) => {")

    // Child handler (handleAction / button) must appear before parent handler
    // (handleItemClick / li) in the delegation handler.
    const actionPos = content.indexOf('handleAction(item.id)')
    const itemClickPos = content.indexOf('handleItemClick(item.id)')
    expect(actionPos).not.toBe(-1)
    expect(itemClickPos).not.toBe(-1)
    expect(actionPos).toBeLessThan(itemClickPos)
  })
})
