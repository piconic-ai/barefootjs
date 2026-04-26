/**
 * BarefootJS Compiler - Child components inside .map() (#344)
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { HonoAdapter } from '../../../../packages/adapter-hono/src/adapter/hono-adapter'

const adapter = new TestAdapter()

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
    const result = compileJSXSync(source, 'RadioGroup.tsx', { adapter })
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
    const result = compileJSXSync(source, 'RadioGroup.tsx', { adapter })
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
    const result = compileJSXSync(source, 'List.tsx', { adapter })
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
    const result = compileJSXSync(source, 'List.tsx', { adapter })
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
    const result = compileJSXSync(source, 'List.tsx', { adapter })
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
    const result = compileJSXSync(source, 'List.tsx', { adapter })
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
    const result = compileJSXSync(source, 'SelectionDemo.tsx', { adapter })
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
    const result = compileJSXSync(source, 'RadioGroup.tsx', { adapter })
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
    const result = compileJSXSync(source, 'CardList.tsx', { adapter: honoAdapter })
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
    const result = compileJSXSync(source, 'StaticList.tsx', { adapter: honoAdapter })
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
    const result = compileJSXSync(source, 'Parent.tsx', { adapter })
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
    const result = compileJSXSync(source, 'DataTable.tsx', { adapter })
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
    const result = compileJSXSync(source, 'List.tsx', { adapter })
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
    const result = compileJSXSync(source, 'RadioGroup.tsx', { adapter })
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
    const result = compileJSXSync(source, 'DataTable.tsx', { adapter })
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
    const result = compileJSXSync(source, 'List.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // Event delegation should be generated for the static array
    expect(content).toContain(".addEventListener('click', (e) => {")
    expect(content).toContain('target.closest')
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
    const result = compileJSXSync(source, 'List.tsx', { adapter })
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
      const result = compileJSXSync(source, 'List.tsx', { adapter })
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
      const result = compileJSXSync(source, 'List.tsx', { adapter })
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
      const result = compileJSXSync(source, 'List.tsx', { adapter })
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
      const result = compileJSXSync(source, 'List.tsx', { adapter: honoAdapter })
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
    const result = compileJSXSync(source, 'DynList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // Dynamic array should use reconcileElements and event delegation
    expect(content).toContain('mapArray')
    expect(content).toContain(".addEventListener('click', (e) => {")
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
    const result = compileJSXSync(source, 'Header.tsx', { adapter })
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
    const result = compileJSXSync(source, 'Header.tsx', { adapter })
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
    const result = compileJSXSync(source, 'List.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // No offset needed — children[__idx] should be used directly
    expect(content).toContain('children[__idx]')
    expect(content).not.toContain('children[__idx + ')
  })
})
