import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'

const fmt  = (n) => n != null ? Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'
const fmtH = (n) => n != null && n > 0 ? Number(n).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' hs' : '—'

function OrigenBadge({ origen }) {
  const cfg = {
    explotado: { bg: '#dbeafe', color: '#1d4ed8', label: 'Costo Explotado' },
    ausente:   { bg: '#fef3c7', color: '#b45309', label: 'Sin datos MO'    },
  }[origen] || { bg: '#f3f4f6', color: '#6b7280', label: origen }
  return (
    <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: '20px', background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  )
}

export default function InformeHoras({ obra }) {
  const [loading, setLoading]                       = useState(true)
  const [error, setError]                           = useState(null)
  const [filas, setFilas]                           = useState([])
  const [resumen, setResumen]                       = useState(null)
  const [hsPrevistasTotales, setHsPrevistasTotales] = useState(0)
  const [filtroOrigen, setFiltroOrigen]             = useState('todos')
  const [filtroMes, setFiltroMes]                   = useState('todos')
  const [mesesDisponibles, setMesesDisponibles]     = useState([])

  useEffect(() => { cargar() }, [obra.id]) // eslint-disable-line

  async function cargar() {
    setLoading(true); setError(null)
    try {
      // ── 1. Planilla items ──────────────────────────────
      const { data: planItems, error: e1 } = await supabase
        .from('planilla_items')
        .select('id, codigo, descripcion, unidad, cantidad, precio_venta, costo_previsto_id')
        .eq('obra_id', obra.id)
        .eq('tipo', 'item')
        .order('orden', { ascending: true })
      if (e1) throw new Error('Error planilla_items: ' + e1.message)
      if (!planItems?.length) { setFilas([]); setLoading(false); return }

      // ── 2. Avances SOLO tipo real — último porcentaje por ítem ──
      const { data: avances, error: e2 } = await supabase
        .from('medicion_avances')
        .select('planilla_item_id, mes, porcentaje')
        .eq('obra_id', obra.id)
        .eq('tipo', 'real')                   // ← solo real
        .order('mes', { ascending: true })
      if (e2) throw new Error('Error medicion_avances: ' + e2.message)

      const meses = [...new Set((avances || []).map(a => a.mes))].sort((a, b) => a - b)
      setMesesDisponibles(meses)

      // Por ítem: avance acumulado = porcentaje del MES MÁS ALTO medido (real)
      const avanceAcumMap = {}  // planilla_item_id → { mes, porcentaje }
      const avancePorMes  = {}  // planilla_item_id → { mes: porcentaje }
      ;(avances || []).forEach(a => {
        if (!avancePorMes[a.planilla_item_id]) avancePorMes[a.planilla_item_id] = {}
        avancePorMes[a.planilla_item_id][a.mes] = a.porcentaje
        if (!avanceAcumMap[a.planilla_item_id] || a.mes > (avanceAcumMap[a.planilla_item_id]?.mes || 0)) {
          avanceAcumMap[a.planilla_item_id] = { mes: a.mes, porcentaje: a.porcentaje }
        }
      })

      // ── 3. Costo Explotado — insumos MO (categoria MANO DE OBRA) ──
      const { data: expRows } = await supabase
        .from('costo_explotado')
        .select('codigo_item, nombre_item, categoria, descripcion, unidad, cantidad')
        .eq('obra_id', obra.id)
        .eq('tipo', 'insumo')
        .ilike('categoria', 'MANO DE OBRA%')

      // Agrupar por codigo_item → suma de hs/unidad de MO
      const expMap = {} // codigo_item → { hsPorUnidad }
      ;(expRows || []).forEach(f => {
        if (!expMap[f.codigo_item]) expMap[f.codigo_item] = { hsPorUnidad: 0 }
        expMap[f.codigo_item].hsPorUnidad += f.cantidad || 0
      })

      // ── 4. Hs previstas totales desde Explosión de Insumos ──
      const { data: expInsumos } = await supabase
        .from('explosion_insumos')
        .select('orden, tipo, descripcion, unidad, cantidad')
        .eq('obra_id', obra.id)
        .order('orden', { ascending: true })

      let hsPrevistasTot = 0
      if (expInsumos?.length) {
        const idxMO = expInsumos.findIndex(
          f => f.tipo === 'tipo' && f.descripcion?.toUpperCase().includes('MANO DE OBRA')
        )
        if (idxMO >= 0) {
          const idxFin = expInsumos.findIndex(
            (f, i) => i > idxMO && f.tipo === 'tipo'
          )
          const bloqueMO = expInsumos.slice(idxMO + 1, idxFin === -1 ? undefined : idxFin)
          hsPrevistasTot = bloqueMO
            .filter(f => f.tipo === 'item' && (f.unidad === 'HS' || f.unidad === 'HORA') && f.cantidad)
            .reduce((s, f) => s + (f.cantidad || 0), 0)
        }
      }
      setHsPrevistasTotales(hsPrevistasTot)

      // ── 5. Construir filas del informe ──
      const resultado = planItems.map(item => {
        const codigo = item.codigo

        const acumData        = avanceAcumMap[item.id]
        const avanceAcumulado = acumData?.porcentaje || 0
        const porMes          = avancePorMes[item.id] || {}
        const sinMedicion     = !acumData

        // MO solo desde Costo Explotado
        let origen      = 'ausente'
        let hsPorUnidad = 0

        if (codigo && expMap[codigo]) {
          origen      = 'explotado'
          hsPorUnidad = expMap[codigo].hsPorUnidad
        }

        const cantidadItem = item.cantidad || 0
        const hsPrevistas  = cantidadItem * hsPorUnidad

        // Hs consumidas = hsPrevistas × avance acumulado real
        const hsConsumidas = hsPrevistas * avanceAcumulado

        // Hs consumidas por mes
        const hsConsumidasPorMes = {}
        meses.forEach(m => {
          const pct = porMes[m] || 0
          hsConsumidasPorMes[m] = hsPrevistas * pct
        })

        return {
          id: item.id,
          codigo,
          descripcion:      item.descripcion,
          unidad:           item.unidad,
          cantidad:         cantidadItem,
          precioVenta:      item.precio_venta,
          origen,
          hsPorUnidad,
          hsPrevistas,
          avanceAcumulado,
          hsConsumidas,
          hsConsumidasPorMes,
          porMes,
          sinMedicion,
        }
      })

      // ── 6. Resumen ──
      const totalHsPrevistasItems = resultado.reduce((s, r) => s + r.hsPrevistas, 0)
      const totalHsConsumidas     = resultado.reduce((s, r) => s + r.hsConsumidas, 0)

      setResumen({
        totalHsPrevistasItems,
        totalHsConsumidas,
        sinDatos:    resultado.filter(r => r.origen === 'ausente').length,
        deExplotado: resultado.filter(r => r.origen === 'explotado').length,
        sinMedicion: resultado.filter(r => r.sinMedicion).length,
        total:       resultado.length,
      })
      setFilas(resultado)

    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  // ── Filtros ────────────────────────────────────────────
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

  const totalHsFiltradas     = filasFiltradas.reduce((s, r) => s + r.hsPrevistas, 0)
  const totalHsConsFiltradas = filasFiltradas.reduce((s, r) => s + hsConsumidasFiltradas(r), 0)

  return (
    <div>

      {/* ── Resumen cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '10px', marginBottom: '24px' }}>
        {[
          { label: 'Hs previstas (explosión)', value: fmtH(hsPrevistasTotales),            color: 'var(--c-text)' },
          { label: 'Hs previstas (ítems)',      value: fmtH(resumen.totalHsPrevistasItems), color: 'var(--c-text)' },
          { label: 'Hs consumidas (real)',       value: fmtH(resumen.totalHsConsumidas),     color: 'var(--c-gold)' },
          { label: '% ejecutado MO',
            value: resumen.totalHsPrevistasItems > 0
              ? (resumen.totalHsConsumidas / resumen.totalHsPrevistasItems * 100).toFixed(1) + '%'
              : '—',
            color: 'var(--c-success)' },
          { label: 'De Costo Explotado', value: resumen.deExplotado + ' ítems', color: '#1d4ed8' },
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
          { k: 'ausente',   l: 'Sin datos' },
        ].map(o => (
          <button key={o.k} onClick={() => setFiltroOrigen(o.k)} style={{
            padding: '4px 12px', fontSize: '11px', fontWeight: '500', borderRadius: '20px',
            border: '1px solid', cursor: 'pointer',
            background: filtroOrigen === o.k ? 'var(--c-gold)' : 'white',
            color:       filtroOrigen === o.k ? 'white' : 'var(--c-text2)',
            borderColor: filtroOrigen === o.k ? 'var(--c-gold)' : 'var(--c-border)',
          }}>{o.l}</button>
        ))}

        <div style={{ width: '1px', height: '18px', background: 'var(--c-border)' }} />

        <span style={{ fontSize: '11px', color: 'var(--c-text3)' }}>Mes:</span>
        <button onClick={() => setFiltroMes('todos')} style={{
          padding: '4px 12px', fontSize: '11px', borderRadius: '20px', border: '1px solid', cursor: 'pointer',
          background: filtroMes === 'todos' ? 'var(--c-gold)' : 'white',
          color:       filtroMes === 'todos' ? 'white' : 'var(--c-text2)',
          borderColor: filtroMes === 'todos' ? 'var(--c-gold)' : 'var(--c-border)',
        }}>Acumulado</button>
        {mesesDisponibles.map(m => (
          <button key={m} onClick={() => setFiltroMes(String(m))} style={{
            padding: '4px 12px', fontSize: '11px', borderRadius: '20px', border: '1px solid', cursor: 'pointer',
            background: filtroMes === String(m) ? 'var(--c-gold)' : 'white',
            color:       filtroMes === String(m) ? 'white' : 'var(--c-text2)',
            borderColor: filtroMes === String(m) ? 'var(--c-gold)' : 'var(--c-border)',
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
                Hs consumidas
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
          <b>{resumen.sinDatos} ítem{resumen.sinDatos > 1 ? 's' : ''}</b> no tiene{resumen.sinDatos > 1 ? 'n' : ''} datos de mano de obra en Costo Explotado.
          Revisá que los códigos coincidan entre las tablas.
        </div>
      )}
    </div>
  )
}