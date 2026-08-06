/**
 * Docs-specific tab component for adapter/framework code examples.
 *
 * Server-side only — renders all panels as static HTML. The companion
 * script `docs-tabs-client.ts` handles tab switching on the client via
 * data-attribute selectors and class toggles, no BarefootJS compilation
 * needed.
 */

const tabTriggerBase = 'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none'
const tabTriggerFocus = 'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'
const tabTriggerActive = 'bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30'
const tabTriggerInactive = 'text-foreground dark:text-muted-foreground'

interface DocsTab {
  label: string
  html: string
}

interface DocsTabsProps {
  id: string
  defaultTab: string
  tabs: DocsTab[]
}

export function DocsTabs({ id, defaultTab, tabs }: DocsTabsProps) {
  return (
    <div data-docs-tabs={id}>
      <div role="tablist" className="bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px] mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.label}
            role="tab"
            aria-selected={tab.label === defaultTab}
            data-state={tab.label === defaultTab ? 'active' : 'inactive'}
            data-docs-tab-trigger={tab.label}
            className={`${tabTriggerBase} ${tabTriggerFocus} ${tab.label === defaultTab ? tabTriggerActive : tabTriggerInactive}`}
            tabindex={tab.label === defaultTab ? 0 : -1}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.label}
          role="tabpanel"
          data-docs-tab-panel={tab.label}
          className={tab.label === defaultTab ? '' : 'hidden'}
          dangerouslySetInnerHTML={{ __html: tab.html }}
        />
      ))}
    </div>
  )
}
