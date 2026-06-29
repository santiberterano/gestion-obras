import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import AdminDashboard from './components/AdminDashboard'
import NuevaObra from './components/NuevaObra'
import Obra from './components/Obra'
import './App.css'

function App() {
  const [session, setSession] = useState(null)
  const [perfil, setPerfil]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Carga inicial de sesión
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) cargarPerfil(session.user.id)
      else setLoading(false)
    })

    // Solo reaccionar a login/logout reales — ignorar TOKEN_REFRESHED y similares
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setSession(null); setPerfil(null); setLoading(false)
      } else if (event === 'SIGNED_IN') {
        setSession(session)
        if (session) cargarPerfil(session.user.id)
      }
      // TOKEN_REFRESHED, USER_UPDATED → ignorar, no tocar el estado
    })

    return () => subscription.unsubscribe()
  }, [])

  async function cargarPerfil(userId) {
    const { data } = await supabase
      .from('perfiles').select('*').eq('id', userId).single()
    setPerfil(data)
    setLoading(false)
  }

  if (!session) return <Login />
  if (loading)  return <p style={{ padding: 24, color: '#999' }}>Cargando...</p>

  const inicio = perfil?.area === 'jefe_obra' ? '/dashboard' : '/admin'

  return (
    <Routes>
      <Route path="/"           element={<Navigate to={inicio} replace />} />
      <Route path="/dashboard"  element={<Dashboard perfil={perfil} />} />
      <Route path="/admin"      element={<AdminDashboard perfil={perfil} />} />
      <Route path="/nueva-obra" element={<NuevaObra />} />
      <Route path="/obras/:id"  element={<Obra perfil={perfil} />} />
      <Route path="*"           element={<Navigate to={inicio} replace />} />
    </Routes>
  )
}

export default App