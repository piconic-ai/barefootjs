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
} from '../html-types'

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
    meta: HTMLBaseAttributes & { charset?: string; content?: string; 'http-equiv'?: string; name?: string }
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

    // SVG (basic support)
    svg: HTMLBaseAttributes & { viewBox?: string; xmlns?: string; width?: number | string; height?: number | string; fill?: string; stroke?: string }
    path: HTMLBaseAttributes & { d?: string; fill?: string; stroke?: string; 'stroke-width'?: number | string; 'stroke-linecap'?: string; 'stroke-linejoin'?: string }
    circle: HTMLBaseAttributes & { cx?: number | string; cy?: number | string; r?: number | string; fill?: string; stroke?: string }
    rect: HTMLBaseAttributes & { x?: number | string; y?: number | string; width?: number | string; height?: number | string; rx?: number | string; ry?: number | string; fill?: string; stroke?: string }
    line: HTMLBaseAttributes & { x1?: number | string; y1?: number | string; x2?: number | string; y2?: number | string; stroke?: string; 'stroke-width'?: number | string }
    polyline: HTMLBaseAttributes & { points?: string; fill?: string; stroke?: string }
    polygon: HTMLBaseAttributes & { points?: string; fill?: string; stroke?: string }
    text: HTMLBaseAttributes & { x?: number | string; y?: number | string; dx?: number | string; dy?: number | string; fill?: string }
    tspan: HTMLBaseAttributes
    g: HTMLBaseAttributes & { transform?: string }
    defs: HTMLBaseAttributes
    use: HTMLBaseAttributes & { href?: string; x?: number | string; y?: number | string; width?: number | string; height?: number | string }
    symbol: HTMLBaseAttributes & { viewBox?: string }
    clipPath: HTMLBaseAttributes
    marker: HTMLBaseAttributes & { viewBox?: string; refX?: number | string; refY?: number | string; markerWidth?: number | string; markerHeight?: number | string; markerUnits?: string; orient?: string | number }
    mask: HTMLBaseAttributes
    linearGradient: HTMLBaseAttributes & { x1?: number | string; y1?: number | string; x2?: number | string; y2?: number | string }
    radialGradient: HTMLBaseAttributes & { cx?: number | string; cy?: number | string; r?: number | string; fx?: number | string; fy?: number | string }
    stop: HTMLBaseAttributes & { offset?: number | string; 'stop-color'?: string; 'stop-opacity'?: number | string }
    pattern: HTMLBaseAttributes & { x?: number | string; y?: number | string; width?: number | string; height?: number | string; patternUnits?: string }
    image: HTMLBaseAttributes & { href?: string; x?: number | string; y?: number | string; width?: number | string; height?: number | string }
    foreignObject: HTMLBaseAttributes & { x?: number | string; y?: number | string; width?: number | string; height?: number | string }

    // Allow any other elements
    [tagName: string]: HTMLBaseAttributes
  }
}
