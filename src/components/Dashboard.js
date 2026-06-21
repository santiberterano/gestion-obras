import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import Obra from './Obra'

function Dashboard({ perfil }) {
  const [obras, setObras] = useState([])
  const [obraSeleccionada, setObraSeleccionada] = useState(null)

  useEffect(() => {
    cargarObras()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargarObras() {
    let query = supabase.from('obras').select('*')
    if (perfil.area === 'jefe_obra') {
      const { data: vinculadas } = await supabase
        .from('usuario_obra').select('obra_id').eq('usuario_id', perfil.id)
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

  const areaLabel = {
    administracion: 'Administración',
    compras: 'Compras',
    jefe_obra: 'Jefe de Obra',
    computo: 'Cómputo',
    produccion: 'Producción',
  }

  const activas   = obras.filter(o => o.estado === 'activa')
  const pausadas  = obras.filter(o => o.estado === 'pausada')
  const finalizadas = obras.filter(o => o.estado === 'finalizada')

  function EstadoBadge({ estado }) {
    const map = {
      activa:     { bg: '#f5a62322', color: '#f5a623', label: 'Activa' },
      pausada:    { bg: '#ffffff18', color: '#aaa',    label: 'Pausada' },
      finalizada: { bg: '#ffffff10', color: '#666',    label: 'Finalizada' },
    }
    const s = map[estado] || map.finalizada
    return (
      <span style={{ background: s.bg, color: s.color, fontSize: '10px', padding: '2px 8px', borderRadius: '4px', fontWeight: '500' }}>
        {s.label}
      </span>
    )
  }

  function ObraCard({ obra }) {
    const fmt = (n) => n ? '$' + Number(n).toLocaleString('es-AR') : null
    return (
      <div onClick={() => setObraSeleccionada(obra)}
        style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '16px', cursor: 'pointer', transition: 'border-color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#f5a623'}
        onMouseLeave={e => e.currentTarget.style.borderColor = '#2a2a2a'}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <span style={{ color: 'white', fontWeight: '500', fontSize: '14px', flex: 1, marginRight: '8px' }}>{obra.nombre}</span>
          <EstadoBadge estado={obra.estado} />
        </div>
        <p style={{ color: '#666', fontSize: '11px', marginBottom: '10px' }}>
          {obra.codigo && `Cód: ${obra.codigo}`}
          {obra.version !== null && ` · V: ${obra.version}`}
          {obra.mes_base && obra.anio_base && ` · Base: ${obra.mes_base} ${obra.anio_base}`}
        </p>
        <div style={{ borderTop: '1px solid #2a2a2a', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {obra.dolar && <span style={{ color: '#666', fontSize: '11px' }}>U$S ${Number(obra.dolar).toLocaleString('es-AR')}</span>}
          {fmt(obra.costo_previsto_total) && (
            <span style={{ color: '#f5a623', fontSize: '12px', fontWeight: '500' }}>{fmt(obra.costo_previsto_total)}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#111' }}>
      {/* Header */}
      <div style={{ background: '#1a1a1a', borderBottom: '1px solid #2a2a2a', padding: '0 28px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '20px', height: '20px', background: '#f5a623', transform: 'rotate(45deg)', borderRadius: '2px', flexShrink: 0 }} />
          <span style={{ color: 'white', fontWeight: '500', fontSize: '14px', letterSpacing: '1px' }}>CONSCA+</span>
          <div style={{ width: '1px', height: '20px', background: '#2a2a2a' }} />
          <span style={{ color: '#666', fontSize: '13px' }}>Gestión de Obras</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ color: '#f5a623', fontSize: '12px' }}>{areaLabel[perfil.area] || perfil.area}</span>
          <span style={{ color: '#666', fontSize: '12px' }}>{perfil.nombre}</span>
          <button onClick={handleLogout}
            style={{ background: 'none', border: '1px solid #2a2a2a', color: '#999', padding: '5px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#f5a623'; e.currentTarget.style.color = '#f5a623' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#999' }}>
            Salir
          </button>
        </div>
      </div>

      {/* Contenido */}
      <div style={{ paddingTop: '80px', padding: '80px 28px 40px', maxWidth: '960px', margin: '0 auto' }}>
        {obras.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#444' }}>No hay obras asignadas.</div>
        ) : (
          <>
            {activas.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <p style={{ color: '#666', fontSize: '11px', letterSpacing: '1px', marginBottom: '14px' }}>OBRAS ACTIVAS</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                  {activas.map(o => <ObraCard key={o.id} obra={o} />)}
                </div>
              </div>
            )}
            {pausadas.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <p style={{ color: '#666', fontSize: '11px', letterSpacing: '1px', marginBottom: '14px' }}>OBRAS PAUSADAS</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                  {pausadas.map(o => <ObraCard key={o.id} obra={o} />)}
                </div>
              </div>
            )}
            {finalizadas.length > 0 && (
              <div>
                <p style={{ color: '#666', fontSize: '11px', letterSpacing: '1px', marginBottom: '14px' }}>OBRAS FINALIZADAS</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                  {finalizadas.map(o => <ObraCard key={o.id} obra={o} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default Dashboard