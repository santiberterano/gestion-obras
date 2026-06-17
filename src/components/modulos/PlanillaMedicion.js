import React, { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../supabaseClient'

function PlanillaMedicion({ obra, perfil }) {
  const [items, setItems] = useState([])
  const [avances, setAvances] = useState([])
  const [meta, setMeta] = useState(null)
  const [meses, setMeses] = useState([])
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState(null)
  const [exito, setExito] = useState(null)
  const [mesActivo, setMesActivo] = useState(1)
  const inputRef = useRef()

  const esAdmin = perfil?.area === 'administracion'

  useEffect(() => {
    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obra.id])

  async function cargarDatos() {
    setCargando(true)
    const { data: itemsData } = await supabase
      .from('planilla_medicion')
      .select('*')
      .eq('obra_id', obra.id)
      .order('orden', { ascending: true })

    const { data: avancesData } = await supabase
      .from('planilla_avances')
      .select('*')
      .eq('obra_id', obra.id)

    if (itemsData && itemsData.length > 0) {
      setMeta({ proyecto: itemsData[0].proyecto, nombre_obra: itemsData[0].nombre_obra })
      setItems(itemsData)

      // Detectar meses disponibles
      const mesesUnicos = [...new Set((avancesData || []).map(a => a.mes))].sort((a, b) => a - b)
      if (mesesUnicos.length > 0) setMeses(mesesUnicos)
    } else {
      setItems([])
      setMeta(null)
    }
    setAvances(avancesData || [])
    setCargando(false)
  }

  async function handleArchivo(e) {
    const archivo = e.target.files[0]
    if (!archivo) return
    setSubiendo(true)
    setError(null)
    setExito(null)

    try {
      const buffer = await archivo.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

      // Metadatos
      const nombre_obra = String(rows[1]?.[1] || '').trim()
      const proyecto    = String(rows[1]?.[2] || '') + ' ' + String(rows[2]?.[2] || '')

      // Detectar meses — fila 2 (índice 1), desde col H (índice 7), de a 2
      const mesesDetectados = []
      let colMes = 7
      while (colMes < (rows[1]?.length || 0)) {
        const encabezado = String(rows[1]?.[colMes] || '').trim()
        if (encabezado.toUpperCase().startsWith('MES')) {
          const numMes = parseInt(encabezado.replace(/\D/g, '')) || mesesDetectados.length + 1
          const fecha = String(rows[3]?.[colMes + 1] || '').trim() || null
          mesesDetectados.push({ num: numMes, colPct: colMes, colMonto: colMes + 1, fecha })
          colMes += 2
        } else {
          colMes++
        }
      }

      // Parsear ítems desde fila 5 (índice 4)
      const itemsParsed = []
      const avancesParsed = []
      let orden = 0

      for (let i = 4; i < rows.length; i++) {
        const r = rows[i] || []
        const colA = r[0] != null ? String(r[0]).trim() : ''
        const colB = r[1] != null ? String(r[1]).trim() : ''
        const colC = r[2] != null ? String(r[2]).trim() : ''
        const colD = typeof r[3] === 'number' ? r[3] : null
        const colE = typeof r[4] === 'number' ? r[4] : null
        const colF = typeof r[5] === 'number' ? r[5] : null

        if (!colA && !colB) continue
        if (colA === 'ITEM' || colA === 'Item') continue

        // Rubro: código entero (01, 02...)
        const esRubro = colA && /^\d+$/.test(colA) && colB
        // Ítem: código decimal (01.01, 02.03...)
        const esItem  = colA && /^\d+\.\d+/.test(colA) && colB

        if (!esRubro && !esItem) continue

        const tipo = esRubro ? 'rubro' : 'item'

        itemsParsed.push({
          obra_id: obra.id,
          orden,
          tipo,
          codigo: colA,
          descripcion: colB,
          unidad: colC || null,
          cantidad: colD,
          precio_unitario: colE,
          total: colF,
          proyecto,
          nombre_obra,
          fecha_base: null,
        })

        // Avances por mes
        for (const mes of mesesDetectados) {
          const pct = typeof r[mes.colPct] === 'number' ? r[mes.colPct] : null
          const monto = typeof r[mes.colMonto] === 'number' ? r[mes.colMonto] : (pct && colF ? pct * colF : null)

          if (pct !== null && pct > 0) {
            avancesParsed.push({
              obra_id: obra.id,
              orden_item: orden,
              mes: mes.num,
              tipo_registro: 'definitivo',
              porcentaje: pct,
              monto,
              fecha: mes.fecha,
            })
          }
        }

        orden++
      }

      // Guardar en Supabase
      await supabase.from('planilla_medicion').delete().eq('obra_id', obra.id)
      const { data: insertedItems, error: insertError } = await supabase
        .from('planilla_medicion')
        .insert(itemsParsed)
        .select()
      if (insertError) throw new Error('Error guardando ítems: ' + insertError.message)

      // Mapear avances con IDs reales
      if (avancesParsed.length > 0 && insertedItems) {
        const avancesConId = avancesParsed.map(a => {
          const item = insertedItems.find(it => it.orden === a.orden_item)
          return item ? {
            planilla_item_id: item.id,
            obra_id: obra.id,
            mes: a.mes,
            tipo_registro: a.tipo_registro,
            porcentaje: a.porcentaje,
            monto: a.monto,
            fecha: a.fecha,
          } : null
        }).filter(Boolean)

        await supabase.from('planilla_avances').delete().eq('obra_id', obra.id)
        if (avancesConId.length > 0) {
          await supabase.from('planilla_avances').insert(avancesConId)
        }
      }

      setExito('Planilla cargada correctamente.')
      await cargarDatos()
    } catch (err) {
      setError(err.message || 'Error procesando el archivo.')
    }
    setSubiendo(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  // Calcular totales del mes activo
  const avancesMes = avances.filter(a => a.mes === mesActivo)
  const totalObra  = items.find(it => it.tipo === 'rubro') 
    ? items.filter(it => it.tipo === 'rubro').reduce((a, it) => a + (it.total || 0), 0)
    : 0
  const totalCertMes = avancesMes.reduce((a, av) => a + (av.monto || 0), 0)
  const pctAcumulado = totalObra > 0 ? totalCertMes / totalObra : 0

  const fmt    = (n) => n != null ? '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
  const fmtPct = (n) => n != null ? (Number(n) * 100).toFixed(2) + '%' : '-'

  if (cargando) return <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Cargando...</div>

  // Agrupar por rubro
  const grupos = []
  let grupoActual = null
  for (const it of items) {
    if (it.tipo === 'rubro') {
      grupoActual = { rubro: it, items: [] }
      grupos.push(grupoActual)
    } else if (grupoActual) {
      grupoActual.items.push(it)
    }
  }

  return (
    <div>
      {/* Encabezado */}
      {meta && (
        <div style={{ marginBottom: '20px', display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '13px', color: '#555' }}>
          {meta.nombre_obra && <span><b style={{ color: '#999' }}>Obra:</b> {meta.nombre_obra}</span>}
          {meta.proyecto    && <span><b style={{ color: '#999' }}>Proyecto:</b> {meta.proyecto}</span>}
        </div>
      )}

      {/* Upload admin */}
      {esAdmin && (
        <div style={{ marginBottom: '20px', padding: '16px 20px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>{items.length > 0 ? '🔄 Reemplazar Planilla' : '📤 Subir Planilla de Medición'}</div>
            <div style={{ fontSize: '12px', color: '#888' }}>Archivos .xlsx</div>
          </div>
          <input ref={inputRef} type="file" accept=".xlsx" onChange={handleArchivo} style={{ display: 'none' }} id="upload-pm" />
          <label htmlFor="upload-pm" style={{ padding: '8px 20px', background: '#2563eb', color: 'white', borderRadius: '6px', cursor: subiendo ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '14px', opacity: subiendo ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {subiendo ? 'Procesando...' : 'Elegir archivo'}
          </label>
        </div>
      )}

      {error && <div style={{ padding: '10px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#dc2626', marginBottom: '16px', fontSize: '14px' }}>⚠️ {error}</div>}
      {exito && <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', color: '#16a34a', marginBottom: '16px', fontSize: '14px' }}>✓ {exito}</div>}

      {items.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#aaa', fontSize: '15px' }}>
          {esAdmin ? 'Subí la planilla para ver el avance de obra.' : 'Aún no se cargó la planilla de medición.'}
        </div>
      ) : (
        <>
          {/* Selector de mes */}
          {meses.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#555', fontWeight: '600' }}>Mes:</span>
              {meses.map(m => (
                <button key={m} onClick={() => setMesActivo(m)}
                  style={{ padding: '6px 14px', background: mesActivo === m ? '#2563eb' : 'white', color: mesActivo === m ? 'white' : '#2563eb', border: '1px solid #2563eb', borderRadius: '6px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
                  Mes {String(m).padStart(2, '0')}
                </button>
              ))}
            </div>
          )}

          {/* Resumen del mes */}
          {meses.length > 0 && (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 20px', minWidth: '180px' }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>TOTAL OBRA</div>
                <div style={{ fontWeight: '700', color: '#1e3a5f', fontSize: '15px' }}>{fmt(totalObra)}</div>
              </div>
              <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 20px', minWidth: '180px' }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>CERTIFICADO MES {String(mesActivo).padStart(2,'0')}</div>
                <div style={{ fontWeight: '700', color: '#2563eb', fontSize: '15px' }}>{fmt(totalCertMes)}</div>
              </div>
              <div style={{ background: '#1e3a5f', borderRadius: '8px', padding: '12px 20px', minWidth: '180px' }}>
                <div style={{ fontSize: '11px', color: '#93c5fd', marginBottom: '4px' }}>AVANCE ACUMULADO</div>
                <div style={{ fontWeight: '700', color: 'white', fontSize: '15px' }}>{fmtPct(pctAcumulado)}</div>
              </div>
            </div>
          )}

          {/* Tabla */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#1e3a5f', color: 'white' }}>
                  {['Ítem', 'Descripción', 'Unid.', 'Cantidad', 'P. Unitario', 'Total'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Descripción' ? 'left' : 'right', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '12px' }}>{h}</th>
                  ))}
                  {meses.map(m => (
                    <th key={m} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '12px', background: m === mesActivo ? '#2563eb' : '#1e3a5f' }}>
                      Mes {String(m).padStart(2,'0')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grupos.map((g, gi) => (
                  <React.Fragment key={gi}>
                    {/* Rubro */}
                    <tr style={{ background: '#dbeafe' }}>
                      <td style={{ padding: '8px 12px', fontWeight: '700', color: '#1e3a5f' }}>{g.rubro.codigo}</td>
                      <td colSpan={4} style={{ padding: '8px 12px', fontWeight: '700', color: '#1e3a5f' }}>{g.rubro.descripcion}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700', color: '#1e3a5f' }}>{fmt(g.rubro.total)}</td>
                      {meses.map(m => {
                        const avRubro = avances.filter(a => a.mes === m && g.items.some(it => it.id === a.planilla_item_id))
                        const montoRubro = avRubro.reduce((a, av) => a + (av.monto || 0), 0)
                        return (
                          <td key={m} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700', color: '#1e3a5f', background: m === mesActivo ? '#eff6ff' : 'transparent' }}>
                            {montoRubro > 0 ? fmt(montoRubro) : '-'}
                          </td>
                        )
                      })}
                    </tr>
                    {/* Ítems */}
                    {g.items.map((it, fi) => {
                      return (
                        <tr key={it.id} style={{ background: fi % 2 === 0 ? 'white' : '#f9fafb', borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '7px 12px', color: '#666' }}>{it.codigo}</td>
                          <td style={{ padding: '7px 12px' }}>{it.descripcion}</td>
                          <td style={{ padding: '7px 12px', textAlign: 'right', color: '#888' }}>{it.unidad}</td>
                          <td style={{ padding: '7px 12px', textAlign: 'right' }}>{it.cantidad != null ? Number(it.cantidad).toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '-'}</td>
                          <td style={{ padding: '7px 12px', textAlign: 'right' }}>{fmt(it.precio_unitario)}</td>
                          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: '600' }}>{fmt(it.total)}</td>
                          {meses.map(m => {
                            const av = avances.find(a => a.planilla_item_id === it.id && a.mes === m)
                            return (
                              <td key={m} style={{ padding: '7px 12px', textAlign: 'right', background: m === mesActivo ? '#eff6ff' : 'transparent' }}>
                                {av ? fmtPct(av.porcentaje) : '-'}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default PlanillaMedicion