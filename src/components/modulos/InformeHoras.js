import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'

const fmtH = (n) =>
  n != null && n > 0
    ? Number(n).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' hs'
    : '—'

const fmtN = (n, dec = 2) =>
  n != null
    ? Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
    : '—'

export default function InformeHoras({ obra }) {
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [filas, setFilas]     = useState([])
  const [resumen, setResumen] = useState(null)
  const [filtroMes, setFiltroMes]           = useState('todos')
  const [mesesDisponibles, setMesesDisponibles] = useState([])

  useEffect(() => { cargar() }, [obra.id]) // eslint-disable-line

  async function cargar() {
    setLoading(true)
    setError(null)
    try {

      // ── 1. Items de planilla de medición ──────────────────────────────────
      const { data: planItems, error: e1 } = await supabase
        .from('planilla_items')
        .select('id, codigo, descripcion, unidad, cantidad')
        .eq('obra_id', obra.id)
        .eq('tipo', 'item')
        .neq('unidad', 'GL')          // GL = globales/subcontratos, cantidad no es unidad física
        .order('orden', { ascending: true })
      if (e1) throw new Error('planilla_items: ' + e1.message)
      if (!planItems?.length) { setFilas([]); setLoading(false); return }

      // ── 2. Avances reales — solo tipo 'real' ──────────────────────────────
      // Por ítem tomamos el porcentaje del mes más alto (= acumulado real)
      const { data: avances, error: e2 } = await supabase
        .from('medicion_avances')
        .select('planilla_item_id, mes, porcentaje')
        .eq('obra_id', obra.id)
        .eq('tipo', 'real')
        .order('mes', { ascending: true })
      if (e2) throw new Error('medicion_avances: ' + e2.message)

      // Meses disponibles para filtro
      const meses = [...new Set((avances || []).map(a => a.mes))].sort((a, b) => a - b)
      setMesesDisponibles(meses)

      // Map: planilla_item_id → { ultimoMes, porcentaje, porMes: { mes: pct } }
      const avanceMap = {}
      ;(avances || []).forEach(a => {
        if (!avanceMap[a.planilla_item_id]) {
          avanceMap[a.planilla_item_id] = { ultimoMes: 0, porcentaje: 0, porMes: {} }
        }
        avanceMap[a.planilla_item_id].porMes[a.mes] = a.porcentaje
        if (a.mes > avanceMap[a.planilla_item_id].ultimoMes) {
          avanceMap[a.planilla_item_id].ultimoMes   = a.mes
          avanceMap[a.planilla_item_id].porcentaje  = a.porcentaje
        }
      })

      // ── 3. Insumos MO de costo_explotado ─────────────────────────────────
      // tipo='insumo', categoria='MANO DE OBRA'
      // cantidad = hs por unidad del ítem padre
      const { data: moRows, error: e3 } = await supabase
        .from('costo_explotado')
        .select('codigo_item, descripcion, cantidad')
        .eq('obra_id', obra.id)
        .eq('tipo', 'insumo')
        .eq('categoria', 'MANO DE OBRA')
      if (e3) throw new Error('costo_explotado: ' + e3.message)

      // Map: codigo_item → { totalHs, detalle: [{ descripcion, cantidad }] }
      // totalHs = suma de cantidad de todos los insumos MO del ítem
      const moMap = {}
      ;(moRows || []).forEach(r => {
        if (!moMap[r.codigo_item]) moMap[r.codigo_item] = { totalHs: 0, detalle: [] }
        moMap[r.codigo_item].totalHs += r.cantidad || 0
        moMap[r.codigo_item].detalle.push({ descripcion: r.descripcion, cantidad: r.cantidad || 0 })
      })

      // ── 4. Construir filas ────────────────────────────────────────────────
      const resultado = planItems.map(item => {
        const mo          = moMap[item.codigo]          // puede ser undefined
        const avData      = avanceMap[item.id]          // puede ser undefined
        const hsPorUnidad = mo?.totalHs    || 0
        const cantPlanilla = item.cantidad || 0
        const hsPrevistas  = cantPlanilla * hsPorUnidad

        // Avance acumulado = porcentaje del último mes real (ya es decimal: 0.45 = 45%)
        const avanceAcum  = avData?.porcentaje || 0
        const hsConsumidas = hsPrevistas * avanceAcum

        // Por mes
        const hsPorMes = {}
        meses.forEach(m => {
          const pct = avData?.porMes[m] || 0
          hsPorMes[m] = hsPrevistas * pct
        })

        return {
          id:           item.id,
          codigo:       item.codigo,
          descripcion:  item.descripcion,
          unidad:       item.unidad,
          cantidad:     cantPlanilla,
          tieneMO:      !!mo,
          hsPorUnidad,
          detalleMO:    mo?.detalle || [],
          hsPrevistas,
          tieneMedicion: !!avData,
          avanceAcum,
          ultimoMes:    avData?.ultimoMes || null,
          hsConsumidas,
          hsPorMes,
        }
      })

      // ── 5. Resumen ───────────────────────────────────────────────────────
      const totalPrevistas  = resultado.reduce((s, r) => s + r.hsPrevistas,  0)
      const totalConsumidas = resultado.reduce((s, r) => s + r.hsConsumidas, 0)
      setResumen({
        totalPrevistas,
        totalConsumidas,
        conMO:      resultado.filter(r => r.tieneMO).length,
        sinMO:      resultado.filter(r => !r.tieneMO).length,
        conMedicion: resultado.filter(r => r.tieneMedicion).length,
        sinMedicion: resultado.filter(r => !r.tieneMedicion).length,
        total:      resultado.length,
      })
      setFilas(resultado)

    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  // ── Helpers de filtro ────────────────────────────────────────────────────
  function hsConsumidasParaMes(r) {
    if (filtroMes === 'todos') return r.hsConsumidas
    return r.hsPorMes[Number(filtroMes)] || 0
  }

  function avanceParaMes(r) {
    if (filtroMes === 'todos') return r.avanceAcum
    return r.tieneMedicion ? (r.hsPorMes[Number(filtroMes)] / (r.hsPrevistas || 1)) : 0
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--c-text3)' }}>
      Calculando informe de horas...
    </div>
  )

  if (error) return (
    <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: 'var(--c-danger)', fontSize: '13px' }}>
      ⚠️ {error}
    </div>
  )

  if (!filas.length) return (
    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--c-text3)', fontSize: '14px' }}>
      Necesitás tener generada la Planilla de Cotización y al menos una Medición real cargada.
    </div>
  )

  const totalHsFiltradas  = filas.reduce((s, r) => s + r.hsPrevistas, 0)
  const totalConsFiltradas = filas.reduce((s, r) => s + hsConsumidasParaMes(r), 0)
  const pctEjecutado = totalHsFiltradas > 0
    ? (totalConsFiltradas / totalHsFiltradas * 100).toFixed(1)
    : null

  return (
    <div>

      {/* ── Cards resumen ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px', marginBottom: '24px' }}>
        {[
          { label: 'Hs previstas total',   value: fmtH(resumen.totalPrevistas),  color: 'var(--c-text)' },
          { label: 'Hs consumidas (real)',  value: fmtH(resumen.totalConsumidas), color: 'var(--c-gold)' },
          { label: '% ejecutado MO',
            value: resumen.totalPrevistas > 0
              ? (resumen.totalConsumidas / resumen.totalPrevistas * 100).toFixed(1) + '%'
              : '—',
            color: 'var(--c-success)' },
          { label: 'Ítems con MO',    value: resumen.conMO + ' / ' + resumen.total, color: '#1d4ed8' },
          { label: 'Sin datos MO',    value: resumen.sinMO,    color: resumen.sinMO    > 0 ? 'var(--c-danger)' : 'var(--c-text3)' },
          { label: 'Sin medición',    value: resumen.sinMedicion, color: resumen.sinMedicion > 0 ? '#ca8a04' : 'var(--c-text3)' },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: '10px', padding: '14px 16px', borderTop: '3px solid var(--c-gold)' }}>
            <div style={{ fontSize: '10px', color: 'var(--c-text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{c.label}</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Filtro mes ── */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: 'var(--c-text3)' }}>Ver:</span>
        <button onClick={() => setFiltroMes('todos')} style={{
          padding: '4px 12px', fontSize: '11px', borderRadius: '20px', border: '1px solid', cursor: 'pointer',
          background: filtroMes === 'todos' ? 'var(--c-gold)' : 'white',
          color:      filtroMes === 'todos' ? 'white' : 'var(--c-text2)',
          borderColor:filtroMes === 'todos' ? 'var(--c-gold)' : 'var(--c-border)',
        }}>
          Acumulado
        </button>
        {mesesDisponibles.map(m => (
          <button key={m} onClick={() => setFiltroMes(String(m))} style={{
            padding: '4px 12px', fontSize: '11px', borderRadius: '20px', border: '1px solid', cursor: 'pointer',
            background: filtroMes === String(m) ? 'var(--c-gold)' : 'white',
            color:      filtroMes === String(m) ? 'white' : 'var(--c-text2)',
            borderColor:filtroMes === String(m) ? 'var(--c-gold)' : 'var(--c-border)',
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
              <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: '600', minWidth: '200px' }}>Ítem</th>
              <th style={{ padding: '9px 8px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap' }}>Cant.</th>
              <th style={{ padding: '9px 8px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap' }}>Hs/unid.</th>
              <th style={{ padding: '9px 8px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap' }}>Hs previstas</th>
              <th style={{ padding: '9px 8px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap', background: '#15803d' }}>
                % {filtroMes === 'todos' ? 'acum.' : `M${String(filtroMes).padStart(2,'0')}`}
              </th>
              <th style={{ padding: '9px 8px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap', background: '#15803d' }}>
                Hs consumidas
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((r, i) => {
              const hsC = hsConsumidasParaMes(r)
              const avC = avanceParaMes(r)
              const sinMO  = !r.tieneMO
              const sinMed = !r.tieneMedicion

              return (
                <tr key={r.id} style={{
                  background: i % 2 === 0 ? 'white' : 'var(--c-surface2)',
                  borderBottom: '1px solid var(--c-border)',
                  opacity: sinMO ? 0.6 : 1,
                }}>
                  {/* Descripción */}
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ fontWeight: '500', color: 'var(--c-text)' }}>{r.descripcion}</div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                      {r.codigo && (
                        <span style={{ fontSize: '10px', color: 'var(--c-text3)' }}>{r.codigo}</span>
                      )}
                      {sinMO && (
                        <span style={{ fontSize: '10px', fontWeight: '600', padding: '1px 6px', borderRadius: '10px', background: '#fef3c7', color: '#b45309' }}>
                          Sin MO en Explotado
                        </span>
                      )}
                      {!sinMO && r.detalleMO.length > 0 && (
                        <span style={{ fontSize: '10px', color: 'var(--c-text3)' }}>
                          {r.detalleMO.map(d => `${d.descripcion} (${fmtN(d.cantidad,2)} hs)`).join(' · ')}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Cantidad planilla */}
                  <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--c-text2)', whiteSpace: 'nowrap' }}>
                    {r.cantidad > 0 ? fmtN(r.cantidad, 2) : '—'}
                    {r.unidad && <span style={{ fontSize: '10px', color: 'var(--c-text3)', marginLeft: '3px' }}>{r.unidad}</span>}
                  </td>

                  {/* Hs por unidad */}
                  <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--c-text2)' }}>
                    {r.hsPorUnidad > 0 ? fmtN(r.hsPorUnidad, 2) : '—'}
                  </td>

                  {/* Hs previstas */}
                  <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: '600', color: 'var(--c-text)' }}>
                    {r.hsPrevistas > 0 ? fmtH(r.hsPrevistas) : '—'}
                  </td>

                  {/* % avance */}
                  <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: '600', color: '#15803d' }}>
                    {sinMed
                      ? <span style={{ color: 'var(--c-text3)', fontWeight: '400', fontSize: '11px' }}>Sin medición</span>
                      : avC > 0
                        ? (avC * 100).toFixed(1) + '%'
                        : '0%'
                    }
                    {!sinMed && filtroMes === 'todos' && r.ultimoMes && (
                      <div style={{ fontSize: '9px', color: 'var(--c-text3)', fontWeight: '400' }}>
                        M{String(r.ultimoMes).padStart(2,'0')}
                      </div>
                    )}
                  </td>

                  {/* Hs consumidas */}
                  <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: '700', color: 'var(--c-gold)' }}>
                    {hsC > 0 ? fmtH(hsC) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--c-text)', color: 'white' }}>
              <td colSpan={3} style={{ padding: '10px 12px', fontWeight: '700', fontSize: '13px' }}>
                Total — {filas.length} ítems
                {pctEjecutado && (
                  <span style={{ fontWeight: '400', fontSize: '11px', marginLeft: '12px', opacity: 0.8 }}>
                    {pctEjecutado}% ejecutado
                  </span>
                )}
              </td>
              <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '700' }}>
                {fmtH(totalHsFiltradas)}
              </td>
              <td />
              <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '700', color: 'var(--c-gold)' }}>
                {fmtH(totalConsFiltradas)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Avisos */}
      {resumen.sinMO > 0 && (
        <div style={{ marginTop: '16px', padding: '12px 16px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', fontSize: '12px', color: '#92400e' }}>
          <b>{resumen.sinMO} ítem{resumen.sinMO > 1 ? 's' : ''}</b> no tiene{resumen.sinMO > 1 ? 'n' : ''} insumos de Mano de Obra cargados en Costo Explotado.
          Verificá que el código del ítem coincida en ambas tablas.
        </div>
      )}
      {resumen.sinMedicion > 0 && (
        <div style={{ marginTop: '10px', padding: '12px 16px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', fontSize: '12px', color: '#0369a1' }}>
          <b>{resumen.sinMedicion} ítem{resumen.sinMedicion > 1 ? 's' : ''}</b> no tiene{resumen.sinMedicion > 1 ? 'n' : ''} medición real cargada aún.
        </div>
      )}

    </div>
  )
}