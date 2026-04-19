'use client'

/**
 * ReactiveProps Component
 *
 * Tests reactivity model documented in spec/compiler.md:
 * 1. Signal access via getter calls: count()
 * 2. Parent-to-child reactive props propagation
 * 3. Callback props from child to parent
 */

import { createSignal, createMemo } from '@barefootjs/client'

// Child component that receives reactive props
// Uses SolidJS-style props (props.xxx) to maintain reactivity
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

// Parent component with signal
export function ReactiveProps() {
  const [count, setCount] = createSignal(0)
  const doubled = createMemo(() => count() * 2)

  return (
    <div className="reactive-props-container">
      {/* Signal basic: count() getter call */}
      <div className="parent-section">
        <p className="parent-count">Parent count: {count()}</p>
        <p className="parent-doubled">Doubled: {doubled()}</p>
        <button className="btn-parent-increment" onClick={() => setCount(n => n + 1)}>
          +1
        </button>
      </div>

      {/* Parent-to-child reactive props */}
      <ReactiveChild
        value={count()}
        label="Child A"
        onIncrement={() => setCount(n => n + 1)}
      />

      {/* Multiple children with same reactive prop */}
      <ReactiveChild
        value={doubled()}
        label="Child B (doubled)"
        onIncrement={() => setCount(n => n + 1)}
      />
    </div>
  )
}

// =============================================================================
// Props Reactivity Comparison Tests
// =============================================================================

/**
 * SolidJS-style: function Component(props: Props)
 * Props accessed via props.xxx maintain reactivity
 */
type PropsStyleChildProps = {
  value: number
  label: string
}

function PropsStyleChild(props: PropsStyleChildProps) {
  // This createMemo will react to props.value changes
  // because we access props.value directly
  const displayValue = createMemo(() => props.value * 10)

  return (
    <div className="props-style-child">
      <span className="child-label">{props.label}</span>
      <span className="child-raw-value">{props.value}</span>
      <span className="child-computed-value">{displayValue()}</span>
    </div>
  )
}

/**
 * Destructured style: function Component({ value, label }: Props)
 * Destructured props lose reactivity - value is captured at initial render
 */
// @bf-ignore props-destructuring
function DestructuredStyleChild({ value, label }: PropsStyleChildProps) {
  // This createMemo captures the initial value of 'value'
  // and will NOT react to changes from the parent
  const displayValue = createMemo(() => value * 10)

  return (
    <div className="destructured-style-child">
      <span className="child-label">{label}</span>
      <span className="child-raw-value">{value}</span>
      <span className="child-computed-value">{displayValue()}</span>
    </div>
  )
}

/**
 * PropsReactivityComparison Component
 *
 * Demonstrates the difference between:
 * 1. SolidJS-style props (props.xxx) - maintains reactivity
 * 2. Destructured props - loses reactivity
 */
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

export default ReactiveProps
