import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import Obra from './Obra'

function Dashboard({ perfil }) {
  const [obras, setObras] = useState([])
  const [obraSeleccionada, setObraSeleccionada] = useState(null)

  useEffect(() => {
    if (perfil) cargarObras()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil])

  async function cargarObras() {
    let query = supabase.from('obras').select('*')

    if (perfil.area === 'jefe_obra') {
      const { data: vinculadas } = await supabase
        .from('usuario_obra')
        .select('obra_id')
        .eq('usuario_id', perfil.id)
      const ids = (vinculadas || []).map(v => v.obra_id)
      if (ids.length === 0) { setObras([]); return }
      query = query.in('id', ids)
    }

    const { data } = await query
    setObras(data || [])
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  function estadoBadgeClass(estado) {
    const map = {
      en_curso:   'estado-badge--en_curso',
      contratada: 'estado-badge--contratada',
      estudiada:  'estado-badge--estudiada',
      finalizada: 'estado-badge--finalizada',
      activa:     'estado-badge--activa',
    }
    return 'estado-badge ' + (map[estado] || 'estado-badge--finalizada')
  }

  if (!perfil) return null

  if (obraSeleccionada) {
    return <Obra obra={obraSeleccionada} perfil={perfil} onVolver={() => setObraSeleccionada(null)} />
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="consca-header">
        <span className="consca-logo">CONSCA<span>+</span></span>
        <div className="consca-header__spacer" />
        <div className="consca-user">
          <div className="consca-avatar">
            {perfil.nombre?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <span>{perfil.nombre}</span>
          <button className="btn-logout" onClick={handleLogout}>Salir</button>
        </div>
      </header>

      <div className="dashboard__main">
        <h1 style={{ marginBottom: 20 }}>Obras</h1>
        <div className="dashboard__grid">
          {obras.length === 0 && (
            <p style={{ color: 'var(--c-text3)' }}>No hay obras disponibles.</p>
          )}
          {obras.map(obra => (
            <div
              key={obra.id}
              className="obra-card"
              onClick={() => setObraSeleccionada(obra)}
            >
              <div className="obra-card__nombre">{obra.nombre}</div>
              {obra.descripcion && (
                <div className="obra-card__desc">{obra.descripcion}</div>
              )}
              <div className="obra-card__footer">
                <span className={estadoBadgeClass(obra.estado)}>{obra.estado}</span>
                <span style={{ fontSize: 11, color: 'var(--c-text3)' }}>{obra.codigo}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Dashboard