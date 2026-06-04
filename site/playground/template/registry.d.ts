// Ambient declarations for the pre-installed shadcn-style registry components
// the AI may import as `@/components/ui/<name>`. These resolve the imports for
// on-disk `tsc` and the Monaco editor WITHOUT deep-checking the real registry
// sources (which carry their own JSX/runtime setup). Props are intentionally
// loose — the runtime renders the real, fully-typed components; this only keeps
// the editor quiet. Mirrors the playground's generated Monaco types bundle.
//
// Only these six components are wired into the playground (see
// build/build-registry.ts). Keep this list in sync if that set changes.

declare module '@/components/ui/button' {
  export function Button(props?: any): any
}
declare module '@/components/ui/card' {
  export function Card(props?: any): any
  export function CardHeader(props?: any): any
  export function CardTitle(props?: any): any
  export function CardDescription(props?: any): any
  export function CardContent(props?: any): any
  export function CardAction(props?: any): any
  export function CardFooter(props?: any): any
}
declare module '@/components/ui/input' {
  export function Input(props?: any): any
}
declare module '@/components/ui/label' {
  export function Label(props?: any): any
}
declare module '@/components/ui/badge' {
  export function Badge(props?: any): any
}
declare module '@/components/ui/separator' {
  export function Separator(props?: any): any
}
