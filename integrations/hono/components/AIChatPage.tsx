/**
 * AI Chat Page — SSE Streaming Example
 *
 * Interactive AI chat with token-by-token streaming responses via Server-Sent Events.
 */

import { AIChatInteractive } from '@/components/AIChatInteractive'

export function AIChatPage() {
  return (
    <div>
      <h1>AI Chat — SSE Streaming</h1>
      <p className="demo-notice">
        Demo only — responses are dummy content streamed via SSE.
        Replace <code>/api/ai-chat</code> in <code>server.tsx</code> with a real LLM API.
      </p>
      <AIChatInteractive />
      <p><a href="/">← Back</a></p>
    </div>
  )
}
