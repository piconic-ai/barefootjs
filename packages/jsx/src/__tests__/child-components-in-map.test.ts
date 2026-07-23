/**
 * BarefootJS Compiler - Child components inside .map() (#344)
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { HonoAdapter } from '../../../../packages/adapter-hono/src/adapter/hono-adapter'

const adapter = new TestAdapter()

/**
 * Collapse all whitespace so offset assertions match the generated index
 * math regardless of the printer's spacing inside array literals
 * (`['a','b']` vs `['a', 'b']`) — the test asserts the offset logic, not
 * formatting.
 */
const noWs = (s: string) => s.replace(/\s+/g, '')

describe('child components inside .map() (#344)', () => {
  test('static array: nested component inside element wrapper generates initChild', () => {
    const source = `
      'use client'

      export function RadioGroup() {
        const items = [{ value: 'a' }, { value: 'b' }]
        return (
          <div>
            {items.map((item, i) => (
              <div key={i}><RadioGroupItem value={item.value} /></div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'RadioGroup.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain("initChild('RadioGroupItem'")
  })

  test('static array: direct component generates initChild with JSX props', () => {
    const source = `
      'use client'

      export function RadioGroup() {
        const items = [{ value: 'a' }, { value: 'b' }]
        return (
          <div>
            {items.map((item, i) => (
              <RadioGroupItem key={i} value={item.value} />
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'RadioGroup.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain("initChild('RadioGroupItem'")
    // Props should reference item.value, not pass raw array item
    expect(clientJs!.content).toContain('item.value')
    expect(clientJs!.content).not.toContain('__childProps')
  })

  test('static array: literal JSX props preserved on direct child component', () => {
    const source = `
      'use client'

      export function List() {
        const items = [{ name: 'a' }, { name: 'b' }]
        return (
          <div>
            {items.map((item, i) => (
              <ListItem key={i} label={item.name} className="pl-2 basis-1/3" />
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'List.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('className: "pl-2 basis-1/3"')
    expect(clientJs!.content).toContain('item.name')
  })

  test('static array: event handler props preserved on direct child component', () => {
    const source = `
      'use client'

      export function List() {
        const items = [{ id: '1' }, { id: '2' }]
        const handleClick = (id: string) => console.log(id)
        return (
          <div>
            {items.map((item, i) => (
              <ListItem key={i} onClick={() => handleClick(item.id)} />
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'List.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('onClick:')
  })

  test('static array: index parameter renamed in direct child component props (#479)', () => {
    const source = `
      'use client'

      export function List() {
        const items = [{ id: '1' }, { id: '2' }]
        return (
          <div>
            {items.map((item, index) => (
              <ListItem key={item.id} index={index} value={item.id} />
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'List.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // The forEach callback should use the user-defined index parameter name
    expect(clientJs!.content).toContain('(childScope, index)')
    expect(clientJs!.content).not.toContain('(childScope, __idx)')
  })

  test('static array: index parameter renamed in nested component props (#479)', () => {
    const source = `
      'use client'

      export function List() {
        const items = [{ id: '1' }, { id: '2' }]
        return (
          <div>
            {items.map((item, idx) => (
              <div key={item.id}><Nested position={idx} value={item.id} /></div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'List.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // The forEach callback should use the user-defined index parameter name
    expect(clientJs!.content).toContain(`(item, idx)`)
    expect(clientJs!.content).not.toContain(`(item, __idx)`)
  })

  test('static array: nested component with index in callback and signal access (#480)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

      export function SelectionDemo() {
        const [selected, setSelected] = createSignal(items.map(() => false))

        const toggleRow = (index) => {
          setSelected(prev => prev.map((v, i) => i === index ? !v : v))
        }

        return (
          <table>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id}>
                  <td>
                    <Checkbox
                      checked={selected()[index]}
                      onCheckedChange={() => toggleRow(index)}
                      aria-label={\`Select \${item.id}\`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    `
    const result = compileJSX(source, 'SelectionDemo.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // The forEach callback should use the user-defined 'index' parameter
    expect(clientJs!.content).toContain('(item, index)')
    expect(clientJs!.content).not.toContain('__idx')
    // Props should reference 'index' correctly in callback and signal access
    expect(clientJs!.content).toContain('selected()[index]')
    expect(clientJs!.content).toContain('toggleRow(index)')
  })

  test('dynamic signal array: component generates reconcileElements with createComponent', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function RadioGroup() {
        const [items, setItems] = createSignal([{ value: 'a' }, { value: 'b' }])
        return (
          <div>
            {items().map((item, i) => (
              <RadioGroupItem key={i} value={item.value} />
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'RadioGroup.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('mapArray')
    expect(clientJs!.content).toContain("createComponent('RadioGroupItem'")
  })

  test('static array: SSR template includes __bfChild for "use client" parent (#483)', () => {
    const honoAdapter = new HonoAdapter()
    const source = `
      'use client'

      export function CardList() {
        const items = [{ title: 'a' }, { title: 'b' }]
        return (
          <div>
            {items.map((item, i) => (
              <Card key={i} title={item.title} className="p-4" />
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'CardList.tsx', { adapter: honoAdapter })
    expect(result.errors).toHaveLength(0)

    const template = result.files.find(f => f.type === 'markedTemplate')
    expect(template).toBeDefined()
    expect(template!.content).toContain('__bfChild={true}')
  })

  test('static array: SSR template includes __bfChild for stateless parent with client interactivity (#483)', () => {
    // Parent has no "use client" but has static array with child components,
    // which triggers needsClientInit (client JS with initChild calls).
    // Without __bfChild, child components hydrate with empty props before
    // the parent's initChild can pass correct props (including className).
    const honoAdapter = new HonoAdapter()
    const source = `
      export function StaticList() {
        const items = [{ label: 'x' }, { label: 'y' }]
        return (
          <ul>
            {items.map((item, i) => (
              <ListItem key={i} label={item.label} className="text-sm" />
            ))}
          </ul>
        )
      }
    `
    const result = compileJSX(source, 'StaticList.tsx', { adapter: honoAdapter })
    expect(result.errors).toHaveLength(0)

    const template = result.files.find(f => f.type === 'markedTemplate')
    expect(template).toBeDefined()
    expect(template!.content).toContain('__bfChild={true}')

    // Should also generate client JS with initChild
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain("initChild('ListItem'")
  })

  test('no duplicate variable declaration when .map() slot ID matches component slot ID (#360)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Parent() {
        const [items, setItems] = createSignal([{ name: 'a' }, { name: 'b' }])
        return (
          <Wrapper>
            {items().map((item, i) => <span key={i}>{item.name}</span>)}
          </Wrapper>
        )
      }
    `
    const result = compileJSX(source, 'Parent.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // Each slot variable should be declared at most once
    const batchDecls = content.match(/const \[([^\]]+)\]/g) || []
    const allVars = batchDecls.flatMap((d: string) => {
      const inner = d.match(/\[([^\]]+)\]/)
      return inner ? inner[1].split(',').map((v: string) => v.trim()) : []
    })
    const uniqueVars = new Set(allVars)
    expect(allVars.length).toBe(uniqueVars.size)

    // Component slot ref ($c) and reconcileElements should both be present
    expect(content).toContain('$c(__scope')
    expect(content).toContain('mapArray')
  })

  test('dynamic signal array: component with component children emits nested createComponent (#481)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function DataTable() {
        const [payments, setPayments] = createSignal([
          { id: 'PAY-001', amount: 100 },
          { id: 'PAY-002', amount: 200 },
        ])
        return (
          <div>
            {payments().map(payment => (
              <TableRow key={payment.id}>
                <TableCell>{payment.id}</TableCell>
                <TableCell>{payment.amount}</TableCell>
              </TableRow>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'DataTable.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // Should use reconcileElements with createComponent
    expect(content).toContain('mapArray')
    expect(content).toContain("createComponent('TableRow'")

    // Children should be emitted as nested createComponent calls
    expect(content).toContain("createComponent('TableCell'")
    expect(content).toContain('get children()')
    expect(content).toContain('payment().id')
    expect(content).toContain('payment().amount')
  })

  test('dynamic signal array: component with mixed children (text + components)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function List() {
        const [items, setItems] = createSignal([{ name: 'a' }, { name: 'b' }])
        return (
          <div>
            {items().map((item, i) => (
              <Card key={i}>
                <CardHeader>{item.name}</CardHeader>
              </Card>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'List.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    expect(content).toContain("createComponent('Card'")
    expect(content).toContain("createComponent('CardHeader'")
    expect(content).toContain('get children()')
    expect(content).toContain('item().name')
  })

  test('dynamic signal array: component without children does not emit children getter', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function RadioGroup() {
        const [items, setItems] = createSignal([{ value: 'a' }, { value: 'b' }])
        return (
          <div>
            {items().map((item, i) => (
              <RadioGroupItem key={i} value={item.value} />
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'RadioGroup.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    expect(content).toContain("createComponent('RadioGroupItem'")
    // No children getter should be emitted for childless component
    expect(content).not.toContain('get children()')
  })

  test('dynamic signal array: deeply nested components (A > B > C)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function DataTable() {
        const [rows, setRows] = createSignal([{ id: '1', value: 'test' }])
        return (
          <div>
            {rows().map(row => (
              <TableRow key={row.id}>
                <TableCell>
                  <Badge>{row.value}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'DataTable.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // All three nested components should appear
    expect(content).toContain("createComponent('TableRow'")
    expect(content).toContain("createComponent('TableCell'")
    expect(content).toContain("createComponent('Badge'")
    expect(content).toContain('row().value')

    // All nested component names should be imported
    expect(content).toContain('@bf-child:TableRow')
    expect(content).toContain('@bf-child:TableCell')
    expect(content).toContain('@bf-child:Badge')
  })

  test('static array: onClick on plain element generates event delegation (#537)', () => {
    const source = `
      'use client'

      export function List() {
        const items = [{ id: '1', label: 'A' }, { id: '2', label: 'B' }]
        const handleClick = (id: string) => console.log(id)
        return (
          <ul>
            {items.map(item => (
              <li key={item.id}><button onClick={() => handleClick(item.id)}>{item.label}</button></li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSX(source, 'List.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // Event delegation should be generated for the static array
    expect(content).toContain(".addEventListener('click', (__bfEvt) => {")
    expect(content).toContain('closestWithin(target,')
    expect(content).toContain('Array.from(')
    expect(content).toContain('handleClick(item.id)')
  })

  test('static array: onClick on nested element uses walk-up strategy (#537)', () => {
    const source = `
      'use client'

      export function List() {
        const items = [{ value: 'x' }, { value: 'y' }]
        const setValue = (v: string) => console.log(v)
        return (
          <div>
            {items.map((item, i) => (
              <div key={i} className="card">
                <span>{item.value}</span>
                <button onClick={() => setValue(item.value)}>Select</button>
              </div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'List.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // Walk-up strategy: traverse from matched element to container's direct child
    expect(content).toContain('while (__el.parentElement')
    expect(content).toContain('.children).indexOf(__el)')
    expect(content).toContain('setValue(item.value)')
  })

  describe('callback returning function call (#546)', () => {
    test('arrow expression body: items().map(item => renderItem(item))', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function List() {
          const [items, setItems] = createSignal([{ id: '1' }, { id: '2' }])
          const renderItem = (item: any) => <li>{item.id}</li>
          return (
            <ul>
              {items().map(item => renderItem(item))}
            </ul>
          )
        }
      `
      const result = compileJSX(source, 'List.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      // The .map() call should become an expression, not a loop with empty children
      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain('renderItem')
    })

    test('parenthesized expression: items().map(item => (renderItem(item)))', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function List() {
          const [items, setItems] = createSignal([{ id: '1' }, { id: '2' }])
          const renderItem = (item: any) => <li>{item.id}</li>
          return (
            <ul>
              {items().map(item => (renderItem(item)))}
            </ul>
          )
        }
      `
      const result = compileJSX(source, 'List.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain('renderItem')
    })

    test('block body with function call return: items().map(item => { return renderItem(item) })', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function List() {
          const [items, setItems] = createSignal([{ id: '1' }, { id: '2' }])
          const renderItem = (item: any) => <li>{item.id}</li>
          return (
            <ul>
              {items().map(item => { const label = item.id; return renderItem(label) })}
            </ul>
          )
        }
      `
      const result = compileJSX(source, 'List.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain('renderItem')
    })

    test('SSR template output does not contain empty arrow body', () => {
      const honoAdapter = new HonoAdapter()
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function List() {
          const [items, setItems] = createSignal([{ id: '1' }, { id: '2' }])
          const renderItem = (item: any) => <li>{item.id}</li>
          return (
            <ul>
              {items().map(item => renderItem(item))}
            </ul>
          )
        }
      `
      const result = compileJSX(source, 'List.tsx', { adapter: honoAdapter })
      expect(result.errors).toHaveLength(0)

      const template = result.files.find(f => f.type === 'markedTemplate')
      expect(template).toBeDefined()
      // Should contain the .map() call with renderItem, not an empty arrow body
      expect(template!.content).toContain('.map(')
      expect(template!.content).toContain('renderItem')
      // Must NOT contain the broken pattern: => )
      expect(template!.content).not.toMatch(/=>\s*\)/)
    })
  })

  test('dynamic signal array: onClick on plain element still works (regression guard)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function DynList() {
        const [items, setItems] = createSignal([{ id: '1' }, { id: '2' }])
        const handleClick = (id: string) => console.log(id)
        return (
          <ul>
            {items().map(item => (
              <li key={item.id}><button onClick={() => handleClick(item.id)}>{item.id}</button></li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSX(source, 'DynList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // Dynamic array should use reconcileElements and event delegation
    expect(content).toContain('mapArray')
    expect(content).toContain(".addEventListener('click', (__bfEvt) => {")
    expect(content).toContain('handleClick(item.id)')
  })

  test('static array with preceding siblings uses siblingOffset (#810)', () => {
    const source = `
      'use client'

      export function Header() {
        const roles = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]
        return (
          <tr>
            <th>Name</th>
            {roles.map(role => (
              <th key={role.id}>{role.label}</th>
            ))}
          </tr>
        )
      }
    `
    const result = compileJSX(source, 'Header.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // Should use offset to skip the preceding <th>Name</th>
    expect(content).toContain('children[__idx + 1]')
  })

  test('static array event delegation with preceding siblings uses offset (#810)', () => {
    const source = `
      'use client'

      export function Header() {
        const roles = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]
        const select = (id: string) => console.log(id)
        return (
          <tr>
            <th>Name</th>
            {roles.map(role => (
              <th key={role.id}><button onClick={() => select(role.id)}>{role.label}</button></th>
            ))}
          </tr>
        )
      }
    `
    const result = compileJSX(source, 'Header.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // Event delegation indexOf should subtract offset
    expect(content).toContain('.indexOf(__el) - 1')
  })

  test('static array without preceding siblings has no offset', () => {
    const source = `
      'use client'

      export function List() {
        const items = [{ id: '1', label: 'A' }, { id: '2', label: 'B' }]
        return (
          <ul>
            {items.map(item => (
              <li key={item.id}>{item.label}</li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSX(source, 'List.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // No offset needed — children[__idx] should be used directly
    expect(content).toContain('children[__idx]')
    expect(content).not.toContain('children[__idx + ')
  })

  test('static array inside a component container with a preceding static sibling uses siblingOffset (#1688)', () => {
    // The loop is a direct child of the <Portaled> component (not an
    // element), with a static <span> sibling before it. Before #1688
    // computeLoopSiblingOffsets only counted siblings under element
    // parents, so the offset was silently zero and the first item's
    // nested child component (Counter) was resolved against the wrong
    // children[idx] — dropping it during hydration.
    const source = `
      'use client'

      function Portaled(props: { children?: any }) {
        return <div>{props.children}</div>
      }
      function Wrapper(props: { children?: any }) {
        return <div class="wrapper">{props.children}</div>
      }
      function Counter(props: { id: string }) {
        const [n, setN] = createSignal(0)
        return <button data-testid={props.id} onClick={() => setN(v => v + 1)}>{n()}</button>
      }
      export function Repro() {
        return (
          <Portaled>
            <span>static sibling</span>
            {['a', 'b'].map(id => (
              <Wrapper key={id}><Counter id={id} /></Wrapper>
            ))}
          </Portaled>
        )
      }
    `
    const result = compileJSX(source, 'Repro.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // The nested Counter lookup must skip the preceding static <span>.
    expect(content).toContain('children[__idx + 1]')
    expect(content).not.toContain('children[__idx]')
  })

  test('a transparent fragment wrapping a .map() inherits the parent container preceding siblings (#1699)', () => {
    // A fragment renders no DOM element wrapper, so a loop inside `<>…</>` is a
    // direct sibling of the fragment's siblings in the real parent element.
    // The offset must skip the two <hr/>s that precede the fragment in <Box>,
    // not reset to the fragment's own (empty) preceding run.
    const source = `
      'use client'

      function Box(props: { children?: any }) { return <div>{props.children}</div> }
      function Wrapper(props: { children?: any }) { return <div>{props.children}</div> }
      function Counter(props: { id: string }) {
        const [n, setN] = createSignal(0)
        return <button onClick={() => setN(v => v + 1)}>{n()}</button>
      }
      export function FragGroup() {
        return (
          <Box>
            <hr />
            <hr />
            <>
              {['a', 'b'].map(id => (
                <Wrapper key={id}><Counter id={id} /></Wrapper>
              ))}
            </>
          </Box>
        )
      }
    `
    const result = compileJSX(source, 'FragGroup.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const content = result.files.find(f => f.type === 'clientJs')!.content
    // Items start past both <hr/>s.
    expect(content).toContain('children[__idx + 2]')
    expect(content).not.toContain('children[__idx]')
  })

  test('a static sibling inside the fragment still counts toward the offset (#1699 regression guard)', () => {
    // The fragment's OWN preceding children must keep counting too — the
    // parent-inheriting flatten must not drop the fragment-internal <span>.
    const source = `
      'use client'

      function Box(props: { children?: any }) { return <div>{props.children}</div> }
      function Wrapper(props: { children?: any }) { return <div>{props.children}</div> }
      function Counter(props: { id: string }) {
        const [n, setN] = createSignal(0)
        return <button onClick={() => setN(v => v + 1)}>{n()}</button>
      }
      export function MixedFrag() {
        return (
          <Box>
            <hr />
            <>
              <span>label</span>
              {['a', 'b'].map(id => (
                <Wrapper key={id}><Counter id={id} /></Wrapper>
              ))}
            </>
          </Box>
        )
      }
    `
    const result = compileJSX(source, 'MixedFrag.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const content = result.files.find(f => f.type === 'clientJs')!.content
    // 1 (parent <hr/>) + 1 (fragment-internal <span>) = 2.
    expect(content).toContain('children[__idx + 2]')
  })

  test('two static + .map() groups inside a component: 2nd group offset skips the 1st group items (#1693)', () => {
    // Follow-up to #1688. With two `<span/> + {arr.map(...)}` groups inside a
    // self-portaling component, the second group's nested child components
    // must be resolved past BOTH the static <span>s AND the first group's
    // mapped items. The static-only offset (#1688) under-counted by the first
    // array's length, leaving the second group inert after hydration.
    const source = `
      'use client'

      function Box(props: { children?: any }) {
        return <div>{props.children}</div>
      }
      function Wrapper(props: { children?: any }) {
        return <div class="wrapper">{props.children}</div>
      }
      function Counter(props: { id: string }) {
        const [n, setN] = createSignal(0)
        return <button data-testid={props.id} onClick={() => setN(v => v + 1)}>{n()}</button>
      }
      export function TwoGroups() {
        return (
          <Box>
            <span>group 1</span>
            {['a', 'b'].map(id => (
              <Wrapper key={id}><Counter id={id} /></Wrapper>
            ))}
            <span>group 2</span>
            {['c', 'd'].map(id => (
              <Wrapper key={id}><Counter id={id} /></Wrapper>
            ))}
          </Box>
        )
      }
    `
    const result = compileJSX(source, 'TwoGroups.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // First group: one preceding static <span> → `+ 1`.
    expect(content).toContain('children[__idx + 1]')
    // Second group: two static <span>s plus the first group's mapped items →
    // the runtime length of the first array is added to the static count.
    expect(noWs(content)).toContain(noWs("children[__idx + 2 + (['a', 'b']).length]"))
  })

  test('two consecutive pure .map()s inside a component: 2nd loop offset is the 1st array length (#1693)', () => {
    // No static siblings: the second loop's items still start after the first
    // loop's items, so the offset is purely the first array's runtime length.
    const source = `
      'use client'

      function Box(props: { children?: any }) {
        return <div>{props.children}</div>
      }
      function Wrapper(props: { children?: any }) {
        return <div class="wrapper">{props.children}</div>
      }
      function Counter(props: { id: string }) {
        const [n, setN] = createSignal(0)
        return <button data-testid={props.id} onClick={() => setN(v => v + 1)}>{n()}</button>
      }
      export function TwoLoops() {
        return (
          <Box>
            {['a', 'b'].map(id => (
              <Wrapper key={id}><Counter id={id} /></Wrapper>
            ))}
            {['c', 'd'].map(id => (
              <Wrapper key={id}><Counter id={id} /></Wrapper>
            ))}
          </Box>
        )
      }
    `
    const result = compileJSX(source, 'TwoLoops.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const content = result.files.find(f => f.type === 'clientJs')!.content
    // First loop: no preceding siblings → bare access.
    expect(content).toContain('children[__idx]')
    // Second loop: offset is the first array's runtime length, no static term.
    expect(noWs(content)).toContain(noWs("children[__idx + (['a', 'b']).length]"))
  })

  test('conditional (&&) sibling before a static-array loop adds a runtime ternary offset (#1693)', () => {
    // A `{cond && <span/>}` sibling renders 1 element when true but ZERO
    // elements (only comment anchors) when false. Counting it as a static
    // `1` over-counts the false case, so the loop's nested children resolve
    // against the wrong `children[idx]`. The offset must be a runtime
    // `(cond ? 1 : 0)` term that collapses to 0 when the branch is absent.
    const source = `
      'use client'

      function Box(props: { children?: any }) { return <div>{props.children}</div> }
      function Wrapper(props: { children?: any }) { return <div>{props.children}</div> }
      function Counter(props: { id: string }) {
        const [n, setN] = createSignal(0)
        return <button onClick={() => setN(v => v + 1)}>{n()}</button>
      }
      export function CondGroup(props: { show: boolean }) {
        return (
          <Box>
            {props.show && <span>maybe</span>}
            {['a', 'b'].map(id => (
              <Wrapper key={id}><Counter id={id} /></Wrapper>
            ))}
          </Box>
        )
      }
    `
    const result = compileJSX(source, 'CondGroup.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const content = result.files.find(f => f.type === 'clientJs')!.content
    // Runtime ternary — `0` when the conditional renders no element. The
    // condition reuses the same `_p.show` form `insert()` evaluates.
    expect(content).toContain('children[__idx + (_p.show ? 1 : 0)]')
    // Must NOT mis-count the conditional as a static sibling.
    expect(content).not.toContain('children[__idx + 1]')
  })

  test('ternary sibling with an element in both branches keeps a static offset (#1693)', () => {
    // `{cond ? <a/> : <b/>}` always renders exactly one element, so both
    // branch counts are equal and the offset folds to a static `+ 1` — no
    // runtime ternary needed.
    const source = `
      'use client'

      function Box(props: { children?: any }) { return <div>{props.children}</div> }
      function Wrapper(props: { children?: any }) { return <div>{props.children}</div> }
      function Counter(props: { id: string }) {
        const [n, setN] = createSignal(0)
        return <button onClick={() => setN(v => v + 1)}>{n()}</button>
      }
      export function TernaryGroup(props: { show: boolean }) {
        return (
          <Box>
            {props.show ? <span>a</span> : <em>b</em>}
            {['a', 'b'].map(id => (
              <Wrapper key={id}><Counter id={id} /></Wrapper>
            ))}
          </Box>
        )
      }
    `
    const result = compileJSX(source, 'TernaryGroup.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const content = result.files.find(f => f.type === 'clientJs')!.content
    expect(content).toContain('children[__idx + 1]')
    expect(content).not.toContain('? 1 : 0')
  })

  test('non-element (text) sibling before a loop produces no offset (#1693)', () => {
    // A bare text node is NOT in `.children` (element-only), so it must
    // contribute 0 to the offset — not be counted as a static sibling.
    const source = `
      'use client'

      function Box(props: { children?: any }) { return <div>{props.children}</div> }
      function Wrapper(props: { children?: any }) { return <div>{props.children}</div> }
      function Counter(props: { id: string }) {
        const [n, setN] = createSignal(0)
        return <button onClick={() => setN(v => v + 1)}>{n()}</button>
      }
      export function TextGroup() {
        return (
          <Box>
            hello
            {['a', 'b'].map(id => (
              <Wrapper key={id}><Counter id={id} /></Wrapper>
            ))}
          </Box>
        )
      }
    `
    const result = compileJSX(source, 'TextGroup.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const content = result.files.find(f => f.type === 'clientJs')!.content
    expect(content).toContain('children[__idx]')
    expect(content).not.toContain('children[__idx + ')
  })

  test('nullish/logical (?? / ||) fallback sibling keeps a static offset, not an inverted ternary (#1693)', () => {
    // `{icon ?? <fallback/>}` transforms to a conditional whose true-branch is
    // the bare `icon` expression (undecidable element count) and whose false-
    // branch is the JSX fallback. The element count is statically unknown, so
    // it must fall back to the legacy flat `1` — NOT emit `(cond ? 0 : 1)`,
    // which would resolve to 0 and drop the items when `icon` is a real element.
    const source = `
      'use client'

      function Box(props: { children?: any }) { return <div>{props.children}</div> }
      function Wrapper(props: { children?: any }) { return <div>{props.children}</div> }
      function Counter(props: { id: string }) {
        const [n, setN] = createSignal(0)
        return <button onClick={() => setN(v => v + 1)}>{n()}</button>
      }
      export function NullishGroup(props: { icon?: any }) {
        return (
          <Box>
            {props.icon ?? <span>fallback</span>}
            {['a', 'b'].map(id => (
              <Wrapper key={id}><Counter id={id} /></Wrapper>
            ))}
          </Box>
        )
      }
    `
    const result = compileJSX(source, 'NullishGroup.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const content = result.files.find(f => f.type === 'clientJs')!.content
    expect(content).toContain('children[__idx + 1]')
    // The inverted-count regression — must not appear.
    expect(content).not.toContain('? 0 : 1')
  })

  test('preceding per-item-conditional loop does not contribute a bogus .length offset (#1693)', () => {
    // A `{arr.map(x => cond ? <el/> : null)}` loop renders 0-or-1 element per
    // item, so its rendered count is NOT `arr.length`. Emitting `+ arr.length`
    // would over-count; the undecidable loop falls back to the legacy `0`.
    const source = `
      'use client'

      function Box(props: { children?: any }) { return <div>{props.children}</div> }
      function Wrapper(props: { children?: any }) { return <div>{props.children}</div> }
      function Counter(props: { id: string }) {
        const [n, setN] = createSignal(0)
        return <button onClick={() => setN(v => v + 1)}>{n()}</button>
      }
      export function MixedLoops() {
        return (
          <Box>
            {['a', 'b', 'c'].map(x => (x === 'b' ? <span key={x}>{x}</span> : null))}
            {['a', 'b'].map(id => (
              <Wrapper key={id}><Counter id={id} /></Wrapper>
            ))}
          </Box>
        )
      }
    `
    const result = compileJSX(source, 'MixedLoops.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const content = result.files.find(f => f.type === 'clientJs')!.content
    // No `.length` term from the undecidable per-item-conditional loop.
    expect(noWs(content)).not.toContain(noWs("(['a', 'b', 'c']).length"))
  })

  test('nested .map() with multiple inner components emits unique __compEl bindings (#1664)', () => {
    const source = `
      'use client'

      export function Picker() {
        const GROUPS = [
          { id: 'a', items: [{ id: 'x', label: 'X' }] },
        ]
        return (
          <div>
            {GROUPS.map(group => (
              <div key={group.id}>
                {group.items.map(it => (
                  <div key={it.id}>
                    <SelectItem value={it.id}>{it.label}</SelectItem>
                    <SelectIcon name={it.id} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'Picker.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // Both inner-loop components must be initialised.
    expect(content).toContain("initChild('SelectItem'")
    expect(content).toContain("initChild('SelectIcon'")

    // No re-declaration of `__compEl` in the shared inner-forEach scope:
    // each comp must use a uniquely-suffixed binding.
    expect(content).toContain('__compEl0')
    expect(content).toContain('__compEl1')

    // The bug threw "Identifier '__compEl' has already been declared" — the
    // unsuffixed binding must not appear when multiple comps share a scope.
    expect(content).not.toContain('const __compEl =')
  })

  test('nested .map() with a single inner component keeps the plain __compEl binding (#1664)', () => {
    const source = `
      'use client'

      export function Picker() {
        const GROUPS = [
          { id: 'a', items: [{ id: 'x', label: 'X' }] },
        ]
        return (
          <div>
            {GROUPS.map(group => (
              <div key={group.id}>
                {group.items.map(it => (
                  <SelectItem key={it.id} value={it.id}>{it.label}</SelectItem>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'Picker.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const content = result.files.find(f => f.type === 'clientJs')!.content
    expect(content).toContain("initChild('SelectItem'")
    // Single comp keeps the unsuffixed name.
    expect(content).toContain('const __compEl =')
    expect(content).not.toContain('__compEl0')
  })

  describe('nested .map() inside a component-rooted loop item (#1725)', () => {
    // The outer loop item root is a *component* (a passthrough wrapper like
    // `SelectGroup`), not an element. Its JSX children contain a nested
    // `.map()` of components. The parent init emitted `initChild` for the
    // outer wrapper but never descended into its children to init the inner
    // loop's components — they rendered from SSR but never hydrated (silent).
    test('emits initChild for the inner-loop component (component wrapper)', () => {
      const source = `
        'use client'

        export function Repro() {
          const GROUPS = [
            { id: 'a', items: [{ id: 'a1', label: 'A1' }] },
            { id: 'b', items: [{ id: 'b1', label: 'B1' }] },
          ]
          return (
            <div>
              {GROUPS.map(group => (
                <Group key={group.id}>
                  {group.items.map(it => (
                    <Item key={it.id} label={it.label} />
                  ))}
                </Group>
              ))}
            </div>
          )
        }
      `
      const result = compileJSX(source, 'Repro.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const content = result.files.find(f => f.type === 'clientJs')!.content
      // Both the outer wrapper and the inner-loop component must init.
      expect(content).toContain("initChild('Group'")
      expect(content).toContain("initChild('Item'")
      // The inner component's props read the inner loop param.
      expect(content).toContain('return it.label')
      // Document-order zip shape — a flat cursor over the queried scopes
      // pairs each with its data item across the nested forEach. This shape
      // is fragment-root safe (no per-group wrapper element to index).
      expect(content).toContain('qsaChildScopes')
      expect(content).toMatch(/__compScopes\[__ci\+\+\]/)
      // No element-offset addressing (`__outerEl = ...children[...]`) — that
      // would break for a fragment-rooted passthrough.
      expect(content).not.toContain('__outerEl')
    })

    test('multiple inner components each get their own document-order cursor', () => {
      const source = `
        'use client'

        export function Repro() {
          const GROUPS = [{ id: 'a', items: [{ id: 'a1', label: 'A1' }] }]
          return (
            <div>
              {GROUPS.map(group => (
                <Group key={group.id}>
                  {group.items.map(it => (
                    <>
                      <Item key={it.id} label={it.label} />
                      <Badge text={it.label} />
                    </>
                  ))}
                </Group>
              ))}
            </div>
          )
        }
      `
      const result = compileJSX(source, 'Repro.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const content = result.files.find(f => f.type === 'clientJs')!.content
      expect(content).toContain("initChild('Item'")
      expect(content).toContain("initChild('Badge'")
      // Distinct scope arrays + cursors so each comp consumes its own
      // document-order stream (no `const __compEl` redeclaration, #1664).
      expect(content).toContain('__compScopes0')
      expect(content).toContain('__compScopes1')
      expect(content).toMatch(/__ci0\+\+/)
      expect(content).toMatch(/__ci1\+\+/)
    })
  })
})
