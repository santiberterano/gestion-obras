import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import CostoPrevisto from './modulos/CostoPrevisto'
import ExplosionInsumos from './modulos/ExplosionInsumos'
import CostoExplotado from './modulos/CostoExplotado'
import PlanillaMedicion from './modulos/PlanillaMedicion'
import Certificados from './modulos/Certificados'

const BOTONES = [
  { id: 'costo_previsto',         label: 'Costo Previsto' },
  { id: 'costo_abierto',          label: 'Costo Abierto' },
  { id: 'costo_explotado',        label: 'Costo Explotado' },
  { id: 'explosion_insumos',      label: 'Explosión de Insumos' },
  { id: 'planilla_medicion',      label: 'Planilla de Medición' },
  { id: 'certificados',           label: 'Certificados' },
  { id: 'tareas_complementarias', label: 'Tareas Complementarias' },
  { id: 'informes',               label: 'Informes' },
]

const ESTADO_BADGE = {
  en_curso:   { bg: '#dcfce7', color: '#16a34a' },
  contratada: { bg: '#fef3c7', color: '#d97706' },
  estudiada:  { bg: '#dbeafe', color: '#2563eb' },
  finalizada: { bg: '#f3f4f6', color: '#6b7280' },
  activa:     { bg: '#dcfce7', color: '#16a34a' },
  pausada:    { bg: '#fef9c3', color: '#ca8a04' },
}

function formatMoney(n) {
  return n ? '$' + Number(n).toLocaleString('es-AR') : '-'
}

function Obra({ perfil }) {
  const { id } = useParams()
  const navigate = useNavigate()

  const [obra, setObra]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [seccion, setSeccion] = useState(null)

  useEffect(() => {
    async function cargarObra() {
      const { data, error } = await supabase
        .from('obras')
        .select('*')
        .eq('id', id)
        .single()
      if (error) console.error(error)
      setObra(data)
      setLoading(false)
    }
    cargarObra()
  }, [id])

  function handleVolver() {
    if (perfil?.area === 'jefe_obra') navigate('/dashboard')
    else navigate('/admin')
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--c-bg)' }}>
      <span style={{ color: 'var(--c-text3)', fontSize: 13 }}>Cargando...</span>
    </div>
  )

  if (!obra) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--c-bg)' }}>
      <span style={{ color: 'var(--c-text3)', fontSize: 13 }}>Obra no encontrada.</span>
    </div>
  )

  const badge = ESTADO_BADGE[obra.estado] || { bg: '#f3f4f6', color: '#6b7280' }
  const estadoLabel = obra.estado
    ? obra.estado.charAt(0).toUpperCase() + obra.estado.slice(1).replace('_', ' ')
    : '-'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)' }}>

      {/* HEADER */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: '#ffffff',
        borderBottom: '1px solid var(--c-border)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        padding: '0 24px',
        height: '54px',
        display: 'flex', alignItems: 'center', gap: '16px',
      }}>
        <span className="consca-logo">CONSCA<span>+</span></span>

        <div style={{ width: '1px', height: '20px', background: 'var(--c-border)' }} />

        <button onClick={handleVolver} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--c-text3)', fontSize: '13px', padding: 0,
          transition: 'color 0.2s',
        }}
          onMouseEnter={e => e.target.style.color = 'var(--c-gold)'}
          onMouseLeave={e => e.target.style.color = 'var(--c-text3)'}
        >
          ← Volver
        </button>

        <div style={{ width: '1px', height: '20px', background: 'var(--c-border)' }} />

        <span style={{ fontWeight: 600, color: 'var(--c-text)', fontSize: '14px', whiteSpace: 'nowrap' }}>
          {obra.nombre}
        </span>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '16px',
          fontSize: '12px', color: 'var(--c-text2)',
          overflow: 'hidden', flex: 1,
        }}>
          {obra.codigo && (
            <span><span style={{ color: 'var(--c-text3)' }}>Cód: </span><b>{obra.codigo}</b></span>
          )}
          {obra.version != null && (
            <span><span style={{ color: 'var(--c-text3)' }}>V: </span><b>{obra.version}</b></span>
          )}
          {obra.dolar && (
            <span><span style={{ color: 'var(--c-text3)' }}>U$S: </span><b>${Number(obra.dolar).toLocaleString('es-AR')}</b></span>
          )}
          {obra.costo_previsto_total && (
            <span>
              <span style={{ color: 'var(--c-text3)' }}>CP: </span>
              <b style={{ color: 'var(--c-gold)' }}>{formatMoney(obra.costo_previsto_total)}</b>
            </span>
          )}
          <span style={{
            padding: '2px 10px', borderRadius: '20px',
            fontSize: '11px', fontWeight: 600,
            background: badge.bg, color: badge.color,
            flexShrink: 0,
          }}>
            {estadoLabel}
          </span>
        </div>
      </div>

      {/* CONTENIDO */}
      <div style={{ paddingTop: '78px', padding: '78px 24px 40px', maxWidth: '960px', margin: '0 auto' }}>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '12px',
          marginTop: '24px',
        }}>
          {BOTONES.map(b => {
            const activo = seccion === b.id
            return (
              <button
                key={b.id}
                onClick={() => setSeccion(activo ? null : b.id)}
                style={{
                  padding: '20px',
                  background: activo ? 'var(--c-gold)' : '#ffffff',
                  color: activo ? '#ffffff' : 'var(--c-text)',
                  border: '1px solid ' + (activo ? 'var(--c-gold)' : 'var(--c-border)'),
                  borderTop: activo ? '3px solid #d4891a' : '3px solid var(--c-gold)',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '14px',
                  textAlign: 'left',
                  boxShadow: activo ? '0 4px 12px rgba(245,166,35,0.25)' : '0 1px 4px rgba(0,0,0,0.06)',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { if (!activo) e.currentTarget.style.borderColor = 'var(--c-gold)' }}
                onMouseLeave={e => { if (!activo) e.currentTarget.style.borderColor = 'var(--c-border)' }}
              >
                {b.label}
              </button>
            )
          })}
        </div>

        {seccion && (
          <div style={{
            marginTop: '20px',
            background: '#ffffff',
            borderRadius: '12px',
            padding: '24px',
            border: '1px solid var(--c-border)',
            borderTop: '3px solid var(--c-gold)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--c-text)' }}>
              {BOTONES.find(b => b.id === seccion)?.label}
            </h3>

            {seccion === 'costo_previsto'
              ? <CostoPrevisto obra={obra} perfil={perfil} onIrAPlanilla={() => setSeccion('planilla_medicion')} />
              : seccion === 'explosion_insumos'
              ? <ExplosionInsumos obra={obra} perfil={perfil} />
              : seccion === 'costo_explotado'
              ? <CostoExplotado obra={obra} perfil={perfil} />
              : seccion === 'planilla_medicion'
              ? <PlanillaMedicion obra={obra} perfil={perfil} />
              : seccion === 'certificados'
              ? <Certificados obra={obra} perfil={perfil} />
              : <p style={{ color: 'var(--c-text3)', fontSize: 13 }}>Módulo en desarrollo.</p>
            }
          </div>
        )}
      </div>
    </div>
  )
}

export default Obra