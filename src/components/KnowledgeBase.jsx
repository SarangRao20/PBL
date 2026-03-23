import { useState, useEffect, useMemo } from 'react'
import { Search, RefreshCw, Edit2, Check, Trash2, Folder, Loader, AlertCircle } from 'lucide-react'

export default function KnowledgeBase({ addToast }) {
  const [chunks,   setChunks]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [search,   setSearch]   = useState('')
  const [editId,   setEditId]   = useState(null)
  const [editText, setEditText] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [delId,    setDelId]    = useState(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/knowledge_base', { credentials: 'include' })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setChunks(d.chunks || [])
    } catch (e) {
      setError(e.message)
      addToast('Failed to load knowledge base', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return chunks
    return chunks.filter(c =>
      (c.text_chunk || '').toLowerCase().includes(q) ||
      (c.author    || '').toLowerCase().includes(q) ||
      (c.doc_type  || '').toLowerCase().includes(q)
    )
  }, [chunks, search])

  const grouped = useMemo(() => {
    const g = {}
    filtered.forEach(c => {
      const k = c.doc_type || 'Unknown Source'
      if (!g[k]) g[k] = []
      g[k].push(c)
    })
    return g
  }, [filtered])

  const startEdit = (chunk) => { setEditId(chunk.id); setEditText(chunk.text_chunk || '') }
  const cancelEdit = () => { setEditId(null); setEditText('') }

  const saveChunk = async (id) => {
    setSavingId(id)
    try {
      const r = await fetch(`/api/knowledge_base/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text_chunk: editText })
      })
      if (!r.ok) throw new Error('Save failed')
      addToast('Chunk updated and re-embedded', 'success')
      setEditId(null)
      load()
    } catch (e) {
      addToast('Failed to save chunk', 'error')
    } finally {
      setSavingId(null)
    }
  }

  const deleteChunk = async (id) => {
    if (!window.confirm('Delete this chunk? This cannot be undone.')) return
    setDelId(id)
    try {
      await fetch(`/api/knowledge_base/${id}`, { method: 'DELETE', credentials: 'include' })
      addToast('Chunk deleted', 'info')
      setChunks(prev => prev.filter(c => c.id !== id))
    } catch {
      addToast('Failed to delete chunk', 'error')
    } finally {
      setDelId(null)
    }
  }

  const short = (s, n = 32) => s?.length > n ? s.slice(0, n - 1) + '…' : (s || '')

  // ── Loading ──
  if (loading) return (
    <div className="page active" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Loader size={30} className="spin" color="var(--violet)" />
      <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)', letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 12 }}>
        Loading Knowledge Base
      </p>
    </div>
  )

  // ── Error ──
  if (error) return (
    <div className="page active" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="empty-state">
        <div className="empty-icon-wrap"><AlertCircle size={24} /></div>
        <div className="empty-title">Failed to load</div>
        <div className="empty-sub">{error}</div>
        <button className="btn-secondary" style={{ marginTop: 16 }} onClick={load}>
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    </div>
  )

  return (
    <div className="page active kb-page">
      <div className="page-header">
        <div className="page-title">Knowledge Base Console</div>
        <div className="page-sub">
          {chunks.length} chunks indexed &nbsp;·&nbsp; Edit or delete to refine RAG retrieval
        </div>
      </div>

      <div className="kb-toolbar">
        <div className="search-box">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search chunks, authors, sources…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="btn-secondary" onClick={load}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div className="kb-table-wrap">
        {Object.keys(grouped).length === 0
          ? (
            <div className="empty-state">
              <div className="empty-icon-wrap"><Folder size={24} /></div>
              <div className="empty-title">No chunks found</div>
              <div className="empty-sub">
                {search ? 'No results for your search query.' : 'Upload documents to populate the knowledge base.'}
              </div>
            </div>
          )
          : (
            <table className="kb-table">
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>Source</th>
                  <th style={{ width: '14%' }}>Author</th>
                  <th>Content</th>
                  <th style={{ width: 84, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(grouped).map(([src, srcChunks]) => (
                  <>
                    <tr key={`g-${src}`} className="group-header-row">
                      <td colSpan={4}>
                        <div className="group-header-inner">
                          <Folder size={12} />
                          {short(src, 50)}
                          <span className="group-count">{srcChunks.length} chunks</span>
                        </div>
                      </td>
                    </tr>
                    {srcChunks.map(chunk => (
                      <tr key={chunk.id}>
                        <td>
                          <span className="src-chip" title={src}>{short(src, 22)}</span>
                        </td>
                        <td>
                          <span className="author-text">{chunk.author || '—'}</span>
                        </td>
                        <td>
                          {editId === chunk.id
                            ? (
                              <textarea
                                className="chunk-edit-ta"
                                value={editText}
                                onChange={e => setEditText(e.target.value)}
                              />
                            )
                            : <div className="chunk-text">{chunk.text_chunk}</div>
                          }
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="kb-actions">
                            {editId === chunk.id
                              ? (
                                <>
                                  <button
                                    className="icon-btn save"
                                    onClick={() => saveChunk(chunk.id)}
                                    disabled={savingId === chunk.id}
                                    title="Save"
                                  >
                                    {savingId === chunk.id
                                      ? <Loader size={13} className="spin" />
                                      : <Check size={13} />
                                    }
                                  </button>
                                  <button className="icon-btn" onClick={cancelEdit} title="Cancel">
                                    <X size={13} />
                                  </button>
                                </>
                              )
                              : (
                                <button className="icon-btn" onClick={() => startEdit(chunk)} title="Edit">
                                  <Edit2 size={13} />
                                </button>
                              )
                            }
                            <button
                              className="icon-btn del"
                              onClick={() => deleteChunk(chunk.id)}
                              disabled={delId === chunk.id}
                              title="Delete"
                            >
                              {delId === chunk.id
                                ? <Loader size={13} className="spin" />
                                : <Trash2 size={13} />
                              }
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          )
        }
      </div>
    </div>
  )
}
