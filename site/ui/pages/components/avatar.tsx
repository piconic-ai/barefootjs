/**
 * Avatar Reference Page (/components/avatar)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { AvatarPlayground } from '@/components/avatar-playground'
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
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"

function AvatarDemo() {
  return (
    <div className="flex items-center gap-4">
      <Avatar>
        <AvatarImage src="https://github.com/kfly8.png" alt="@kfly8" />
        <AvatarFallback>KF</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>BF</AvatarFallback>
      </Avatar>
      <div className="flex -space-x-3">
        <Avatar className="border-2 border-background">
          <AvatarImage src="https://github.com/kfly8.png" alt="@kfly8" />
          <AvatarFallback>KF</AvatarFallback>
        </Avatar>
        <Avatar className="border-2 border-background">
          <AvatarFallback>AB</AvatarFallback>
        </Avatar>
        <Avatar className="border-2 border-background">
          <AvatarFallback>+2</AvatarFallback>
        </Avatar>
      </div>
    </div>
  )
}`

const avatarProps: PropDefinition[] = [
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS classes for the avatar container.',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'AvatarImage and AvatarFallback components.',
  },
]

const avatarImageProps: PropDefinition[] = [
  {
    name: 'src',
    type: 'string',
    description: 'The image source URL.',
  },
  {
    name: 'alt',
    type: 'string',
    description: 'Alt text for the image.',
  },
]

const avatarFallbackProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'Fallback content (typically user initials).',
  },
]

export function AvatarRefPage() {
  return (
    <DocPage slug="avatar" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Avatar"
          description="An image element with a fallback for representing the user."
          {...getNavLinks('avatar')}
        />

        {/* Props Playground */}
        <AvatarPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add avatar" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="flex items-center gap-4">
              <Avatar>
                <AvatarImage src="https://github.com/kfly8.png" alt="@kfly8" />
                <AvatarFallback>KF</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarFallback>BF</AvatarFallback>
              </Avatar>
              <div className="flex -space-x-3">
                <Avatar className="border-2 border-background">
                  <AvatarImage src="https://github.com/kfly8.png" alt="@kfly8" />
                  <AvatarFallback>KF</AvatarFallback>
                </Avatar>
                <Avatar className="border-2 border-background">
                  <AvatarFallback>AB</AvatarFallback>
                </Avatar>
                <Avatar className="border-2 border-background">
                  <AvatarFallback>+2</AvatarFallback>
                </Avatar>
              </div>
            </div>
          </Example>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">Avatar</h3>
              <PropsTable props={avatarProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">AvatarImage</h3>
              <PropsTable props={avatarImageProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">AvatarFallback</h3>
              <PropsTable props={avatarFallbackProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
