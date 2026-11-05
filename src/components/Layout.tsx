import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function Layout() {
  const { profile, signOut } = useAuth()
  const isManager = profile?.role === 'manager'

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-stone-300/70 pb-4">
        <div>
          <Link to="/objects" className="text-xl font-semibold tracking-tight text-stone-900">
            Объекты и задачи
          </Link>
          <p className="text-sm text-stone-600">Мини-CRM для стройки</p>
        </div>
        <nav className="flex flex-wrap items-center gap-3 text-sm">
          <NavLink
            to="/objects"
            className={({ isActive }) =>
              isActive ? 'font-semibold text-stone-900' : 'text-stone-600 hover:text-stone-900'
            }
          >
            Объекты
          </NavLink>
          {!isManager && (
            <NavLink
              to="/my-tasks"
              className={({ isActive }) =>
                isActive ? 'font-semibold text-stone-900' : 'text-stone-600 hover:text-stone-900'
              }
            >
              Мои задачи
            </NavLink>
          )}
          <span className="rounded bg-stone-200/80 px-2 py-1 text-stone-700">
            {profile?.full_name || profile?.email} ·{' '}
            {isManager ? 'постановщик' : 'исполнитель'}
          </span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded border border-stone-400 px-3 py-1 text-stone-800 hover:bg-white"
          >
            Выйти
          </button>
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
