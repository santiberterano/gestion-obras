import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import AdminDashboard from './components/AdminDashboard'
import NuevaObra from './components/NuevaObra'
import './App.css'

function App() {
  const [session, setSession] = useState(null)
  const [perfil, setPerfil]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) cargarPerfil(session.user.id)
      else setLoading(false)
    })

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) cargarPerfil(session.user.id)
      else { setPerfil(null); setLoading(false) }
    })
  }, [])

  async function cargarPerfil(userId) {
    const { data } = await supabase
      .from('perfiles').select('*').eq('id', userId).single()
    setPerfil(data)
    setLoading(false)
  }

  if (!session) return <Login />
  if (loading)  return <p style={{ padding: 24, color: '#999' }}>Cargando...</p>

  const inicio = perfil?.area === 'administracion' ? '/admin' : '/dashboard'

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={inicio} replace />} />
        <Route path="/dashboard"   element={<Dashboard perfil={perfil} />} />
        <Route path="/admin"       element={<AdminDashboard perfil={perfil} />} />
        <Route path="/nueva-obra"  element={<NuevaObra />} />
        <Route path="/obras/:id"   element={<Dashboard perfil={perfil} />} />
        <Route path="*"            element={<Navigate to={inicio} replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App