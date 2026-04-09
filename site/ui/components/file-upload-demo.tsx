"use client"
/**
 * FileUploadDemo
 *
 * File upload manager with drag & drop, upload progress simulation,
 * and preview dialog.
 *
 * Compiler stress targets:
 * - onCleanup for interval timers (upload progress simulation)
 * - Dynamic list with per-item status updates (pending → uploading → done/error)
 * - Conditional rendering from enum state (status-based UI)
 * - Drag state signal → dynamic class toggle
 * - Computed stats from array signal (totalSize, completedCount)
 * - Toast for completion notification
 */

import { createSignal, createMemo, createEffect, onCleanup } from '@barefootjs/dom'
import { Card, CardContent } from '@ui/components/ui/card'
import { Badge } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'
import { Progress } from '@ui/components/ui/progress'
import { Separator } from '@ui/components/ui/separator'
import { ToastProvider, Toast, ToastTitle, ToastDescription, ToastClose } from '@ui/components/ui/toast'

// --- Types ---

type FileStatus = 'pending' | 'uploading' | 'done' | 'error'

type FileItem = {
  id: number
  name: string
  size: number
  type: string
  status: FileStatus
  progress: number
  error: string | null
}

// --- Helpers ---

let nextId = 1

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(type: string): string {
  if (type.startsWith('image/')) return '🖼️'
  if (type.startsWith('video/')) return '🎬'
  if (type.startsWith('audio/')) return '🎵'
  if (type.includes('pdf')) return '📄'
  if (type.includes('zip') || type.includes('tar')) return '📦'
  return '📎'
}

function typeBadgeVariant(type: string): 'default' | 'secondary' | 'outline' {
  if (type.startsWith('image/')) return 'default'
  if (type.includes('pdf')) return 'secondary'
  return 'outline'
}

const statusBadge = {
  pending: { variant: 'outline' as const, label: 'Pending' },
  uploading: { variant: 'default' as const, label: 'Uploading' },
  done: { variant: 'default' as const, label: 'Done' },
  error: { variant: 'destructive' as const, label: 'Failed' },
}

// Sample files for demo (simulated — no real file access)
const sampleFiles: Array<{ name: string; size: number; type: string }> = [
  { name: 'photo-vacation.jpg', size: 2_400_000, type: 'image/jpeg' },
  { name: 'presentation.pdf', size: 1_800_000, type: 'application/pdf' },
  { name: 'song.mp3', size: 5_200_000, type: 'audio/mpeg' },
  { name: 'data-export.csv', size: 340_000, type: 'text/csv' },
  { name: 'archive.zip', size: 8_100_000, type: 'application/zip' },
]

// --- Component ---

export function FileUploadDemo() {
  const [files, setFiles] = createSignal<FileItem[]>([])
  const [isDragging, setIsDragging] = createSignal(false)
  const [toastOpen, setToastOpen] = createSignal(false)
  const [toastMessage, setToastMessage] = createSignal('')
  const [toastVariant, setToastVariant] = createSignal<'default' | 'error'>('default')

  // Computed stats from array signal
  const totalSize = createMemo(() => files().reduce((s, f) => s + f.size, 0))
  const completedCount = createMemo(() => files().filter(f => f.status === 'done').length)
  const errorCount = createMemo(() => files().filter(f => f.status === 'error').length)
  const uploadingCount = createMemo(() => files().filter(f => f.status === 'uploading').length)
  const pendingCount = createMemo(() => files().filter(f => f.status === 'pending').length)

  // Upload simulation with onCleanup
  createEffect(() => {
    const uploading = files().filter(f => f.status === 'uploading')
    if (uploading.length === 0) return

    const timer = setInterval(() => {
      setFiles(prev => {
        let anyChanged = false
        const updated = prev.map(f => {
          if (f.status !== 'uploading') return f
          anyChanged = true
          const newProgress = Math.min(100, f.progress + Math.floor(Math.random() * 15) + 5)
          if (newProgress >= 100) {
            // 20% chance of failure for demo purposes
            const failed = f.id % 5 === 0
            if (failed) {
              return { ...f, status: 'error' as FileStatus, progress: 0, error: 'Network timeout' }
            }
            return { ...f, status: 'done' as FileStatus, progress: 100 }
          }
          return { ...f, progress: newProgress }
        })
        return anyChanged ? updated : prev
      })
    }, 200)

    // onCleanup: clear interval when effect re-runs or component unmounts
    onCleanup(() => clearInterval(timer))
  })

  // Toast when all uploads complete
  createEffect(() => {
    const total = files().length
    if (total === 0) return
    const done = completedCount()
    const errors = errorCount()
    if (done + errors === total && uploadingCount() === 0 && pendingCount() === 0) {
      if (errors > 0) {
        setToastMessage(`${done} uploaded, ${errors} failed`)
        setToastVariant('error')
      } else {
        setToastMessage(`All ${done} files uploaded successfully`)
        setToastVariant('default')
      }
      setToastOpen(true)
    }
  })

  // Handlers
  const addFiles = (newFiles: Array<{ name: string; size: number; type: string }>) => {
    const items: FileItem[] = newFiles.map(f => ({
      id: nextId++,
      name: f.name,
      size: f.size,
      type: f.type,
      status: 'pending' as FileStatus,
      progress: 0,
      error: null,
    }))
    setFiles(prev => [...prev, ...items])
  }

  const addSampleFiles = () => {
    addFiles(sampleFiles)
  }

  const startUpload = (fileId: number) => {
    setFiles(prev => prev.map(f => f.id === fileId && f.status === 'pending' ? { ...f, status: 'uploading' as FileStatus } : f))
  }

  const startAll = () => {
    setFiles(prev => prev.map(f => f.status === 'pending' ? { ...f, status: 'uploading' as FileStatus } : f))
  }

  const retryFile = (fileId: number) => {
    setFiles(prev => prev.map(f => f.id === fileId && f.status === 'error' ? { ...f, status: 'uploading' as FileStatus, progress: 0, error: null } : f))
  }

  const removeFile = (fileId: number) => {
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }

  const clearCompleted = () => {
    setFiles(prev => prev.filter(f => f.status !== 'done'))
  }

  const clearAll = () => {
    setFiles([])
  }

  return (
    <div className="upload-page w-full max-w-3xl mx-auto space-y-6">

      {/* Drop Zone — drag state signal → class toggle */}
      <div
        className={isDragging()
          ? 'drop-zone border-2 border-dashed border-primary bg-primary/5 rounded-lg p-8 text-center transition-colors'
          : 'drop-zone border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center transition-colors'}
        onDragOver={(e: DragEvent) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e: DragEvent) => { e.preventDefault(); setIsDragging(false); addSampleFiles() }}
      >
        <div className="text-4xl mb-2">📁</div>
        <p className="text-sm font-medium">{isDragging() ? 'Drop files here' : 'Drag & drop files here'}</p>
        <p className="text-xs text-muted-foreground mt-1">or click the button below</p>
        <Button variant="outline" size="sm" className="add-files-btn mt-3" onClick={addSampleFiles}>
          Add Sample Files
        </Button>
      </div>

      {/* Stats Bar — computed from array signal */}
      {files().length > 0 ? (
        <div className="stats-bar flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="file-count">{files().length} files</span>
          <Separator orientation="vertical" decorative className="h-4" />
          <span className="total-size">{formatSize(totalSize())}</span>
          <Separator orientation="vertical" decorative className="h-4" />
          <span className="completed-count">{completedCount()} completed</span>
          {errorCount() > 0 ? (
            <Badge variant="destructive" className="error-count">{errorCount()} failed</Badge>
          ) : null}
        </div>
      ) : null}

      {/* Upload Controls */}
      {files().length > 0 ? (
        <div className="upload-controls flex gap-2">
          <Button size="sm" className="start-all-btn" onClick={startAll} disabled={pendingCount() === 0}>
            Start All
          </Button>
          <Button variant="outline" size="sm" className="clear-completed-btn" onClick={clearCompleted} disabled={completedCount() === 0}>
            Clear Completed
          </Button>
          <Button variant="outline" size="sm" className="clear-all-btn" onClick={clearAll}>
            Clear All
          </Button>
        </div>
      ) : null}

      {/* File List — per-item status with conditional rendering */}
      <div className="file-list space-y-2">
        {files().map(file => (
          <Card key={file.id} className="file-item">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{fileIcon(file.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="file-name text-sm font-medium truncate">{file.name}</p>
                    <Badge variant={typeBadgeVariant(file.type)} className="type-badge text-xs shrink-0">
                      {file.type.split('/')[1]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="file-size text-xs text-muted-foreground">{formatSize(file.size)}</span>
                    <Badge variant={statusBadge[file.status].variant} className="status-badge text-xs">
                      {statusBadge[file.status].label}
                    </Badge>
                  </div>
                  {/* Conditional: show progress bar only when uploading */}
                  {file.status === 'uploading' ? (
                    <Progress value={file.progress} max={100} className="file-progress mt-2 h-1.5" />
                  ) : null}
                  {/* Conditional: show error message */}
                  {file.status === 'error' ? (
                    <p className="file-error text-xs text-destructive mt-1">{file.error}</p>
                  ) : null}
                </div>
                <div className="flex gap-1 shrink-0">
                  {file.status === 'pending' ? (
                    <Button variant="outline" size="sm" className="start-btn h-7 text-xs" onClick={() => startUpload(file.id)}>Start</Button>
                  ) : null}
                  {file.status === 'error' ? (
                    <Button variant="outline" size="sm" className="retry-btn h-7 text-xs" onClick={() => retryFile(file.id)}>Retry</Button>
                  ) : null}
                  {file.status !== 'uploading' ? (
                    <Button variant="ghost" size="sm" className="remove-btn h-7 text-xs text-destructive" onClick={() => removeFile(file.id)}>×</Button>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty state */}
      {files().length === 0 ? (
        <p className="empty-state text-center text-sm text-muted-foreground py-4">
          No files added yet. Drop files or click "Add Sample Files" to get started.
        </p>
      ) : null}

      {/* Toast */}
      <ToastProvider position="bottom-right">
        <Toast open={toastOpen()} onOpenChange={setToastOpen} variant={toastVariant()} duration={4000}>
          <ToastTitle>Upload Complete</ToastTitle>
          <ToastDescription>{toastMessage()}</ToastDescription>
          <ToastClose />
        </Toast>
      </ToastProvider>
    </div>
  )
}
