import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Send, Brain, Zap, BookOpen, Code2, Network,
  ChevronDown, Volume2, VolumeX, Edit3, Check, X
} from 'lucide-react'
import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: true })

const SUGGESTIONS = [
  { Icon: Network,  text: 'Explain cosine similarity in RAG systems' },
  { Icon: Code2,    text: 'How does the embedding pipeline work?' },
  { Icon: BookOpen, text: 'Summarize the key concepts from uploaded docs' },
  { Icon: Zap,      text: 'What algorithms are used in this module?' },
]

// ─── Mermaid ───────────────────────────────────────────────
let mermaidReady = false
function initMermaid() {
  if (mermaidReady || !window.mermaid) return
  window.mermaid.initialize({
    startOnLoad: false, theme: 'dark',
    themeVariables: {
      primaryColor: '#7c3aed', primaryTextColor: '#eef0ff',
      primaryBorderColor: '#7c3aed', lineColor: '#9098c4',
      secondaryColor: '#161a35', tertiaryColor: '#10142b',
      background: '#070916', mainBkg: '#161a35', darkMode: true,
      fontSize: '14px', fontFamily: "'JetBrains Mono', monospace",
    },
    flowchart: { curve: 'basis', useMaxWidth: true, htmlLabels: true },
    sequence:  { useMaxWidth: true, mirrorActors: true },
  })
  mermaidReady = true
}
async function renderMermaid(id, code) {
  initMermaid()
  if (!window.mermaid) return null
  try { const { svg } = await window.mermaid.render(id, code); return svg }
  catch { return null }
}

// ─── Message component ─────────────────────────────────────
function Message({ msg, isTeacher }) {
  const bubbleRef   = useRef(null)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [correcting, setCorrecting]   = useState(false)
  const [corrText, setCorrText]       = useState('')
  const [corrSent, setCorrSent]       = useState(false)
  const [ttsOn, setTtsOn]             = useState(false)

  useEffect(() => {
    if (msg.role !== 'assistant' || !bubbleRef.current) return
    const divs = bubbleRef.current.querySelectorAll('.language-mermaid')
    divs.forEach(async (el, i) => {
      const code = el.textContent.trim()
      const wrap = document.createElement('div')
      wrap.className = 'mermaid-container'
      wrap.innerHTML = '<div style="text-align:center;padding:20px;font-family:var(--mono);font-size:11px;color:var(--t3);">Rendering diagram…</div>'
      el.parentNode?.replaceChild(wrap, el)
      const svg = await renderMermaid(`merm-${msg.id}-${i}-${Date.now()}`, code)
      wrap.innerHTML = svg
        ? svg
        : '<p style="color:var(--rose);font-size:12px;font-family:var(--mono);padding:10px">Diagram syntax error</p>'
    })
  }, [msg])

  const handleTTS = () => {
    if (ttsOn) { window.speechSynthesis?.cancel(); setTtsOn(false); return }
    if (!('speechSynthesis' in window)) return
    const clean = msg.content
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_~#]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    const utt = new SpeechSynthesisUtterance(clean)
    utt.rate = 0.92; utt.pitch = 1; utt.volume = 1
    utt.onend = () => setTtsOn(false)
    window.speechSynthesis.speak(utt)
    setTtsOn(true)
  }

  const submitCorrection = async () => {
    if (!corrText.trim()) return
    await fetch('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message_id: msg.id, type: -1, correction_text: corrText, context: 'self_correcting_loop' })
    })
    setCorrSent(true)
    setCorrecting(false)
    setCorrText('')
  }

  const scoreClass = s => s >= 75 ? 'high' : s >= 50 ? 'med' : 'low'

  // ── User message ──
  if (msg.role === 'user') {
    return (
      <div className="message user">
        <div className="msg-header">
          <div className="msg-avatar" style={{ background: 'var(--raised)', color: 'var(--t2)' }}>U</div>
          <span className="msg-sender">You</span>
        </div>
        <div className="msg-bubble">{msg.content}</div>
      </div>
    )
  }

  // ── Typing indicator ──
  if (msg.typing) {
    return (
      <div className="message assistant">
        <div className="msg-header">
          <div className="msg-avatar" style={{ background: 'linear-gradient(135deg,var(--violet),var(--indigo))', color: '#fff' }}>AI</div>
          <span className="msg-sender">Research Assistant</span>
        </div>
        <div className="typing-bubble">
          <div className="t-dot"/><div className="t-dot"/><div className="t-dot"/>
        </div>
      </div>
    )
  }

  // ── Assistant message ──
  return (
    <div className="message assistant">
      <div className="msg-header">
        <div className="msg-avatar" style={{ background: 'linear-gradient(135deg,var(--violet),var(--indigo))', color: '#fff', boxShadow: '0 4px 12px rgba(124,58,237,0.4)' }}>AI</div>
        <span className="msg-sender">Research Assistant</span>
      </div>
      <div className="msg-bubble">
        {/* Markdown content */}
        <div ref={bubbleRef} dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) }} />

        {/* Sources */}
        {msg.sources?.length > 0 && (
          <div className="sources-panel">
            <button
              className={`sources-btn ${sourcesOpen ? 'open' : ''}`}
              onClick={() => setSourcesOpen(o => !o)}
            >
              <ChevronDown size={12} />
              {sourcesOpen ? 'Hide' : 'Show'} sources ({msg.sources.length})
            </button>
            {sourcesOpen && (
              <div className="sources-list">
                {msg.sources.map((s, i) => (
                  <div key={i} className="source-item">
                    <div className="source-meta">
                      <span className="source-label">
                        Source [{i + 1}]{s.doc_type ? ` — ${s.doc_type}` : ''}
                      </span>
                      <span className={`source-score ${scoreClass(s.score)}`}>
                        {s.score.toFixed(1)}% match
                      </span>
                    </div>
                    <div className="source-text">
                      "{(s.text || '').substring(0, 200)}…"
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action row */}
        <div className="msg-actions">
          <button className={`act-btn ${ttsOn ? 'active' : ''}`} onClick={handleTTS}>
            {ttsOn ? <VolumeX size={12} /> : <Volume2 size={12} />}
            {ttsOn ? 'Stop' : 'Listen'}
          </button>

          {isTeacher && msg.id && !corrSent && (
            <button className={`act-btn ${correcting ? 'active' : ''}`} onClick={() => setCorrecting(c => !c)}>
              <Edit3 size={12} /> Refine Answer
            </button>
          )}

          {corrSent && (
            <span className="refined-tag">
              <Check size={13} /> Refinement submitted
            </span>
          )}
        </div>

        {/* Correction form */}
        {correcting && (
          <div className="correction-wrap">
            <textarea
              className="correction-ta"
              rows={3}
              placeholder="Provide your expert correction or enhancement for the knowledge base…"
              value={corrText}
              onChange={e => setCorrText(e.target.value)}
            />
            <div className="correction-actions">
              <button className="btn-submit" onClick={submitCorrection}>
                <Check size={13} /> Submit Refinement
              </button>
              <button className="btn-cancel" onClick={() => setCorrecting(false)}>
                <X size={13} /> Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Chat ──────────────────────────────────────────────
export default function Chat({ session, addToast }) {
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef  = useRef(null)
  const taRef      = useRef(null)
  const isTeacher  = session?.role === 'teacher'

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const autoResize = () => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'
  }

  const send = useCallback(async (text) => {
    const q = (text || input).trim()
    if (!q || loading) return

    setInput('')
    if (taRef.current) taRef.current.style.height = 'auto'
    setLoading(true)

    const uid   = Date.now()
    const typId = uid + 1
    setMessages(prev => [
      ...prev,
      { role: 'user',      content: q,   id: uid  },
      { role: 'assistant', typing: true,  id: typId },
    ])

    try {
      const r = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ question: q })
      })
      const data = await r.json()

      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== typId)
        if (data.error) {
          return [...filtered, { role: 'assistant', content: `**Error:** ${data.error}`, id: uid + 2 }]
        }
        return [...filtered, {
          role: 'assistant',
          content: data.answer,
          sources: data.sources || [],
          id: data.message_id || uid + 2,
        }]
      })
    } catch {
      setMessages(prev => prev.filter(m => m.id !== typId).concat({
        role: 'assistant',
        content: '**Network error.** Could not reach the server. Please try again.',
        id: uid + 2,
      }))
      addToast('Connection failed — please retry', 'error')
    } finally {
      setLoading(false)
    }
  }, [input, loading, addToast])

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div className="page active chat-page">
      <div className="chat-messages">
        <div className="chat-messages-inner">
          {/* Welcome state */}
          {messages.length === 0 && (
            <div className="welcome-state">
              <div className="welcome-icon-wrap"><Brain size={32} /></div>
              <div className="welcome-title">Ready for Research</div>
              <div className="welcome-sub">
                Ask anything grounded in your uploaded knowledge base.
                I'll retrieve the most relevant content and generate a precise, accurate answer.
              </div>
              <div className="chips-row">
                {SUGGESTIONS.map(({ Icon, text }) => (
                  <div key={text} className="chip" onClick={() => send(text)}>
                    <Icon size={14} />
                    {text}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, i) => (
            <Message key={msg.id || i} msg={msg} isTeacher={isTeacher} />
          ))}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="chat-input-section">
        <div className="chat-input-inner">
          <div className="input-shell">
            <textarea
              ref={taRef}
              className="chat-textarea"
              rows={1}
              placeholder="Ask a research question…"
              value={input}
              onChange={e => { setInput(e.target.value); autoResize() }}
              onKeyDown={handleKey}
              disabled={loading}
            />
            <button
              className="send-btn"
              onClick={() => send()}
              disabled={!input.trim() || loading}
            >
              <Send size={17} />
            </button>
          </div>
          <p className="input-hint">
            Enter to send &nbsp;·&nbsp; Shift+Enter for new line &nbsp;·&nbsp; Answers grounded in your knowledge base
          </p>
        </div>
      </div>
    </div>
  )
}
