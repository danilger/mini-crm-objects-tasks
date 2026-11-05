import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { MyTasksPage } from './pages/MyTasksPage'
import { ObjectDetailPage } from './pages/ObjectDetailPage'
import { ObjectsPage } from './pages/ObjectsPage'
import { TaskDetailPage } from './pages/TaskDetailPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/objects" replace />} />
              <Route path="/objects" element={<ObjectsPage />} />
              <Route path="/objects/:id" element={<ObjectDetailPage />} />
              <Route path="/tasks/:id" element={<TaskDetailPage />} />
              <Route path="/my-tasks" element={<MyTasksPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/objects" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
