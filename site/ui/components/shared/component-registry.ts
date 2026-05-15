/**
 * Component Registry — Single source of truth for component metadata
 *
 * Shared across: sidebar, home page, catalog, PageNavigation, and studio.
 * Categories follow industry-standard functional classification
 * (Ant Design, MUI, Chakra UI, Spectrum all use similar groupings).
 */

export type ComponentCategory = 'input' | 'display' | 'feedback' | 'navigation' | 'layout'

export interface ComponentEntry {
  slug: string
  title: string
  description: string
  category: ComponentCategory
}

export interface BlockEntry {
  slug: string
  title: string
  description: string
}

export const categoryOrder: ComponentCategory[] = ['input', 'display', 'feedback', 'navigation', 'layout']

export const categoryLabels: Record<ComponentCategory, string> = {
  input: 'Input',
  display: 'Display',
  feedback: 'Feedback',
  navigation: 'Navigation',
  layout: 'Layout',
}

// All components sorted alphabetically within each category
export const componentEntries: ComponentEntry[] = [
  // Input (15)
  { slug: 'button', title: 'Button', description: 'Displays a button or a component that looks like a button.', category: 'input' },
  { slug: 'button-group', title: 'Button Group', description: 'Groups related buttons together with shared borders and consistent spacing.', category: 'input' },
  { slug: 'calendar', title: 'Calendar', description: 'A date field component that allows users to enter and edit date.', category: 'input' },
  { slug: 'checkbox', title: 'Checkbox', description: 'A control that allows the user to toggle between checked and not checked.', category: 'input' },
  { slug: 'combobox', title: 'Combobox', description: 'Autocomplete input and command palette with a list of suggestions.', category: 'input' },
  { slug: 'date-picker', title: 'Date Picker', description: 'A date picker component with range and presets.', category: 'input' },
  { slug: 'field', title: 'Field', description: 'A form field wrapper that pairs a label, control, description, and error message.', category: 'input' },
  { slug: 'input', title: 'Input', description: 'Displays a form input field or a component that looks like an input field.', category: 'input' },
  { slug: 'input-group', title: 'Input Group', description: 'Composes an input with leading or trailing addons such as icons, text, or buttons.', category: 'input' },
  { slug: 'input-otp', title: 'Input OTP', description: 'Accessible one-time password input with copy paste functionality.', category: 'input' },
  { slug: 'label', title: 'Label', description: 'Renders an accessible label associated with controls.', category: 'input' },
  { slug: 'native-select', title: 'Native Select', description: 'A styled wrapper around the native HTML select element.', category: 'input' },
  { slug: 'radio-group', title: 'Radio Group', description: 'A set of checkable buttons—known as radio buttons—where no more than one of the buttons can be checked at a time.', category: 'input' },
  { slug: 'select', title: 'Select', description: 'Displays a list of options for the user to pick from—triggered by a button.', category: 'input' },
  { slug: 'slider', title: 'Slider', description: 'An input where the user selects a value from within a given range.', category: 'input' },
  { slug: 'switch', title: 'Switch', description: 'A control that allows the user to toggle between checked and not checked.', category: 'input' },
  { slug: 'textarea', title: 'Textarea', description: 'Displays a form textarea or a component that looks like a textarea.', category: 'input' },
  { slug: 'toggle', title: 'Toggle', description: 'A two-state button that can be either on or off.', category: 'input' },
  { slug: 'toggle-group', title: 'Toggle Group', description: 'A set of two-state buttons that can be toggled on or off.', category: 'input' },

  // Display (10)
  { slug: 'aspect-ratio', title: 'Aspect Ratio', description: 'Displays content within a desired ratio.', category: 'display' },
  { slug: 'avatar', title: 'Avatar', description: 'An image element with a fallback for representing the user.', category: 'display' },
  { slug: 'badge', title: 'Badge', description: 'Displays a badge or a component that looks like a badge.', category: 'display' },
  { slug: 'card', title: 'Card', description: 'Displays a card with header, content, and footer.', category: 'display' },
  { slug: 'carousel', title: 'Carousel', description: 'A carousel with motion and swipe built using Embla.', category: 'display' },
  { slug: 'kbd', title: 'Kbd', description: 'Renders a keyboard key to indicate a shortcut or keystroke.', category: 'display' },
  { slug: 'data-table', title: 'Data Table', description: 'Powerful table and datagrids with sorting, filtering, and pagination.', category: 'display' },
  { slug: 'item', title: 'Item', description: 'A flexible list item primitive with media, content, and actions slots.', category: 'display' },
  { slug: 'separator', title: 'Separator', description: 'Visually or semantically separates content.', category: 'display' },
  { slug: 'skeleton', title: 'Skeleton', description: 'Use to show a placeholder while content is loading.', category: 'display' },
  { slug: 'table', title: 'Table', description: 'A responsive table component.', category: 'display' },
  { slug: 'typography', title: 'Typography', description: 'Styled text primitives for headings, paragraphs, lists, and inline prose.', category: 'display' },

  // Feedback (7)
  { slug: 'alert', title: 'Alert', description: 'Displays a callout for user attention.', category: 'feedback' },
  { slug: 'alert-dialog', title: 'Alert Dialog', description: 'A modal dialog that interrupts the user with important content and expects a response.', category: 'feedback' },
  { slug: 'dialog', title: 'Dialog', description: 'A window overlaid on either the primary window or another dialog window, rendering the content underneath inert.', category: 'feedback' },
  { slug: 'empty', title: 'Empty', description: 'Displays an empty state with an icon, title, description, and call to action.', category: 'feedback' },
  { slug: 'progress', title: 'Progress', description: 'Displays an indicator showing the completion progress of a task, typically displayed as a progress bar.', category: 'feedback' },
  { slug: 'spinner', title: 'Spinner', description: 'An animated indicator that communicates an in-progress or loading state.', category: 'feedback' },
  { slug: 'toast', title: 'Toast', description: 'A succinct message that is displayed temporarily.', category: 'feedback' },

  // Navigation (10)
  { slug: 'accordion', title: 'Accordion', description: 'A vertically stacked set of interactive headings that each reveal a section of content.', category: 'navigation' },
  { slug: 'breadcrumb', title: 'Breadcrumb', description: 'Displays the path to the current resource using a hierarchy of links.', category: 'navigation' },
  { slug: 'collapsible', title: 'Collapsible', description: 'An interactive component which expands/collapses a panel.', category: 'navigation' },
  { slug: 'command', title: 'Command', description: 'Fast, composable, unstyled command menu for React.', category: 'navigation' },
  { slug: 'context-menu', title: 'Context Menu', description: 'Displays a menu located at the pointer, triggered by a right-click or a long-press.', category: 'navigation' },
  { slug: 'dropdown-menu', title: 'Dropdown Menu', description: 'Displays a menu to the user — such as a set of actions or functions — triggered by a button.', category: 'navigation' },
  { slug: 'menubar', title: 'Menubar', description: 'A visually persistent menu common in desktop applications that provides a consistent set of commands.', category: 'navigation' },
  { slug: 'navigation-menu', title: 'Navigation Menu', description: 'A collection of links for navigating websites.', category: 'navigation' },
  { slug: 'pagination', title: 'Pagination', description: 'Pagination with page navigation, next and previous links.', category: 'navigation' },
  { slug: 'tabs', title: 'Tabs', description: 'A set of layered sections of content—known as tab panels—that are displayed one at a time.', category: 'navigation' },

  // Layout (9)
  { slug: 'direction', title: 'Direction', description: 'Provides text direction (LTR or RTL) context to descendant components.', category: 'layout' },
  { slug: 'drawer', title: 'Drawer', description: 'A drawer component for React.', category: 'layout' },
  { slug: 'hover-card', title: 'Hover Card', description: 'For sighted users to preview content available behind a link.', category: 'layout' },
  { slug: 'popover', title: 'Popover', description: 'Displays rich content in a portal, triggered by a button.', category: 'layout' },
  { slug: 'portal', title: 'Portal', description: 'Renders children into a different part of the DOM tree.', category: 'layout' },
  { slug: 'resizable', title: 'Resizable', description: 'Accessible resizable panel groups and layouts with keyboard support.', category: 'layout' },
  { slug: 'scroll-area', title: 'Scroll Area', description: 'Augments native scroll functionality for custom, cross-browser styling.', category: 'layout' },
  { slug: 'sheet', title: 'Sheet', description: 'Extends the Dialog component to display content that complements the main content of the screen.', category: 'layout' },
  { slug: 'tooltip', title: 'Tooltip', description: 'A popup that displays information related to an element when the element receives keyboard focus or the mouse hovers over it.', category: 'layout' },
]

// Blocks — compiler stress-test patterns kept as standalone /components entries.
// Blocks subsumed by gallery apps have been retired (see issue #929 Phase 3).
export const blockEntries: BlockEntry[] = [
  { slug: 'file-upload', title: 'File Upload', description: 'A file upload manager demonstrating drag and drop, simulated upload progress, and effect cleanup.' },
  { slug: 'music-player', title: 'Music Player', description: 'A media player demonstrating timer-driven progress, effect cleanup, and slider binding.' },
  { slug: 'spreadsheet', title: 'Spreadsheet', description: 'A spreadsheet grid demonstrating cell editing, formula evaluation, selection, and 2D nested loops.' },
  { slug: 'permission-matrix', title: 'Permission Matrix', description: 'A role-by-permission grid demonstrating inheritance cascade, diamond memo dependencies, and bulk operations.' },
  { slug: 'form-builder', title: 'Form Builder', description: 'A signal-driven form builder demonstrating heterogeneous loops, dynamic field type switching, nested groups, and conditional visibility.' },
  { slug: 'pivot-table', title: 'Pivot Table', description: 'A pivot table demonstrating dynamic row and column grouping with multi-level aggregation, drag axis configuration, and expand/collapse groups.' },
  { slug: 'dashboard-builder', title: 'Dashboard Builder', description: 'A dashboard demonstrating dynamic widget composition with per-widget signal isolation, dynamic component switching per item, and a layout memo driven by widget count.' },
  { slug: 'state-machine-playground', title: 'State Machine Playground', description: 'An interactive state machine explorer demonstrating preset workflows, multi-conditional class flipping on transition, a reactive transitions loop source, and a history filter/group memo chain.' },
  { slug: 'theme-customizer', title: 'Theme Customizer', description: 'Three signal-driven context providers (palette, spacing, typography) wrapping a deep consumer tree to exercise provider value propagation, ordering, stale-read safety, and dynamic token add/remove.' },
  { slug: 'infinite-scroll', title: 'Async Infinite Scroll', description: 'IntersectionObserver-triggered pagination demonstrating Async streaming boundaries, mapArray append, per-item like and save actions, and effect cleanup on unmount.' },
  { slug: 'toast-queue', title: 'Toast Queue', description: 'A signal-backed notification queue demonstrating multiple simultaneous portals, auto-dismiss timers, manual dismiss, stack ordering, and per-toast cleanup on dynamic unmount.' },
  { slug: 'recursive-comments', title: 'Recursive Comments', description: 'An unlimited-depth comment thread demonstrating self-referential recursion, memo-lifted inner-loop reconciliation at every depth, cross-depth context propagation, and tree-wide derived stats.' },
]

// Helper: get components filtered by category
export function getComponentsByCategory(category: ComponentCategory): ComponentEntry[] {
  return componentEntries.filter(e => e.category === category)
}
