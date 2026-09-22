"use client"
/**
 * MenubarDemo Components
 *
 * Interactive demos for Menubar component.
 * Used in menubar documentation page.
 *
 * Note: Due to BarefootJS compiler limitations, we explicitly write out each
 * item instead of using .map() over a local array. Local variables
 * are not preserved during compilation.
 */

import { createSignal } from '@barefootjs/client'
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarSeparator,
  MenubarShortcut,
} from '@ui/components/ui/menubar'

/**
 * Application menu demo - classic File/Edit/View/Profiles pattern
 * Features: shortcuts, submenus, checkbox items, radio items
 */
export function MenubarApplicationDemo() {
  const [showBookmarks, setShowBookmarks] = createSignal(true)
  const [showFullUrls, setShowFullUrls] = createSignal(false)
  const [profile, setProfile] = createSignal('benoit')

  return (
    <Menubar>
      <MenubarMenu value="file">
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent value="file">
          <MenubarItem>
            <span>New Tab</span>
            <MenubarShortcut>⌘T</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            <span>New Window</span>
            <MenubarShortcut>⌘N</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled={true}>
            <span>New Incognito Window</span>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>
              <span>Share</span>
            </MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem>
                <span>Email</span>
              </MenubarItem>
              <MenubarItem>
                <span>Messages</span>
              </MenubarItem>
              <MenubarItem>
                <span>Notes</span>
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem>
            <span>Print...</span>
            <MenubarShortcut>⌘P</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu value="edit">
        <MenubarTrigger>Edit</MenubarTrigger>
        <MenubarContent value="edit">
          <MenubarItem>
            <span>Undo</span>
            <MenubarShortcut>⌘Z</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            <span>Redo</span>
            <MenubarShortcut>⇧⌘Z</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>
              <span>Find</span>
            </MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem>
                <span>Search the web</span>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem>
                <span>Find...</span>
              </MenubarItem>
              <MenubarItem>
                <span>Find and Replace</span>
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem>
            <span>Cut</span>
          </MenubarItem>
          <MenubarItem>
            <span>Copy</span>
          </MenubarItem>
          <MenubarItem>
            <span>Paste</span>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu value="view">
        <MenubarTrigger>View</MenubarTrigger>
        <MenubarContent value="view">
          <MenubarCheckboxItem checked={showBookmarks()} onCheckedChange={setShowBookmarks}>
            <span>Always Show Bookmarks Bar</span>
          </MenubarCheckboxItem>
          <MenubarCheckboxItem checked={showFullUrls()} onCheckedChange={setShowFullUrls}>
            <span>Always Show Full URLs</span>
          </MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarItem>
            <span>Reload</span>
            <MenubarShortcut>⌘R</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            <span>Force Reload</span>
            <MenubarShortcut>⇧⌘R</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>
            <span>Toggle Fullscreen</span>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>
            <span>Hide Sidebar</span>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu value="profiles">
        <MenubarTrigger>Profiles</MenubarTrigger>
        <MenubarContent value="profiles">
          <MenubarRadioGroup value={profile()} onValueChange={setProfile}>
            <MenubarRadioItem value="andy">
              <span>Andy</span>
            </MenubarRadioItem>
            <MenubarRadioItem value="benoit">
              <span>Benoit</span>
            </MenubarRadioItem>
            <MenubarRadioItem value="luis">
              <span>Luis</span>
            </MenubarRadioItem>
          </MenubarRadioGroup>
          <MenubarSeparator />
          <MenubarItem>
            <span>Edit...</span>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>
            <span>Add Profile</span>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}

/**
 * Basic demo - simple File+Edit menus
 */
export function MenubarBasicDemo() {
  return (
    <Menubar>
      <MenubarMenu value="file">
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent value="file">
          <MenubarItem>
            <span>New Tab</span>
            <MenubarShortcut>⌘T</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            <span>New Window</span>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>
            <span>Print</span>
            <MenubarShortcut>⌘P</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu value="edit">
        <MenubarTrigger>Edit</MenubarTrigger>
        <MenubarContent value="edit">
          <MenubarItem>
            <span>Undo</span>
            <MenubarShortcut>⌘Z</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            <span>Redo</span>
            <MenubarShortcut>⇧⌘Z</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>
            <span>Cut</span>
          </MenubarItem>
          <MenubarItem>
            <span>Copy</span>
          </MenubarItem>
          <MenubarItem>
            <span>Paste</span>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}
