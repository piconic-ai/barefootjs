'use client'

// Test fixture for the reactivity model in spec/compiler.md:
// - signal getter calls (count())
// - parent-to-child reactive prop propagation
// - callback props from child to parent

import { createSignal, createMemo } from '@barefootjs/client'

type ChildProps = {
  value: number
  label: string
  onIncrement: () => void
}

function ReactiveChild(props: ChildProps) {
  return (
    <div className="reactive-child">
      <span className="child-label">{props.label}</span>
      <span className="child-value">{props.value}</span>
      <button className="btn-child-increment" onClick={() => props.onIncrement()}>
        Increment from child
      </button>
    </div>
  )
}

export function ReactiveProps() {
  const [count, setCount] = createSignal(0)
  const doubled = createMemo(() => count() * 2)

  return (
    <div className="reactive-props-container">
      <div className="parent-section">
        <p className="parent-count">Parent count: {count()}</p>
        <p className="parent-doubled">Doubled: {doubled()}</p>
        <button className="btn-parent-increment" onClick={() => setCount(n => n + 1)}>
          +1
        </button>
      </div>

      <ReactiveChild
        value={count()}
        label="Child A"
        onIncrement={() => setCount(n => n + 1)}
      />

      <ReactiveChild
        value={doubled()}
        label="Child B (doubled)"
        onIncrement={() => setCount(n => n + 1)}
      />
    </div>
  )
}

// Demonstrates that `props.xxx` access preserves reactivity while
// destructured props capture the initial value. See spec/compiler.md.
type PropsStyleChildProps = {
  value: number
  label: string
}

function PropsStyleChild(props: PropsStyleChildProps) {
  const displayValue = createMemo(() => props.value * 10)

  return (
    <div className="props-style-child">
      <span className="child-label">{props.label}</span>
      <span className="child-raw-value">{props.value}</span>
      <span className="child-computed-value">{displayValue()}</span>
    </div>
  )
}

// @bf-ignore props-destructuring
function DestructuredStyleChild({ value, label }: PropsStyleChildProps) {
  const displayValue = createMemo(() => value * 10)

  return (
    <div className="destructured-style-child">
      <span className="child-label">{label}</span>
      <span className="child-raw-value">{value}</span>
      <span className="child-computed-value">{displayValue()}</span>
    </div>
  )
}

export function PropsReactivityComparison() {
  const [count, setCount] = createSignal(1)

  return (
    <div className="props-reactivity-comparison">
      <div className="parent-section">
        <p className="parent-count">Count: {count()}</p>
        <button className="btn-increment" onClick={() => setCount(n => n + 1)}>
          Increment
        </button>
      </div>

      <div className="children-section">
        <h3>Props Style (Reactive)</h3>
        <PropsStyleChild value={count()} label="Props Style" />

        <h3>Destructured Style (Not Reactive)</h3>
        <DestructuredStyleChild value={count()} label="Destructured" />
      </div>
    </div>
  )
}
