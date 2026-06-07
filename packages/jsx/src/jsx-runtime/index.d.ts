/**
 * BarefootJS JSX Runtime - Type Definitions Only
 *
 * This module provides JSX type definitions for type checking.
 * No runtime implementation is provided - use with a backend-specific
 * jsx-runtime (e.g., @barefootjs/hono/jsx) for actual rendering.
 *
 * Usage in tsconfig.json:
 *   "jsxImportSource": "@barefootjs/jsx"
 */

// Import types for use in JSX namespace
import type {
  HTMLBaseAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
  FormHTMLAttributes,
  AnchorHTMLAttributes,
  ImgHTMLAttributes,
  LabelHTMLAttributes,
  OptionHTMLAttributes,
  SVGBaseAttributes,
  SVGPresentationAttributes,
  SVGMarkerReferenceAttributes,
} from '../html-types.ts'

// Stub function types (for type checking only - no runtime implementation)
export declare const jsx: (
  tag: string | Function,
  props: Record<string, unknown>,
  key?: string
) => JSX.Element
export declare const jsxs: typeof jsx
export declare const Fragment: (props: { children?: unknown }) => JSX.Element

// Re-export JSX namespace with proper types
export declare namespace JSX {
  type Element = unknown

  interface ElementChildrenAttribute {
    children: {}
  }

  interface IntrinsicAttributes {
    key?: string | number | bigint | null | undefined
  }

  interface IntrinsicElements {
    // Form elements with properly typed events
    input: InputHTMLAttributes
    textarea: TextareaHTMLAttributes
    select: SelectHTMLAttributes
    button: ButtonHTMLAttributes
    form: FormHTMLAttributes
    label: LabelHTMLAttributes
    option: OptionHTMLAttributes
    optgroup: HTMLBaseAttributes & { disabled?: boolean; label?: string }

    // Interactive elements
    a: AnchorHTMLAttributes

    // Media elements
    img: ImgHTMLAttributes
    video: HTMLBaseAttributes & { src?: string; controls?: boolean; autoplay?: boolean; loop?: boolean; muted?: boolean; poster?: string; width?: number | string; height?: number | string }
    audio: HTMLBaseAttributes & { src?: string; controls?: boolean; autoplay?: boolean; loop?: boolean; muted?: boolean }
    source: HTMLBaseAttributes & { src?: string; type?: string; media?: string }
    track: HTMLBaseAttributes & { default?: boolean; kind?: string; label?: string; src?: string; srclang?: string }

    // Container elements
    div: HTMLBaseAttributes
    span: HTMLBaseAttributes
    p: HTMLBaseAttributes
    section: HTMLBaseAttributes
    article: HTMLBaseAttributes
    aside: HTMLBaseAttributes
    header: HTMLBaseAttributes
    footer: HTMLBaseAttributes
    main: HTMLBaseAttributes
    nav: HTMLBaseAttributes

    // Heading elements
    h1: HTMLBaseAttributes
    h2: HTMLBaseAttributes
    h3: HTMLBaseAttributes
    h4: HTMLBaseAttributes
    h5: HTMLBaseAttributes
    h6: HTMLBaseAttributes

    // List elements
    ul: HTMLBaseAttributes
    ol: HTMLBaseAttributes & { start?: number; type?: '1' | 'a' | 'A' | 'i' | 'I'; reversed?: boolean }
    li: HTMLBaseAttributes & { value?: number }
    dl: HTMLBaseAttributes
    dt: HTMLBaseAttributes
    dd: HTMLBaseAttributes

    // Table elements
    table: HTMLBaseAttributes
    thead: HTMLBaseAttributes
    tbody: HTMLBaseAttributes
    tfoot: HTMLBaseAttributes
    tr: HTMLBaseAttributes
    th: HTMLBaseAttributes & { colspan?: number; rowspan?: number; scope?: string; headers?: string }
    td: HTMLBaseAttributes & { colspan?: number; rowspan?: number; headers?: string }
    caption: HTMLBaseAttributes
    colgroup: HTMLBaseAttributes & { span?: number }
    col: HTMLBaseAttributes & { span?: number }

    // Text formatting
    strong: HTMLBaseAttributes
    em: HTMLBaseAttributes
    b: HTMLBaseAttributes
    i: HTMLBaseAttributes
    u: HTMLBaseAttributes
    s: HTMLBaseAttributes
    mark: HTMLBaseAttributes
    small: HTMLBaseAttributes
    sub: HTMLBaseAttributes
    sup: HTMLBaseAttributes
    code: HTMLBaseAttributes
    pre: HTMLBaseAttributes
    kbd: HTMLBaseAttributes
    samp: HTMLBaseAttributes
    var: HTMLBaseAttributes
    abbr: HTMLBaseAttributes & { title?: string }
    cite: HTMLBaseAttributes
    q: HTMLBaseAttributes & { cite?: string }
    blockquote: HTMLBaseAttributes & { cite?: string }

    // Line break and horizontal rule
    br: HTMLBaseAttributes
    hr: HTMLBaseAttributes
    wbr: HTMLBaseAttributes

    // Semantic elements
    address: HTMLBaseAttributes
    time: HTMLBaseAttributes & { datetime?: string }
    figure: HTMLBaseAttributes
    figcaption: HTMLBaseAttributes
    details: HTMLBaseAttributes & { open?: boolean }
    summary: HTMLBaseAttributes
    dialog: HTMLBaseAttributes & { open?: boolean }

    // Embedded content
    iframe: HTMLBaseAttributes & { src?: string; srcdoc?: string; name?: string; sandbox?: string; allow?: string; allowfullscreen?: boolean; width?: number | string; height?: number | string; loading?: 'eager' | 'lazy'; referrerpolicy?: string }
    embed: HTMLBaseAttributes & { src?: string; type?: string; width?: number | string; height?: number | string }
    object: HTMLBaseAttributes & { data?: string; type?: string; name?: string; usemap?: string; width?: number | string; height?: number | string }
    param: HTMLBaseAttributes & { name?: string; value?: string }
    picture: HTMLBaseAttributes

    // Script and style
    script: HTMLBaseAttributes & { src?: string; type?: string; async?: boolean; defer?: boolean; crossorigin?: string; integrity?: string; nomodule?: boolean; nonce?: string; referrerpolicy?: string }
    noscript: HTMLBaseAttributes
    style: HTMLBaseAttributes & { media?: string; nonce?: string; scoped?: boolean; type?: string }
    link: HTMLBaseAttributes & { href?: string; rel?: string; media?: string; type?: string; as?: string; crossorigin?: string; integrity?: string; sizes?: string }

    // Meta elements
    meta: HTMLBaseAttributes & { charset?: string; content?: string; 'http-equiv'?: string; name?: string; property?: string }
    base: HTMLBaseAttributes & { href?: string; target?: string }
    title: HTMLBaseAttributes

    // Document structure
    html: HTMLBaseAttributes & { lang?: string }
    head: HTMLBaseAttributes
    body: HTMLBaseAttributes

    // Interactive elements
    menu: HTMLBaseAttributes
    fieldset: HTMLBaseAttributes & { disabled?: boolean; form?: string; name?: string }
    legend: HTMLBaseAttributes
    datalist: HTMLBaseAttributes
    output: HTMLBaseAttributes & { for?: string; form?: string; name?: string }
    progress: HTMLBaseAttributes & { max?: number; value?: number }
    meter: HTMLBaseAttributes & { high?: number; low?: number; max?: number; min?: number; optimum?: number; value?: number }

    // Template and slot
    template: HTMLBaseAttributes
    slot: HTMLBaseAttributes & { name?: string }

    // Canvas and map
    canvas: HTMLBaseAttributes & { width?: number | string; height?: number | string }
    map: HTMLBaseAttributes & { name?: string }
    area: HTMLBaseAttributes & { alt?: string; coords?: string; download?: string; href?: string; media?: string; ping?: string; rel?: string; shape?: string; target?: string }

    // SVG (basic support).
    // Each entry uses `SVGBaseAttributes` so `ref` can be narrowed per-tag.
    // See `SVGBaseAttributes` JSDoc for why plain intersection doesn't work.
    svg: SVGBaseAttributes & SVGPresentationAttributes & {
      viewBox?: string
      xmlns?: string
      width?: number | string
      height?: number | string
      ref?: (element: SVGSVGElement) => void
    }
    path: SVGBaseAttributes & SVGPresentationAttributes & SVGMarkerReferenceAttributes & {
      d?: string
      pathLength?: number | string
      ref?: (element: SVGPathElement) => void
    }
    circle: SVGBaseAttributes & SVGPresentationAttributes & {
      cx?: number | string
      cy?: number | string
      r?: number | string
      ref?: (element: SVGCircleElement) => void
    }
    rect: SVGBaseAttributes & SVGPresentationAttributes & {
      x?: number | string
      y?: number | string
      width?: number | string
      height?: number | string
      rx?: number | string
      ry?: number | string
      ref?: (element: SVGRectElement) => void
    }
    line: SVGBaseAttributes & SVGPresentationAttributes & SVGMarkerReferenceAttributes & {
      x1?: number | string
      y1?: number | string
      x2?: number | string
      y2?: number | string
      ref?: (element: SVGLineElement) => void
    }
    polyline: SVGBaseAttributes & SVGPresentationAttributes & SVGMarkerReferenceAttributes & {
      points?: string
      ref?: (element: SVGPolylineElement) => void
    }
    polygon: SVGBaseAttributes & SVGPresentationAttributes & SVGMarkerReferenceAttributes & {
      points?: string
      ref?: (element: SVGPolygonElement) => void
    }
    text: SVGBaseAttributes & SVGPresentationAttributes & {
      x?: number | string
      y?: number | string
      dx?: number | string
      dy?: number | string
      ref?: (element: SVGTextElement) => void
    }
    tspan: SVGBaseAttributes & SVGPresentationAttributes & {
      ref?: (element: SVGTSpanElement) => void
    }
    g: SVGBaseAttributes & SVGPresentationAttributes & {
      transform?: string
      ref?: (element: SVGGElement) => void
    }
    defs: SVGBaseAttributes & {
      ref?: (element: SVGDefsElement) => void
    }
    use: SVGBaseAttributes & SVGPresentationAttributes & {
      href?: string
      x?: number | string
      y?: number | string
      width?: number | string
      height?: number | string
      ref?: (element: SVGUseElement) => void
    }
    symbol: SVGBaseAttributes & {
      viewBox?: string
      ref?: (element: SVGSymbolElement) => void
    }
    clipPath: SVGBaseAttributes & {
      ref?: (element: SVGClipPathElement) => void
    }
    marker: SVGBaseAttributes & {
      viewBox?: string
      refX?: number | string
      refY?: number | string
      markerWidth?: number | string
      markerHeight?: number | string
      markerUnits?: string
      orient?: string | number
      ref?: (element: SVGMarkerElement) => void
    }
    mask: SVGBaseAttributes & {
      ref?: (element: SVGMaskElement) => void
    }
    linearGradient: SVGBaseAttributes & {
      x1?: number | string
      y1?: number | string
      x2?: number | string
      y2?: number | string
      ref?: (element: SVGLinearGradientElement) => void
    }
    radialGradient: SVGBaseAttributes & {
      cx?: number | string
      cy?: number | string
      r?: number | string
      fx?: number | string
      fy?: number | string
      ref?: (element: SVGRadialGradientElement) => void
    }
    // `<stop>` accepts both kebab-case (SVG-native) and camelCase
    // (React-compatible) forms. Compiler converts camelCase to kebab-case
    // via `SVG_CAMEL_TO_KEBAB` (packages/jsx/src/ir-to-client-js/utils.ts).
    stop: SVGBaseAttributes & {
      offset?: number | string
      stopColor?: string
      'stop-color'?: string
      stopOpacity?: number | string
      'stop-opacity'?: number | string
      ref?: (element: SVGStopElement) => void
    }
    pattern: SVGBaseAttributes & {
      x?: number | string
      y?: number | string
      width?: number | string
      height?: number | string
      patternUnits?: string
      ref?: (element: SVGPatternElement) => void
    }
    image: SVGBaseAttributes & {
      href?: string
      x?: number | string
      y?: number | string
      width?: number | string
      height?: number | string
      ref?: (element: SVGImageElement) => void
    }
    foreignObject: SVGBaseAttributes & {
      x?: number | string
      y?: number | string
      width?: number | string
      height?: number | string
      ref?: (element: SVGForeignObjectElement) => void
    }

    // Catch-all for any other (custom / unknown) element.
    //
    // Mirrors hono/jsx, whose `IntrinsicElements` index signature is
    // `[tagName: string]: Props` with `Props = Record<string, any>`
    // (see hono `src/jsx/base.ts`). Using `HTMLBaseAttributes` here instead
    // would force every explicitly-typed element above to be assignable to
    // it, which TS rejects with TS2411: the per-element types narrow `ref`
    // to a concrete subtype (`HTMLInputElement`, …) and re-declare event
    // handlers, neither assignable to the `HTMLElement`-typed base under
    // `strictFunctionTypes`. `tsc` only surfaced this with `skipLibCheck`
    // off; `deno publish` (JSR) always type-checks `.d.ts`, so it broke the
    // release. `Record<string, any>` accepts every named entry and keeps us
    // aligned with hono. Known elements stay fully typed via their explicit
    // entries above — the index only governs unlisted tag names.
    [tagName: string]: Record<string, any>
  }
}
