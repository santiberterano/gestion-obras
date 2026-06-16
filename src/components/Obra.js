import { useState } from 'react'
// import { supabase } from '../supabaseClient'
import CostoPrevisto from './modulos/CostoPrevisto'
import ExplosionInsumos from './modulos/ExplosionInsumos'
import CostoExplotado from './modulos/CostoExplotado'

function Obra({ obra, perfil, onVolver }) {
  const [seccion, setSeccion] = useState(null)

  const botones = [
    { id: 'costo_previsto', label: 'Costo Previsto' },
    { id: 'costo_abierto', label: 'Costo Abierto' },
    { id: 'costo_explotado', label: 'Costo Explotado' },
    { id: 'explosion_insumos', label: 'Explosión de Insumos' },
    { id: 'planilla_medicion', label: 'Planilla de Medición' },
    { id: 'certificados', label: 'Certificados' },
    { id: 'tareas_complementarias', label: 'Tareas Complementarias' },
    { id: 'informes', label: 'Informes' },
  ]

  const formatMoney = (n) =>
    n ? '$' + Number(n).toLocaleString('es-AR') : '-'

  const estadoColor = {
    activa: { bg: '#dcfce7', color: '#16a34a' },
    finalizada: { bg: '#f3f4f6', color: '#666' },
    pausada: { bg: '#fef9c3', color: '#ca8a04' },
  }
  const estado = estadoColor[obra.estado] || { bg: '#f3f4f6', color: '#666' }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>

      {/* HEADER FIJO */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'white', borderBottom: '1px solid #e5e7eb',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        padding: '0 24px',
        height: '56px',
        display: 'flex', alignItems: 'center', gap: '24px'
      }}>
        <button
          onClick={onVolver}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: '14px', whiteSpace: 'nowrap', padding: '0' }}
        >
          ← Volver
        </button>

        <div style={{ width: '1px', height: '24px', background: '#e5e7eb' }} />

        <span style={{ fontWeight: '700', color: '#111', whiteSpace: 'nowrap' }}>{obra.nombre}</span>

        <div style={{ width: '1px', height: '24px', background: '#e5e7eb' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '13px', color: '#555', overflow: 'hidden' }}>
          {obra.codigo && <span><span style={{ color: '#999' }}>Cód: </span><b>{obra.codigo}</b></span>}
          {obra.version !== null && <span><span style={{ color: '#999' }}>V: </span><b>{obra.version}</b></span>}
          {obra.mes_base && obra.anio_base && <span><span style={{ color: '#999' }}>Base: </span><b>{obra.mes_base} {obra.anio_base}</b></span>}
          {obra.dolar && <span><span style={{ color: '#999' }}>U$S: </span><b>${Number(obra.dolar).toLocaleString('es-AR')}</b></span>}
          {obra.costo_previsto_total && <span><span style={{ color: '#999' }}>CP: </span><b style={{ color: '#2563eb' }}>{formatMoney(obra.costo_previsto_total)}</b></span>}
          <span style={{
            padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
            background: estado.bg, color: estado.color
          }}>
            {obra.estado ? obra.estado.charAt(0).toUpperCase() + obra.estado.slice(1) : '-'}
          </span>
        </div>
      </div>

      {/* CONTENIDO */}
      <div style={{ paddingTop: '80px', padding: '80px 24px 24px', maxWidth: '960px', margin: '0 auto' }}>

        {/* BOTONES */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px', marginTop: '24px' }}>
          {botones.map(b => (
            <button
              key={b.id}
              onClick={() => setSeccion(b.id)}
              style={{
                padding: '24px 20px',
                background: seccion === b.id ? '#2563eb' : 'white',
                color: seccion === b.id ? 'white' : '#111',
                border: '1px solid ' + (seccion === b.id ? '#2563eb' : '#e5e7eb'),
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '15px',
                textAlign: 'left',
                boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
              }}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* SECCIÓN ACTIVA */}
        {seccion === 'costo_previsto'
  ? <CostoPrevisto obra={obra} perfil={perfil} />
  : seccion === 'explosion_insumos'
  ? <ExplosionInsumos obra={obra} perfil={perfil} />
  : seccion === 'costo_explotado'
  ? <CostoExplotado obra={obra} perfil={perfil} />
  : <p style={{ color: '#999' }}>Módulo en desarrollo.</p>
}
      </div>
    </div>
  )
}

export default Obra