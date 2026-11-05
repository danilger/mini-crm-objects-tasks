export type UserRole = 'manager' | 'worker'

export type TaskStatus =
  | 'new'
  | 'in_progress'
  | 'in_review'
  | 'rework'
  | 'accepted'

export type Profile = {
  id: string
  email: string
  full_name: string
  role: UserRole
  created_at: string
}

export type SiteObject = {
  id: string
  title: string
  address: string
  created_by: string
  created_at: string
}

export type Task = {
  id: string
  object_id: string
  title: string
  description: string
  assignee_id: string
  author_id: string
  status: TaskStatus
  created_at: string
}

export type TaskStatusHistory = {
  id: string
  task_id: string
  from_status: TaskStatus | null
  to_status: TaskStatus
  changed_by: string
  comment: string | null
  created_at: string
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  in_review: 'На проверке',
  rework: 'На доработке',
  accepted: 'Принята',
}

export function availableTransitions(
  status: TaskStatus,
  role: UserRole,
  isAssignee: boolean,
): TaskStatus[] {
  if (role === 'worker' && isAssignee) {
    if (status === 'new') return ['in_progress']
    if (status === 'in_progress') return ['in_review']
    if (status === 'rework') return ['in_progress']
  }
  if (role === 'manager') {
    if (status === 'in_review') return ['accepted', 'rework']
  }
  return []
}
