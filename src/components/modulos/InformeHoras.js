import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'

const fmt  = (n) => n != null ? Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'
const fmtH = (n) => n != null && n > 0 ? Number(n).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' hs' : '—'

// Categorías de MO reconocidas en costo_abierto
const MO_KEYWORDS = ['Oficial Civil', 'Medio Oficial Civil', 'Ayudante Civil']

function OrigenBadge({ origen }) {
  const cfg = {
    explotado: { bg: '#dbeafe', color: '#1d4ed8', label: 'Costo Explotado' },
    abierto:   { bg: '#dcfce7', color: '#15803d', label: 'Costo Abierto'   },
    ausente:   { bg: '#fef3c7', color: '#b45309', label: 'Sin datos MO'    },
  }[origen] || { bg: '#f3f4f6', color: '#6b7280', label: origen }
  return (
    <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: '20px', background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  )
}

export default function InformeHoras({ obra }) {
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [filas, setFilas]               = useState([])
  const [resumen, setResumen]           = useState(null)
  const [filtroOrigen, setFiltroOrigen] = useState('todos')
  const [filtroMes, setFiltroMes]       = useState('todos')
  const [mesesDisponibles, setMesesDisponibles] = useState([])

  useEffect(() => { cargar() }, [obra.id]) // eslint-disable-line

  async function cargar() {
    setLoading(true); setError(null)
    try {

      // ── 1. Planilla items ──────────────────────────────────────────────
      const { data: planItems, error: e1 } = await supabase
        .from('planilla_items')
        .select('id, codigo, descripcion, unidad, cantidad')
        .eq('obra_id', obra.id)
        .eq('tipo', 'item')
        .neq('unidad', 'GL')
        .order('orden', { ascending: true })
      if (e1) throw new Error('planilla_items: ' + e1.message)
      if (!planItems?.length) { setFilas([]); setLoading(false); return }

      // ── 2. Último avance real por ítem ────────────────────────────────
      const { data: avances, error: e2 } = await supabase
        .from('medicion_avances')
        .select('planilla_item_id, mes, porcentaje')
        .eq('obra_id', obra.id)
        .eq('tipo', 'real')
        .order('mes', { ascending: true })
      if (e2) throw new Error('medicion_avances: ' + e2.message)

      const meses = [...new Set((avances || []).map(a => a.mes))].sort((a, b) => a - b)
      setMesesDisponibles(meses)

      // avanceAcumMap: planilla_item_id → { mes, porcentaje } del mes más alto
      // avancePorMes:  planilla_item_id → { mes: porcentaje }
      const avanceAcumMap = {}
      const avancePorMes  = {}
      ;(avances || []).forEach(a => {
        if (!avancePorMes[a.planilla_item_id]) avancePorMes[a.planilla_item_id] = {}
        avancePorMes[a.planilla_item_id][a.mes] = a.porcentaje
        const actual = avanceAcumMap[a.planilla_item_id]
        if (!actual || a.mes > actual.mes) {
          avanceAcumMap[a.planilla_item_id] = { mes: a.mes, porcentaje: a.porcentaje }
        }
      })

      // ── 3. Costo Explotado — insumos MO (categoria MANO DE OBRA, unidad HS) ──
      // Join por codigo_item + nombre_item + obra_id para evitar mezclar obras
      const { data: expRows, error: e3 } = await supabase
        .from('costo_explotado')
        .select('codigo_item, nombre_item, descripcion, cantidad')
        .eq('obra_id', obra.id)
        .eq('tipo', 'insumo')
        .eq('categoria', 'MANO DE OBRA')
        .eq('unidad', 'HS')
      if (e3) throw new Error('costo_explotado: ' + e3.message)

      // expMap: "codigo|nombre" → { hsPorUnidad, insumos[] }
      const expMap = {}
      ;(expRows || []).forEach(f => {
        const key = `${f.codigo_item}|${f.nombre_item}`
        if (!expMap[key]) expMap[key] = { hsPorUnidad: 0, insumos: [] }
        expMap[key].hsPorUnidad += f.cantidad || 0
        expMap[key].insumos.push(f)
      })

      // ── 4. Costo Abierto — SOLO para ítems sin match en explotado ────
      // Filtra por descripcion que contenga alguna de las categorías MO conocidas
      const moFilter = MO_KEYWORDS.map(k => `descripcion.ilike.%${k}%`).join(',')
      const { data: abRows, error: e4 } = await supabase
        .from('costo_abierto')
        .select('codigo_item, nombre_item, descripcion, cantidad')
        .eq('obra_id', obra.id)
        .eq('tipo', 'insumo')
        .eq('unidad', 'HS')
        .or(moFilter)
      if (e4) throw new Error('costo_abierto: ' + e4.message)

      // abMap: "codigo|nombre" → { hsPorUnidad, insumos[] }
      const abMap = {}
      ;(abRows || []).forEach(f => {
        const key = `${f.codigo_item}|${f.nombre_item}`
        if (!abMap[key]) abMap[key] = { hsPorUnidad: 0, insumos: [] }
        abMap[key].hsPorUnidad += f.cantidad || 0
        abMap[key].insumos.push(f)
      })

      // ── 5. Construir filas ────────────────────────────────────────────
      const resultado = planItems.map(item => {
        const key = `${item.codigo}|${item.descripcion}`

        // PRIMERO explotado, SOLO si no hay → abierto
        let origen      = 'ausente'
        let hsPorUnidad = 0
        let insumos     = []

        if (expMap[key]) {
          origen      = 'explotado'
          hsPorUnidad = expMap[key].hsPorUnidad
          insumos     = expMap[key].insumos
        } else if (abMap[key]) {
          origen      = 'abierto'
          hsPorUnidad = abMap[key].hsPorUnidad
          insumos     = abMap[key].insumos
        }

        const cantidad     = item.cantidad || 0
        const hsPrevistas  = cantidad * hsPorUnidad

        // Avance: porcentaje ya en decimal (0.1 = 10%), NO dividir por 100
        const acumData         = avanceAcumMap[item.id]
        const avanceAcumulado  = acumData?.porcentaje || 0
        const sinMedicion      = !acumData
        const porMes           = avancePorMes[item.id] || {}

        const hsConsumidas = hsPrevistas * avanceAcumulado

        const hsConsumidasPorMes = {}
        meses.forEach(m => {
          hsConsumidasPorMes[m] = hsPrevistas * (porMes[m] || 0)
        })

        return {
          id: item.id,
          codigo: item.codigo,
          descripcion: item.descripcion,
          unidad: item.unidad,
          cantidad,
          origen,
          hsPorUnidad,
          hsPrevistas,
          avanceAcumulado,
          hsConsumidas,
          hsConsumidasPorMes,
          porMes,
          sinMedicion,
          insumos,
        }
      })

      // ── 6. Resumen ────────────────────────────────────────────────────
      const totalHsPrevistas = resultado.reduce((s, r) => s + r.hsPrevistas, 0)
      const totalHsConsumidas = resultado.reduce((s, r) => s + r.hsConsumidas, 0)

      setResumen({
        totalHsPrevistas,
        totalHsConsumidas,
        sinDatos:    resultado.filter(r => r.origen === 'ausente').length,
        deExplotado: resultado.filter(r => r.origen === 'explotado').length,
        deAbierto:   resultado.filter(r => r.origen === 'abierto').length,
        sinMedicion: resultado.filter(r => r.sinMedicion).length,
        total:       resultado.length,
      })
      setFilas(resultado)

    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  // ── Filtros ──────────────────────────────────────────────────────────
  const filasFiltradas = filas.filter(r => {
    if (filtroOrigen !== 'todos' && r.origen !== filtroOrigen) return false
    if (filtroMes !== 'todos' && !(r.porMes[Number(filtroMes)] > 0)) return false
    return true
  })

  function hsConsumidasFiltradas(r) {
    if (filtroMes === 'todos') return r.hsConsumidas
    return r.hsConsumidasPorMes[Number(filtroMes)] || 0
  }

  function avanceFiltrado(r) {
    if (filtroMes === 'todos') return r.avanceAcumulado
    return r.porMes[Number(filtroMes)] || 0
  }

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--c-text3)' }}>
      Calculando informe...
    </div>
  )

  if (error) return (
    <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: 'var(--c-danger)', fontSize: '14px' }}>
      {error}
    </div>
  )

  if (filas.length === 0) return (
    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--c-text3)', fontSize: '14px' }}>
      Para ver este informe necesitás tener cargados: Costo Previsto → Planilla de Cotización generada → Medición real.
    </div>
  )

  const totalHsFiltradas     = filasFiltradas.reduce((s, r) => s + r.hsPrevistas, 0)
  const totalHsConsFiltradas = filasFiltradas.reduce((s, r) => s + hsConsumidasFiltradas(r), 0)

  return (
    <div>

      {/* ── Resumen cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '10px', marginBottom: '24px' }}>
        {[
          { label: 'Hs previstas total',  value: fmtH(resumen.totalHsPrevistas),  color: 'var(--c-text)' },
          { label: 'Hs a avance actual',  value: fmtH(resumen.totalHsConsumidas), color: 'var(--c-gold)' },
          { label: '% ejecutado MO',
            value: resumen.totalHsPrevistas > 0
              ? (resumen.totalHsConsumidas / resumen.totalHsPrevistas * 100).toFixed(1) + '%'
              : '—',
            color: 'var(--c-success)' },
          { label: 'De Costo Explotado', value: resumen.deExplotado + ' ítems', color: '#1d4ed8' },
          { label: 'De Costo Abierto',   value: resumen.deAbierto   + ' ítems', color: '#15803d' },
          { label: 'Sin datos MO',
            value: resumen.sinDatos + ' ítems',
            color: resumen.sinDatos > 0 ? 'var(--c-danger)' : 'var(--c-text3)' },
        ].map(card => (
          <div key={card.label} style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: '10px', padding: '14px 16px', borderTop: '3px solid var(--c-gold)' }}>
            <div style={{ fontSize: '10px', color: 'var(--c-text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{card.label}</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* ── Filtros ── */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: 'var(--c-text3)' }}>Origen:</span>
        {[
          { k: 'todos',     l: 'Todos' },
          { k: 'explotado', l: 'Explotado' },
          { k: 'abierto',   l: 'Abierto' },
          { k: 'ausente',   l: 'Sin datos' },
        ].map(o => (
          <button key={o.k} onClick={() => setFiltroOrigen(o.k)} style={{
            padding: '4px 12px', fontSize: '11px', fontWeight: '500', borderRadius: '20px',
            border: '1px solid', cursor: 'pointer',
            background: filtroOrigen === o.k ? 'var(--c-gold)' : 'white',
            color:      filtroOrigen === o.k ? 'white' : 'var(--c-text2)',
            borderColor:filtroOrigen === o.k ? 'var(--c-gold)' : 'var(--c-border)',
          }}>{o.l}</button>
        ))}

        <div style={{ width: '1px', height: '18px', background: 'var(--c-border)' }} />

        <span style={{ fontSize: '11px', color: 'var(--c-text3)' }}>Mes:</span>
        <button onClick={() => setFiltroMes('todos')} style={{
          padding: '4px 12px', fontSize: '11px', borderRadius: '20px', border: '1px solid', cursor: 'pointer',
          background: filtroMes === 'todos' ? 'var(--c-gold)' : 'white',
          color:      filtroMes === 'todos' ? 'white' : 'var(--c-text2)',
          borderColor:filtroMes === 'todos' ? 'var(--c-gold)' : 'var(--c-border)',
        }}>Acumulado</button>
        {mesesDisponibles.map(m => (
          <button key={m} onClick={() => setFiltroMes(String(m))} style={{
            padding: '4px 12px', fontSize: '11px', borderRadius: '20px', border: '1px solid', cursor: 'pointer',
            background: filtroMes === String(m) ? 'var(--c-gold)' : 'white',
            color:      filtroMes === String(m) ? 'white' : 'var(--c-text2)',
            borderColor:filtroMes === String(m) ? 'var(--c-gold)' : 'var(--c-border)',
          }}>Mes {String(m).padStart(2, '0')}</button>
        ))}
      </div>

      {/* ── Tabla ── */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: 'var(--c-text)', color: 'white' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left',   fontWeight: '600' }}>Ítem</th>
              <th style={{ padding: '8px 8px',  textAlign: 'right',  fontWeight: '600', whiteSpace: 'nowrap' }}>Cant.</th>
              <th style={{ padding: '8px 8px',  textAlign: 'center', fontWeight: '600' }}>Origen MO</th>
              <th style={{ padding: '8px 8px',  textAlign: 'right',  fontWeight: '600', whiteSpace: 'nowrap' }}>Hs/unid.</th>
              <th style={{ padding: '8px 8px',  textAlign: 'right',  fontWeight: '600', whiteSpace: 'nowrap' }}>Hs previstas</th>
              <th style={{ padding: '8px 8px',  textAlign: 'right',  fontWeight: '600', whiteSpace: 'nowrap', background: '#15803d' }}>
                % {filtroMes === 'todos' ? 'acum.' : `M${String(filtroMes).padStart(2,'0')}`}
              </th>
              <th style={{ padding: '8px 8px',  textAlign: 'right',  fontWeight: '600', whiteSpace: 'nowrap', background: '#15803d' }}>
                Hs a avance
              </th>
            </tr>
          </thead>
          <tbody>
            {filasFiltradas.map((r, i) => {
              const hsC = hsConsumidasFiltradas(r)
              const avC = avanceFiltrado(r)
              return (
                <tr key={r.id} style={{ background: i % 2 === 0 ? 'white' : 'var(--c-surface2)', borderBottom: '1px solid var(--c-border)' }}>
                  <td style={{ padding: '7px 12px' }}>
                    <div style={{ fontWeight: '500', color: 'var(--c-text)' }}>{r.descripcion}</div>
                    {r.codigo && <div style={{ fontSize: '10px', color: 'var(--c-text3)' }}>{r.codigo}</div>}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--c-text2)' }}>
                    {r.cantidad > 0 ? Number(r.cantidad).toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '—'}
                    {r.unidad && <span style={{ fontSize: '10px', color: 'var(--c-text3)', marginLeft: '3px' }}>{r.unidad}</span>}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                    <OrigenBadge origen={r.origen} />
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--c-text2)' }}>
                    {r.hsPorUnidad > 0 ? fmt(r.hsPorUnidad) : '—'}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: '600', color: 'var(--c-text)' }}>
                    {fmtH(r.hsPrevistas)}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#15803d', fontWeight: '600' }}>
                    {avC > 0
                      ? (avC * 100).toFixed(1) + '%'
                      : r.sinMedicion
                        ? <span style={{ color: 'var(--c-text3)', fontWeight: '400' }}>Sin medición</span>
                        : '0%'}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: '700', color: 'var(--c-gold)' }}>
                    {fmtH(hsC)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--c-text)', color: 'white' }}>
              <td colSpan={4} style={{ padding: '10px 12px', fontWeight: '700', fontSize: '13px' }}>
                Total — {filasFiltradas.length} ítems
              </td>
              <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '700' }}>
                {fmtH(totalHsFiltradas)}
              </td>
              <td />
              <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '700', color: 'var(--c-gold)' }}>
                {fmtH(totalHsConsFiltradas)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Aviso ítems sin datos */}
      {resumen.sinDatos > 0 && (
        <div style={{ marginTop: '16px', padding: '12px 16px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', fontSize: '12px', color: '#92400e' }}>
          <b>{resumen.sinDatos} ítem{resumen.sinDatos > 1 ? 's' : ''}</b> no tiene{resumen.sinDatos > 1 ? 'n' : ''} datos de mano de obra en Costo Explotado ni en Costo Abierto.
        </div>
      )}
    </div>
  )
}