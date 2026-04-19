"use client"

/**
 * AI Chat Interactive Component
 *
 * Client-side chat with SSE streaming responses.
 * Each user message triggers a streaming AI response via /api/ai-chat.
 */

import { createSignal, createEffect } from '@barefootjs/client'

type Message = { id: number; role: 'user' | 'assistant'; content: string }

export function AIChatInteractive() {
  const [messages, setMessages] = createSignal<Message[]>([])
  const [input, setInput] = createSignal('')
  const [streamingText, setStreamingText] = createSignal('')
  const [isStreaming, setIsStreaming] = createSignal(false)

  // Auto-scroll messages container when new messages arrive
  createEffect(() => {
    messages()
    streamingText()
    const el = document.getElementById('chat-messages')
    if (el) el.scrollTop = el.scrollHeight
  })

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming()) return

    setMessages((prev: Message[]) => [...prev, { id: Date.now(), role: 'user', content: trimmed }])
    setInput('')
    setIsStreaming(true)
    setStreamingText('')

    const es = new EventSource(`api/ai-chat?q=${encodeURIComponent(trimmed)}`)

    es.onmessage = (e) => {
      if (e.data === '[DONE]') {
        const final = streamingText()
        setMessages((prev: Message[]) => [...prev, { id: Date.now(), role: 'assistant', content: final }])
        setStreamingText('')
        setIsStreaming(false)
        es.close()
      } else {
        const token = JSON.parse(e.data) as string
        setStreamingText((prev: string) => prev + token)
      }
    }

    es.onerror = () => {
      setIsStreaming(false)
      es.close()
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.isComposing) send(input())
  }

  return (
    <div className="chat-container">
      <div className="chat-messages" id="chat-messages">
        {messages().map((msg: Message) => (
          <div key={msg.id} className={`chat-msg chat-${msg.role}`}>
            <div className="chat-bubble">
              <p>{msg.content}</p>
            </div>
          </div>
        ))}
        {isStreaming() && (
          <div className="chat-msg chat-assistant">
            <div className="chat-bubble">
              <p>{streamingText()}<span className="streaming-cursor">▌</span></p>
            </div>
          </div>
        )}
      </div>

      <div className="chat-input-area">
        <input
          type="text"
          className="chat-input"
          placeholder="Type a message..."
          value={input()}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming()}
        />
        <button
          className="chat-send"
          onClick={() => send(input())}
          disabled={isStreaming()}
        >
          Send
        </button>
      </div>
    </div>
  )
}
