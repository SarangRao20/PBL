import { CheckCircle, XCircle, Info } from 'lucide-react'

const ICONS = { success: CheckCircle, error: XCircle, info: Info }

export default function Toast({ toasts }) {
  return (
    <div className="toast-area">
      {toasts.map(t => {
        const Icon = ICONS[t.type] || Info
        return (
          <div key={t.id} className={`toast ${t.type}`}>
            <Icon size={15} />
            <span>{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}
