import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const ESTADO_COLORS = {
  estudiada:  { bg: '#f3f4f6', color: '#6b7280', dot: '#9ca3af' },
  contratada: { bg: '#dbeafe', color: '#1d4ed8', dot: '#3b82f6' },
  en_curso:   { bg: '#dcfce7', color: '#16a34a', dot: '#22c55e' },
  finalizada: { bg: '#f3f4f6', color: '#374151', dot: '#6b7280' },
}

const ESTADO_LABELS = {
  estudiada:  'Estudiada',
  contratada: 'Contratada',
  en_curso:   'En curso',
  finalizada: 'Finalizada',
}

function fmtMoney(n) {
  if (!n) return null
  return '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

export default function Dashboard({ perfil }) {
  const navigate = useNavigate()
  const [obras, setObras]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { cargarObras() }, []) // eslint-disable-line

  async function cargarObras() {
    setLoading(true)
    const { data: vinculadas } = await supabase
      .from('usuario_obra')
      .select('obra_id')
      .eq('usuario_id', perfil.id)

    const ids = (vinculadas || []).map(v => v.obra_id)

    if (!ids.length) { setObras([]); setLoading(false); return }

    const { data } = await supabase
      .from('obras')
      .select('id, nombre, codigo, estado, costo_previsto_total, m2, cliente, categoria_obra')
      .in('id', ids)
      .order('created_at', { ascending: false })

    setObras(data || [])
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  const enCurso    = obras.filter(o => o.estado === 'en_curso')
  const contratada = obras.filter(o => o.estado === 'contratada')
  const otras      = obras.filter(o => !['en_curso', 'contratada'].includes(o.estado))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)' }}>

      {/* ── Header ── */}
      <header className="consca-header">
        <span className="consca-logo">CONSCA<span>+</span></span>
        <div className="consca-header__spacer" />
        <div className="consca-user">
          <div className="consca-avatar">
            {perfil?.nombre?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'JO'}
          </div>
          <span style={{ fontSize: 13, color: 'var(--c-text2)' }}>{perfil?.nombre}</span>
          <button className="btn-logout" onClick={handleLogout}>Salir</button>
        </div>
      </header>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── KPIs ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 32 }}>
          {[
            { label: 'Obras asignadas', value: obras.length, color: 'var(--c-text)' },
            { label: 'En curso',        value: enCurso.length, color: '#16a34a' },
            { label: 'Contratadas',     value: contratada.length, color: '#1d4ed8' },
            { label: 'Otras',           value: otras.length, color: 'var(--c-text3)' },
          ].map(k => (
            <div key={k.label} style={{ background: 'white', border: '1px solid var(--c-border)', borderRadius: 10, padding: '16px', borderTop: '3px solid var(--c-gold)' }}>
              <div style={{ fontSize: 10, color: 'var(--c-text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* ── Lista de obras ── */}
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--c-text3)', padding: 60 }}>Cargando obras...</div>
        ) : obras.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--c-text3)', padding: 60, fontSize: 14 }}>
            No tenés obras asignadas aún.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {obras.map(obra => {
              const est = ESTADO_COLORS[obra.estado] || { bg: '#f3f4f6', color: '#666', dot: '#9ca3af' }
              return (
                <div
                  key={obra.id}
                  onClick={() => navigate(`/obras/${obra.id}`)}
                  style={{
                    background: 'white', border: '1px solid var(--c-border)',
                    borderRadius: 10, padding: '16px 20px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 16,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    transition: 'box-shadow 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'}
                >
                  {/* Dot de estado */}
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: est.dot, flexShrink: 0 }} />

                  {/* Info principal */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: 'var(--c-text)', fontSize: 14, marginBottom: 2 }}>
                      {obra.nombre}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--c-text3)', display: 'flex', gap: 12 }}>
                      {obra.codigo  && <span>Cód: {obra.codigo}</span>}
                      {obra.cliente && <span>{obra.cliente}</span>}
                      {obra.m2      && <span>{Number(obra.m2).toLocaleString('es-AR')} m²</span>}
                    </div>
                  </div>

                  {/* CP */}
                  {obra.costo_previsto_total && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-accent)' }}>
                        {fmtMoney(obra.costo_previsto_total)}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--c-text3)' }}>Costo previsto</div>
                    </div>
                  )}

                  {/* Estado badge */}
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    background: est.bg, color: est.color, flexShrink: 0,
                  }}>
                    {ESTADO_LABELS[obra.estado] || obra.estado}
                  </span>

                  <span style={{ color: 'var(--c-text3)', fontSize: 16 }}>›</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}