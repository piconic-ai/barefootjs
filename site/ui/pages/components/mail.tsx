/**
 * Mail Reference Page (/components/mail)
 *
 * Block-level composition pattern: Card + Badge + Input + Checkbox +
 * AlertDialog + Toast with dynamic array signals.
 * Compiler stress test for dynamic array manipulation, .map() over signal arrays,
 * state toggles inside loops, AlertDialog from loop context, and derived memos.
 */

import { MailInboxDemo } from '@/components/mail-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  type TocItem,
} from '../../components/shared/docs'
import { getNavLinks } from '../../components/shared/PageNavigation'

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'features', title: 'Features' },
  { id: 'mail-list', title: 'Mail List', branch: 'start' },
  { id: 'detail-panel', title: 'Detail Panel', branch: 'child' },
  { id: 'bulk-actions', title: 'Bulk Actions', branch: 'end' },
]

const previewCode = `"use client"

import { createSignal, createMemo } from '@barefootjs/dom'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { AlertDialog, AlertDialogContent, ... } from '@/components/ui/alert-dialog'
import { ToastProvider, Toast, ... } from '@/components/ui/toast'

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

const initialMails: Mail[] = [
  { id: 1, from: 'Alice Johnson', subject: 'Q4 Planning', ... },
  { id: 2, from: 'Bob Smith', subject: 'Design Review', ... },
  // ...
]

function MailInbox() {
  const [mails, setMails] = createSignal(initialMails)
  const [selectedId, setSelectedId] = createSignal(null)
  const [searchQuery, setSearchQuery] = createSignal('')
  const [deleteDialogOpen, setDeleteDialogOpen] = createSignal(false)

  const filteredMails = createMemo(() =>
    mails().filter(m => m.from.toLowerCase().includes(searchQuery().toLowerCase()))
  )
  const selectedMail = createMemo(() => mails().find(m => m.id === selectedId()))
  const selectedCount = createMemo(() => mails().filter(m => m.selected).length)

  return (
    <div className="w-full max-w-5xl">
      <Card>
        <CardHeader><CardTitle>Inbox</CardTitle></CardHeader>
        <CardContent>
          {/* Toolbar: search, select all, bulk delete */}
          {/* Two-panel: mail list + detail */}
          <div className="flex">
            <div className="w-2/5">
              {filteredMails().map(mail => (
                <div onClick={() => { setSelectedId(mail.id); setMails(...) }}>
                  <Checkbox checked={mail.selected} onCheckedChange={...} />
                  <span>{mail.from}</span>
                  <span>{mail.subject}</span>
                  {!mail.read ? <Badge>New</Badge> : null}
                </div>
              ))}
            </div>
            <div className="w-3/5">
              {selectedMail() ? (
                <div>
                  <h3>{selectedMail().subject}</h3>
                  <Button onClick={() => handleDeleteClick(mail.id)}>Delete</Button>
                  <p>{selectedMail().body}</p>
                </div>
              ) : (
                <div>Select an email to read</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <AlertDialog open={deleteDialogOpen()}>...</AlertDialog>
      <ToastProvider>...</ToastProvider>
    </div>
  )
}`

export function MailRefPage() {
  return (
    <DocPage slug="mail" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Mail"
          description="A mail inbox block combining Card, Badge, Input, Checkbox, AlertDialog, and Toast for dynamic array manipulation, loop-context interactions, and multi-signal reactivity."
          {...getNavLinks('mail')}
        />

        {/* Preview */}
        <Section id="preview" title="Preview">
          <Example title="" code={previewCode}>
            <MailInboxDemo />
          </Example>
        </Section>

        {/* Features */}
        <Section id="features" title="Features">
          <div className="space-y-4">
            <div>
              <h3 id="mail-list" className="text-base font-medium text-foreground mb-2">Mail List</h3>
              <p className="text-sm text-muted-foreground">
                Dynamic mail list rendered with .map() over a signal array.
                Each row includes Checkbox selection, star toggle, and conditional
                Badge for unread status. Search input filters the list reactively.
              </p>
            </div>
            <div>
              <h3 id="detail-panel" className="text-base font-medium text-foreground mb-2">Detail Panel</h3>
              <p className="text-sm text-muted-foreground">
                Conditional rendering shows selected email detail or empty state.
                Includes read/unread toggle and delete with AlertDialog confirmation.
                Tests derived memo (.find) and portal from loop context.
              </p>
            </div>
            <div>
              <h3 id="bulk-actions" className="text-base font-medium text-foreground mb-2">Bulk Actions</h3>
              <p className="text-sm text-muted-foreground">
                Select all checkbox with derived isAllSelected memo. Bulk delete
                removes multiple items from the signal array. Count display shows
                filtered vs total using derived memos.
              </p>
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
