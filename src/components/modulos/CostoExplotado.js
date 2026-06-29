import React, { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../supabaseClient'

function CostoExplotado({ obra, perfil }) {
  const [filas, setFilas] = useState([])
  const [meta, setMeta] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState(null)
  const [exito, setExito] = useState(null)
  const [vistaCalc, setVistaCalc] = useState(false)
  const [tablaVisible, setTablaVisible] = useState(false)
  const [tareas, setTareas] = useState([]) // array de { id, itemSeleccionado, cantidad, dias, resultado, detalleExpandido }

  const inputRef = useRef()

  const esAdmin = perfil?.area === 'administracion'
  const esJefe  = perfil?.area === 'jefe_obra'

  useEffect(() => {
    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obra.id])

  async function cargarDatos() {
    setCargando(true)
    const { data, error } = await supabase
      .from('costo_explotado')
      .select('*')
      .eq('obra_id', obra.id)
      .order('orden', { ascending: true })

    if (error) { setError('Error al cargar datos.'); setCargando(false); return }

    if (data && data.length > 0) {
      setMeta({ proyecto: data[0].proyecto, nombre_obra: data[0].nombre_obra, fecha: data[0].fecha })
      setFilas(data)
    } else {
      setFilas([])
      setMeta(null)
    }
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

      const proyecto    = String(rows[1]?.[0] || '').trim()
      const nombre_obra = String(rows[2]?.[0] || '').trim()
      const fecha       = String(rows[3]?.[0] || '').trim() || null

      const CATEGORIAS = ['MANO DE OBRA', 'MATERIALES', 'ALQUILERES', 'DIRECTOS FIJOS', 'EQUIPOS', 'SUBCONTRATOS', 'ANALISIS']
      const filasParsed = []
      let orden = 0
      let itemActual = null
      let codigoActual = null
      let categoriaActual = null

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] || []
        const colBRaw = r[1]
        const colBNum = typeof colBRaw === 'number' ? colBRaw : parseFloat(colBRaw)
        const colC = r[2] != null ? String(r[2]).trim() : ''
        const colD = r[3] != null ? String(r[3]).trim() : ''
        const colE = typeof r[4] === 'number' ? r[4] : null
        const colF = typeof r[5] === 'number' ? r[5] : null

        if (!colBRaw && !colC && !colE && !colF) continue
        if (colD.includes('P.Un') || colC.includes('P.Un') || colD.includes('Can.')) continue

        const esItem      = colBRaw !== null && !isNaN(colBNum) && colBNum > 0 && colC
        const colCUpper   = colC.toUpperCase()
        const esCategoria = !colBRaw && colC && CATEGORIAS.some(cat => colCUpper.startsWith(cat)) && colE === null && colF === null
        const esCostoCosto = !colBRaw && (colCUpper.includes('COSTO-COSTO') || colCUpper.includes('COSTO COSTO'))
        const esSubtotal  = !colBRaw && !colC && colE === null && colF === null
        const esInsumo    = !colBRaw && colC && !esCategoria && !esCostoCosto && (colE !== null || colF !== null)

        if (esItem) {
          itemActual = colC; codigoActual = String(colBNum); categoriaActual = null
          filasParsed.push({ obra_id: obra.id, orden, tipo: 'item', codigo_item: codigoActual, nombre_item: colC, categoria: null, descripcion: colC, unidad: colD || null, precio_unitario: null, cantidad: null, total: null, proyecto, nombre_obra, fecha })
          orden++; continue
        }
        if (esCategoria) {
          categoriaActual = colCUpper.trim()
          filasParsed.push({ obra_id: obra.id, orden, tipo: 'categoria', codigo_item: codigoActual, nombre_item: itemActual, categoria: categoriaActual, descripcion: colC, unidad: null, precio_unitario: null, cantidad: null, total: null, proyecto, nombre_obra, fecha })
          orden++; continue
        }
        if (esCostoCosto) {
          const codActual = codigoActual
          const subtotalesItem = filasParsed.filter(f => f.codigo_item === codActual && f.tipo === 'subtotal')
          const totalCC = subtotalesItem.reduce((a, f) => a + (f.total || 0), 0)
          filasParsed.push({ obra_id: obra.id, orden, tipo: 'costo_costo', codigo_item: codigoActual, nombre_item: itemActual, categoria: null, descripcion: 'Costo-Costo', unidad: null, precio_unitario: null, cantidad: null, total: totalCC, proyecto, nombre_obra, fecha })
          orden++; continue
        }
        if (esSubtotal) {
          const codAct = codigoActual; const catAct = categoriaActual
          const insumosCateg = filasParsed.filter(f => f.codigo_item === codAct && f.categoria === catAct && f.tipo === 'insumo')
          const sumaCateg = insumosCateg.reduce((a, f) => a + (f.total || 0), 0)
          filasParsed.push({ obra_id: obra.id, orden, tipo: 'subtotal', codigo_item: codigoActual, nombre_item: itemActual, categoria: categoriaActual, descripcion: null, unidad: null, precio_unitario: null, cantidad: null, total: sumaCateg, proyecto, nombre_obra, fecha })
          orden++; continue
        }
        if (esInsumo) {
          const total = colE !== null && colF !== null ? colE * colF : null
          filasParsed.push({ obra_id: obra.id, orden, tipo: 'insumo', codigo_item: codigoActual, nombre_item: itemActual, categoria: categoriaActual, descripcion: colC, unidad: colD || null, precio_unitario: colE, cantidad: colF, total, proyecto, nombre_obra, fecha })
          orden++
        }
      }

      const nombreArchivo = `${obra.id}/costo_explotado.xlsx`
      await supabase.storage.from('excels').remove([nombreArchivo])
      const { error: storageError } = await supabase.storage.from('excels').upload(nombreArchivo, archivo, { upsert: true })
      if (storageError) throw new Error('Error subiendo archivo: ' + storageError.message)

      await supabase.from('costo_explotado').delete().eq('obra_id', obra.id)
      const { error: insertError } = await supabase.from('costo_explotado').insert(filasParsed)
      if (insertError) throw new Error('Error guardando datos: ' + insertError.message)

      setExito('Excel cargado correctamente.')
      await cargarDatos()
    } catch (err) {
      setError(err.message || 'Error procesando el archivo.')
    }
    setSubiendo(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const items = [...new Map(filas.filter(f => f.tipo === 'item').map(f => [f.codigo_item, f])).values()]

  function calcularTarea(itemSel, cantidad, dias) {
    if (!itemSel) return []
    const horasDisponibles = dias ? parseFloat(dias) * 9 : null
    return filas
      .filter(f => f.codigo_item === itemSel.codigo_item && f.tipo === 'insumo' && f.precio_unitario && f.cantidad)
      .map(f => {
        const esManoDeObra = f.categoria?.toUpperCase().startsWith('MANO DE OBRA')
        const cantidad_total = f.cantidad * cantidad
        const personas = esManoDeObra && horasDisponibles > 0 ? cantidad_total / horasDisponibles : null
        return {
          categoria: f.categoria,
          descripcion: f.descripcion,
          unidad: f.unidad,
          precio_unitario: f.precio_unitario,
          cantidad_unit: f.cantidad,
          cantidad_total,
          total: f.precio_unitario * cantidad_total,
          personas,
          esManoDeObra,
        }
      })
  }

  function agregarTarea() {
    setTareas(prev => [...prev, {
      id: Date.now(),
      itemSeleccionado: null,
      cantidad: 1,
      dias: '',
      resultado: null,
      detalleExpandido: {},
    }])
  }

  function actualizarTarea(id, campo, valor) {
    setTareas(prev => prev.map(t => t.id === id ? { ...t, [campo]: valor, resultado: null } : t))
  }

  function calcularTareaId(id) {
    setTareas(prev => prev.map(t => {
      if (t.id !== id) return t
      const resultado = calcularTarea(t.itemSeleccionado, t.cantidad, t.dias)
      return { ...t, resultado }
    }))
  }

  function quitarTarea(id) {
    setTareas(prev => prev.filter(t => t.id !== id))
  }

  function toggleDetalle(tareaId, cat) {
    setTareas(prev => prev.map(t => {
      if (t.id !== tareaId) return t
      return { ...t, detalleExpandido: { ...t.detalleExpandido, [cat]: !t.detalleExpandido[cat] } }
    }))
  }

  const CATS = ['MANO DE OBRA', 'MATERIALES', 'ALQUILERES', 'EQUIPOS', 'DIRECTOS FIJOS', 'SUBCONTRATOS', 'ANALISIS']
  const fmt  = (n) => n != null ? '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
  const fmtN = (n) => n != null ? Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '-'

  if (cargando) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--c-text3)' }}>Cargando...</div>

  const grupos = []
  let grupoActual = null
  for (const f of filas) {
    if (f.tipo === 'item') { grupoActual = { item: f, secciones: [] }; grupos.push(grupoActual) }
    else if (grupoActual) grupoActual.secciones.push(f)
  }

  return (
    <div>
      {/* Encabezado */}
      {meta && (
        <div style={{ marginBottom: '20px', display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--c-text2)' }}>
          {meta.proyecto    && <span><b style={{ color: 'var(--c-text3)' }}>Proyecto:</b> {meta.proyecto}</span>}
          {meta.nombre_obra && <span><b style={{ color: 'var(--c-text3)' }}>Obra:</b> {meta.nombre_obra}</span>}
          {meta.fecha       && <span><b style={{ color: 'var(--c-text3)' }}>Fecha:</b> {meta.fecha}</span>}
        </div>
      )}

      {/* Upload admin */}
      {esAdmin && (
        <div style={{ marginBottom: '20px', padding: '16px 20px', background: 'var(--c-surface2)', border: '1px dashed #cbd5e1', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>{filas.length > 0 ? '🔄 Reemplazar Excel' : '📤 Subir Excel de Costo Explotado'}</div>
            <div style={{ fontSize: '12px', color: 'var(--c-text3)' }}>Archivos .xlsx o .xls</div>
          </div>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={handleArchivo} style={{ display: 'none' }} id="upload-ce" />
          <label htmlFor="upload-ce" style={{ padding: '8px 20px', background: 'var(--c-gold)', color: 'white', borderRadius: '6px', cursor: subiendo ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '14px', opacity: subiendo ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {subiendo ? 'Procesando...' : 'Elegir archivo'}
          </label>
        </div>
      )}

      {/* Botones */}
      {filas.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {(esJefe || esAdmin) && (
            <button onClick={() => { setVistaCalc(!vistaCalc); if (!vistaCalc && tareas.length === 0) agregarTarea() }}
              style={{ padding: '10px 20px', background: vistaCalc ? 'var(--c-gold)' : 'white', color: vistaCalc ? 'white' : 'var(--c-gold)', border: '1px solid #2563eb', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
              🧮 Calculadora de Rendimientos
            </button>
          )}
          <button onClick={() => setTablaVisible(!tablaVisible)}
            style={{ padding: '10px 20px', background: 'white', color: 'var(--c-text2)', border: '1px solid #e2e8f0', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
            {tablaVisible ? '▲ Ocultar análisis' : '▼ Ver análisis de precios'}
          </button>
        </div>
      )}

      {error && <div style={{ padding: '10px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: 'var(--c-danger)', marginBottom: '16px', fontSize: '14px' }}>⚠️ {error}</div>}
      {exito && <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', color: 'var(--c-success)', marginBottom: '16px', fontSize: '14px' }}>✓ {exito}</div>}

      {/* Calculadora */}
      {vistaCalc && (
        <div style={{ marginBottom: '24px', background: 'var(--c-surface2)', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ margin: 0, color: 'var(--c-text)' }}>Calculadora de Rendimientos</h4>

          </div>

          {tareas.map((tarea, ti) => (
            <div key={tarea.id} style={{ marginBottom: '20px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontWeight: '700', color: 'var(--c-text)', fontSize: '13px' }}>Tarea {ti + 1}</span>
                {tareas.length > 1 && (
                  <button onClick={() => quitarTarea(tarea.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-danger)', fontSize: '16px' }}>✕</button>
                )}
              </div>

              {/* Inputs */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '12px' }}>
                <div style={{ flex: 2, minWidth: '200px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--c-text3)', display: 'block', marginBottom: '4px' }}>Ítem</label>
                  <select value={tarea.itemSeleccionado?.codigo_item || ''} onChange={ev => {
                    const it = items.find(f => f.codigo_item === ev.target.value)
                    actualizarTarea(tarea.id, 'itemSeleccionado', it || null)
                  }} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}>
                    <option value="">Seleccioná un ítem...</option>
                    {items.map(f => <option key={f.codigo_item} value={f.codigo_item}>{f.codigo_item} — {f.nombre_item}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--c-text3)' }}>Cantidad</label>
                  <input type="number" min="0.01" value={tarea.cantidad}
                    onChange={ev => actualizarTarea(tarea.id, 'cantidad', parseFloat(ev.target.value) || 1)}
                    style={{ width: '100px', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', textAlign: 'right' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--c-text3)' }}>Días <span style={{ color: 'var(--c-text3)' }}>(opcional · 9 hs/día)</span></label>
                  <input type="number" min="1" value={tarea.dias} placeholder="—"
                    onChange={ev => actualizarTarea(tarea.id, 'dias', ev.target.value)}
                    style={{ width: '80px', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', textAlign: 'right' }} />
                </div>
                <button onClick={() => calcularTareaId(tarea.id)} disabled={!tarea.itemSeleccionado}
                  style={{ padding: '8px 20px', background: tarea.itemSeleccionado ? 'var(--c-gold)' : 'var(--c-border2)', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '14px', cursor: tarea.itemSeleccionado ? 'pointer' : 'not-allowed' }}>
                  Calcular
                </button>
              </div>

              {/* Resultado de la tarea */}
              {tarea.resultado && tarea.resultado.length > 0 && (
                <>
                  {/* Resumen */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    {CATS.filter(cat => tarea.resultado.some(r => r.categoria?.toUpperCase().startsWith(cat))).map(cat => {
                      const esMO = cat === 'MANO DE OBRA'
                      const filasCat = tarea.resultado.filter(r => r.categoria?.toUpperCase().startsWith(cat))
                      const totalCat = filasCat.reduce((a, r) => a + r.total, 0)
                      return (
                        <div key={cat} style={{ background: 'var(--c-surface2)', border: '1px solid ' + (esMO ? '#fca5a5' : 'var(--c-border)'), borderRadius: '8px', padding: '10px 14px', minWidth: '140px' }}>
                          <div style={{ fontSize: '10px', color: esMO ? 'var(--c-danger)' : '#888', fontWeight: '700', marginBottom: '4px' }}>{cat}</div>
                          {esMO ? (
                            filasCat.map((r, i) => (
                              <div key={i} style={{ marginBottom: '4px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--c-text2)' }}>{r.descripcion}</div>
                                {r.personas != null && <div style={{ fontWeight: '700', color: 'var(--c-danger)', fontSize: '14px' }}>{Number(r.personas).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pers.</div>}
                                <div style={{ fontSize: '10px', color: 'var(--c-text3)' }}>{fmtN(r.cantidad_total)} hs</div>
                              </div>
                            ))
                          ) : (
                            <div style={{ fontWeight: '700', color: 'var(--c-text)', fontSize: '14px' }}>{fmt(totalCat)}</div>
                          )}
                        </div>
                      )
                    })}
                    <div style={{ background: 'var(--c-text)', borderRadius: '8px', padding: '10px 14px', minWidth: '120px' }}>
                      <div style={{ fontSize: '10px', color: 'var(--c-gold)', marginBottom: '4px' }}>TOTAL</div>
                      <div style={{ fontWeight: '700', color: 'white', fontSize: '14px' }}>{fmt(tarea.resultado.reduce((a, r) => a + r.total, 0))}</div>
                    </div>
                  </div>

                  {/* Detalle expandible */}
                  {CATS.filter(cat => tarea.resultado.some(r => r.categoria?.toUpperCase().startsWith(cat))).map(cat => (
                    <div key={cat} style={{ marginBottom: '6px', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                      <button onClick={() => toggleDetalle(tarea.id, cat)}
                        style={{ width: '100%', background: 'var(--c-gold-dim)', padding: '6px 12px', fontWeight: '700', color: 'var(--c-text)', fontSize: '12px', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{cat}</span>
                        <span>{tarea.detalleExpandido[cat] ? '▲ Ocultar' : '▼ Ver detalle'}</span>
                      </button>
                      {tarea.detalleExpandido[cat] && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ background: 'var(--c-border)' }}>
                              <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: '600' }}>Descripción</th>
                              <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600' }}>Unid.</th>
                              <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600' }}>Cant./Unit.</th>
                              <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600' }}>Cant. Total</th>
                              {cat === 'MANO DE OBRA' && <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: 'var(--c-danger)' }}>Personas</th>}
                              <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600' }}>Total $</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tarea.resultado.filter(r => r.categoria?.toUpperCase().startsWith(cat)).map((r, i) => (
                              <tr key={i} style={{ background: i % 2 === 0 ? 'white' : 'var(--c-surface2)', borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 10px' }}>{r.descripcion}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--c-text3)' }}>{r.unidad}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtN(r.cantidad_unit)}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600' }}>{fmtN(r.cantidad_total)}</td>
                                {cat === 'MANO DE OBRA' && (
                                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '700', color: 'var(--c-danger)' }}>
                                    {r.personas != null ? Number(r.personas).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                                  </td>
                                )}
                                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600' }}>{fmt(r.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          ))}

          {/* Botón agregar tarea */}
          <button onClick={agregarTarea}
            style={{ padding: '8px 20px', background: 'white', border: '1px dashed #2563eb', color: 'var(--c-gold)', borderRadius: '8px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', width: '100%' }}>
            + Agregar otra tarea
          </button>
        </div>
      )}

      {/* Tabla análisis de precios */}
      {tablaVisible && (
        filas.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--c-text3)', fontSize: '15px' }}>
            {esAdmin ? 'Subí el Excel para ver el costo explotado.' : 'Aún no se cargó el costo explotado para esta obra.'}
          </div>
        ) : (
          <div>
            {grupos.map((g, gi) => {
              const costoTotal = g.secciones.find(f => f.tipo === 'costo_costo')
              return (
                <div key={gi} style={{ marginBottom: '24px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ background: 'var(--c-text)', color: 'white', padding: '10px 16px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: '700', fontSize: '13px', minWidth: '40px' }}>{g.item.codigo_item}</span>
                    <span style={{ fontWeight: '700', fontSize: '14px', flex: 1 }}>{g.item.nombre_item}</span>
                    {costoTotal?.total > 0 && <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--c-gold)' }}>Costo-Costo: {fmt(costoTotal.total)}</span>}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: 'var(--c-surface2)' }}>
                        <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: '600', color: 'var(--c-text2)' }}>Descripción</th>
                        <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: '600', color: 'var(--c-text2)' }}>Unid.</th>
                        <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: '600', color: 'var(--c-text2)' }}>P. Unitario</th>
                        <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: '600', color: 'var(--c-text2)' }}>Cantidad</th>
                        <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: '600', color: 'var(--c-text2)' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.secciones.filter(f => f.tipo !== 'costo_costo').map((f, fi) => {
                        const esCategoria = f.tipo === 'categoria'
                        const esSubtotal  = f.tipo === 'subtotal'
                        return (
                          <tr key={fi} style={{ background: esCategoria ? 'var(--c-gold-dim)' : esSubtotal ? 'var(--c-border)' : fi % 2 === 0 ? 'white' : 'var(--c-surface2)', borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 12px', fontWeight: esCategoria || esSubtotal ? '700' : '400', color: esCategoria ? 'var(--c-text)' : 'inherit' }}>
                              {esSubtotal ? 'SUBTOTAL' : f.descripcion || ''}
                            </td>
                            <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--c-text3)' }}>{esCategoria || esSubtotal ? '' : f.unidad || ''}</td>
                            <td style={{ padding: '6px 12px', textAlign: 'right' }}>{esCategoria || esSubtotal ? '' : fmt(f.precio_unitario)}</td>
                            <td style={{ padding: '6px 12px', textAlign: 'right' }}>{esCategoria || esSubtotal ? '' : fmtN(f.cantidad)}</td>
                            <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: esSubtotal ? '700' : '400', color: esSubtotal ? 'var(--c-text)' : '#111' }}>
                              {esCategoria ? '' : fmt(f.total)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )
      )}

      {filas.length === 0 && !tablaVisible && (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--c-text3)', fontSize: '15px' }}>
          {esAdmin ? 'Subí el Excel para ver el costo explotado.' : 'Aún no se cargó el costo explotado para esta obra.'}
        </div>
      )}
    </div>
  )
}

export default CostoExplotado