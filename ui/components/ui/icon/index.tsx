'use client'

/**
 * Icon Components
 *
 * SVG icons based on Lucide icon definitions.
 * Each icon component directly returns an SVG element.
 * Based on lucide-static v0.562.0 icon definitions.
 *
 * @example Using a specific icon
 * ```tsx
 * <CheckIcon size="md" />
 * <ChevronDownIcon size="sm" className="text-muted-foreground" />
 * ```
 *
 * @example Using the generic Icon component
 * ```tsx
 * <Icon name="check" size="lg" />
 * <Icon name="x" size="sm" className="text-destructive" />
 * ```
 *
 * @example Available sizes
 * ```tsx
 * <CheckIcon size="sm" />  // 16px
 * <CheckIcon size="md" />  // 20px (default)
 * <CheckIcon size="lg" />  // 24px
 * <CheckIcon size="xl" />  // 32px
 * ```
 */

import type { SVGSVGAttributes } from '@barefootjs/jsx'

export type IconSize = 'sm' | 'md' | 'lg' | 'xl'

export interface IconProps extends SVGSVGAttributes {
  size?: IconSize
}

// Map size to pixel values
const sizeMap: Record<IconSize, number> = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}

// Stroke icon path definitions
const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  'moon': 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  'monitor': 'M20 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8 21h8M12 17v4',
  'copy': 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  'clipboard': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'clipboard-check': 'M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4',
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'arrow-left': 'm12 19-7-7 7-7M19 12H5',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
  'arrow-up-down': 'm21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16',
  'panel-left': 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M3 3h12v18H3zM9 3v18',
  'loader-circle': 'M21 12a9 9 0 1 1-6.219-8.56',
} as const

export type IconName = keyof typeof strokePaths | 'github' | 'search' | 'settings' | 'globe' | 'log-out' | 'circle-help' | 'panel-left' | 'calendar' | 'grip-vertical' | 'loader-circle'

// Icons that need butt linecap for proper visual centering
const buttLinecapIcons = ['plus', 'minus'] as const

export function CheckIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={strokePaths['check']} />
    </svg>
  )
}

export function ChevronDownIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={strokePaths['chevron-down']} />
    </svg>
  )
}

export function ChevronUpIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={strokePaths['chevron-up']} />
    </svg>
  )
}

export function ChevronLeftIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={strokePaths['chevron-left']} />
    </svg>
  )
}

export function ChevronRightIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={strokePaths['chevron-right']} />
    </svg>
  )
}

export function XIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={strokePaths['x']} />
    </svg>
  )
}

export function PlusIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="butt" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={strokePaths['plus']} />
    </svg>
  )
}

export function MinusIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="butt" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={strokePaths['minus']} />
    </svg>
  )
}

export function SunIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={strokePaths['sun']} />
    </svg>
  )
}

export function MoonIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={strokePaths['moon']} />
    </svg>
  )
}

export function MonitorIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={strokePaths['monitor']} />
    </svg>
  )
}

export function CopyIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={strokePaths['copy']} />
    </svg>
  )
}

export function ClipboardIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={strokePaths['clipboard']} />
    </svg>
  )
}

export function ClipboardCheckIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={strokePaths['clipboard-check']} />
    </svg>
  )
}

export function MenuIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={strokePaths['menu']} />
    </svg>
  )
}

export function ArrowLeftIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={strokePaths['arrow-left']} />
    </svg>
  )
}

export function ArrowRightIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={strokePaths['arrow-right']} />
    </svg>
  )
}

export function ArrowUpDownIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={strokePaths['arrow-up-down']} />
    </svg>
  )
}

export function EllipsisIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  )
}

export function GitHubIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="currentColor" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  )
}

export function SettingsIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function GlobeIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  )
}

export function LogOutIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    </svg>
  )
}

export function CircleHelpIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  )
}

export function SearchIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

export function CircleCheckIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

export function CircleXIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  )
}

export function TriangleAlertIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

export function InfoIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  )
}

export function CalendarIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </svg>
  )
}

export function GripVerticalIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="5" r="1" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="15" cy="19" r="1" />
    </svg>
  )
}

export function LoaderCircleIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={strokePaths['loader-circle']} />
    </svg>
  )
}

export function PanelLeftIcon({ size, className = '', ...props }: IconProps) {
  const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...sizeAttrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  )
}

// Generic Icon component for dynamic icon selection
export function Icon({ name, size = 'md', className = '', ...props }: { name: IconName } & IconProps) {
  const s = sizeMap[size]

  if (name === 'github') {
    return <GitHubIcon size={size} className={className} {...props} />
  }

  if (name === 'search') {
    return <SearchIcon size={size} className={className} {...props} />
  }

  if (name === 'settings') {
    return <SettingsIcon size={size} className={className} {...props} />
  }

  if (name === 'globe') {
    return <GlobeIcon size={size} className={className} {...props} />
  }

  if (name === 'log-out') {
    return <LogOutIcon size={size} className={className} {...props} />
  }

  if (name === 'circle-help') {
    return <CircleHelpIcon size={size} className={className} {...props} />
  }

  if (name === 'calendar') {
    return <CalendarIcon size={size} className={className} {...props} />
  }

  if (name === 'grip-vertical') {
    return <GripVerticalIcon size={size} className={className} {...props} />
  }

  if (name === 'loader-circle') {
    return <LoaderCircleIcon size={size} className={className} {...props} />
  }

  if (name === 'panel-left') {
    return <PanelLeftIcon size={size} className={className} {...props} />
  }

  const path = strokePaths[name as keyof typeof strokePaths]
  if (!path) {
    return null
  }

  const linecap = (buttLinecapIcons as readonly string[]).includes(name) ? 'butt' : 'round'

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap={linecap} stroke-linejoin="round" className={`shrink-0 ${className}`} aria-hidden="true" {...props}>
      <path d={path} />
    </svg>
  )
}
