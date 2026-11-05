import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import type { SiteObject } from '../lib/types'

export function ObjectsPage() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'manager'
  const [objects, setObjects] = useState<SiteObject[]>([])
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const { data, error: err } = await supabase
      .from('objects')
      .select('*')
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else {
      setError(null)
      setObjects((data ?? []) as SiteObject[])
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    const { error: err } = await supabase.from('objects').insert({
      title: title.trim(),
      address: address.trim(),
      created_by: profile.id,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setTitle('')
    setAddress('')
    await load()
  }

  async function onDelete(id: string) {
    if (!confirm('Удалить объект и все его задачи?')) return
    const { error: err } = await supabase.from('objects').delete().eq('id', id)
    if (err) setError(err.message)
    else await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Объекты</h1>
          <p className="text-sm text-stone-600">Стройки и связанные задачи</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {isManager && (
        <form
          onSubmit={onCreate}
          className="grid gap-3 rounded-lg border border-stone-300 bg-white/70 p-4 md:grid-cols-[1fr_1fr_auto]"
        >
          <input
            required
            placeholder="Название"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded border border-stone-300 px-3 py-2"
          />
          <input
            required
            placeholder="Адрес"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="rounded border border-stone-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-stone-900 px-4 py-2 text-white hover:bg-stone-800 disabled:opacity-60"
          >
            Добавить
          </button>
        </form>
      )}

      <ul className="divide-y divide-stone-200 rounded-lg border border-stone-300 bg-white/70">
        {objects.length === 0 && (
          <li className="px-4 py-6 text-sm text-stone-600">Пока нет доступных объектов</li>
        )}
        {objects.map((obj) => (
          <li key={obj.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <Link to={`/objects/${obj.id}`} className="font-medium text-stone-900 hover:underline">
                {obj.title}
              </Link>
              <p className="text-sm text-stone-600">{obj.address}</p>
            </div>
            {isManager && (
              <button
                type="button"
                onClick={() => void onDelete(obj.id)}
                className="text-sm text-red-700 hover:underline"
              >
                Удалить
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
