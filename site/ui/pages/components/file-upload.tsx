/**
 * File Upload Reference Page (/components/file-upload)
 */

import { FileUploadDemo } from '@/components/file-upload-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  type TocItem,
} from '../../components/shared/docs'

const previewCode = `"use client"

import { createSignal, createMemo, createEffect, onCleanup } from '@barefootjs/dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

export function FileUpload() {
  const [files, setFiles] = createSignal([])

  // Upload simulation with effect cleanup
  createEffect(() => {
    const uploading = files().filter(f => f.status === 'uploading')
    if (uploading.length === 0) return

    const timer = setInterval(() => {
      setFiles(prev => prev.map(f =>
        f.status === 'uploading'
          ? { ...f, progress: Math.min(100, f.progress + 10) }
          : f
      ))
    }, 200)

    onCleanup(() => clearInterval(timer))
  })

  return (
    <div>
      <Button onClick={addFiles}>Add Files</Button>
      {files().map(file => (
        <Card key={file.id}>
          <CardContent>
            <span>{file.name}</span>
            <Badge>{file.status}</Badge>
            {file.status === 'uploading'
              ? <Progress value={file.progress} />
              : null}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}`

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'features', title: 'Features' },
  { id: 'upload', title: 'Upload Simulation', branch: 'start' },
  { id: 'cleanup', title: 'Effect Cleanup', branch: 'end' },
]

export function FileUploadRefPage() {
  return (
    <DocPage slug="file-upload" toc={tocItems}>
      <PageHeader
        title="File Upload"
        description="File upload manager with drag & drop, progress simulation, and effect cleanup."
      />

      <Section id="preview" title="Preview">
        <Example code={previewCode}>
          <FileUploadDemo />
        </Example>
      </Section>

      <Section id="features" title="Features">
        <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
          <li>Drag & drop zone with isDragging signal-driven class toggle</li>
          <li>Per-file upload progress simulation with interval timer</li>
          <li>onCleanup for interval cleanup on effect re-run</li>
          <li>Per-item status badges (pending/uploading/done/error)</li>
          <li>Computed stats from array signal (total size, completed count)</li>
          <li>Conditional rendering per status (progress bar, error message, action buttons)</li>
          <li>Toast notification on upload completion</li>
        </ul>
      </Section>

      <Section id="upload" title="Upload Simulation">
        <p className="text-sm text-muted-foreground">
          Upload progress is simulated with <code>setInterval</code> inside a <code>createEffect</code>.
          Each tick increments the progress of all uploading files. Files randomly fail (20% chance) to test error states.
        </p>
      </Section>

      <Section id="cleanup" title="Effect Cleanup">
        <p className="text-sm text-muted-foreground">
          <code>onCleanup(() =&gt; clearInterval(timer))</code> ensures the interval is cleared
          when the effect re-runs (new files start uploading) or when all uploads complete.
        </p>
      </Section>
    </DocPage>
  )
}
