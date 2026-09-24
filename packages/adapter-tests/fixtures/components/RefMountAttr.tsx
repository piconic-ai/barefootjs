'use client'

// A `ref` mount callback that writes an attribute imperatively via
// `setAttribute`. The callback never runs at SSR, so the server HTML
// omits the attribute while the hydrated DOM carries it — the general,
// component-agnostic shape `ref-effect-attr-state-ssr` describes. The UI
// components that used to hit it (accordion, radio-group, command,
// combobox, select) have all since threaded the value through an
// explicit prop instead; this fixture pins the underlying mechanism
// itself so the registry entry keeps a live, named repro.
export function RefMountAttr() {
  const handleMount = (el: Element) => {
    el.setAttribute('data-mounted', '1')
  }
  return (
    <div data-slot="target" ref={handleMount}>
      content
    </div>
  )
}
