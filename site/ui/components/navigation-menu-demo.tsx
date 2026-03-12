"use client"
/**
 * NavigationMenuDemo Components
 *
 * Interactive demos for NavigationMenu component.
 * Used in navigation-menu documentation page.
 */

import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
} from '@ui/components/ui/navigation-menu'

/**
 * Basic demo — two trigger menus with link grids
 */
export function NavigationMenuBasicDemo() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem value="getting-started">
          <NavigationMenuTrigger>Getting Started</NavigationMenuTrigger>
          <NavigationMenuContent className="w-[400px] md:w-[500px]">
            <ul className="grid gap-3 p-4 md:grid-cols-2">
              <li>
                <NavigationMenuLink href="/docs">
                  <div className="text-sm font-medium leading-none">Introduction</div>
                  <p className="line-clamp-2 text-sm leading-snug text-muted-foreground mt-1">
                    Learn the basics of BarefootJS and get up and running.
                  </p>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink href="/docs/installation">
                  <div className="text-sm font-medium leading-none">Installation</div>
                  <p className="line-clamp-2 text-sm leading-snug text-muted-foreground mt-1">
                    How to install and configure BarefootJS.
                  </p>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink href="/docs/primitives">
                  <div className="text-sm font-medium leading-none">Primitives</div>
                  <p className="line-clamp-2 text-sm leading-snug text-muted-foreground mt-1">
                    Signals, effects, memos, and other reactive primitives.
                  </p>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink href="/docs/styling">
                  <div className="text-sm font-medium leading-none">Styling</div>
                  <p className="line-clamp-2 text-sm leading-snug text-muted-foreground mt-1">
                    Using Tailwind CSS and UnoCSS with BarefootJS.
                  </p>
                </NavigationMenuLink>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem value="components">
          <NavigationMenuTrigger>Components</NavigationMenuTrigger>
          <NavigationMenuContent className="w-[400px] md:w-[500px]">
            <ul className="grid gap-3 p-4 md:grid-cols-2">
              <li>
                <NavigationMenuLink href="/components/button">
                  <div className="text-sm font-medium leading-none">Button</div>
                  <p className="line-clamp-2 text-sm leading-snug text-muted-foreground mt-1">
                    Clickable actions with multiple variants and sizes.
                  </p>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink href="/docs/components/dialog">
                  <div className="text-sm font-medium leading-none">Dialog</div>
                  <p className="line-clamp-2 text-sm leading-snug text-muted-foreground mt-1">
                    Modal overlay with custom content and focus trap.
                  </p>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink href="/docs/components/tabs">
                  <div className="text-sm font-medium leading-none">Tabs</div>
                  <p className="line-clamp-2 text-sm leading-snug text-muted-foreground mt-1">
                    Tabbed content with keyboard navigation.
                  </p>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink href="/components/accordion">
                  <div className="text-sm font-medium leading-none">Accordion</div>
                  <p className="line-clamp-2 text-sm leading-snug text-muted-foreground mt-1">
                    Vertically collapsing content sections.
                  </p>
                </NavigationMenuLink>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}

/**
 * Demo with trigger menus and direct links mixed
 */
export function NavigationMenuWithLinksDemo() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem value="docs">
          <NavigationMenuTrigger>Documentation</NavigationMenuTrigger>
          <NavigationMenuContent className="w-[300px]">
            <ul className="grid gap-3 p-4">
              <li>
                <NavigationMenuLink href="/docs/introduction">
                  <div className="text-sm font-medium leading-none">Introduction</div>
                  <p className="line-clamp-2 text-sm leading-snug text-muted-foreground mt-1">
                    Get started with BarefootJS.
                  </p>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink href="/docs/api" active={true}>
                  <div className="text-sm font-medium leading-none">API Reference</div>
                  <p className="line-clamp-2 text-sm leading-snug text-muted-foreground mt-1">
                    Full API documentation.
                  </p>
                </NavigationMenuLink>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem>
          <NavigationMenuLink href="/blog" className="h-9 px-4 py-2 inline-flex items-center justify-center text-sm font-medium">
            Blog
          </NavigationMenuLink>
        </NavigationMenuItem>

        <NavigationMenuItem>
          <NavigationMenuLink href="/about" className="h-9 px-4 py-2 inline-flex items-center justify-center text-sm font-medium">
            About
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}
