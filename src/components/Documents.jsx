import { useState, useRef, useCallback } from 'react'
import { FileText, Link, Upload, Check, AlertCircle, Loader, X } from 'lucide-react'

function useJobPoller(addToast) {
  const pollRef = useRef(null)

  const poll = useCallback((jobId, { onProgress, onDone, onFail }) => {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/job/${jobId}`, { credentials: 'include' })
        const d = await r.json()
        if (d.error) { clearInterval(pollRef.current); onFail?.('Error tracking job'); return }
        onProgress?.(d.progress || 0, d.message || 'Processing…')
        if (d.status === 'completed') { clearInterval(pollRef.current); onDone?.() }
        else if (d.status === 'failed') { clearInterval(pollRef.current); onFail?.(d.message || 'Failed') }
      } catch { clearInterval(pollRef.current) }
    }, 1000)
  }, [])

  return poll
}

// ── Progress bar ──────────────────────────────────────────
function ProgressBar({ progress, message }) {
  return (
    <div className="progress-wrap">
      <div className="progress-header">
        <span>{message}</span>
        <span>{progress}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}

// ── Upload card ───────────────────────────────────────────
function UploadCard({ addToast }) {
  const [file, setFile]           = useState(null)
  const [dragging, setDragging]   = useState(false)
  const [job, setJob]             = useState(null)   // { progress, message, status }
  const inputRef  = useRef(null)
  const pollJob   = useJobPoller(addToast)

  const setFileObj = (f) => {
    if (!f) return
    if (!f.name.endsWith('.pdf') && !f.name.endsWith('.txt')) {
      addToast('Only PDF and TXT files are supported', 'error'); return
    }
    setFile(f)
  }

  const clearFile = () => {
    setFile(null)
    if (inputRef.current) inputRef.current.value = ''
    setJob(null)
  }

  const upload = async () => {
    if (!file) return
    const fd = new FormData(); fd.append('document', file)
    setJob({ progress: 0, message: 'Uploading…', status: 'running' })

    try {
      const r = await fetch('/upload', { method: 'POST', body: fd, credentials: 'include' })
      const d = await r.json()
      if (!d.success || !d.job_id) throw new Error(d.error || 'Upload failed')

      pollJob(d.job_id, {
        onProgress: (p, m) => setJob({ progress: p, message: m, status: 'running' }),
        onDone: () => {
          setJob({ progress: 100, message: 'Done!', status: 'completed' })
          addToast('Document indexed successfully!', 'success')
          setTimeout(() => clearFile(), 3000)
        },
        onFail: (msg) => {
          setJob({ progress: 0, message: msg, status: 'failed' })
          addToast(msg, 'error')
        },
      })
    } catch (e) {
      setJob({ progress: 0, message: e.message, status: 'failed' })
      addToast(e.message, 'error')
    }
  }

  const running = job?.status === 'running'

  return (
    <div className="doc-card">
      <div className="doc-card-title">
        <FileText size={17} /> Upload Document
      </div>

      <div
        className={`drop-zone ${dragging ? 'dragging' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); setFileObj(e.dataTransfer.files[0]) }}
        onClick={() => !running && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt"
          style={{ display: 'none' }}
          onChange={e => setFileObj(e.target.files[0])}
        />
        <Upload size={28} color="var(--t3)" />
        <div className="drop-text">{dragging ? 'Drop to upload' : 'Drag & drop or click to select'}</div>
        <div className="drop-hint">PDF, TXT — up to 50 MB</div>
      </div>

      {file && !running && (
        <div className="file-selected-pill">
          <FileText size={13} />
          <span className="file-name">{file.name}</span>
          <span className="file-size">{(file.size / 1024).toFixed(0)} KB</span>
          <button
            onClick={e => { e.stopPropagation(); clearFile() }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 0, marginLeft: 4, display: 'flex' }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {job?.status === 'running' && <ProgressBar progress={job.progress} message={job.message} />}
      {job?.status === 'completed' && (
        <div className="status-msg success"><Check size={14} /> Document indexed successfully</div>
      )}
      {job?.status === 'failed' && (
        <div className="status-msg error"><AlertCircle size={14} /> {job.message}</div>
      )}

      <button className="btn-primary" onClick={upload} disabled={!file || running}>
        {running
          ? <><Loader size={14} className="spin" /> Processing…</>
          : <><Upload size={14} /> Upload & Index</>
        }
      </button>
    </div>
  )
}

// ── Scrape card ───────────────────────────────────────────
function ScrapeCard({ addToast }) {
  const [url, setUrl]   = useState('')
  const [job, setJob]   = useState(null)
  const pollJob = useJobPoller(addToast)

  const scrape = async () => {
    if (!url.trim()) return
    setJob({ progress: 0, message: 'Fetching URL…', status: 'running' })

    try {
      const r = await fetch('/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: url.trim() })
      })
      const d = await r.json()
      if (!d.success || !d.job_id) throw new Error(d.error || 'Scrape failed')

      pollJob(d.job_id, {
        onProgress: (p, m) => setJob({ progress: p, message: m, status: 'running' }),
        onDone: () => {
          setJob({ progress: 100, message: 'Done!', status: 'completed' })
          addToast('URL indexed successfully!', 'success')
          setTimeout(() => { setUrl(''); setJob(null) }, 3000)
        },
        onFail: (msg) => {
          setJob({ progress: 0, message: msg, status: 'failed' })
          addToast(msg, 'error')
        },
      })
    } catch (e) {
      setJob({ progress: 0, message: e.message, status: 'failed' })
      addToast(e.message, 'error')
    }
  }

  const running = job?.status === 'running'

  return (
    <div className="doc-card">
      <div className="doc-card-title">
        <Link size={17} /> Index Web Page
      </div>

      <label className="field-label">URL</label>
      <input
        className="url-input"
        type="url"
        placeholder="https://example.com/article"
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && scrape()}
        disabled={running}
      />

      {job?.status === 'running' && <ProgressBar progress={job.progress} message={job.message} />}
      {job?.status === 'completed' && (
        <div className="status-msg success"><Check size={14} /> URL indexed successfully</div>
      )}
      {job?.status === 'failed' && (
        <div className="status-msg error"><AlertCircle size={14} /> {job.message}</div>
      )}

      <button className="btn-primary" onClick={scrape} disabled={!url.trim() || running}>
        {running
          ? <><Loader size={14} className="spin" /> Indexing…</>
          : <><Link size={14} /> Fetch & Index URL</>
        }
      </button>
    </div>
  )
}

export default function Documents({ session, addToast }) {
  return (
    <div className="page active" style={{ flexDirection: 'column' }}>
      <div className="page-header">
        <div className="page-title">My Documents</div>
        <div className="page-sub">
          Upload PDFs or index web pages into your personal knowledge base.
          {session?.role === 'student'
            ? ' Your uploads are private and only visible to you.'
            : ' Uploads are indexed into the shared knowledge base.'}
        </div>
      </div>
      <div className="docs-scroll">
        <div className="docs-grid">
          <UploadCard addToast={addToast} />
          <ScrapeCard addToast={addToast} />
        </div>
      </div>
    </div>
  )
}
