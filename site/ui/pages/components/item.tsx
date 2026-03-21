/**
 * Item Reference Page (/components/item)
 *
 * Focused developer reference with interactive Props Playground.
 */

import { Item, ItemGroup, ItemSeparator, ItemContent, ItemTitle, ItemDescription, ItemMedia, ItemActions } from '@/components/ui/item'
import { ItemPlayground } from '@/components/item-playground'
import { ItemSettingsDemo } from '@/components/item-demo'
import { Button } from '@/components/ui/button'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  PropsTable,
  PackageManagerTabs,
  type PropDefinition,
  type TocItem,
} from '../../components/shared/docs'
import { getNavLinks } from '../../components/shared/PageNavigation'

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'installation', title: 'Installation' },
  { id: 'usage', title: 'Usage' },
  { id: 'examples', title: 'Examples' },
  { id: 'variants', title: 'Variants', branch: 'start' },
  { id: 'sizes', title: 'Sizes', branch: 'child' },
  { id: 'with-media', title: 'With Media', branch: 'child' },
  { id: 'with-actions', title: 'With Actions', branch: 'child' },
  { id: 'settings-list', title: 'Settings List', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import {
  Item, ItemGroup, ItemSeparator,
  ItemContent, ItemTitle, ItemDescription,
  ItemMedia, ItemActions,
} from "@/components/ui/item"

function NotificationList() {
  return (
    <ItemGroup>
      <Item>
        <ItemContent>
          <ItemTitle>New comment</ItemTitle>
          <ItemDescription>Alice replied to your post.</ItemDescription>
        </ItemContent>
      </Item>
      <ItemSeparator />
      <Item>
        <ItemContent>
          <ItemTitle>Team update</ItemTitle>
          <ItemDescription>Sprint review notes available.</ItemDescription>
        </ItemContent>
      </Item>
    </ItemGroup>
  )
}`

const variantsCode = `<Item variant="default">...</Item>
<Item variant="outline">...</Item>
<Item variant="muted">...</Item>`

const sizesCode = `<Item size="default">...</Item>
<Item size="sm">...</Item>`

const mediaCode = `<Item>
  <ItemMedia variant="icon">
    <BellIcon />
  </ItemMedia>
  <ItemContent>
    <ItemTitle>With icon media</ItemTitle>
    <ItemDescription>Icon container with border.</ItemDescription>
  </ItemContent>
</Item>
<Item>
  <ItemMedia variant="image">
    <img src="..." alt="Avatar" />
  </ItemMedia>
  <ItemContent>
    <ItemTitle>With image media</ItemTitle>
    <ItemDescription>Image container with cover fit.</ItemDescription>
  </ItemContent>
</Item>`

const actionsCode = `<Item variant="outline">
  <ItemContent>
    <ItemTitle>Notifications</ItemTitle>
    <ItemDescription>Receive push notifications.</ItemDescription>
  </ItemContent>
  <ItemActions>
    <Button size="sm">On</Button>
  </ItemActions>
</Item>`

const itemProps: PropDefinition[] = [
  {
    name: 'variant',
    type: "'default' | 'outline' | 'muted'",
    defaultValue: "'default'",
    description: 'The visual style of the item.',
  },
  {
    name: 'size',
    type: "'default' | 'sm'",
    defaultValue: "'default'",
    description: 'The size of the item.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'The content of the item (typically ItemMedia, ItemContent, ItemActions).',
  },
]

const itemMediaProps: PropDefinition[] = [
  {
    name: 'variant',
    type: "'default' | 'icon' | 'image'",
    defaultValue: "'default'",
    description: 'The visual style of the media container.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'The media content (SVG icon or img element).',
  },
]

export function ItemRefPage() {
  return (
    <DocPage slug="item" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Item"
          description="A generic list/menu item component with composable sub-components for building notification feeds, settings lists, team rosters, and more."
          {...getNavLinks('item')}
        />

        {/* Props Playground */}
        <ItemPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add item" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <ItemGroup>
              <Item>
                <ItemContent>
                  <ItemTitle>New comment</ItemTitle>
                  <ItemDescription>Alice replied to your post.</ItemDescription>
                </ItemContent>
              </Item>
              <ItemSeparator />
              <Item>
                <ItemContent>
                  <ItemTitle>Team update</ItemTitle>
                  <ItemDescription>Sprint review notes available.</ItemDescription>
                </ItemContent>
              </Item>
            </ItemGroup>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Variants" code={variantsCode} showLineNumbers={false}>
              <div className="space-y-4 w-full max-w-md">
                <Item variant="default">
                  <ItemContent>
                    <ItemTitle>Default</ItemTitle>
                    <ItemDescription>Transparent background.</ItemDescription>
                  </ItemContent>
                </Item>
                <Item variant="outline">
                  <ItemContent>
                    <ItemTitle>Outline</ItemTitle>
                    <ItemDescription>Visible border.</ItemDescription>
                  </ItemContent>
                </Item>
                <Item variant="muted">
                  <ItemContent>
                    <ItemTitle>Muted</ItemTitle>
                    <ItemDescription>Subtle background.</ItemDescription>
                  </ItemContent>
                </Item>
              </div>
            </Example>

            <Example title="Sizes" code={sizesCode} showLineNumbers={false}>
              <div className="space-y-4 w-full max-w-md">
                <Item variant="outline" size="default">
                  <ItemContent>
                    <ItemTitle>Default size</ItemTitle>
                    <ItemDescription>Standard padding and gap.</ItemDescription>
                  </ItemContent>
                </Item>
                <Item variant="outline" size="sm">
                  <ItemContent>
                    <ItemTitle>Small size</ItemTitle>
                    <ItemDescription>Compact padding and gap.</ItemDescription>
                  </ItemContent>
                </Item>
              </div>
            </Example>

            <Example title="With Media" code={mediaCode}>
              <div className="space-y-4 w-full max-w-md">
                <Item>
                  <ItemMedia variant="icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>With icon media</ItemTitle>
                    <ItemDescription>Icon container with border and muted background.</ItemDescription>
                  </ItemContent>
                </Item>
                <Item>
                  <ItemMedia variant="image">
                    <img src="https://api.dicebear.com/9.x/initials/svg?seed=AS" alt="Avatar" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>With image media</ItemTitle>
                    <ItemDescription>Image container with cover fit.</ItemDescription>
                  </ItemContent>
                </Item>
              </div>
            </Example>

            <Example title="With Actions" code={actionsCode}>
              <div className="w-full max-w-md">
                <Item variant="outline">
                  <ItemContent>
                    <ItemTitle>Notifications</ItemTitle>
                    <ItemDescription>Receive push notifications.</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button size="sm">On</Button>
                  </ItemActions>
                </Item>
              </div>
            </Example>

            <Example title="Settings List" code="">
              <div className="w-full max-w-md">
                <ItemSettingsDemo />
              </div>
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <div>
              <h3 className="text-base font-semibold mb-3">Item</h3>
              <PropsTable props={itemProps} />
            </div>
            <div>
              <h3 className="text-base font-semibold mb-3">ItemMedia</h3>
              <PropsTable props={itemMediaProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
