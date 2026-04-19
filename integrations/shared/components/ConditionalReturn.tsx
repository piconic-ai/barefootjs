'use client'

/**
 * ConditionalReturn Component (Shared)
 *
 * Exercises if/else conditional JSX returns (IRIfStatement).
 * Renders a <button> by default or an <a> when variant="link".
 * Both branches have reactive state to verify client-side hydration.
 */

import { createSignal } from '@barefootjs/client'

interface ConditionalReturnProps {
  variant?: string
}

function ConditionalReturn(props: ConditionalReturnProps) {
  const [count, setCount] = createSignal(0)

  if (props.variant === 'link') {
    return (
      <a
        href="#"
        className="conditional-link"
        data-active={count() > 0}
        onClick={(e: Event) => {
          e.preventDefault()
          setCount(n => n + 1)
        }}
      >
        link variant: {count()}
      </a>
    )
  }

  return (
    <button
      className="conditional-button"
      data-active={count() > 0}
      onClick={() => setCount(n => n + 1)}
    >
      button variant: {count()}
    </button>
  )
}

export default ConditionalReturn
