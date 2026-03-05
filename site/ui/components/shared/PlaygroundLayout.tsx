/**
 * Playground Layout Components
 *
 * Shared layout for component playgrounds with three areas:
 * 1. Preview area (dot grid background)
 * 2. Controls sidebar (props editors)
 * 3. Code display (highlighted JSX + copy button)
 *
 * Stateless components — no "use client" needed.
 * Safe to use from "use client" playground components thanks to __slot().
 */

import type { Child } from 'hono/jsx'

interface PlaygroundLayoutProps {
  previewDataAttr: string
  controls: Child
  copyButton: Child
}

export function PlaygroundLayout({ previewDataAttr, controls, copyButton }: PlaygroundLayoutProps) {
  return (
    <div id="preview" className="border border-border rounded-lg overflow-hidden scroll-mt-16">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px]">
        {/* Preview */}
        <div className="flex items-center justify-center min-h-[140px] p-8 bg-card relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle,hsl(var(--muted)/0.5)_1px,transparent_1px)] bg-[length:16px_16px] pointer-events-none" />
          <div className="relative z-10" {...{ [previewDataAttr]: true }} />
        </div>

        {/* Controls */}
        <div className="border-t lg:border-t-0 lg:border-l border-border p-6 space-y-4 bg-background">
          {controls}
        </div>
      </div>

      {/* Generated code */}
      <div className="border-t border-border relative group">
        <pre className="m-0 p-4 pr-12 bg-muted overflow-x-auto text-sm font-mono">
          <code data-playground-code />
        </pre>
        {copyButton}
      </div>
    </div>
  )
}

export function PlaygroundControl({ label, children }: { label: string; children: Child }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground block">{label}</label>
      {children}
    </div>
  )
}
