/**
 * Small meta strip for every `/gallery/admin/*` page — shown above the
 * admin app shell. Intentionally kept outside AdminShell because it's
 * gallery chrome (about the demo site), not part of the Acme admin UI.
 */

interface GalleryMetaProps {
  appName: string
  issueNumber: number
}

export function GalleryMeta({ appName, issueNumber }: GalleryMetaProps) {
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground mb-3 px-1">
      <span>
        <span className="font-medium text-foreground">{appName}</span>
        {' '}— a multi-page gallery demo built with BarefootJS (
        <a
          href="https://github.com/barefootjs/barefootjs/issues/135"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground"
        >
          Phase 9 Blocks
        </a>
        )
      </span>
      <a
        href={`https://github.com/barefootjs/barefootjs/issues/${issueNumber}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        View on GitHub
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 7h10v10" />
          <path d="M7 17 17 7" />
        </svg>
      </a>
    </div>
  )
}
