import { ThemeSwitcher } from '@/components/theme-switcher'

interface GalleryMetaProps {
  appName: string
  sourceHref: string
}

export function GalleryMeta({ appName, sourceHref }: GalleryMetaProps) {
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground mb-3 px-1">
      <span className="font-medium text-foreground">{appName}</span>
      <div className="flex items-center gap-2">
        <ThemeSwitcher className="inline-flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus:outline-none" />
        <a
          href={sourceHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          View source
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 7h10v10" />
            <path d="M7 17 17 7" />
          </svg>
        </a>
      </div>
    </div>
  )
}
