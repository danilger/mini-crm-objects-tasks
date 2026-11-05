import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { StatusBadge } from '../components/StatusBadge'
import { supabase } from '../lib/supabase'
import type { SiteObject, Task } from '../lib/types'

export function MyTasksPage() {
  const { profile } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [objects, setObjects] = useState<Record<string, SiteObject>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    void (async () => {
      const { data, error: err } = await supabase
        .from('tasks')
        .select('*')
        .eq('assignee_id', profile.id)
        .order('created_at', { ascending: false })
      if (err) {
        setError(err.message)
        return
      }
      const list = (data ?? []) as Task[]
      setTasks(list)
      const objectIds = [...new Set(list.map((t) => t.object_id))]
      if (objectIds.length === 0) return
      const { data: objs } = await supabase.from('objects').select('*').in('id', objectIds)
      const map: Record<string, SiteObject> = {}
      for (const o of (objs ?? []) as SiteObject[]) map[o.id] = o
      setObjects(map)
    })()
  }, [profile])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Мои задачи</h1>
        <p className="text-sm text-stone-600">Только задачи, где вы исполнитель</p>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <ul className="divide-y divide-stone-200 rounded-lg border border-stone-300 bg-white/70">
        {tasks.length === 0 && (
          <li className="px-4 py-6 text-sm text-stone-600">Назначенных задач нет</li>
        )}
        {tasks.map((task) => (
          <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <Link to={`/tasks/${task.id}`} className="font-medium hover:underline">
                {task.title}
              </Link>
              <p className="text-sm text-stone-600">
                {objects[task.object_id]?.title ?? 'Объект'}
              </p>
            </div>
            <StatusBadge status={task.status} />
          </li>
        ))}
      </ul>
    </div>
  )
}
