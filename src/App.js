import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './components/Login'
import Dashboard from './components/Dashboard'

function App() {
  const [session, setSession] = useState(null)
  const [perfil, setPerfil] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) cargarPerfil(session.user.id)
    })

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) cargarPerfil(session.user.id)
      else setPerfil(null)
    })
  }, [])

  async function cargarPerfil(userId) {
    const { data } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', userId)
      .single()
    setPerfil(data)
  }

  if (!session) return <Login />
  if (!perfil) return <p>Cargando...</p>
  return <Dashboard perfil={perfil} />
}

export default App