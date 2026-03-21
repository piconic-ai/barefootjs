"use client"
/**
 * ItemDemo Components
 *
 * Interactive demos for Item component.
 * Shows realistic list layouts with composable sub-components.
 */

import { createSignal } from '@barefootjs/dom'
import { Item, ItemGroup, ItemSeparator, ItemContent, ItemTitle, ItemDescription, ItemMedia, ItemActions } from '@ui/components/ui/item'
import { Button } from '@ui/components/ui/button'
import { Badge } from '@ui/components/ui/badge'

/**
 * Basic item list — notification feed
 */
export function ItemBasicDemo() {
  return (
    <ItemGroup>
      <Item>
        <ItemMedia variant="icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
        </ItemMedia>
        <ItemContent>
          <ItemTitle>New comment on your post</ItemTitle>
          <ItemDescription>Alice replied to your discussion thread about the new design system.</ItemDescription>
        </ItemContent>
      </Item>
      <ItemSeparator />
      <Item>
        <ItemMedia variant="icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Team invitation</ItemTitle>
          <ItemDescription>You have been invited to join the Engineering team.</ItemDescription>
        </ItemContent>
      </Item>
      <ItemSeparator />
      <Item>
        <ItemMedia variant="icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Task completed</ItemTitle>
          <ItemDescription>Your deployment to production was successful.</ItemDescription>
        </ItemContent>
      </Item>
    </ItemGroup>
  )
}

/**
 * Variants demo — shows all item visual variants
 */
export function ItemVariantsDemo() {
  return (
    <div className="space-y-4">
      <Item variant="default">
        <ItemContent>
          <ItemTitle>Default variant</ItemTitle>
          <ItemDescription>Transparent background, no border.</ItemDescription>
        </ItemContent>
      </Item>
      <Item variant="outline">
        <ItemContent>
          <ItemTitle>Outline variant</ItemTitle>
          <ItemDescription>Visible border for visual separation.</ItemDescription>
        </ItemContent>
      </Item>
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>Muted variant</ItemTitle>
          <ItemDescription>Subtle background for grouped sections.</ItemDescription>
        </ItemContent>
      </Item>
    </div>
  )
}

/**
 * Settings list — realistic scenario with actions
 */
export function ItemSettingsDemo() {
  const [notificationsEnabled, setNotificationsEnabled] = createSignal(true)
  const [darkMode, setDarkMode] = createSignal(false)

  return (
    <ItemGroup>
      <Item variant="outline">
        <ItemContent>
          <ItemTitle>Notifications</ItemTitle>
          <ItemDescription>Receive push notifications for new messages.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            variant={notificationsEnabled() ? 'default' : 'outline'}
            size="sm"
            onClick={() => setNotificationsEnabled(v => !v)}
          >
            {notificationsEnabled() ? 'On' : 'Off'}
          </Button>
        </ItemActions>
      </Item>
      <Item variant="outline">
        <ItemContent>
          <ItemTitle>Dark Mode</ItemTitle>
          <ItemDescription>Switch between light and dark theme.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            variant={darkMode() ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDarkMode(v => !v)}
          >
            {darkMode() ? 'On' : 'Off'}
          </Button>
        </ItemActions>
      </Item>
      <Item variant="outline">
        <ItemContent>
          <ItemTitle>Language</ItemTitle>
          <ItemDescription>Choose your preferred language.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Badge variant="secondary">English</Badge>
        </ItemActions>
      </Item>
    </ItemGroup>
  )
}

/**
 * Team members list — with media images and actions
 */
export function ItemTeamDemo() {
  return (
    <ItemGroup>
      <Item size="sm">
        <ItemMedia variant="image">
          <img src="https://api.dicebear.com/9.x/initials/svg?seed=AS" alt="Alice Smith" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>
            Alice Smith
            <Badge variant="secondary">Admin</Badge>
          </ItemTitle>
          <ItemDescription>alice@example.com</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button variant="ghost" size="sm">Edit</Button>
        </ItemActions>
      </Item>
      <ItemSeparator />
      <Item size="sm">
        <ItemMedia variant="image">
          <img src="https://api.dicebear.com/9.x/initials/svg?seed=BJ" alt="Bob Johnson" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>
            Bob Johnson
            <Badge variant="outline">Member</Badge>
          </ItemTitle>
          <ItemDescription>bob@example.com</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button variant="ghost" size="sm">Edit</Button>
        </ItemActions>
      </Item>
      <ItemSeparator />
      <Item size="sm">
        <ItemMedia variant="image">
          <img src="https://api.dicebear.com/9.x/initials/svg?seed=CW" alt="Carol Williams" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>
            Carol Williams
            <Badge variant="outline">Member</Badge>
          </ItemTitle>
          <ItemDescription>carol@example.com</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button variant="ghost" size="sm">Edit</Button>
        </ItemActions>
      </Item>
    </ItemGroup>
  )
}
