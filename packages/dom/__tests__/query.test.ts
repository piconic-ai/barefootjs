import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { findScope, find, $, $c, $t } from '../src/query'
import { hydratedScopes } from '../src/hydration-state'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('findScope', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('finds scope by component name prefix', () => {
    document.body.innerHTML = `
      <div bf-s="Counter_abc123">content</div>
    `
    const scope = findScope('Counter', 0, null)
    expect(scope).not.toBeNull()
    expect(scope?.getAttribute('bf-s')).toBe('Counter_abc123')
    expect(hydratedScopes.has(scope!)).toBe(true)
  })

  test('returns parent if it is the scope element', () => {
    document.body.innerHTML = `
      <div bf-s="Counter_abc123">content</div>
    `
    const parent = document.querySelector('[bf-s]') as Element
    const scope = findScope('Counter', 0, parent)
    expect(scope).toBe(parent)
  })

  test('skips already initialized scopes', () => {
    document.body.innerHTML = `
      <div bf-s="Counter_1"></div>
      <div bf-s="Counter_2"></div>
    `
    // Mark first scope as already hydrated
    const first = document.querySelector('[bf-s="Counter_1"]')!
    hydratedScopes.add(first)

    const scope = findScope('Counter', 0, null)
    expect(scope?.getAttribute('bf-s')).toBe('Counter_2')
  })

  test('returns null if no matching scope found', () => {
    document.body.innerHTML = `
      <div bf-s="Other_1"></div>
    `
    const scope = findScope('Counter', 0, null)
    expect(scope).toBeNull()
  })

  test('finds scope at specific index', () => {
    document.body.innerHTML = `
      <div bf-s="Counter_1"></div>
      <div bf-s="Counter_2"></div>
      <div bf-s="Counter_3"></div>
    `
    const scope = findScope('Counter', 1, null)
    expect(scope?.getAttribute('bf-s')).toBe('Counter_2')
  })

  test('searches within parent element', () => {
    document.body.innerHTML = `
      <div id="parent">
        <div bf-s="Counter_inside"></div>
      </div>
      <div bf-s="Counter_outside"></div>
    `
    const parent = document.getElementById('parent')!
    const scope = findScope('Counter', 0, parent)
    expect(scope?.getAttribute('bf-s')).toBe('Counter_inside')
  })

  test('without comment flag returns null when no attribute scope exists', () => {
    document.body.innerHTML = `
      <!--bf-scope:FragComp_abc-->
      <div>child 1</div>
      <div>child 2</div>
    `
    // Without comment flag, should NOT fall back to comment-based search
    const scope = findScope('FragComp', 0, null)
    expect(scope).toBeNull()
  })

  test('with comment=true finds comment-based scope', () => {
    document.body.innerHTML = `
      <!--bf-scope:FragComp_abc-->
      <div>child 1</div>
      <div>child 2</div>
    `
    // With comment flag, should find via comment scope marker
    const scope = findScope('FragComp', 0, null, true)
    expect(scope).not.toBeNull()
  })
})

describe('find', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('finds element within scope', () => {
    document.body.innerHTML = `
      <div bf-s="Counter_1">
        <button bf="btn1">Click</button>
      </div>
    `
    const scope = document.querySelector('[bf-s]')
    const btn = find(scope, '[bf="btn1"]')
    expect(btn).not.toBeNull()
    expect(btn?.textContent).toBe('Click')
  })

  test('returns scope if it matches selector', () => {
    document.body.innerHTML = `
      <button bf-s="Button_1" bf="root">Click</button>
    `
    const scope = document.querySelector('[bf-s]')
    const el = find(scope, '[bf="root"]')
    expect(el).toBe(scope)
  })

  test('excludes elements in nested scopes', () => {
    document.body.innerHTML = `
      <div bf-s="Parent_1">
        <div bf-s="Child_1">
          <button bf="btn1">Nested</button>
        </div>
      </div>
    `
    const parentScope = document.querySelector('[bf-s="Parent_1"]')
    const btn = find(parentScope, '[bf="btn1"]')
    expect(btn).toBeNull()
  })

  test('returns null for null scope', () => {
    const el = find(null, '[bf="btn1"]')
    expect(el).toBeNull()
  })

  test('returns null if element not found', () => {
    document.body.innerHTML = `
      <div bf-s="Counter_1"></div>
    `
    const scope = document.querySelector('[bf-s]')
    const el = find(scope, '[bf="nonexistent"]')
    expect(el).toBeNull()
  })

  // Note: child scope searches (bf-s selectors) are handled by $c/findChildScope,
  // not by find(). See the $c test suite for scope-selector tests.

  describe('with portals', () => {
    test('finds element in portal owned by scope', () => {
      document.body.innerHTML = `
        <div bf-s="Dialog_abc123">
          <button bf="trigger">Open</button>
        </div>
        <div bf-po="Dialog_abc123">
          <input bf="input" />
        </div>
      `
      const scope = document.querySelector('[bf-s]')
      const input = find(scope, '[bf="input"]')
      expect(input).not.toBeNull()
      expect(input?.tagName.toLowerCase()).toBe('input')
    })

    test('prioritizes scope over portal for same selector', () => {
      document.body.innerHTML = `
        <div bf-s="Test_1">
          <span bf="item">Scope</span>
        </div>
        <div bf-po="Test_1">
          <span bf="item">Portal</span>
        </div>
      `
      const scope = document.querySelector('[bf-s]')
      const item = find(scope, '[bf="item"]')
      expect(item?.textContent).toBe('Scope')
    })

    test('finds element in portal when not in scope', () => {
      document.body.innerHTML = `
        <div bf-s="Dialog_xyz">
          <button bf="trigger">Open</button>
        </div>
        <div bf-po="Dialog_xyz">
          <div class="content">
            <input bf="email" type="email" />
            <button bf="submit">Submit</button>
          </div>
        </div>
      `
      const scope = document.querySelector('[bf-s]')
      const email = find(scope, '[bf="email"]')
      const submit = find(scope, '[bf="submit"]')
      expect(email).not.toBeNull()
      expect(submit).not.toBeNull()
      expect(email?.getAttribute('type')).toBe('email')
    })

    test('does not find element in portal owned by different scope', () => {
      document.body.innerHTML = `
        <div bf-s="Dialog_1">
          <button bf="trigger">Open</button>
        </div>
        <div bf-po="Dialog_2">
          <input bf="input" />
        </div>
      `
      const scope = document.querySelector('[bf-s="Dialog_1"]')
      const input = find(scope, '[bf="input"]')
      expect(input).toBeNull()
    })

    test('finds multiple elements across multiple portals', () => {
      document.body.innerHTML = `
        <div bf-s="Dialog_multi">
          <button bf="trigger">Open</button>
        </div>
        <div bf-po="Dialog_multi">
          <div bf="overlay" class="overlay"></div>
        </div>
        <div bf-po="Dialog_multi">
          <div bf="content" class="content"></div>
        </div>
      `
      const scope = document.querySelector('[bf-s]')
      const overlay = find(scope, '[bf="overlay"]')
      const content = find(scope, '[bf="content"]')
      expect(overlay).not.toBeNull()
      expect(content).not.toBeNull()
    })

    test('finds portal element itself when it matches selector', () => {
      document.body.innerHTML = `
        <div bf-s="Dialog_self">
          <button bf="trigger">Open</button>
        </div>
        <div bf-po="Dialog_self" bf="portal-root"></div>
      `
      const scope = document.querySelector('[bf-s]')
      const portalRoot = find(scope, '[bf="portal-root"]')
      expect(portalRoot).not.toBeNull()
      expect(portalRoot?.getAttribute('bf-po')).toBe('Dialog_self')
    })
  })

  describe('with comment-based scopes', () => {
    test('finds slot in proxy element (sibling with bf-s)', () => {
      // Comment scope: proxy element has bf-s but is a top-level sibling
      // in the comment range — should be searchable for its own slots
      document.body.innerHTML = `
        <!--bf-scope:FragComp_abc-->
        <div bf-s="~Child_xyz">
          <button bf="s0">Click</button>
        </div>
      `
      const scope = findScope('FragComp', 0, null, true)
      expect(scope).not.toBeNull()
      // The proxy element has bf-s, but find() should still search into it
      const btn = find(scope, '[bf="s0"]')
      // Should be null — s0 is inside Child_xyz's scope, not FragComp's
      expect(btn).toBeNull()
    })

    test('finds slot directly in comment range (no nested scope)', () => {
      document.body.innerHTML = `
        <!--bf-scope:FragComp_abc-->
        <div>
          <button bf="s0">Click</button>
        </div>
      `
      const scope = findScope('FragComp', 0, null, true)
      const btn = find(scope, '[bf="s0"]')
      expect(btn).not.toBeNull()
      expect(btn?.textContent).toBe('Click')
    })

    test('finds sibling element itself when it matches selector', () => {
      document.body.innerHTML = `
        <!--bf-scope:FragComp_abc-->
        <button bf="s0">Direct sibling</button>
        <div>other</div>
      `
      const scope = findScope('FragComp', 0, null, true)
      const btn = find(scope, '[bf="s0"]')
      expect(btn).not.toBeNull()
      expect(btn?.textContent).toBe('Direct sibling')
    })

    test('finds proxy element itself when it matches selector', () => {
      // Proxy element has bf-s AND matches the slot selector
      document.body.innerHTML = `
        <!--bf-scope:FragComp_abc-->
        <div bf-s="~Child_xyz" bf="s0">Proxy with slot</div>
      `
      const scope = findScope('FragComp', 0, null, true)
      const el = find(scope, '[bf="s0"]')
      expect(el).not.toBeNull()
      expect(el?.textContent).toBe('Proxy with slot')
    })
  })
})

describe('$', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('finds single element (destructured)', () => {
    document.body.innerHTML = `
      <div bf-s="Demo_abc">
        <button bf="s0">btn</button>
      </div>
    `
    const scope = document.querySelector('[bf-s="Demo_abc"]')
    const [btn] = $(scope, 's0')
    expect(btn?.textContent).toBe('btn')
  })

  test('finds multiple elements', () => {
    document.body.innerHTML = `
      <div bf-s="Demo_abc">
        <button bf="s0">btn0</button>
        <input bf="s1" />
        <span bf="s2">text</span>
      </div>
    `
    const scope = document.querySelector('[bf-s="Demo_abc"]')
    const [el0, el1, el2] = $(scope, 's0', 's1', 's2')
    expect(el0?.textContent).toBe('btn0')
    expect(el1?.tagName.toLowerCase()).toBe('input')
    expect(el2?.textContent).toBe('text')
  })

  test('finds ^-prefixed slot inside child scope', () => {
    document.body.innerHTML = `
      <div bf-s="Parent_abc">
        <div bf-s="~Child_xyz">
          <button bf="^s3">Click</button>
        </div>
      </div>
    `
    const scope = document.querySelector('[bf-s="Parent_abc"]')
    const [btn] = $(scope, '^s3')
    expect(btn).not.toBeNull()
    expect(btn?.textContent).toBe('Click')
  })

  test('finds ^-prefixed slot in deeply nested child scopes', () => {
    document.body.innerHTML = `
      <div bf-s="Parent_abc">
        <div bf-s="~Child_xyz">
          <div bf-s="~GrandChild_def">
            <input bf="^s5" type="text" />
          </div>
        </div>
      </div>
    `
    const scope = document.querySelector('[bf-s="Parent_abc"]')
    const [input] = $(scope, '^s5')
    expect(input).not.toBeNull()
    expect(input?.getAttribute('type')).toBe('text')
  })

  test('finds ^-prefixed slot in portals', () => {
    document.body.innerHTML = `
      <div bf-s="Dialog_abc">
        <button bf="s0">Open</button>
      </div>
      <div bf-po="Dialog_abc">
        <button bf="^s2">Close</button>
      </div>
    `
    const scope = document.querySelector('[bf-s="Dialog_abc"]')
    const [closeBtn] = $(scope, '^s2')
    expect(closeBtn).not.toBeNull()
    expect(closeBtn?.textContent).toBe('Close')
  })

  test('mix of regular and ^-prefixed IDs', () => {
    document.body.innerHTML = `
      <div bf-s="Parent_abc">
        <button bf="s0">regular</button>
        <div bf-s="~Child_xyz">
          <span bf="^s1">parent-owned</span>
        </div>
      </div>
    `
    const scope = document.querySelector('[bf-s="Parent_abc"]')
    const [el0, el1] = $(scope, 's0', '^s1')
    expect(el0?.textContent).toBe('regular')
    expect(el1?.textContent).toBe('parent-owned')
  })

  test('does NOT find regular slot in child scope', () => {
    document.body.innerHTML = `
      <div bf-s="Parent_abc">
        <div bf-s="~Child_xyz">
          <button bf="s3">Click</button>
        </div>
      </div>
    `
    const scope = document.querySelector('[bf-s="Parent_abc"]')
    const [btn] = $(scope, 's3')
    expect(btn).toBeNull()
  })

  test('null scope returns array of nulls', () => {
    const [a, b] = $(null, 's0', 's1')
    expect(a).toBeNull()
    expect(b).toBeNull()
  })

  test('missing elements return null', () => {
    document.body.innerHTML = `
      <div bf-s="Demo_abc">
        <button bf="s0">exists</button>
      </div>
    `
    const scope = document.querySelector('[bf-s="Demo_abc"]')
    const [el0, el1] = $(scope, 's0', 's1')
    expect(el0?.textContent).toBe('exists')
    expect(el1).toBeNull()
  })
})

describe('$c', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('returns direct child scope only, not nested grandchild with same suffix', () => {
    document.body.innerHTML = `
      <div bf-s="Demo_abc">
        <div bf-s="Demo_abc_s3">direct child</div>
        <div bf-s="Demo_abc_s4">
          <div bf-s="Demo_abc_s4_s3">nested grandchild</div>
        </div>
      </div>
    `
    const scope = document.querySelector('[bf-s="Demo_abc"]')!
    const [result] = $c(scope, 's3')
    expect(result).not.toBeNull()
    expect(result?.getAttribute('bf-s')).toBe('Demo_abc_s3')
  })

  test('finds child scope by slot ID', () => {
    document.body.innerHTML = `
      <div bf-s="Parent_xyz">
        <div bf-s="Parent_xyz_s1">slot content</div>
      </div>
    `
    const scope = document.querySelector('[bf-s="Parent_xyz"]')!
    const [result] = $c(scope, 's1')
    expect(result).not.toBeNull()
    expect(result?.getAttribute('bf-s')).toBe('Parent_xyz_s1')
  })

  test('finds child scope by component name prefix', () => {
    document.body.innerHTML = `
      <div bf-s="App_root">
        <div bf-s="Counter_abc123">counter</div>
      </div>
    `
    const scope = document.querySelector('[bf-s="App_root"]')!
    const [result] = $c(scope, 'Counter')
    expect(result).not.toBeNull()
    expect(result?.getAttribute('bf-s')).toBe('Counter_abc123')
  })

  test('null scope returns array of nulls', () => {
    const [result] = $c(null, 's0')
    expect(result).toBeNull()
  })

  test('strips ^ prefix defensively for slot IDs', () => {
    document.body.innerHTML = `
      <div bf-s="Parent_abc">
        <div bf-s="~DialogTrigger_Parent_abc_s0">trigger</div>
      </div>
    `
    const scope = document.querySelector('[bf-s="Parent_abc"]')!
    const [result] = $c(scope, '^s0')
    expect(result).not.toBeNull()
    expect(result?.getAttribute('bf-s')).toBe('~DialogTrigger_Parent_abc_s0')
  })

  test('strips ^ prefix defensively for component name IDs', () => {
    document.body.innerHTML = `
      <div bf-s="App_root">
        <div bf-s="~Counter_abc123">counter</div>
      </div>
    `
    const scope = document.querySelector('[bf-s="App_root"]')!
    const [result] = $c(scope, '^Counter')
    expect(result).not.toBeNull()
    expect(result?.getAttribute('bf-s')).toBe('~Counter_abc123')
  })

  test('finds multiple child scopes', () => {
    document.body.innerHTML = `
      <div bf-s="App_abc">
        <div bf-s="App_abc_s0">child0</div>
        <div bf-s="App_abc_s1">child1</div>
      </div>
    `
    const scope = document.querySelector('[bf-s="App_abc"]')!
    const [c0, c1] = $c(scope, 's0', 's1')
    expect(c0?.textContent).toBe('child0')
    expect(c1?.textContent).toBe('child1')
  })

  test('mix of slot IDs and component names', () => {
    document.body.innerHTML = `
      <div bf-s="App_abc">
        <div bf-s="App_abc_s0">slot</div>
        <div bf-s="~Counter_xyz">counter</div>
      </div>
    `
    const scope = document.querySelector('[bf-s="App_abc"]')!
    const [c0, c1] = $c(scope, 's0', 'Counter')
    expect(c0?.textContent).toBe('slot')
    expect(c1?.textContent).toBe('counter')
  })

  describe('slot ID disambiguation (direct child vs nested grandchild)', () => {
    test('when grandchild matches suffix first, falls back to direct child', () => {
      // The grandchild Demo_abc_s4_s3 has suffix "_s3" and appears inside
      // the subtree before Demo_abc_s3 in DOM order (because it's nested).
      // $cSingle must disambiguate using the parent scope ID.
      document.body.innerHTML = `
        <div bf-s="Demo_abc">
          <div bf-s="Demo_abc_s4">
            <div bf-s="Demo_abc_s4_s3">nested grandchild</div>
          </div>
          <div bf-s="Demo_abc_s3">direct child</div>
        </div>
      `
      const scope = document.querySelector('[bf-s="Demo_abc"]')!
      const [result] = $c(scope, 's3')
      expect(result).not.toBeNull()
      expect(result?.getAttribute('bf-s')).toBe('Demo_abc_s3')
    })

    test('returns null when only nested grandchild exists (no direct child)', () => {
      // Only Demo_abc_s4_s3 exists, not Demo_abc_s3.
      // $cSingle should NOT return the grandchild.
      document.body.innerHTML = `
        <div bf-s="Demo_abc">
          <div bf-s="Demo_abc_s4">
            <div bf-s="Demo_abc_s4_s3">nested grandchild only</div>
          </div>
        </div>
      `
      const scope = document.querySelector('[bf-s="Demo_abc"]')!
      const [result] = $c(scope, 's3')
      expect(result).toBeNull()
    })

    test('scope element itself matches suffix (fragment root / inlined)', () => {
      // When find() returns the scope element itself, it means the child
      // component's scope IS the parent's scope (inlined or fragment root).
      document.body.innerHTML = `
        <div bf-s="Parent_abc_s0">
          <span>content</span>
        </div>
      `
      const scope = document.querySelector('[bf-s="Parent_abc_s0"]')!
      const [result] = $c(scope, 's0')
      expect(result).toBe(scope)
    })
  })

  describe('child component prefix (~) matching', () => {
    test('finds child-prefixed scope by component name', () => {
      document.body.innerHTML = `
        <div bf-s="App_root">
          <div bf-s="~Dialog_abc">dialog</div>
        </div>
      `
      const scope = document.querySelector('[bf-s="App_root"]')!
      const [result] = $c(scope, 'Dialog')
      expect(result).not.toBeNull()
      expect(result?.getAttribute('bf-s')).toBe('~Dialog_abc')
    })

    test('finds non-prefixed scope by component name', () => {
      document.body.innerHTML = `
        <div bf-s="App_root">
          <div bf-s="Counter_abc">counter</div>
        </div>
      `
      const scope = document.querySelector('[bf-s="App_root"]')!
      const [result] = $c(scope, 'Counter')
      expect(result?.getAttribute('bf-s')).toBe('Counter_abc')
    })
  })

  describe('child priority over self-match', () => {
    test('finds child scope before matching scope itself', () => {
      // AccordionTrigger case: parent scope also matches the suffix,
      // but the child scope (ChevronDownIcon) should be returned
      document.body.innerHTML = `
        <div bf-s="AccordionTrigger_abc_s0">
          <span bf-s="AccordionTrigger_abc_s0_s0">icon</span>
        </div>
      `
      const scope = document.querySelector('[bf-s="AccordionTrigger_abc_s0"]')!
      const [result] = $c(scope, 's0')
      expect(result).not.toBeNull()
      expect(result?.textContent).toBe('icon')
    })

    test('prioritizes child over self when both match', () => {
      document.body.innerHTML = `
        <div bf-s="Parent_abc_s0">
          <div bf-s="Parent_abc_s0_s0">child</div>
        </div>
      `
      const scope = document.querySelector('[bf-s="Parent_abc_s0"]')!
      const [result] = $c(scope, 's0')
      expect(result?.textContent).toBe('child')
      expect(result).not.toBe(scope)
    })
  })
})

describe('$t', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('finds text node after comment marker', () => {
    document.body.innerHTML = `
      <div bf-s="Counter_abc"><!--bf:s0-->42<!--/--></div>
    `
    const scope = document.querySelector('[bf-s="Counter_abc"]')
    const [textNode] = $t(scope, 's0')
    expect(textNode).not.toBeNull()
    expect(textNode?.nodeValue).toBe('42')
  })

  test('creates text node when none exists after marker', () => {
    document.body.innerHTML = `
      <div bf-s="Counter_abc"><!--bf:s0--><!--/--></div>
    `
    const scope = document.querySelector('[bf-s="Counter_abc"]')
    const [textNode] = $t(scope, 's0')
    expect(textNode).not.toBeNull()
    expect(textNode?.nodeValue).toBe('')
  })

  test('null scope returns array of nulls', () => {
    const [t] = $t(null, 's0')
    expect(t).toBeNull()
  })

  test('returns null for missing marker', () => {
    document.body.innerHTML = `
      <div bf-s="Counter_abc">no markers here</div>
    `
    const scope = document.querySelector('[bf-s="Counter_abc"]')
    const [t] = $t(scope, 's0')
    expect(t).toBeNull()
  })

  test('does not find marker inside nested child scope', () => {
    document.body.innerHTML = `
      <div bf-s="Parent_abc">
        <div bf-s="Child_xyz"><!--bf:s0-->nested<!--/--></div>
      </div>
    `
    const scope = document.querySelector('[bf-s="Parent_abc"]')
    const [t] = $t(scope, 's0')
    expect(t).toBeNull()
  })

  test('finds ^-prefixed marker (parent-owned)', () => {
    document.body.innerHTML = `
      <div bf-s="Parent_abc">
        <div bf-s="~Child_xyz"><!--bf:^s1-->owned<!--/--></div>
      </div>
    `
    const scope = document.querySelector('[bf-s="Parent_abc"]')
    const [textNode] = $t(scope, '^s1')
    expect(textNode).not.toBeNull()
    expect(textNode?.nodeValue).toBe('owned')
  })

  test('finds multiple text nodes in single TreeWalker pass', () => {
    document.body.innerHTML = `
      <div bf-s="Demo_abc">
        <p><!--bf:s0-->hello<!--/--></p>
        <p><!--bf:s1-->world<!--/--></p>
      </div>
    `
    const scope = document.querySelector('[bf-s="Demo_abc"]')
    const [t0, t1] = $t(scope, 's0', 's1')
    expect(t0?.nodeValue).toBe('hello')
    expect(t1?.nodeValue).toBe('world')
  })

  test('missing markers return null', () => {
    document.body.innerHTML = `
      <div bf-s="Demo_abc">
        <p><!--bf:s0-->found<!--/--></p>
      </div>
    `
    const scope = document.querySelector('[bf-s="Demo_abc"]')
    const [t0, t1] = $t(scope, 's0', 's1')
    expect(t0?.nodeValue).toBe('found')
    expect(t1).toBeNull()
  })

  test('creates text nodes when none exist after markers', () => {
    document.body.innerHTML = `
      <div bf-s="Demo_abc"><!--bf:s0--><!--/--><!--bf:s1--><!--/--></div>
    `
    const scope = document.querySelector('[bf-s="Demo_abc"]')
    const [t0, t1] = $t(scope, 's0', 's1')
    expect(t0).not.toBeNull()
    expect(t0?.nodeValue).toBe('')
    expect(t1).not.toBeNull()
    expect(t1?.nodeValue).toBe('')
  })
})
