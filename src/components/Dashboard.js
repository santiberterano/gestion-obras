import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const fmtPeso = (n) => n != null ? '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 }) : '—'
const fmtPct  = (n) => n != null ? (Number(n) * 100).toFixed(1) + '%' : '—'
const fmtHs   = (n) => n != null && n > 0 ? Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' hs' : '—'

const ESTADO_CFG = {
  en_curso:   { color: 'var(--c-en-curso)',   label: 'En curso' },
  contratada: { color: 'var(--c-contratada)', label: 'Contratada' },
  estudiada:  { color: 'var(--c-estudiada)',  label: 'Estudiada' },
  finalizada: { color: 'var(--c-finalizada)', label: 'Finalizada' },
}

function KpiCard({ label, value, color, sub }) {
  return (
    <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: '10px', padding: '14px 16px', borderTop: '3px solid var(--c-gold)' }}>
      <div style={{ fontSize: '10px', color: 'var(--c-text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: '700', color: color || 'var(--c-text)' }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--c-text3)', marginTop: '3px' }}>{sub}</div>}
    </div>
  )
}

function Donut({ pct, color, size = 56 }) {
  const r = 22
  const circ = 2 * Math.PI * r
  const filled = circ * Math.min(Math.max(pct || 0, 0), 1)
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" style={{ flexShrink: 0 }}>
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--c-border)" strokeWidth="7" />
      <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="7"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeDashoffset={circ * 0.25} strokeLinecap="round" />
      <text x="28" y="33" textAnchor="middle" fill="var(--c-text)" fontSize="11" fontWeight="600">
        {Math.round((pct || 0) * 100)}%
      </text>
    </svg>
  )
}

async function cargarKpis(obra) {
  const obraId = obra.id

  // Planilla items
  const { data: planItems } = await supabase
    .from('planilla_items')
    .select('id, tipo, precio_venta, cantidad')
    .eq('obra_id', obraId)
    .eq('tipo', 'item')

  const precioVentaTotal = (planItems || []).reduce((s, i) => s + (i.precio_venta || 0), 0)

  // Planilla config (duración)
  const { data: config } = await supabase
    .from('planilla_config')
    .select('duracion_meses')
    .eq('obra_id', obraId)
    .maybeSingle()

  const duracionMeses = config?.duracion_meses || null

  // Avances reales — último mes por ítem
  const { data: avances } = await supabase
    .from('medicion_avances')
    .select('planilla_item_id, mes, porcentaje, tipo')
    .eq('obra_id', obraId)
    .in('tipo', ['real', 'proyeccion_inicial'])
    .order('mes', { ascending: true })

  const avancesReal    = (avances || []).filter(a => a.tipo === 'real')
  const avancesProyIni = (avances || []).filter(a => a.tipo === 'proyeccion_inicial')

  // Último mes real
  const mesesReales = [...new Set(avancesReal.map(a => a.mes))].sort((a, b) => a - b)
  const ultimoMesReal = mesesReales.length > 0 ? Math.max(...mesesReales) : null
  const mesesRestantes = duracionMeses && ultimoMesReal ? duracionMeses - ultimoMesReal : null

  // Avance acumulado ponderado por precio_venta
  const planMap = {}
  ;(planItems || []).forEach(i => { planMap[i.id] = i })

  // Último porcentaje real por ítem
  const ultimoAvanceMap = {}
  avancesReal.forEach(a => {
    const actual = ultimoAvanceMap[a.planilla_item_id]
    if (!actual || a.mes > actual.mes) ultimoAvanceMap[a.planilla_item_id] = a
  })

  const totalPrecioVenta = precioVentaTotal || 1
  let sumaPonderada = 0
  Object.values(ultimoAvanceMap).forEach(a => {
    const item = planMap[a.planilla_item_id]
    if (item) sumaPonderada += (a.porcentaje || 0) * (item.precio_venta || 0)
  })
  const avanceAcumulado = totalPrecioVenta > 0 ? sumaPonderada / totalPrecioVenta : 0

  // Proyección inicial para el último mes real (desvío)
  const proyIniMap = {}
  avancesProyIni.forEach(a => {
    if (!ultimoMesReal || a.mes !== ultimoMesReal) return
    const actual = proyIniMap[a.planilla_item_id]
    if (!actual || a.mes > actual.mes) proyIniMap[a.planilla_item_id] = a
  })
  let sumaPonderadaProyIni = 0
  Object.values(proyIniMap).forEach(a => {
    const item = planMap[a.planilla_item_id]
    if (item) sumaPonderadaProyIni += (a.porcentaje || 0) * (item.precio_venta || 0)
  })
  const avanceProyIni = totalPrecioVenta > 0 ? sumaPonderadaProyIni / totalPrecioVenta : 0
  const desvioPct     = avanceAcumulado - avanceProyIni
  const desvioEco     = desvioPct * precioVentaTotal

  // Dinero certificado y costo consumido
  const dineroCertificado = precioVentaTotal * avanceAcumulado
  const costoConsumido    = (obra.costo_previsto_total || 0) * avanceAcumulado

  // Horas MO desde costo_explotado
  const { data: expRows } = await supabase
    .from('costo_explotado')
    .select('codigo_item, nombre_item, descripcion, cantidad')
    .eq('obra_id', obraId)
    .eq('tipo', 'insumo')
    .eq('categoria', 'MANO DE OBRA')
    .eq('unidad', 'HS')

  // expMap: codigo|nombre → hsPorUnidad
  const expMap = {}
  ;(expRows || []).forEach(f => {
    const key = `${f.codigo_item}|${f.nombre_item}`
    if (!expMap[key]) expMap[key] = 0
    expMap[key] += f.cantidad || 0
  })

  // planilla items con GL excluido
  const { data: planItemsAll } = await supabase
    .from('planilla_items')
    .select('id, codigo, descripcion, cantidad, unidad')
    .eq('obra_id', obraId)
    .eq('tipo', 'item')
    .neq('unidad', 'GL')

  let hsPrevistasTotales = 0
  let hsConsumidas = 0

  ;(planItemsAll || []).forEach(item => {
    const key = `${item.codigo}|${item.descripcion}`
    const hsPorUnidad = expMap[key] || 0
    if (!hsPorUnidad) return
    const hsPrev = hsPorUnidad * (item.cantidad || 0)
    hsPrevistasTotales += hsPrev
    const avance = ultimoAvanceMap[item.id]?.porcentaje || 0
    hsConsumidas += hsPrev * avance
  })

  const pctHsConsumidas  = hsPrevistasTotales > 0 ? hsConsumidas / hsPrevistasTotales : 0
  const pctHsDisponibles = 1 - pctHsConsumidas

  return {
    costoTotal: obra.costo_previsto_total || 0,
    precioVentaTotal,
    dineroCertificado,
    avanceAcumulado,
    costoConsumido,
    hsConsumidas,
    hsPrevistasTotales,
    pctHsConsumidas,
    pctHsDisponibles,
    mesesRestantes,
    duracionMeses,
    ultimoMesReal,
    desvioPct,
    desvioEco,
    avanceProyIni,
  }
}

export default function Dashboard({ perfil }) {
  const navigate    = useNavigate()
  const [obras, setObras]     = useState([])
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis]       = useState({})      // obraId → kpi data
  const [loadingKpi, setLoadingKpi] = useState({}) // obraId → bool

  useEffect(() => {
    async function fetchObras() {
      setLoading(true)
      const { data: vinculadas } = await supabase
        .from('usuario_obra')
        .select('obra_id')
        .eq('usuario_id', perfil.id)
      const ids = (vinculadas || []).map(v => v.obra_id)
      if (ids.length === 0) { setObras([]); setLoading(false); return }
      const { data } = await supabase
        .from('obras')
        .select('id, nombre, codigo, estado, costo_previsto_total, m2, cliente')
        .in('id', ids)
        .order('created_at', { ascending: false })
      setObras(data || [])

      // Cargar KPIs de todas las obras en paralelo
      const kpiResults = {}
      await Promise.all((data || []).map(async obra => {
        setLoadingKpi(prev => ({ ...prev, [obra.id]: true }))
        try {
          kpiResults[obra.id] = await cargarKpis(obra)
        } catch (e) {
          console.error('Error KPI obra', obra.id, e)
        }
        setLoadingKpi(prev => ({ ...prev, [obra.id]: false }))
      }))
      setKpis(kpiResults)
      setLoading(false)
    }
    fetchObras()
  }, [perfil.id])

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  if (loading) return (
    <div className="admin-dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <span style={{ color: 'var(--c-text3)', fontSize: 13 }}>Cargando...</span>
    </div>
  )

  return (
    <div className="admin-dashboard">
      {/* Header */}
      <header className="consca-header">
        <span className="consca-logo">CONSCA<span>+</span></span>
        <button className="consca-nav-btn consca-nav-btn--active">Jefe de Obra</button>
        <div className="consca-header__spacer" />
        <div className="consca-user">
          <div className="consca-avatar">
            {perfil?.nombre?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'JO'}
          </div>
          <span>{perfil?.nombre}</span>
          <button className="btn-logout" onClick={handleLogout}>Salir</button>
        </div>
      </header>

      <div className="admin-main">
        <div className="section-label" style={{ marginBottom: '16px' }}>Mis obras</div>

        {obras.length === 0 && (
          <p style={{ color: 'var(--c-text3)' }}>No tenés obras asignadas.</p>
        )}

        {obras.map(obra => {
          const k   = kpis[obra.id]
          const est = ESTADO_CFG[obra.estado] || { color: 'var(--c-text3)', label: obra.estado }

          return (
            <div key={obra.id} style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: '14px', padding: '20px 24px', marginBottom: '20px' }}>

              {/* Cabecera obra */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: est.color, flexShrink: 0 }} />
                    <h2 style={{ margin: 0, fontSize: '18px' }}>{obra.nombre}</h2>
                    {obra.codigo && <span style={{ fontSize: '12px', color: 'var(--c-text3)' }}>{obra.codigo}</span>}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--c-text3)', paddingLeft: '20px' }}>
                    {est.label}{obra.cliente ? ` · ${obra.cliente}` : ''}{obra.m2 ? ` · ${obra.m2} m²` : ''}
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/obras/${obra.id}`)}
                  style={{ padding: '8px 20px', background: 'var(--c-gold)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Ir a la obra →
                </button>
              </div>

              {/* KPIs */}
              {loadingKpi[obra.id] && (
                <div style={{ fontSize: '12px', color: 'var(--c-text3)', padding: '12px 0' }}>Calculando KPIs...</div>
              )}

              {k && !loadingKpi[obra.id] && (
                <>
                  {/* Fila 1 — financiero */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                    <KpiCard label="Costo total obra"     value={fmtPeso(k.costoTotal)}        color="var(--c-text)" />
                    <KpiCard label="Precio venta total"   value={fmtPeso(k.precioVentaTotal)}   color="var(--c-text)" />
                    <KpiCard
                      label="Avance acumulado"
                      value={
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Donut pct={k.avanceAcumulado} color="var(--c-gold)" />
                        </div>
                      }
                    />
                    <KpiCard label="Dinero certificado"   value={fmtPeso(k.dineroCertificado)}  color="var(--c-gold)" />
                    <KpiCard label="Costo consumido"      value={fmtPeso(k.costoConsumido)}      color="var(--c-text2)" sub={`de ${fmtPeso(k.costoTotal)}`} />
                    <KpiCard label="Meses restantes"      value={k.mesesRestantes != null ? `${k.mesesRestantes} meses` : '—'} sub={k.duracionMeses ? `de ${k.duracionMeses} total` : null} />
                  </div>

                  {/* Fila 2 — horas y desvío */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                    <KpiCard label="Hs MO consumidas"     value={fmtHs(k.hsConsumidas)}         color="var(--c-gold)" sub={`de ${fmtHs(k.hsPrevistasTotales)}`} />
                    <KpiCard
                      label="% hs consumidas"
                      value={
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Donut pct={k.pctHsConsumidas} color="var(--c-gold)" />
                        </div>
                      }
                    />
                    <KpiCard
                      label="% hs disponibles"
                      value={
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Donut pct={k.pctHsDisponibles} color="var(--c-success)" />
                        </div>
                      }
                    />
                    <KpiCard
                      label="Desvío avance"
                      value={fmtPct(Math.abs(k.desvioPct))}
                      color={k.desvioPct >= 0 ? 'var(--c-success)' : 'var(--c-danger)'}
                      sub={k.desvioPct >= 0 ? `adelantado vs proyección` : `atrasado vs proyección`}
                    />
                    <KpiCard
                      label="Desvío económico"
                      value={fmtPeso(Math.abs(k.desvioEco))}
                      color={k.desvioEco >= 0 ? 'var(--c-success)' : 'var(--c-danger)'}
                      sub={k.desvioEco >= 0 ? `a favor` : `en contra`}
                    />
                    <KpiCard
                      label="Avance proyectado M{k.ultimoMesReal || '—'}"
                      value={fmtPct(k.avanceProyIni)}
                      color="var(--c-text2)"
                    />
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}