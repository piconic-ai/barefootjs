// Ambient declarations for the pre-installed shadcn-style registry components
// the AI may import as `@/components/ui/<name>`. They let the editor / on-disk
// `tsc` resolve those imports WITHOUT deep-checking the real registry sources
// (which carry their own JSX-runtime setup that doesn't fit the template's
// tsconfig). The component-specific props (variant / size / orientation / …)
// are typed from `bf docs <name>`, so an invalid value like
// `<Button variant="primary">` is flagged here too. The components spread the
// rest onto the underlying element, so an index signature carries native HTML
// attributes; the return is the JSX node (kept `any` — the precise element type
// lives in the real sources and isn't needed to author apps).
//
// Keep in sync with the curated set in build/build-registry.ts.

// Native HTML attributes the components forward via `...props`, plus children.
type RegistryHTMLProps = {
  className?: string
  children?: unknown
  [prop: string]: unknown
}

declare module '@/components/ui/button' {
  export function Button(
    props?: RegistryHTMLProps & {
      variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
      size?: 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg'
      asChild?: boolean
    },
  ): any
}
declare module '@/components/ui/badge' {
  export function Badge(
    props?: RegistryHTMLProps & {
      variant?: 'default' | 'secondary' | 'destructive' | 'outline'
      asChild?: boolean
    },
  ): any
}
declare module '@/components/ui/separator' {
  export function Separator(
    props?: RegistryHTMLProps & {
      orientation?: 'horizontal' | 'vertical'
      decorative?: boolean
    },
  ): any
}
declare module '@/components/ui/input' {
  // Accepts all native input attributes (value, onInput, type, placeholder, …).
  export function Input(props?: RegistryHTMLProps): any
}
declare module '@/components/ui/label' {
  export function Label(props?: RegistryHTMLProps): any
}
declare module '@/components/ui/card' {
  export function Card(props?: RegistryHTMLProps): any
  export function CardHeader(props?: RegistryHTMLProps): any
  export function CardTitle(props?: RegistryHTMLProps): any
  export function CardDescription(props?: RegistryHTMLProps): any
  export function CardContent(props?: RegistryHTMLProps): any
  export function CardAction(props?: RegistryHTMLProps): any
  export function CardFooter(props?: RegistryHTMLProps): any
}
