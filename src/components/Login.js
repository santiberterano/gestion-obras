import { useState } from 'react'
import { supabase } from '../supabaseClient'

const C = {
  negro: '#0A0A0A',
  grisOscuro: '#1A1A1A',
  grisMedio: '#2A2A2A',
  grisClaro: '#3A3A3A',
  grisTexto: '#9A9A9A',
  grisBorde: '#2E2E2E',
  amarillo: '#F5A800',
  amarilloHover: '#FFB800',
  blanco: '#FFFFFF',
  blancoSuave: '#F0F0F0',
}

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

  async function handleKeyDown(e) {
    if (e.key === 'Enter') handleLogin()
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: C.negro,
      fontFamily: "'Roboto', sans-serif",
    }}>
      {/* Google Fonts */}
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap" rel="stylesheet" />

      {/* Grid sutil de fondo */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage: `linear-gradient(${C.grisBorde} 1px, transparent 1px), linear-gradient(90deg, ${C.grisBorde} 1px, transparent 1px)`,
        backgroundSize: '48px 48px',
        opacity: 0.3,
      }} />

      <div style={{ position: 'relative', width: '100%', maxWidth: '400px', padding: '0 24px' }}>

        {/* Logo / Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          {/* Diamante SVG inspirado en logo CONSCA+ */}
          <svg width="48" height="48" viewBox="0 0 48 48" style={{ marginBottom: '16px' }}>
            <polygon
              points="24,4 44,24 24,44 4,24"
              fill={C.amarillo}
            />
            <polygon
              points="24,14 34,24 24,34 14,24"
              fill={C.negro}
            />
            <polygon
              points="24,19 29,24 24,29 19,24"
              fill={C.amarillo}
            />
          </svg>
          <div style={{ fontSize: '22px', fontWeight: '900', color: C.blanco, letterSpacing: '0.02em', lineHeight: 1.1 }}>
            GESTIÓN DE OBRAS
          </div>
          <div style={{ fontSize: '13px', fontWeight: '500', color: C.amarillo, letterSpacing: '0.15em', marginTop: '4px' }}>
            CONSCA+
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: C.grisOscuro,
          border: `1px solid ${C.grisBorde}`,
          borderRadius: '4px',
          padding: '36px 32px',
        }}>
          <p style={{ margin: '0 0 24px', fontSize: '13px', color: C.grisTexto, fontWeight: '400' }}>
            Ingresá tus credenciales para continuar
          </p>

          <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.grisTexto, letterSpacing: '0.1em', marginBottom: '6px', textTransform: 'uppercase' }}>
            Email
          </label>
          <input
            type="email"
            placeholder="usuario@consca.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              padding: '11px 14px',
              marginBottom: '16px',
              borderRadius: '3px',
              border: `1px solid ${C.grisBorde}`,
              background: C.grisMedio,
              color: C.blanco,
              fontSize: '14px',
              fontFamily: "'Roboto', sans-serif",
              boxSizing: 'border-box',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = C.amarillo}
            onBlur={e => e.target.style.borderColor = C.grisBorde}
          />

          <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.grisTexto, letterSpacing: '0.1em', marginBottom: '6px', textTransform: 'uppercase' }}>
            Contraseña
          </label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              padding: '11px 14px',
              marginBottom: '20px',
              borderRadius: '3px',
              border: `1px solid ${C.grisBorde}`,
              background: C.grisMedio,
              color: C.blanco,
              fontSize: '14px',
              fontFamily: "'Roboto', sans-serif",
              boxSizing: 'border-box',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = C.amarillo}
            onBlur={e => e.target.style.borderColor = C.grisBorde}
          />

          {error && (
            <div style={{
              padding: '10px 14px',
              background: 'rgba(220,38,38,0.1)',
              border: '1px solid rgba(220,38,38,0.3)',
              borderRadius: '3px',
              color: '#f87171',
              fontSize: '13px',
              marginBottom: '16px',
              fontWeight: '500',
            }}>
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={cargando}
            style={{
              width: '100%',
              padding: '12px',
              background: cargando ? C.grisClaro : C.amarillo,
              color: cargando ? C.grisTexto : C.negro,
              border: 'none',
              borderRadius: '3px',
              cursor: cargando ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '700',
              fontFamily: "'Roboto', sans-serif",
              letterSpacing: '0.05em',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (!cargando) e.target.style.background = C.amarilloHover }}
            onMouseLeave={e => { if (!cargando) e.target.style.background = C.amarillo }}
          >
            {cargando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '11px', color: C.grisClaro, letterSpacing: '0.05em' }}>
          © CONSCA+ · Sistema de Gestión de Obras
        </div>
      </div>
    </div>
  )
}

export default Login