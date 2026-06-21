import { useState } from 'react'
import CostoPrevisto from './modulos/CostoPrevisto'
import ExplosionInsumos from './modulos/ExplosionInsumos'
import CostoExplotado from './modulos/CostoExplotado'
import PlanillaMedicion from './modulos/PlanillaMedicion'

function Obra({ obra, perfil, onVolver }) {
  const [seccion, setSeccion] = useState(null)

  const botones = [
    { id: 'costo_previsto',    label: 'Costo Previsto',       icono: '📋' },
    { id: 'costo_abierto',     label: 'Costo Abierto',        icono: '📂' },
    { id: 'costo_explotado',   label: 'Costo Explotado',      icono: '🧮' },
    { id: 'explosion_insumos', label: 'Explosión de Insumos', icono: '📦' },
    { id: 'planilla_medicion', label: 'Planilla de Medición', icono: '📊' },
    { id: 'certificados',      label: 'Certificados',         icono: '🏅' },
    { id: 'informes',          label: 'Informes',             icono: '📈' },
  ]

  const formatMoney = (n) => n ? '$' + Number(n).toLocaleString('es-AR') : '-'

  const estadoMap = {
    activa:     { bg: '#f5a62322', color: '#f5a623', label: 'Activa' },
    finalizada: { bg: '#ffffff10', color: '#666',    label: 'Finalizada' },
    pausada:    { bg: '#ffffff10', color: '#aaa',    label: 'Pausada' },
  }
  const estado = estadoMap[obra.estado] || estadoMap.finalizada

  return (
    <div style={{ minHeight: '100vh', background: '#111' }}>

      {/* HEADER FIJO */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: '#1a1a1a', borderBottom: '1px solid #2a2a2a',
        padding: '0 24px', height: '56px',
        display: 'flex', alignItems: 'center', gap: '16px'
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div style={{ width: '18px', height: '18px', background: '#f5a623', transform: 'rotate(45deg)', borderRadius: '2px' }} />
          <span style={{ color: 'white', fontWeight: '500', fontSize: '13px', letterSpacing: '1px' }}>CONSCA+</span>
        </div>

        <div style={{ width: '1px', height: '20px', background: '#2a2a2a', flexShrink: 0 }} />

        <button onClick={onVolver}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f5a623', fontSize: '13px', whiteSpace: 'nowrap', padding: '0', flexShrink: 0 }}>
          ← Volver
        </button>

        <div style={{ width: '1px', height: '20px', background: '#2a2a2a', flexShrink: 0 }} />

        <span style={{ fontWeight: '500', color: 'white', whiteSpace: 'nowrap', fontSize: '14px', flexShrink: 0 }}>{obra.nombre}</span>

        <div style={{ width: '1px', height: '20px', background: '#2a2a2a', flexShrink: 0 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: '#666', overflow: 'hidden' }}>
          {obra.codigo && <span><span style={{ color: '#444' }}>Cód: </span><span style={{ color: '#999' }}>{obra.codigo}</span></span>}
          {obra.version !== null && <span><span style={{ color: '#444' }}>V: </span><span style={{ color: '#999' }}>{obra.version}</span></span>}
          {obra.mes_base && obra.anio_base && <span><span style={{ color: '#444' }}>Base: </span><span style={{ color: '#999' }}>{obra.mes_base} {obra.anio_base}</span></span>}
          {obra.dolar && <span><span style={{ color: '#444' }}>U$S: </span><span style={{ color: '#999' }}>${Number(obra.dolar).toLocaleString('es-AR')}</span></span>}
          {obra.costo_previsto_total && <span><span style={{ color: '#444' }}>CP: </span><span style={{ color: '#f5a623', fontWeight: '500' }}>{formatMoney(obra.costo_previsto_total)}</span></span>}
          <span style={{ background: estado.bg, color: estado.color, fontSize: '10px', padding: '2px 8px', borderRadius: '4px', fontWeight: '500', flexShrink: 0 }}>
            {estado.label}
          </span>
        </div>
      </div>

      {/* CONTENIDO */}
      <div style={{ paddingTop: '80px', padding: '80px 24px 40px', maxWidth: '1000px', margin: '0 auto' }}>

        {/* TABS DE NAVEGACIÓN */}
<div style={{ display: 'flex', borderBottom: '2px solid #2a2a2a', marginTop: '8px', overflowX: 'auto' }}>
  {botones.map(b => {
    const activo = seccion === b.id
    return (
      <button key={b.id} onClick={() => setSeccion(b.id)}
        style={{
          padding: '10px 18px',
          background: 'none',
          color: activo ? '#f5a623' : '#666',
          border: 'none',
          borderBottom: `2px solid ${activo ? '#f5a623' : 'transparent'}`,
          marginBottom: '-2px',
          cursor: 'pointer',
          fontWeight: activo ? '600' : '400',
          fontSize: '13px',
          whiteSpace: 'nowrap',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => { if (!activo) e.currentTarget.style.color = '#f5a623' }}
        onMouseLeave={e => { if (!activo) e.currentTarget.style.color = '#666' }}
      >
        {b.icono} {b.label}
      </button>
    )
  })}
</div>

        {/* SECCIÓN ACTIVA */}
        {seccion && (
          <div style={{ marginTop: '16px', background: '#f8f7f4', borderRadius: '10px', padding: '24px', borderTop: '3px solid #f5a623' }}>
            {seccion === 'costo_previsto'
              ? <CostoPrevisto obra={obra} perfil={perfil} onIrAPlanilla={() => setSeccion('planilla_medicion')} />
              : seccion === 'explosion_insumos'
              ? <ExplosionInsumos obra={obra} perfil={perfil} />
              : seccion === 'costo_explotado'
              ? <CostoExplotado obra={obra} perfil={perfil} />
              : seccion === 'planilla_medicion'
              ? <PlanillaMedicion obra={obra} perfil={perfil} />
              : <div style={{ padding: '40px', textAlign: 'center', color: '#aaa', fontSize: '14px' }}>Módulo en desarrollo.</div>
            }
          </div>
        )}
      </div>
    </div>
  )
}

export default Obra