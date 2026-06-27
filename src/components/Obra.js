import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import CostoPrevisto    from './modulos/CostoPrevisto'
import CostoAbierto     from './modulos/CostoAbierto'
import CostoExplotado   from './modulos/CostoExplotado'
import ExplosionInsumos from './modulos/ExplosionInsumos'
import PlanillaMedicion from './modulos/PlanillaMedicion'
import Certificados     from './modulos/Certificados'
import InformeHoras     from './modulos/InformeHoras'

const BOTONES = [
  { id: 'costo_previsto',    label: 'Costo Previsto'       },
  { id: 'costo_abierto',     label: 'Costo Abierto'        },
  { id: 'costo_explotado',   label: 'Costo Explotado'      },
  { id: 'explosion_insumos', label: 'Explosión de Insumos' },
  { id: 'planilla_medicion', label: 'Planilla de Medición' },
  { id: 'certificados',      label: 'Certificados'         },
  { id: 'informe_horas',     label: 'Informe de Horas MO'  },
]

const ESTADO_COLORS = {
  estudiada:   { bg: '#f3f4f6', color: '#6b7280' },
  contratada:  { bg: '#dbeafe', color: '#1d4ed8' },
  en_curso:    { bg: '#dcfce7', color: '#16a34a' },
  finalizada:  { bg: '#f3f4f6', color: '#374151' },
}

const ESTADO_LABELS = {
  estudiada:  'Estudiada',
  contratada: 'Contratada',
  en_curso:   'En curso',
  finalizada: 'Finalizada',
}

function fmtMoney(n) {
  return n ? '$' + Number(n).toLocaleString('es-AR') : '-'
}

function Obra({ perfil }) {
  const { id }       = useParams()
  const navigate     = useNavigate()
  const [obra, setObra]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [seccion, setSeccion] = useState(null)

  useEffect(() => {
    cargarObra()
    setSeccion(null) // resetear sección al cambiar de obra
  }, [id]) // eslint-disable-line

  async function cargarObra() {
    setLoading(true)
    setError(null)
    const { data, error: e } = await supabase
      .from('obras')
      .select('*')
      .eq('id', id)
      .single()
    if (e) setError('No se pudo cargar la obra.')
    else setObra(data)
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--c-text3)' }}>
      Cargando obra...
    </div>
  )

  if (error || !obra) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 12 }}>
      <p style={{ color: 'var(--c-danger)' }}>{error || 'Obra no encontrada.'}</p>
      <button onClick={() => navigate(-1)} style={{ color: 'var(--c-accent)', background: 'none', border: 'none', cursor: 'pointer' }}>← Volver</button>
    </div>
  )

  const estadoStyle = ESTADO_COLORS[obra.estado] || { bg: '#f3f4f6', color: '#666' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)' }}>

      {/* ── HEADER FIJO ── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'white', borderBottom: '1px solid var(--c-border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        padding: '0 24px', height: '56px',
        display: 'flex', alignItems: 'center', gap: '20px',
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-accent)', fontSize: '14px', whiteSpace: 'nowrap', padding: 0 }}
        >
          ← Volver
        </button>

        <div style={{ width: 1, height: 24, background: 'var(--c-border)' }} />

        <span style={{ fontWeight: 700, color: 'var(--c-text)', whiteSpace: 'nowrap', fontSize: 15 }}>
          {obra.nombre}
        </span>

        <div style={{ width: 1, height: 24, background: 'var(--c-border)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: 'var(--c-text2)', overflow: 'hidden', flexWrap: 'nowrap' }}>
          {obra.codigo  && <span><span style={{ color: 'var(--c-text3)' }}>Cód: </span><b>{obra.codigo}</b></span>}
          {obra.version != null && <span><span style={{ color: 'var(--c-text3)' }}>V: </span><b>{obra.version}</b></span>}
          {obra.dolar   && <span><span style={{ color: 'var(--c-text3)' }}>U$S: </span><b>${Number(obra.dolar).toLocaleString('es-AR')}</b></span>}
          {obra.costo_previsto_total && (
            <span><span style={{ color: 'var(--c-text3)' }}>CP: </span><b style={{ color: 'var(--c-accent)' }}>{fmtMoney(obra.costo_previsto_total)}</b></span>
          )}
          <span style={{
            padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: estadoStyle.bg, color: estadoStyle.color,
          }}>
            {ESTADO_LABELS[obra.estado] || obra.estado}
          </span>
        </div>
      </div>

      {/* ── CONTENIDO ── */}
      <div style={{ paddingTop: 80, padding: '80px 24px 24px', maxWidth: 960, margin: '0 auto' }}>

        {/* Botones de módulos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginTop: 24 }}>
          {BOTONES.map(b => (
            <button
              key={b.id}
              onClick={() => setSeccion(seccion === b.id ? null : b.id)}
              style={{
                padding: '20px 16px',
                background: seccion === b.id ? 'var(--c-accent)' : 'white',
                color: seccion === b.id ? 'white' : 'var(--c-text)',
                border: '1px solid ' + (seccion === b.id ? 'var(--c-accent)' : 'var(--c-border)'),
                borderRadius: 10, cursor: 'pointer',
                fontWeight: 600, fontSize: 14, textAlign: 'left',
                boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                transition: 'all 0.15s',
              }}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Módulo activo */}
        {seccion && (
          <div style={{ marginTop: 20, background: 'white', borderRadius: 10, padding: 24, border: '1px solid var(--c-border)' }}>
            <h3 style={{ marginBottom: 20, color: 'var(--c-text)', fontSize: 16 }}>
              {BOTONES.find(b => b.id === seccion)?.label}
            </h3>

            {seccion === 'costo_previsto'
              ? <CostoPrevisto    obra={obra} perfil={perfil} onIrAPlanilla={() => setSeccion('planilla_medicion')} />
              : seccion === 'costo_abierto'
              ? <CostoAbierto     obra={obra} perfil={perfil} />
              : seccion === 'costo_explotado'
              ? <CostoExplotado   obra={obra} perfil={perfil} />
              : seccion === 'explosion_insumos'
              ? <ExplosionInsumos obra={obra} perfil={perfil} />
              : seccion === 'planilla_medicion'
              ? <PlanillaMedicion obra={obra} perfil={perfil} />
              : seccion === 'certificados'
              ? <Certificados     obra={obra} perfil={perfil} />
              : seccion === 'informe_horas'
              ? <InformeHoras     obra={obra} perfil={perfil} />
              : <p style={{ color: 'var(--c-text3)' }}>Módulo en desarrollo.</p>
            }
          </div>
        )}
      </div>
    </div>
  )
}

export default Obra