import { STATUS_LABELS, type TaskStatus } from '../lib/types'

const COLORS: Record<TaskStatus, string> = {
  new: 'bg-slate-200 text-slate-800',
  in_progress: 'bg-amber-100 text-amber-900',
  in_review: 'bg-sky-100 text-sky-900',
  rework: 'bg-orange-100 text-orange-900',
  accepted: 'bg-emerald-100 text-emerald-900',
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}
