"use client"
/**
 * MailInboxDemo Component
 *
 * Mail inbox block combining Card, Badge, Input, Checkbox, AlertDialog, and Toast.
 * Compiler stress: dynamic array signals (add/delete), state toggles inside loops,
 * AlertDialog/portal from loop context, filter+map chains, derived memos.
 */

import { createSignal, createMemo } from '@barefootjs/dom'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@ui/components/ui/card'
import { Badge } from '@ui/components/ui/badge'
import { Input } from '@ui/components/ui/input'
import { Button } from '@ui/components/ui/button'
import { Checkbox } from '@ui/components/ui/checkbox'
import { Separator } from '@ui/components/ui/separator'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@ui/components/ui/alert-dialog'
import {
  ToastProvider,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from '@ui/components/ui/toast'

// Mail data type
type Mail = {
  id: number
  from: string
  subject: string
  preview: string
  body: string
  date: string
  read: boolean
  starred: boolean
  selected: boolean
}

// Initial mail data
const initialMails: Mail[] = [
  {
    id: 1,
    from: 'Alice Johnson',
    subject: 'Q4 Planning Meeting',
    preview: 'Let\'s discuss the Q4 roadmap and key milestones...',
    body: 'Hi team,\n\nLet\'s discuss the Q4 roadmap and key milestones for the upcoming quarter. Please review the attached document before the meeting.\n\nBest regards,\nAlice',
    date: 'Oct 22',
    read: false,
    starred: true,
    selected: false,
  },
  {
    id: 2,
    from: 'Bob Smith',
    subject: 'Design Review Feedback',
    preview: 'Great work on the new dashboard design. A few notes...',
    body: 'Great work on the new dashboard design. A few notes:\n\n1. The color scheme looks solid\n2. Consider adding more whitespace in the sidebar\n3. The responsive breakpoints need adjustment\n\nLet me know if you have questions.',
    date: 'Oct 21',
    read: true,
    starred: false,
    selected: false,
  },
  {
    id: 3,
    from: 'Carol White',
    subject: 'Invoice #1234 Approved',
    preview: 'Your invoice has been approved and payment is...',
    body: 'Your invoice #1234 has been approved and payment is scheduled for processing within 5 business days. Please reach out to accounting if you have any questions.',
    date: 'Oct 20',
    read: false,
    starred: false,
    selected: false,
  },
  {
    id: 4,
    from: 'David Brown',
    subject: 'Team Outing This Friday',
    preview: 'Reminder: team outing this Friday at 3pm...',
    body: 'Reminder: team outing this Friday at 3pm. We\'ll be going to the park for some outdoor activities. Please RSVP by Wednesday so we can plan accordingly.\n\nLooking forward to it!',
    date: 'Oct 19',
    read: true,
    starred: true,
    selected: false,
  },
  {
    id: 5,
    from: 'Eve Davis',
    subject: 'Security Alert: New Login',
    preview: 'A new login was detected from an unrecognized device...',
    body: 'A new login was detected from an unrecognized device.\n\nDevice: Chrome on macOS\nLocation: San Francisco, CA\nTime: Oct 18, 2024 at 2:30 PM\n\nIf this wasn\'t you, please change your password immediately.',
    date: 'Oct 18',
    read: false,
    starred: false,
    selected: false,
  },
  {
    id: 6,
    from: 'Frank Wilson',
    subject: 'Project Deadline Extended',
    preview: 'Good news — the client has agreed to extend...',
    body: 'Good news — the client has agreed to extend the project deadline by two weeks. This gives us more time to polish the deliverables and run additional testing.\n\nUpdated timeline will be shared tomorrow.',
    date: 'Oct 17',
    read: true,
    starred: false,
    selected: false,
  },
]

/**
 * Mail inbox demo — list + detail view with search, bulk select, star, delete
 *
 * Compiler stress points:
 * - Dynamic array signal (setMails with immutable updates: filter, map)
 * - .map() rendering over signal array
 * - State toggle inside loop (star, read, checkbox)
 * - AlertDialog opened from loop context (delete confirmation)
 * - Derived memo from signal array (.find, .filter)
 * - Conditional rendering based on selection (detail panel)
 * - Multiple signal updates in one handler (mark read + select)
 */
export function MailInboxDemo() {
  // Core mail state — dynamic array signal
  const [mails, setMails] = createSignal<Mail[]>(initialMails.map(m => ({ ...m })))
  const [selectedId, setSelectedId] = createSignal<number | null>(null)
  const [searchQuery, setSearchQuery] = createSignal('')

  // AlertDialog state for delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = createSignal(false)
  const [deleteTargetId, setDeleteTargetId] = createSignal<number | null>(null)

  // Toast state
  const [toastOpen, setToastOpen] = createSignal(false)
  const [toastMessage, setToastMessage] = createSignal('')

  // Derived memos — stress test for reactive .filter(), .find()
  const filteredMails = createMemo(() =>
    mails().filter((m) => {
      const query = searchQuery().toLowerCase()
      if (query === '') return true
      return m.from.toLowerCase().includes(query) ||
        m.subject.toLowerCase().includes(query) ||
        m.preview.toLowerCase().includes(query)
    })
  )

  const selectedMail = createMemo(() =>
    mails().find((m) => m.id === selectedId())
  )

  // Derived properties with safe defaults — avoids null access in conditional templates
  const detailSubject = createMemo(() => selectedMail()?.subject ?? '')
  const detailFrom = createMemo(() => selectedMail()?.from ?? '')
  const detailDate = createMemo(() => selectedMail()?.date ?? '')
  const detailBody = createMemo(() => selectedMail()?.body ?? '')
  const detailRead = createMemo(() => selectedMail()?.read ?? false)
  const detailId = createMemo(() => selectedMail()?.id ?? 0)

  const selectedCount = createMemo(() =>
    mails().filter((m) => m.selected).length
  )

  const isAllSelected = createMemo(() => {
    const filtered = filteredMails()
    if (filtered.length === 0) return false
    return filtered.every((m) => m.selected)
  })

  // Show toast helper
  const showToast = (message: string) => {
    setToastMessage(message)
    setToastOpen(true)
    setTimeout(() => setToastOpen(false), 3000)
  }

  // Select a mail — also mark as read
  const handleSelectMail = (id: number) => {
    setSelectedId(id)
    setMails(mails().map(m => m.id === id ? { ...m, read: true } : m))
  }

  // Toggle star — state toggle inside loop
  const handleToggleStar = (id: number) => {
    setMails(mails().map(m => m.id === id ? { ...m, starred: !m.starred } : m))
  }

  // Toggle individual checkbox — state toggle inside loop
  const handleToggleSelect = (id: number) => {
    setMails(mails().map(m => m.id === id ? { ...m, selected: !m.selected } : m))
  }

  // Toggle all checkboxes
  const handleToggleAll = (value: boolean) => {
    const filteredIds = filteredMails().map(m => m.id)
    setMails(mails().map(m => filteredIds.includes(m.id) ? { ...m, selected: value } : m))
  }

  // Toggle read/unread for selected mail
  const handleToggleRead = () => {
    const mail = selectedMail()
    if (!mail) return
    setMails(mails().map(m => m.id === mail.id ? { ...m, read: !m.read } : m))
  }

  // Initiate delete — opens AlertDialog from loop context
  const handleDeleteClick = (id: number) => {
    setDeleteTargetId(id)
    setDeleteDialogOpen(true)
  }

  // Confirm delete — removes from array signal
  const handleDeleteConfirm = () => {
    const targetId = deleteTargetId()
    if (targetId === null) return
    setMails(mails().filter(m => m.id !== targetId))
    if (selectedId() === targetId) {
      setSelectedId(null)
    }
    setDeleteDialogOpen(false)
    setDeleteTargetId(null)
    showToast('Email deleted successfully')
  }

  // Delete all selected mails
  const handleDeleteSelected = () => {
    const selectedIds = mails().filter(m => m.selected).map(m => m.id)
    setMails(mails().filter(m => !m.selected))
    if (selectedId() !== null && selectedIds.includes(selectedId()!)) {
      setSelectedId(null)
    }
    showToast(`${selectedIds.length} email(s) deleted`)
  }

  return (
    <div className="w-full max-w-5xl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Inbox</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-4 py-2 border-b">
            <Checkbox
              checked={isAllSelected()}
              onCheckedChange={handleToggleAll}
            />
            <Input
              placeholder="Search mail..."
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs h-8 text-sm"
            />
            <span className="mail-count text-sm text-muted-foreground whitespace-nowrap">
              {filteredMails().length} of {mails().length}
            </span>
            {selectedCount() > 0 ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
              >
                Delete selected
              </Button>
            ) : null}
          </div>

          {/* Two-panel layout */}
          <div className="flex min-h-[400px]">
            {/* Mail list (left panel) */}
            <div className="w-2/5 border-r overflow-y-auto">
              {filteredMails().map((mail) => (
                <div
                  key={mail.id}
                  className={`mail-row flex items-start gap-2 px-3 py-3 border-b cursor-pointer hover:bg-muted/50 ${mail.id === selectedId() ? 'bg-muted' : ''}`}
                >
                  <div className="pt-0.5">
                    <Checkbox
                      checked={mail.selected}
                      onCheckedChange={() => handleToggleSelect(mail.id)}
                    />
                  </div>
                  <button
                    type="button"
                    className={`star-button shrink-0 pt-0.5 text-sm bg-transparent border-none cursor-pointer p-0 ${mail.starred ? 'text-yellow-500' : 'text-muted-foreground'}`}
                    onClick={() => handleToggleStar(mail.id)}
                  >
                    {mail.starred ? '\u2605' : '\u2606'}
                  </button>
                  <div className="mail-content flex-1 min-w-0" onClick={() => handleSelectMail(mail.id)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`mail-from text-sm truncate ${!mail.read ? 'font-semibold' : ''}`}>{mail.from}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{mail.date}</span>
                    </div>
                    <p className={`mail-subject text-sm truncate ${!mail.read ? 'font-medium' : 'text-muted-foreground'}`}>{mail.subject}</p>
                    <p className="text-xs text-muted-foreground truncate">{mail.preview}</p>
                    <div className="flex gap-1 mt-1">
                      {!mail.read ? <Badge variant="default" className="text-[10px] px-1.5 py-0">New</Badge> : null}
                      {mail.starred ? <Badge variant="outline" className="text-[10px] px-1.5 py-0">Starred</Badge> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Mail detail (right panel) */}
            <div className="w-3/5 overflow-y-auto">
              {selectedMail() ? (
                <div className="mail-detail p-4 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="mail-detail-subject text-lg font-semibold">{detailSubject()}</h3>
                      <p className="mail-detail-from text-sm text-muted-foreground">From: {detailFrom()}</p>
                      <p className="text-xs text-muted-foreground">{detailDate()}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleToggleRead}
                      >
                        <span className="read-toggle-text">{detailRead() ? 'Mark unread' : 'Mark read'}</span>
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteClick(detailId())}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="mail-body text-sm whitespace-pre-line">{detailBody()}</div>
                </div>
              ) : (
                <div className="mail-empty flex items-center justify-center h-full text-muted-foreground text-sm">
                  Select an email to read
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AlertDialog for delete confirmation — portal from loop context */}
      <AlertDialog open={deleteDialogOpen()} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogOverlay />
        <AlertDialogContent
          ariaLabelledby="delete-mail-title"
          ariaDescribedby="delete-mail-desc"
        >
          <AlertDialogHeader>
            <AlertDialogTitle id="delete-mail-title">Delete Email</AlertDialogTitle>
            <AlertDialogDescription id="delete-mail-desc">
              Are you sure you want to delete this email? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ToastProvider position="bottom-right">
        <Toast variant="success" open={toastOpen()}>
          <div className="flex-1">
            <ToastTitle>Success</ToastTitle>
            <ToastDescription className="toast-message">{toastMessage()}</ToastDescription>
          </div>
          <ToastClose onClick={() => setToastOpen(false)} />
        </Toast>
      </ToastProvider>
    </div>
  )
}
