import { useState, useEffect, useRef } from 'react'
import { MessageSquare, Users, Database, TrendingUp, RefreshCw, Loader, BarChart2 } from 'lucide-react'

async function loadChartJS() {
  if (window.Chart) return window.Chart
  return new Promise(resolve => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js'
    s.onload = () => resolve(window.Chart)
    document.head.appendChild(s)
  })
}

const PALETTE = ['#7c3aed', '#0fb8d0', '#e8b84b', '#10b981', '#f43f5e', '#a78bfa', '#f97316']

export default function Analytics({ addToast }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const kbRef  = useRef(null)
  const actRef = useRef(null)
  const kbInst  = useRef(null)
  const actInst = useRef(null)

  const fetch_ = async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/analytics', { credentials: 'include' })
      if (!r.ok) throw new Error('Unauthorized or server error')
      const d = await r.json()
      setData(d)
    } catch (e) {
      setError(e.message)
      addToast('Failed to load analytics', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetch_() }, [])

  useEffect(() => {
    if (!data) return
    loadChartJS().then(Chart => {
      kbInst.current?.destroy()
      actInst.current?.destroy()

      const gridColor  = 'rgba(255,255,255,0.03)'
      const tickColor  = '#4a5080'
      const tickFont   = { family: 'JetBrains Mono', size: 10 }
      const legendFont = { family: 'JetBrains Mono', size: 10 }

      // KB Doughnut
      if (kbRef.current) {
        const labels = Object.keys(data.kb_composition || {})
        const values = Object.values(data.kb_composition || {})
        kbInst.current = new Chart(kbRef.current, {
          type: 'doughnut',
          data: {
            labels,
            datasets: [{
              data: values,
              backgroundColor: PALETTE.slice(0, labels.length),
              borderColor: '#10142b',
              borderWidth: 3,
              hoverOffset: 7,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
              legend: {
                position: 'bottom',
                labels: { color: '#9098c4', font: legendFont, padding: 14, boxWidth: 10 }
              }
            }
          }
        })
      }

      // Activity Line
      if (actRef.current) {
        const labels = Object.keys(data.activity || {}).reverse()
        const values = Object.values(data.activity || {}).reverse()
        actInst.current = new Chart(actRef.current, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'Queries',
              data: values,
              borderColor: '#7c3aed',
              backgroundColor: 'rgba(124,58,237,0.1)',
              fill: true, tension: 0.4,
              pointBackgroundColor: '#7c3aed',
              pointRadius: 4, pointHoverRadius: 7,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { ticks: { color: tickColor, font: tickFont }, grid: { color: gridColor }, border: { color: 'transparent' } },
              x: { ticks: { color: tickColor, font: tickFont }, grid: { display: false }, border: { color: 'transparent' } },
            }
          }
        })
      }
    })

    return () => { kbInst.current?.destroy(); actInst.current?.destroy() }
  }, [data])

  if (loading) return (
    <div className="page active" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Loader size={30} className="spin" color="var(--violet)" />
      <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)', letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 12 }}>
        Loading Analytics
      </p>
    </div>
  )

  if (error) return (
    <div className="page active" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="empty-state">
        <div className="empty-icon-wrap"><BarChart2 size={24} /></div>
        <div className="empty-title">Analytics unavailable</div>
        <div className="empty-sub">{error}</div>
        <button className="btn-secondary" style={{ marginTop: 16 }} onClick={fetch_}>
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    </div>
  )

  const kbTotal  = Object.values(data?.kb_composition || {}).reduce((a, b) => a + b, 0)
  const q7Total  = Object.values(data?.activity || {}).reduce((a, b) => a + b, 0)
  const contribs = Object.entries(data?.top_authors || {})
  const contribMax = Math.max(...contribs.map(([,v]) => v), 1)

  const STATS = [
    { Icon: MessageSquare, value: data?.total_messages ?? 0,  label: 'Total Messages' },
    { Icon: Users,         value: data?.total_sessions ?? 0,  label: 'Sessions'       },
    { Icon: Database,      value: kbTotal,                    label: 'KB Chunks'      },
    { Icon: TrendingUp,    value: q7Total,                    label: 'Queries (7d)',  gold: true },
  ]

  return (
    <div className="page active" style={{ flexDirection: 'column' }}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div className="page-title">Research Analytics</div>
            <div className="page-sub">Knowledge distribution, query activity, session insights</div>
          </div>
          <button className="btn-secondary" onClick={fetch_} style={{ marginTop: 2 }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      <div className="analytics-scroll">
        {/* Stats */}
        <div className="stats-grid">
          {STATS.map(({ Icon, value, label, gold }) => (
            <div className="stat-card" key={label}>
              <div className="stat-icon" style={gold ? { background: 'var(--gold-d)', borderColor: 'rgba(232,184,75,0.25)' } : {}}>
                <Icon size={16} color={gold ? 'var(--gold)' : 'var(--violet)'} />
              </div>
              <div className="stat-value">{value.toLocaleString()}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="charts-grid">
          <div className="chart-card">
            <div className="chart-title">Knowledge Distribution</div>
            <div className="chart-sub">Chunks by document type</div>
            <div style={{ height: 220, position: 'relative' }}>
              <canvas ref={kbRef} />
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-title">Research Activity</div>
            <div className="chart-sub">Queries per day, last 7 days</div>
            <div style={{ height: 220, position: 'relative' }}>
              <canvas ref={actRef} />
            </div>
          </div>

          {/* Top contributors */}
          {contribs.length > 0 && (
            <div className="chart-card wide">
              <div className="chart-title">Top Contributors</div>
              <div className="chart-sub">Authors ranked by knowledge base chunks</div>
              {contribs.map(([name, count], i) => (
                <div key={name} className="contrib-row">
                  <span className="contrib-rank">#{i + 1}</span>
                  <span className="contrib-name" title={name}>{name}</span>
                  <div className="contrib-track">
                    <div
                      className="contrib-bar"
                      style={{ width: `${Math.round(count / contribMax * 100)}%` }}
                    />
                  </div>
                  <span className="contrib-val">{count}</span>
                </div>
              ))}
            </div>
          )}

          {/* Sessions by role */}
          {data?.sessions_by_role && Object.keys(data.sessions_by_role).length > 0 && (
            <div className="chart-card wide">
              <div className="chart-title">Session Breakdown by Role</div>
              <div className="chart-sub">Distribution across access levels</div>
              <div className="role-split">
                {Object.entries(data.sessions_by_role).map(([role, count]) => (
                  <div key={role} className="role-box">
                    <div className={`role-number ${role}`}>{count}</div>
                    <div className="role-label">{role}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
