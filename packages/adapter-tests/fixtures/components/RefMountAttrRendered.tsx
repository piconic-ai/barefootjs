'use client'

// The `rewrite` escape for BF063 (`ref-mount-attr`): the same `ref` mount
// callback writing `data-mounted`, but the element's JSX now also renders
// the attribute, so the server HTML already carries the value the callback
// writes on mount and hydration changes nothing.
export function RefMountAttrRendered() {
  const handleMount = (el: Element) => {
    el.setAttribute('data-mounted', '1')
  }
  return (
    <div data-slot="target" data-mounted="1" ref={handleMount}>
      content
    </div>
  )
}
