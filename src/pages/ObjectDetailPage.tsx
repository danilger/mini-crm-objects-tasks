import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { StatusBadge } from '../components/StatusBadge'
import { supabase } from '../lib/supabase'
import type { Profile, SiteObject, Task } from '../lib/types'

export function ObjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const isManager = profile?.role === 'manager'

  const [object, setObject] = useState<SiteObject | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [workers, setWorkers] = useState<Profile[]>([])
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [address, setAddress] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [assigneeId, setAssigneeId] = useState('')

  async function load() {
    if (!id) return
    const [{ data: obj, error: objErr }, { data: taskRows, error: taskErr }] = await Promise.all([
      supabase.from('objects').select('*').eq('id', id).maybeSingle(),
      supabase.from('tasks').select('*').eq('object_id', id).order('created_at', { ascending: false }),
    ])
    if (objErr || taskErr) {
      setError(objErr?.message || taskErr?.message || 'Ошибка загрузки')
      return
    }
    setError(null)
    setObject(obj as SiteObject | null)
    setTitle((obj as SiteObject | null)?.title ?? '')
    setAddress((obj as SiteObject | null)?.address ?? '')
    setTasks((taskRows ?? []) as Task[])
  }

  useEffect(() => {
    void load()
  }, [id])

  useEffect(() => {
    if (!isManager) return
    void supabase
      .from('profiles')
      .select('*')
      .eq('role', 'worker')
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        else {
          const list = (data ?? []) as Profile[]
          setWorkers(list)
          if (list[0]) setAssigneeId(list[0].id)
        }
      })
  }, [isManager])

  async function onSaveObject(e: FormEvent) {
    e.preventDefault()
    if (!id) return
    const { error: err } = await supabase
      .from('objects')
      .update({ title: title.trim(), address: address.trim() })
      .eq('id', id)
    if (err) setError(err.message)
    else await load()
  }

  async function onCreateTask(e: FormEvent) {
    e.preventDefault()
    if (!id || !profile) return
    const { error: err } = await supabase.from('tasks').insert({
      object_id: id,
      title: taskTitle.trim(),
      description: taskDescription.trim(),
      assignee_id: assigneeId,
      author_id: profile.id,
      status: 'new',
    })
    if (err) {
      setError(err.message)
      return
    }
    setTaskTitle('')
    setTaskDescription('')
    await load()
  }

  if (!object && !error) {
    return <p className="text-stone-600">Загрузка…</p>
  }

  if (!object) {
    return <p className="text-red-700">{error || 'Объект не найден или нет доступа'}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/objects" className="text-sm text-stone-600 hover:underline">
          ← К объектам
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-stone-900">{object.title}</h1>
        <p className="text-stone-600">{object.address}</p>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {isManager && (
        <form
          onSubmit={onSaveObject}
          className="grid gap-3 rounded-lg border border-stone-300 bg-white/70 p-4 md:grid-cols-[1fr_1fr_auto]"
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded border border-stone-300 px-3 py-2"
            required
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="rounded border border-stone-300 px-3 py-2"
            required
          />
          <button type="submit" className="rounded bg-stone-900 px-4 py-2 text-white">
            Сохранить
          </button>
        </form>
      )}

      {isManager && (
        <form
          onSubmit={onCreateTask}
          className="space-y-3 rounded-lg border border-stone-300 bg-white/70 p-4"
        >
          <h2 className="font-medium text-stone-900">Новая задача</h2>
          <input
            required
            placeholder="Название"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
          <textarea
            placeholder="Описание"
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2"
            rows={3}
          />
          <select
            required
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2"
          >
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.full_name || w.email}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded bg-stone-900 px-4 py-2 text-white">
            Создать задачу
          </button>
        </form>
      )}

      <section>
        <h2 className="mb-3 font-medium text-stone-900">Задачи</h2>
        <ul className="divide-y divide-stone-200 rounded-lg border border-stone-300 bg-white/70">
          {tasks.length === 0 && (
            <li className="px-4 py-6 text-sm text-stone-600">Задач пока нет</li>
          )}
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <Link to={`/tasks/${task.id}`} className="font-medium hover:underline">
                {task.title}
              </Link>
              <StatusBadge status={task.status} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
