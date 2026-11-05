import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { StatusBadge } from '../components/StatusBadge'
import { formatDateTime } from '../lib/format'
import { supabase } from '../lib/supabase'
import {
  STATUS_LABELS,
  availableTransitions,
  type Profile,
  type SiteObject,
  type Task,
  type TaskStatus,
  type TaskStatusHistory,
} from '../lib/types'

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()

  const [task, setTask] = useState<Task | null>(null)
  const [object, setObject] = useState<SiteObject | null>(null)
  const [history, setHistory] = useState<TaskStatusHistory[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [workers, setWorkers] = useState<Profile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editAssignee, setEditAssignee] = useState('')
  const [busy, setBusy] = useState(false)

  const isManager = profile?.role === 'manager'
  const isAssignee = !!profile && task?.assignee_id === profile.id

  const transitions = useMemo(() => {
    if (!task || !profile) return []
    return availableTransitions(task.status, profile.role, isAssignee)
  }, [task, profile, isAssignee])

  async function load() {
    if (!id) return
    const { data: taskRow, error: taskErr } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (taskErr || !taskRow) {
      setError(taskErr?.message || 'Задача не найдена или нет доступа')
      setTask(null)
      return
    }

    const t = taskRow as Task
    setTask(t)
    setEditTitle(t.title)
    setEditDescription(t.description)
    setEditAssignee(t.assignee_id)

    const [{ data: obj }, { data: hist }, { data: profs }] = await Promise.all([
      supabase.from('objects').select('*').eq('id', t.object_id).maybeSingle(),
      supabase
        .from('task_status_history')
        .select('*')
        .eq('task_id', t.id)
        .order('created_at', { ascending: true }),
      supabase.from('profiles').select('*'),
    ])

    setObject((obj as SiteObject | null) ?? null)
    setHistory((hist ?? []) as TaskStatusHistory[])
    const map: Record<string, Profile> = {}
    for (const p of (profs ?? []) as Profile[]) map[p.id] = p
    setProfiles(map)
    setWorkers(((profs ?? []) as Profile[]).filter((p) => p.role === 'worker'))
    setError(null)
  }

  useEffect(() => {
    void load()
  }, [id])

  async function onTransition(next: TaskStatus) {
    if (!task) return
    if (next === 'rework' && !comment.trim()) {
      setError('Для возврата на доработку нужен комментарий')
      return
    }
    setBusy(true)
    const { error: err } = await supabase.rpc('transition_task', {
      p_task_id: task.id,
      p_new_status: next,
      p_comment: comment.trim() || null,
    })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    setComment('')
    await load()
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!task) return
    setBusy(true)
    const { error: err } = await supabase
      .from('tasks')
      .update({
        title: editTitle.trim(),
        description: editDescription.trim(),
        assignee_id: editAssignee,
      })
      .eq('id', task.id)
    setBusy(false)
    if (err) setError(err.message)
    else await load()
  }

  async function onDelete() {
    if (!task || !confirm('Удалить задачу?')) return
    const { error: err } = await supabase.from('tasks').delete().eq('id', task.id)
    if (err) setError(err.message)
    else window.location.href = object ? `/objects/${object.id}` : '/objects'
  }

  if (!task && !error) return <p className="text-stone-600">Загрузка…</p>
  if (!task) return <p className="text-red-700">{error}</p>

  const author = profiles[task.author_id]
  const assignee = profiles[task.assignee_id]

  return (
    <div className="space-y-6">
      <div>
        {object && (
          <Link to={`/objects/${object.id}`} className="text-sm text-stone-600 hover:underline">
            ← {object.title}
          </Link>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-stone-900">{task.title}</h1>
          <StatusBadge status={task.status} />
        </div>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <section className="space-y-2 rounded-lg border border-stone-300 bg-white/70 p-4 text-sm">
        <p>
          <span className="text-stone-500">Объект:</span> {object?.title ?? '—'}
        </p>
        <p>
          <span className="text-stone-500">Автор:</span> {author?.full_name || author?.email || '—'}
        </p>
        <p>
          <span className="text-stone-500">Исполнитель:</span>{' '}
          {assignee?.full_name || assignee?.email || '—'}
        </p>
        <p>
          <span className="text-stone-500">Создана:</span> {formatDateTime(task.created_at)}
        </p>
        <p className="whitespace-pre-wrap text-stone-800">{task.description || 'Без описания'}</p>
      </section>

      {isManager && (
        <form onSubmit={onSave} className="space-y-3 rounded-lg border border-stone-300 bg-white/70 p-4">
          <h2 className="font-medium">Редактирование</h2>
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2"
            required
          />
          <textarea
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2"
            rows={3}
          />
          <select
            value={editAssignee}
            onChange={(e) => setEditAssignee(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2"
          >
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.full_name || w.email}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-stone-900 px-4 py-2 text-white disabled:opacity-60"
            >
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => void onDelete()}
              className="rounded border border-red-300 px-4 py-2 text-red-700"
            >
              Удалить
            </button>
          </div>
        </form>
      )}

      {transitions.length > 0 && (
        <section className="space-y-3 rounded-lg border border-stone-300 bg-white/70 p-4">
          <h2 className="font-medium">Действия</h2>
          {transitions.includes('rework') && (
            <textarea
              placeholder="Комментарий (обязателен для доработки)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-2"
              rows={2}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {transitions.map((next) => (
              <button
                key={next}
                type="button"
                disabled={busy}
                onClick={() => void onTransition(next)}
                className="rounded bg-stone-900 px-4 py-2 text-white disabled:opacity-60"
              >
                → {STATUS_LABELS[next]}
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-medium">История статусов</h2>
        <ul className="divide-y divide-stone-200 rounded-lg border border-stone-300 bg-white/70">
          {history.map((row) => {
            const who = profiles[row.changed_by]
            return (
              <li key={row.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-stone-500">
                    {row.from_status ? STATUS_LABELS[row.from_status] : '—'}
                  </span>
                  <span>→</span>
                  <StatusBadge status={row.to_status} />
                  <span className="text-stone-500">· {formatDateTime(row.created_at)}</span>
                </div>
                <p className="text-stone-700">{who?.full_name || who?.email || row.changed_by}</p>
                {row.comment && <p className="mt-1 text-stone-800">{row.comment}</p>}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
