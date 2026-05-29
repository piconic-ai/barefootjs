import { $, $t, __bfSlot, __bfText, createComponent, createDisposableEffect, createEffect, createSignal, hydrate, initChild, insert, mapArray, onMount, qsa, renderChild } from '@barefootjs/client/runtime'

export function initTodoItem(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [_s0, _s2, _s3, _s4, _s5] = $(__scope, 's0', 's2', 's3', 's4', 's5')
  const [_s1] = $t(__scope, 's1')

  let __anchor_s1 = _s1
  createEffect(() => {
    const __val = _p.todo.text
    __anchor_s1 = __bfText(__anchor_s1, __val)
  })

  createEffect(() => {
    if (_s5) {
      { const __v = _p.todo.done ? (_p.todo.editing ? 'completed editing' : 'completed') : (_p.todo.editing ? 'editing' : ''); if (__v != null) _s5.setAttribute('class', String(__v)); else _s5.removeAttribute('class') }
    }
  })

  createEffect(() => {
    if (_s0) {
      _s0.checked = !!(_p.todo.done)
    }
  })

  createEffect(() => {
    if (_s4) {
      const __val = String(_p.todo.text)
      if (_s4.value !== __val) _s4.value = __val
    }
  })

  if (_s0) _s0.addEventListener('change', () => { _p.onToggle() })
  if (_s2) _s2.addEventListener('dblclick', () => { _p.onStartEdit() })
  if (_s3) _s3.addEventListener('click', () => { _p.onDelete() })
  if (_s4) _s4.addEventListener('blur', (e) => { _p.onFinishEdit(e.target.value) })
  if (_s4) _s4.addEventListener('keydown', (e) => { e.key === 'Enter' && !e.isComposing && _p.onFinishEdit(e.target.value) })
}

hydrate('TodoItem', { init: initTodoItem, template: (_p) => `<li ${(_p.todo.done ? (_p.todo.editing ? 'completed editing' : 'completed') : (_p.todo.editing ? 'editing' : '')) != null ? 'class="' + (_p.todo.done ? (_p.todo.editing ? 'completed editing' : 'completed') : (_p.todo.editing ? 'editing' : '')) + '"' : ''} bf="s5"><div class="view"><input class="toggle" type="checkbox" ${_p.todo.done ? 'checked' : ''} bf="s0" /><label bf="s2"><!--bf:s1-->${_p.todo.text}<!--/--></label><button class="destroy" bf="s3"></button></div><input class="edit" ${(_p.todo.text) != null ? 'value="' + (_p.todo.text) + '"' : ''} autofocus bf="s4" /></li>` })
export function TodoItem(_p, __bfKey) { return createComponent('TodoItem', _p, __bfKey) }
export function initTodoAppSSR(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [todos, setTodos] = createSignal((_p.initialTodos ?? []).map(t => ({ ...t, editing: false })))
  const [newText, setNewText] = createSignal('')
  const [filter, setFilter] = createSignal('all')
  const getFilterFromHash = () => {
    const hash = window.location.hash
    if (hash === '#/active') return 'active'
    if (hash === '#/completed') return 'completed'
    return 'all'
  }
  const handleAdd = async () => {
    const text = newText().trim()
    if (!text) return

    try {
      const res = await fetch('api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const newTodo = await res.json()
      setTodos([...todos(), { ...newTodo, editing: false }])
      setNewText('')
    } catch (err) {
      console.error('Failed to add todo:', err)
    }
  }
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      handleAdd()
    }
  }
  const handleToggle = async (id) => {
    const todo = todos().find(t => t.id === id)
    if (!todo) return

    try {
      const res = await fetch(`api/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: !todo.done }),
      })
      const updatedTodo = await res.json()
      setTodos(todos().map(t => t.id === id ? { ...updatedTodo, editing: t.editing } : t))
    } catch (err) {
      console.error('Failed to update todo:', err)
    }
  }
  const handleDelete = async (id) => {
    try {
      await fetch(`api/todos/${id}`, { method: 'DELETE' })
      setTodos(todos().filter(t => t.id !== id))
    } catch (err) {
      console.error('Failed to delete todo:', err)
    }
  }
  const handleStartEdit = (id) => {
    setTodos(todos().map(t => t.id === id ? { ...t, editing: true } : t))
  }
  const handleFinishEdit = async (id, text) => {
    const trimmedText = text.trim()
    if (!trimmedText) {
      setTodos(todos().map(t => t.id === id ? { ...t, editing: false } : t))
      return
    }

    try {
      const res = await fetch(`api/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmedText }),
      })
      const updatedTodo = await res.json()
      setTodos(todos().map(t => t.id === id ? { ...updatedTodo, editing: false } : t))
    } catch (err) {
      console.error('Failed to update todo:', err)
    }
  }
  const handleClearCompleted = async () => {
    const completedTodos = todos().filter(t => t.done)
    for (const todo of completedTodos) {
      try {
        await fetch(`api/todos/${todo.id}`, { method: 'DELETE' })
      } catch (err) {
        console.error('Failed to delete todo:', err)
      }
    }
    setTodos(todos().filter(t => !t.done))
  }
  const handleToggleAll = async () => {
    const allDone = todos().every(t => t.done)
    const newDoneState = !allDone

    for (const todo of todos()) {
      if (todo.done !== newDoneState) {
        try {
          await fetch(`api/todos/${todo.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ done: newDoneState }),
          })
        } catch (err) {
          console.error('Failed to update todo:', err)
        }
      }
    }
    setTodos(todos().map(t => ({ ...t, done: newDoneState })))
  }
  const handleFilterChange = (newFilter) => {
    setFilter(newFilter)
    const hash = newFilter === 'all' ? '#/' : `#/${newFilter}`
    window.location.hash = hash
  }

  const [_s0, _s10, _s11, _s12, _s1, _s8, _s13, _s4] = $(__scope, 's0', 's10', 's11', 's12', 's1', 's8', 's13', 's4')
  const [_s6] = $t(__scope, 's6')

  let __anchor_s6 = _s6
  createEffect(() => {
    const __val = todos().filter(t => !t.done).length
    __anchor_s6 = __bfText(__anchor_s6, __val)
  })

  createEffect(() => {
    if (_s0) {
      const __val = String(newText())
      if (_s0.value !== __val) _s0.value = __val
    }
  })

  createEffect(() => {
    if (_s10) {
      { const __v = `${filter() === 'all' ? 'selected' : ''}`; if (__v != null) _s10.setAttribute('class', String(__v)); else _s10.removeAttribute('class') }
    }
  })

  createEffect(() => {
    if (_s11) {
      { const __v = `${filter() === 'active' ? 'selected' : ''}`; if (__v != null) _s11.setAttribute('class', String(__v)); else _s11.removeAttribute('class') }
    }
  })

  createEffect(() => {
    if (_s12) {
      { const __v = `${filter() === 'completed' ? 'selected' : ''}`; if (__v != null) _s12.setAttribute('class', String(__v)); else _s12.removeAttribute('class') }
    }
  })

  insert(__scope, 's1', () => todos().length > 0, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s1--><input id="toggle-all" class="toggle-all" type="checkbox" ${todos().every(t => t.done) ? 'checked' : ''} bf="s2" /><label for="toggle-all">Mark all as complete</label><!--bf-cond-end:s1-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const [_s2] = $(__branchScope, 's2')
      if (_s2) _s2.addEventListener('change', handleToggleAll)
      const __disposers = []
      { const __ra_s2 = qsa(__branchScope, '[bf="s2"]')
      if (__ra_s2) {
        __disposers.push(createDisposableEffect(() => {
          __ra_s2.checked = !!(todos().every(t => t.done))
        }))
      } }
      return () => __disposers.forEach(d => d())
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s1--><!--bf-cond-end:s1-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  insert(__scope, 's8', () => todos().filter(t => !t.done).length === 1, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s8-->${__bfSlot('item', __slots)}<!--bf-cond-end:s8-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s8-->${__bfSlot('items', __slots)}<!--bf-cond-end:s8-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  insert(__scope, 's13', () => todos().filter(t => t.done).length > 0, {
    template: () => { const __slots = []; return { html: `<button bf-c="s13" class="clear-completed" bf="s14"> Clear completed </button>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const [_s14] = $(__branchScope, 's14')
      if (_s14) _s14.addEventListener('click', handleClearCompleted)
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s13--><!--bf-cond-end:s13-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s0) _s0.addEventListener('input', e => setNewText(e.target.value))
  if (_s0) _s0.addEventListener('keydown', handleKeyDown)
  if (_s10) _s10.addEventListener('click', () => { handleFilterChange('all') })
  if (_s11) _s11.addEventListener('click', () => { handleFilterChange('active') })
  if (_s12) _s12.addEventListener('click', () => { handleFilterChange('completed') })
  onMount(() => {
    setFilter(getFilterFromHash())
    window.addEventListener('hashchange', () => {
      setFilter(getFilterFromHash())
    })
  })
  mapArray(() => todos().filter(t => {
            const f = filter()
            if (f === 'active') return !t.done
            if (f === 'completed') return t.done
            return true
          }), _s4, (todo) => String(todo.id), (todo, __idx, __existing) => {
    if (__existing) { initChild('TodoItem', __existing, { get todo() { return todo() }, onToggle: () => handleToggle(todo().id), onDelete: () => handleDelete(todo().id), onStartEdit: () => handleStartEdit(todo().id), onFinishEdit: (text) => handleFinishEdit(todo().id, text) }); return __existing }
    return createComponent('TodoItem', { get todo() { return todo() }, onToggle: () => handleToggle(todo().id), onDelete: () => handleDelete(todo().id), onStartEdit: () => handleStartEdit(todo().id), onFinishEdit: (text) => handleFinishEdit(todo().id, text) }, todo().id)
  }, 'l0')

}

hydrate('TodoAppSSR', { init: initTodoAppSSR, template: (_p) => `<section class="todoapp"><header class="header"><h1>todos</h1><input class="new-todo" placeholder="What needs to be done?" ${(('')) != null ? 'value="' + (('')) + '"' : ''} autofocus bf="s0" /></header><section class="main" bf="s5">${((_p.initialTodos ?? []).map(t => ({ ...t, editing: false }))).length > 0 ? `<!--bf-cond-start:s1--><input id="toggle-all" class="toggle-all" type="checkbox" ${((_p.initialTodos ?? []).map(t => ({ ...t, editing: false }))).every(t => t.done) ? 'checked' : ''} bf="s2" /><label for="toggle-all">Mark all as complete</label><!--bf-cond-end:s1-->` : `<!--bf-cond-start:s1--><!--bf-cond-end:s1-->`}<ul class="todo-list" bf="s4"><!--bf-loop:l0-->${((_p.initialTodos ?? []).map(t => ({ ...t, editing: false }))).filter(t => {
            const f = ('all')
            if (f === 'active') return !t.done
            if (f === 'completed') return t.done
            return true
          }).map((todo) => `${renderChild('TodoItem', {todo: todo}, todo.id)}`).join('')}<!--bf-/loop:l0--></ul></section><footer class="footer" bf="s15"><span class="todo-count" bf="s9"><strong bf="s7"><!--bf:s6-->${((_p.initialTodos ?? []).map(t => ({ ...t, editing: false }))).filter(t => !t.done).length}<!--/--></strong>${' '}${((_p.initialTodos ?? []).map(t => ({ ...t, editing: false }))).filter(t => !t.done).length === 1 ? `<!--bf-cond-start:s8-->${'item'}<!--bf-cond-end:s8-->` : `<!--bf-cond-start:s8-->${'items'}<!--bf-cond-end:s8-->`} left </span><ul class="filters"><li><a href="#/" ${(`${('all') === 'all' ? 'selected' : ''}`) != null ? 'class="' + (`${('all') === 'all' ? 'selected' : ''}`) + '"' : ''} bf="s10">All</a></li><li><a href="#/active" ${(`${('all') === 'active' ? 'selected' : ''}`) != null ? 'class="' + (`${('all') === 'active' ? 'selected' : ''}`) + '"' : ''} bf="s11">Active</a></li><li><a href="#/completed" ${(`${('all') === 'completed' ? 'selected' : ''}`) != null ? 'class="' + (`${('all') === 'completed' ? 'selected' : ''}`) + '"' : ''} bf="s12">Completed</a></li></ul>${((_p.initialTodos ?? []).map(t => ({ ...t, editing: false }))).filter(t => t.done).length > 0 ? `<button bf-c="s13" class="clear-completed" bf="s14"> Clear completed </button>` : `<!--bf-cond-start:s13--><!--bf-cond-end:s13-->`}</footer></section>` })
export function TodoAppSSR(_p, __bfKey) { return createComponent('TodoAppSSR', _p, __bfKey) }
