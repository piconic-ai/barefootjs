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
  { slug: 'button', title: 'Button', description: 'Clickable actions with multiple variants', category: 'input' },
  { slug: 'button-group', title: 'Button Group', description: 'Container for grouping related buttons', category: 'input' },
  { slug: 'calendar', title: 'Calendar', description: 'Date picker with month navigation', category: 'input' },
  { slug: 'checkbox', title: 'Checkbox', description: 'Toggle selection control', category: 'input' },
  { slug: 'combobox', title: 'Combobox', description: 'Autocomplete input with dropdown', category: 'input' },
  { slug: 'date-picker', title: 'Date Picker', description: 'Date selection with calendar popup', category: 'input' },
  { slug: 'field', title: 'Field', description: 'Form field wrapper with label and error', category: 'input' },
  { slug: 'input', title: 'Input', description: 'Text input field', category: 'input' },
  { slug: 'input-group', title: 'Input Group', description: 'Input with addons and affixes', category: 'input' },
  { slug: 'input-otp', title: 'Input OTP', description: 'One-time password input', category: 'input' },
  { slug: 'label', title: 'Label', description: 'Accessible label for form controls', category: 'input' },
  { slug: 'native-select', title: 'Native Select', description: 'Styled native HTML select', category: 'input' },
  { slug: 'radio-group', title: 'Radio Group', description: 'Single-select option group', category: 'input' },
  { slug: 'select', title: 'Select', description: 'Dropdown selection control', category: 'input' },
  { slug: 'slider', title: 'Slider', description: 'Range value selector', category: 'input' },
  { slug: 'switch', title: 'Switch', description: 'On/off toggle control', category: 'input' },
  { slug: 'textarea', title: 'Textarea', description: 'Multi-line text input', category: 'input' },
  { slug: 'toggle', title: 'Toggle', description: 'Two-state pressed button', category: 'input' },
  { slug: 'toggle-group', title: 'Toggle Group', description: 'Group of toggle buttons', category: 'input' },

  // Display (10)
  { slug: 'aspect-ratio', title: 'Aspect Ratio', description: 'Content within a desired ratio', category: 'display' },
  { slug: 'avatar', title: 'Avatar', description: 'User profile image with fallback', category: 'display' },
  { slug: 'badge', title: 'Badge', description: 'Small status indicator labels', category: 'display' },
  { slug: 'card', title: 'Card', description: 'Container for grouped content', category: 'display' },
  { slug: 'carousel', title: 'Carousel', description: 'Motion and swipe content slider', category: 'display' },
  { slug: 'kbd', title: 'Kbd', description: 'Keyboard key display for shortcuts', category: 'display' },
  { slug: 'data-table', title: 'Data Table', description: 'Sortable, filterable data table', category: 'display' },
  { slug: 'item', title: 'Item', description: 'Generic list/menu item with sub-components', category: 'display' },
  { slug: 'separator', title: 'Separator', description: 'Visual divider between content', category: 'display' },
  { slug: 'skeleton', title: 'Skeleton', description: 'Placeholder loading indicator', category: 'display' },
  { slug: 'table', title: 'Table', description: 'Responsive data table', category: 'display' },
  { slug: 'typography', title: 'Typography', description: 'Styled text elements for prose', category: 'display' },

  // Feedback (7)
  { slug: 'alert', title: 'Alert', description: 'Callout for important content', category: 'feedback' },
  { slug: 'alert-dialog', title: 'Alert Dialog', description: 'Modal dialog for important confirmations', category: 'feedback' },
  { slug: 'dialog', title: 'Dialog', description: 'Modal overlay with custom content', category: 'feedback' },
  { slug: 'empty', title: 'Empty', description: 'Empty state placeholder with icon and action', category: 'feedback' },
  { slug: 'progress', title: 'Progress', description: 'Task completion indicator bar', category: 'feedback' },
  { slug: 'spinner', title: 'Spinner', description: 'Animated loading indicator', category: 'feedback' },
  { slug: 'toast', title: 'Toast', description: 'Temporary notification message', category: 'feedback' },

  // Navigation (10)
  { slug: 'accordion', title: 'Accordion', description: 'Vertically collapsing content sections', category: 'navigation' },
  { slug: 'breadcrumb', title: 'Breadcrumb', description: 'Navigation hierarchy trail', category: 'navigation' },
  { slug: 'collapsible', title: 'Collapsible', description: 'Expandable content section', category: 'navigation' },
  { slug: 'command', title: 'Command', description: 'Search and command menu', category: 'navigation' },
  { slug: 'context-menu', title: 'Context Menu', description: 'Right-click menu at cursor position', category: 'navigation' },
  { slug: 'dropdown-menu', title: 'Dropdown Menu', description: 'Action menu triggered by a button', category: 'navigation' },
  { slug: 'menubar', title: 'Menubar', description: 'Desktop application menu bar', category: 'navigation' },
  { slug: 'navigation-menu', title: 'Navigation Menu', description: 'Hover-activated navigation links', category: 'navigation' },
  { slug: 'pagination', title: 'Pagination', description: 'Page navigation controls', category: 'navigation' },
  { slug: 'tabs', title: 'Tabs', description: 'Tabbed content navigation', category: 'navigation' },

  // Layout (9)
  { slug: 'direction', title: 'Direction', description: 'RTL/LTR direction provider', category: 'layout' },
  { slug: 'drawer', title: 'Drawer', description: 'Slide-out panel from screen edge', category: 'layout' },
  { slug: 'hover-card', title: 'Hover Card', description: 'Preview card on hover', category: 'layout' },
  { slug: 'popover', title: 'Popover', description: 'Floating content anchored to a trigger', category: 'layout' },
  { slug: 'portal', title: 'Portal', description: 'Renders content outside DOM hierarchy', category: 'layout' },
  { slug: 'resizable', title: 'Resizable', description: 'Draggable resize panels', category: 'layout' },
  { slug: 'scroll-area', title: 'Scroll Area', description: 'Custom scrollbar container', category: 'layout' },
  { slug: 'sheet', title: 'Sheet', description: 'Side panel overlay', category: 'layout' },
  { slug: 'tooltip', title: 'Tooltip', description: 'Informational text on hover', category: 'layout' },
]

// Blocks — page-level composition patterns
export const blockEntries: BlockEntry[] = [
  { slug: 'analytics-dashboard', title: 'Analytics Dashboard', description: 'Website analytics with multi-level memo chains, dynamic charts, inner loops, and controlled input' },
  { slug: 'file-upload', title: 'File Upload', description: 'File upload manager with drag & drop, progress simulation, and effect cleanup' },
  { slug: 'pricing', title: 'Pricing', description: 'SaaS pricing with billing toggle, plan cards, and feature comparison table' },
  { slug: 'product-cards', title: 'Product Cards', description: 'E-commerce product grid with multi-signal filtering, cart, and view mode toggle' },
  { slug: 'user-profile', title: 'User Profile', description: 'Developer profile with inline editing, filterable repos, star toggle, and activity feed' },
  { slug: 'dashboard', title: 'Dashboard', description: 'Sales dashboard with stats, filterable orders table, and activity feed' },
  { slug: 'mail', title: 'Mail', description: 'Mail inbox with search, star toggle, bulk select, delete confirmation, and detail panel' },
  { slug: 'kanban', title: 'Kanban Board', description: 'Task board with nested loops and cross-column movement' },
  { slug: 'login', title: 'Login', description: 'Login form with validation and social auth' },
  { slug: 'settings', title: 'Settings', description: 'Multi-tab settings page with forms and dialogs' },
  { slug: 'sidebar', title: 'Sidebar', description: 'Collapsible navigation panel' },
  { slug: 'chat', title: 'Chat', description: 'Messaging interface with auto-scroll, typing indicator, and unread counts' },
  { slug: 'music-player', title: 'Music Player', description: 'Media player with timer, effect cleanup, and slider binding' },
  { slug: 'multi-step-form', title: 'Multi-Step Form', description: 'Wizard form with step validation, cross-step state, and review' },
  { slug: 'tasks-table', title: 'Tasks Table', description: 'Data table with sort, filter, pagination, and row selection' },
  { slug: 'social-feed', title: 'Social Feed', description: 'Feed with posts, comments, replies — deeply nested loops and conditionals' },
  { slug: 'file-browser', title: 'File Browser', description: 'Tree-structured file browser with expand/collapse, multi-select, and CRUD' },
  { slug: 'cart', title: 'Cart', description: 'Shopping cart with inline quantity editing, discount, and derived pricing chain' },
  { slug: 'checkout', title: 'Checkout', description: 'Multi-step checkout with shipping, payment, and order review' },
  { slug: 'comments', title: 'Comments', description: 'Comment thread with inline editing, sorting, reactions, and nested replies' },
  { slug: 'notifications-center', title: 'Notifications Center', description: 'Notification center with streaming, date grouping, type filtering, and bulk actions' },
  { slug: 'inventory-manager', title: 'Inventory Manager', description: 'CRUD inventory table with inline editing, undo/redo, search/filter, and validation' },
  { slug: 'permission-matrix', title: 'Permission Matrix', description: 'Role x Permission grid with inheritance cascade, diamond memo dependencies, and bulk operations' },
  { slug: 'spreadsheet', title: 'Spreadsheet', description: 'Spreadsheet grid with cell editing, formula evaluation, selection, and 2D nested loops' },
  { slug: 'form-builder', title: 'Form Builder', description: 'Signal-driven form builder with heterogeneous loop, dynamic field type switching, nested groups, and conditional visibility' },
  { slug: 'pivot-table', title: 'Pivot Table', description: 'Dynamic row/column grouping with multi-level aggregation, drag axis config, and expand/collapse groups' },
  { slug: 'dashboard-builder', title: 'Dashboard Builder', description: 'Dynamic widget composition with per-widget signal isolation, dynamic component switching per item, and layout memo driven by widget count' },
]

// Helper: get components filtered by category
export function getComponentsByCategory(category: ComponentCategory): ComponentEntry[] {
  return componentEntries.filter(e => e.category === category)
}

