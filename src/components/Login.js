import { useState } from 'react'
import { supabase } from '../supabaseClient'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function handleLogin() {
    setCargando(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    console.log('data:', data)
    console.log('error:', error)
    if (error) setError('Email o contraseña incorrectos')
    setCargando(false)
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
      <div style={{ background: 'white', padding: '40px', borderRadius: '8px', width: '320px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
        <h2 style={{ marginBottom: '24px', textAlign: 'center' }}>Gestión de Obras</h2>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ width: '100%', padding: '10px', marginBottom: '12px', borderRadius: '4px', border: '1px solid #ddd', boxSizing: 'border-box' }}
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ width: '100%', padding: '10px', marginBottom: '16px', borderRadius: '4px', border: '1px solid #ddd', boxSizing: 'border-box' }}
        />
        {error && <p style={{ color: 'red', marginBottom: '12px', fontSize: '14px' }}>{error}</p>}
        <button
          onClick={handleLogin}
          disabled={cargando}
          style={{ width: '100%', padding: '10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}
        >
          {cargando ? 'Ingresando...' : 'Ingresar'}
        </button>
      </div>
    </div>
  )
}

export default Login