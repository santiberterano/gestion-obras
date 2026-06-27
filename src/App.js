import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import AdminDashboard from './components/AdminDashboard'
import NuevaObra from './components/NuevaObra'
import Obra from './components/Obra'
import './App.css'

function App() {
  const [session, setSession] = useState(undefined) // undefined = todavía cargando
  const [perfil, setPerfil]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) cargarPerfil(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) cargarPerfil(session.user.id)
      else { setPerfil(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function cargarPerfil(userId) {
    setLoading(true)
    const { data } = await supabase
      .from('perfiles').select('*').eq('id', userId).single()
    setPerfil(data)
    setLoading(false)
  }

  // Todavía resolviendo sesión inicial
  if (session === undefined) return null

  // Sin sesión → Login
  if (!session) return <Login />

  // Con sesión pero sin perfil cargado
  if (loading || !perfil) return <p style={{ padding: 24, color: '#999' }}>Cargando...</p>

  const inicio = perfil.area === 'jefe_obra' ? '/dashboard' : '/admin'

  // key={session.user.id} fuerza remount completo del router al cambiar de usuario
  // esto elimina el bug de redirección al loguear un usuario distinto
  return (
    <BrowserRouter key={session.user.id}>
      <Routes>
        <Route path="/"           element={<Navigate to={inicio} replace />} />
        <Route path="/dashboard"  element={<Dashboard perfil={perfil} />} />
        <Route path="/admin"      element={<AdminDashboard perfil={perfil} />} />
        <Route path="/nueva-obra" element={<NuevaObra />} />
        <Route path="/obras/:id"  element={<Obra perfil={perfil} />} />
        <Route path="*"           element={<Navigate to={inicio} replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App