/**
 * User Profile Reference Page (/components/user-profile)
 *
 * Block-level composition: Avatar + Tabs + Card + Badge + Input + Textarea + Select.
 * Compiler stress test for deep conditional nesting, inline editing,
 * per-item array mutation, and filter/sort memo chains.
 */

import { UserProfileDemo } from '@/components/user-profile-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  type TocItem,
} from '../../components/shared/docs'

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'features', title: 'Features' },
  { id: 'profile-header', title: 'Profile Header', branch: 'start' },
  { id: 'tabs', title: 'Tab Navigation', branch: 'child' },
  { id: 'repos', title: 'Repository List', branch: 'child' },
  { id: 'activity', title: 'Activity Feed', branch: 'end' },
]

export function UserProfileRefPage() {
  return (
    <DocPage slug="user-profile" toc={tocItems}>
      <PageHeader
        title="User Profile"
        description="Developer profile with inline editing, filterable repositories, and activity feed."
      />

      <Section id="preview" title="Preview">
        <Example code="">
          <UserProfileDemo />
        </Example>
      </Section>

      <Section id="features" title="Features">
        <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
          <li>Deep conditional nesting (3 levels) for profile name editing</li>
          <li>Inline editing with shared editingField signal (name, bio, about)</li>
          <li>Per-item star toggle with immutable array mutation</li>
          <li>Filter + sort memo chain for repositories</li>
          <li>Tabs with complex content switching (3 different subtrees)</li>
          <li>Mixed loop types (component grid + plain element badges)</li>
          <li>Activity feed with type-based badge variants</li>
        </ul>
      </Section>

      <Section id="profile-header" title="Profile Header">
        <p className="text-sm text-muted-foreground">
          Avatar with inline name and bio editing. Deep conditional: editing mode → verified view → basic view.
        </p>
      </Section>

      <Section id="tabs" title="Tab Navigation">
        <p className="text-sm text-muted-foreground">
          Three tabs with completely different content trees. Switching tabs resets inline editing state.
        </p>
      </Section>

      <Section id="repos" title="Repository List">
        <p className="text-sm text-muted-foreground">
          Search + language filter + sort dropdown driving a 2-level memo chain.
          Per-item star toggle updates both the repo and total stars count.
        </p>
      </Section>

      <Section id="activity" title="Activity Feed">
        <p className="text-sm text-muted-foreground">
          Activity items with type-based Badge variants (commit, PR, issue, review, release).
        </p>
      </Section>
    </DocPage>
  )
}
