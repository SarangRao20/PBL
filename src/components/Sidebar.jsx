import { MessageSquare, Upload, Database, BarChart2, LogOut } from 'lucide-react'

const NAV = [
  { id: 'chat',      label: 'Chat',           Icon: MessageSquare, teacherOnly: false },
  { id: 'documents', label: 'My Documents',   Icon: Upload,        teacherOnly: false },
  { id: 'knowledge', label: 'Knowledge Base', Icon: Database,      teacherOnly: true  },
  { id: 'analytics', label: 'Analytics',      Icon: BarChart2,     teacherOnly: true  },
]

export default function Sidebar({ session, active, onNav, onLogout }) {
  const isTeacher = session?.role === 'teacher'
  const initials = (session?.author || 'U')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <aside className="sidebar">
      <div className="sb-header">
        <div className="sb-brand">QModule</div>
        <div className="sb-tagline">Academic Intelligence</div>
      </div>

      <nav className="sb-nav">
        <span className="sb-section-label">Navigation</span>
        {NAV.map(({ id, label, Icon, teacherOnly }) => {
          if (teacherOnly && !isTeacher) return null
          return (
            <button
              key={id}
              className={`nav-item ${active === id ? 'active' : ''}`}
              onClick={() => onNav(id)}
            >
              <Icon size={16} />
              <span>{label}</span>
              {teacherOnly && <span className="nav-badge">Prof</span>}
            </button>
          )
        })}
      </nav>

      <div className="sb-footer">
        <div className="user-card">
          <div className="user-avatar">{initials}</div>
          <div>
            <div className="user-name">{session?.author || 'User'}</div>
            <div className="user-role">{session?.role || '—'}</div>
          </div>
        </div>
        <button className="logout-btn" onClick={onLogout}>
          <LogOut size={15} />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
