import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import Obra from './Obra'

function Dashboard({ perfil }) {
  const [obras, setObras] = useState([])
  const [obraSeleccionada, setObraSeleccionada] = useState(null)

  useEffect(() => {
    cargarObras()
  }, [])

  async function cargarObras() {
    let query = supabase.from('obras').select('*')

    if (perfil.area === 'jefe_obra') {
      const { data: vinculadas } = await supabase
        .from('usuario_obra')
        .select('obra_id')
        .eq('usuario_id', perfil.id)
      const ids = vinculadas.map(v => v.obra_id)
      query = query.in('id', ids)
    }

    const { data } = await query
    setObras(data || [])
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  if (obraSeleccionada) {
    return <Obra obra={obraSeleccionada} perfil={perfil} onVolver={() => setObraSeleccionada(null)} />
  }

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1>Gestión de Obras</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ color: '#666' }}>{perfil.nombre} — {perfil.area}</span>
          <button onClick={handleLogout} style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Salir
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
        {obras.length === 0 && <p>No hay obras disponibles.</p>}
        {obras.map(obra => (
          <div
            key={obra.id}
            onClick={() => setObraSeleccionada(obra)}
            style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', cursor: 'pointer', border: '1px solid #e5e7eb' }}
          >
            <h3 style={{ marginBottom: '8px' }}>{obra.nombre}</h3>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '8px' }}>{obra.descripcion}</p>
            <span style={{
              padding: '4px 10px', borderRadius: '20px', fontSize: '12px',
              background: obra.estado === 'activa' ? '#dcfce7' : '#f3f4f6',
              color: obra.estado === 'activa' ? '#16a34a' : '#666'
            }}>
              {obra.estado}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Dashboard