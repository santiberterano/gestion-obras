import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'

// ── Helpers ───────────────────────────────────────────────
const fmt  = (n) => n != null ? Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'
const fmtH = (n) => n != null ? Number(n).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' hs' : '—'

function esMO_explotado(fila) {
  return fila.categoria?.toUpperCase().startsWith('MANO DE OBRA')
}

function esMO_abierto(fila) {
  return fila.unidad === 'HS'
    || fila.descripcion?.toUpperCase().includes('OFICIAL')
    || fila.descripcion?.toUpperCase().includes('AYUDANTE')
}

// Horas de MO por unidad de medición para un ítem en una fuente
function horasMOPorUnidad(insumos, fuente) {
  return insumos
    .filter(f => fuente === 'explotado' ? esMO_explotado(f) : esMO_abierto(f))
    .reduce((s, f) => s + (f.cantidad || 0), 0)
}

// Badge de origen
function OrigenBadge({ origen }) {
  const cfg = {
    explotado: { bg: '#dbeafe', color: '#1d4ed8', label: 'Costo Explotado' },
    abierto:   { bg: '#dcfce7', color: '#15803d', label: 'Costo Abierto' },
    ausente:   { bg: '#fef3c7', color: '#b45309', label: 'Sin datos de MO' },
  }[origen] || { bg: '#f3f4f6', color: '#6b7280', label: origen }
  return (
    <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: '20px', background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  )
}

export default function InformeHoras({ obra }) {
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [filas, setFilas]       = useState([])   // filas del informe
  const [resumen, setResumen]   = useState(null) // totales
  const [filtroOrigen, setFiltroOrigen] = useState('todos')
  const [filtroMes, setFiltroMes]       = useState('todos')
  const [mesesDisponibles, setMesesDisponibles] = useState([])

  useEffect(() => { cargar() }, [obra.id]) // eslint-disable-line

  async function cargar() {
    setLoading(true); setError(null)
    try {
      // 1. Planilla items (ítems certificables de esta obra)
      const { data: planItems, error: e1 } = await supabase
        .from('planilla_items')
        .select('id, codigo, descripcion, unidad, cantidad, precio_venta, costo_previsto_id')
        .eq('obra_id', obra.id)
        .eq('tipo', 'item')
        .order('orden', { ascending: true })
      if (e1) throw new Error('Error cargando planilla_items: ' + e1.message)
      if (!planItems?.length) { setFilas([]); setLoading(false); return }

      // 2. Medición real acumulada por ítem (suma de porcentajes reales por mes)
      const { data: avances, error: e2 } = await supabase
        .from('medicion_avances')
        .select('planilla_item_id, mes, porcentaje')
        .eq('obra_id', obra.id)
        .eq('tipo', 'real')
      if (e2) throw new Error('Error cargando medicion_avances: ' + e2.message)

      const meses = [...new Set((avances || []).map(a => a.mes))].sort((a, b) => a - b)
      setMesesDisponibles(meses)

      // 3. Costo Explotado — insumos de MO agrupados por codigo_item
      const { data: explotadoRows } = await supabase
        .from('costo_explotado')
        .select('codigo_item, categoria, descripcion, unidad, cantidad, precio_unitario')
        .eq('obra_id', obra.id)
        .eq('tipo', 'insumo')

      // 4. Costo Abierto — insumos de MO agrupados por codigo_item
      const { data: abiertoRows } = await supabase
        .from('costo_abierto')
        .select('codigo_item, descripcion, unidad, cantidad, precio_unitario')
        .eq('obra_id', obra.id)
        .eq('tipo', 'insumo')

      // Indexar por codigo_item
      const explotadoMap = {}
      ;(explotadoRows || []).forEach(f => {
        if (!explotadoMap[f.codigo_item]) explotadoMap[f.codigo_item] = []
        explotadoMap[f.codigo_item].push(f)
      })

      const abiertoMap = {}
      ;(abiertoRows || []).forEach(f => {
        if (!abiertoMap[f.codigo_item]) abiertoMap[f.codigo_item] = []
        abiertoMap[f.codigo_item].push(f)
      })

      // 5. Construir filas del informe
      const resultado = planItems.map(item => {
        // Avances reales por mes
        const avancesItem = (avances || []).filter(a => a.planilla_item_id === item.id)
        const avanceAcumulado = avancesItem.reduce((s, a) => s + (a.porcentaje || 0), 0)

        // Avance por mes para desglose
        const porMes = {}
        avancesItem.forEach(a => { porMes[a.mes] = (porMes[a.mes] || 0) + a.porcentaje })

        // Buscar en Costo Explotado primero, luego Abierto
        let insumosMO = []
        let origen = 'ausente'
        let hsPorUnidad = 0

        const codigo = item.codigo

        if (codigo && explotadoMap[codigo]) {
          const insumos = explotadoMap[codigo].filter(esMO_explotado)
          if (insumos.length > 0) {
            insumosMO = insumos
            origen = 'explotado'
            hsPorUnidad = horasMOPorUnidad(insumos, 'explotado')
          }
        }

        if (origen === 'ausente' && codigo && abiertoMap[codigo]) {
          const insumos = abiertoMap[codigo].filter(esMO_abierto)
          if (insumos.length > 0) {
            insumosMO = insumos
            origen = 'abierto'
            hsPorUnidad = horasMOPorUnidad(insumos, 'abierto')
          }
        }

        // Horas previstas (cantidad del ítem × hs/unidad)
        const cantidadItem = item.cantidad || 0
        const hsPrevistas = cantidadItem * hsPorUnidad

        // Horas consumidas = hsPrevistas × avance acumulado real
        const hsConsumidas = hsPrevistas * avanceAcumulado

        // Horas consumidas por mes
        const hsConsumidasPorMes = {}
        meses.forEach(m => {
          const pct = porMes[m] || 0
          hsConsumidasPorMes[m] = hsPrevistas * pct
        })

        return {
          id:            item.id,
          codigo,
          descripcion:   item.descripcion,
          unidad:        item.unidad,
          cantidad:      cantidadItem,
          precioVenta:   item.precio_venta,
          origen,
          insumosMO,
          hsPorUnidad,
          hsPrevistas,
          avanceAcumulado,
          hsConsumidas,
          hsConsumidasPorMes,
          porMes,
          sinMedicion:   avancesItem.length === 0,
        }
      })

      // Resumen
      const totalHsPrevistas  = resultado.reduce((s, r) => s + r.hsPrevistas, 0)
      const totalHsConsumidas = resultado.reduce((s, r) => s + r.hsConsumidas, 0)
      const sinDatos          = resultado.filter(r => r.origen === 'ausente').length
      const deExplotado       = resultado.filter(r => r.origen === 'explotado').length
      const deAbierto         = resultado.filter(r => r.origen === 'abierto').length
      const sinMedicion       = resultado.filter(r => r.sinMedicion).length

      setResumen({ totalHsPrevistas, totalHsConsumidas, sinDatos, deExplotado, deAbierto, sinMedicion, total: resultado.length })
      setFilas(resultado)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  // Filtros
  const filasFiltradas = filas.filter(r => {
    if (filtroOrigen !== 'todos' && r.origen !== filtroOrigen) return false
    if (filtroMes !== 'todos' && !(r.porMes[Number(filtroMes)] > 0)) return false
    return true
  })

  // Horas consumidas según filtro de mes
  function hsConsumidasFiltradas(r) {
    if (filtroMes === 'todos') return r.hsConsumidas
    return r.hsConsumidasPorMes[Number(filtroMes)] || 0
  }

  function avanceFiltrado(r) {
    if (filtroMes === 'todos') return r.avanceAcumulado
    return r.porMes[Number(filtroMes)] || 0
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--c-text3)' }}>Calculando informe...</div>

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

  return (
    <div>

      {/* ── Resumen ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px', marginBottom: '24px' }}>
        {[
          { label: 'Hs. previstas total', value: fmtH(resumen.totalHsPrevistas), color: 'var(--c-text)' },
          { label: 'Hs. consumidas (real)', value: fmtH(resumen.totalHsConsumidas), color: 'var(--c-gold)' },
          { label: '% ejecutado MO', value: resumen.totalHsPrevistas > 0 ? (resumen.totalHsConsumidas / resumen.totalHsPrevistas * 100).toFixed(1) + '%' : '—', color: 'var(--c-success)' },
          { label: 'De Costo Explotado', value: resumen.deExplotado + ' ítems', color: '#1d4ed8' },
          { label: 'De Costo Abierto', value: resumen.deAbierto + ' ítems', color: '#15803d' },
          { label: 'Sin datos MO', value: resumen.sinDatos + ' ítems', color: resumen.sinDatos > 0 ? 'var(--c-danger)' : 'var(--c-text3)' },
        ].map(card => (
          <div key={card.label} style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: '10px', padding: '14px 16px', borderTop: '3px solid var(--c-gold)' }}>
            <div style={{ fontSize: '10px', color: 'var(--c-text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{card.label}</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* ── Filtros ── */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: 'var(--c-text3)' }}>Origen:</span>
        {['todos', 'explotado', 'abierto', 'ausente'].map(o => (
          <button key={o} onClick={() => setFiltroOrigen(o)}
            style={{ padding: '4px 12px', fontSize: '11px', fontWeight: '500', borderRadius: '20px', border: '1px solid', cursor: 'pointer',
              background: filtroOrigen === o ? 'var(--c-gold)' : 'white',
              color: filtroOrigen === o ? 'white' : 'var(--c-text2)',
              borderColor: filtroOrigen === o ? 'var(--c-gold)' : 'var(--c-border)',
            }}>
            {o === 'todos' ? 'Todos' : o === 'explotado' ? 'Explotado' : o === 'abierto' ? 'Abierto' : 'Sin datos'}
          </button>
        ))}

        <div style={{ width: '1px', height: '18px', background: 'var(--c-border)' }} />

        <span style={{ fontSize: '11px', color: 'var(--c-text3)' }}>Mes:</span>
        <button onClick={() => setFiltroMes('todos')}
          style={{ padding: '4px 12px', fontSize: '11px', borderRadius: '20px', border: '1px solid', cursor: 'pointer',
            background: filtroMes === 'todos' ? 'var(--c-gold)' : 'white',
            color: filtroMes === 'todos' ? 'white' : 'var(--c-text2)',
            borderColor: filtroMes === 'todos' ? 'var(--c-gold)' : 'var(--c-border)',
          }}>
          Acumulado
        </button>
        {mesesDisponibles.map(m => (
          <button key={m} onClick={() => setFiltroMes(String(m))}
            style={{ padding: '4px 12px', fontSize: '11px', borderRadius: '20px', border: '1px solid', cursor: 'pointer',
              background: filtroMes === String(m) ? 'var(--c-gold)' : 'white',
              color: filtroMes === String(m) ? 'white' : 'var(--c-text2)',
              borderColor: filtroMes === String(m) ? 'var(--c-gold)' : 'var(--c-border)',
            }}>
            Mes {String(m).padStart(2, '0')}
          </button>
        ))}
      </div>

      {/* ── Tabla ── */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: 'var(--c-text)', color: 'white' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '600' }}>Ítem</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap' }}>Cant.</th>
              <th style={{ padding: '8px 8px', textAlign: 'center', fontWeight: '600' }}>Origen MO</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap' }}>Hs/unid.</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap' }}>Hs previstas</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap', background: '#15803d' }}>
                % {filtroMes === 'todos' ? 'acum.' : `M${String(filtroMes).padStart(2,'0')}`}
              </th>
              <th style={{ padding: '8px 8px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap', background: '#15803d' }}>
                Hs consumidas
              </th>
              <th style={{ padding: '8px 8px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap' }}>
                Desvío
              </th>
            </tr>
          </thead>
          <tbody>
            {filasFiltradas.map((r, i) => {
              const hsC = hsConsumidasFiltradas(r)
              const avC = avanceFiltrado(r)
              const hsPrev = filtroMes === 'todos' ? r.hsPrevistas : r.hsPrevistas // previstas siempre sobre total
              const desvio = hsPrev > 0 ? ((hsC - hsPrev * avC) / (hsPrev * avC)) * 100 : null

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
                    {r.hsPrevistas > 0 ? fmtH(r.hsPrevistas) : '—'}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#15803d', fontWeight: '600' }}>
                    {avC > 0 ? (avC * 100).toFixed(1) + '%' : r.sinMedicion ? <span style={{ color: 'var(--c-text3)' }}>Sin medición</span> : '0%'}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: '700', color: 'var(--c-gold)' }}>
                    {hsC > 0 ? fmtH(hsC) : '—'}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                    {desvio != null && isFinite(desvio) ? (
                      <span style={{ color: desvio > 10 ? 'var(--c-danger)' : desvio < -5 ? 'var(--c-success)' : 'var(--c-text2)', fontWeight: '600' }}>
                        {desvio > 0 ? '+' : ''}{desvio.toFixed(1)}%
                      </span>
                    ) : <span style={{ color: 'var(--c-text3)' }}>—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {/* Totales */}
          <tfoot>
            <tr style={{ background: 'var(--c-text)', color: 'white' }}>
              <td colSpan={4} style={{ padding: '10px 12px', fontWeight: '700', fontSize: '13px' }}>
                Total — {filasFiltradas.length} ítems
              </td>
              <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '700' }}>
                {fmtH(filasFiltradas.reduce((s, r) => s + r.hsPrevistas, 0))}
              </td>
              <td />
              <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '700', color: 'var(--c-gold)' }}>
                {fmtH(filasFiltradas.reduce((s, r) => s + hsConsumidasFiltradas(r), 0))}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Aviso ítems sin datos */}
      {resumen.sinDatos > 0 && (
        <div style={{ marginTop: '16px', padding: '12px 16px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', fontSize: '12px', color: '#92400e' }}>
          <b>{resumen.sinDatos} ítem{resumen.sinDatos > 1 ? 's' : ''}</b> no tiene{resumen.sinDatos > 1 ? 'n' : ''} datos de mano de obra en Costo Explotado ni en Costo Abierto.
          Revisá que los códigos coincidan entre las tres tablas.
        </div>
      )}
    </div>
  )
}