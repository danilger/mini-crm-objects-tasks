import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function ProtectedRoute() {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return <div className="p-8 text-stone-600">Загрузка…</div>
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-lg p-8 text-stone-800">
        <h1 className="mb-2 text-xl font-semibold">Профиль не найден</h1>
        <p>
          Пользователь есть в Auth, но строки в <code>profiles</code> нет. Добавьте роль через
          seed SQL.
        </p>
      </div>
    )
  }

  return <Outlet />
}
