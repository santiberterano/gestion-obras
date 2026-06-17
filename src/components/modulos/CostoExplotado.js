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
  const [itemSeleccionado, setItemSeleccionado] = useState(null)
  const [cantidadCalc, setCantidadCalc] = useState(1)
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

      // Metadatos — col A (índice 0), filas 2-4
      const proyecto    = String(rows[1]?.[0] || '').trim()
      const nombre_obra = String(rows[2]?.[0] || '').trim()
      const fecha       = String(rows[3]?.[0] || '').trim() || null

      const CATEGORIAS = ['MANO DE OBRA', 'MATERIALES', 'ALQUILERES', 'DIRECTOS FIJOS', 'EQUIPOS', 'SUBCONTRATOS', 'ANALISIS']

      const filasParsed = []
      let orden = 0
      let itemActual = null
      let codigoActual = null
      let categoriaActual = null

      for (let i = 9; i < rows.length; i++) {
        const r = rows[i] || []

        // Col A(0) vacía, B(1)=código ítem, C(2)=descripción, D(3)=unidad, E(4)=precio, F(5)=cantidad, G(6)=total(fórmula)
        const colB = r[1]
        const colC = r[2] != null ? String(r[2]).trim() : ''
        const colD = r[3] != null ? String(r[3]).trim() : ''
        const colE = typeof r[4] === 'number' ? r[4] : null
        const colF = typeof r[5] === 'number' ? r[5] : null

        // Saltar filas completamente vacías
        if (!colB && !colC && !colE && !colF) continue

        // Saltar fila encabezado de columnas (tiene P.Un o Can.)
        if (colD.includes('P.Un') || colC.includes('P.Un') || colD.includes('Can.')) continue

        // Detectar ítem: col B es número (0.1, 0.3...)
        const esItem = colB !== null && typeof colB === 'number' && colC

        // Detectar categoría: col C en mayúsculas, sin precio ni cantidad
        const colCUpper = colC.toUpperCase()
        const esCategoria = !colB && colC && CATEGORIAS.some(cat => colCUpper.startsWith(cat)) && colE === null && colF === null

        // Detectar Costo-Costo
        const esCostoCosto = !colB && colCUpper.includes('COSTO-COSTO') || colCUpper.includes('COSTO COSTO')

        // Detectar subtotal: sin descripción, sin precio, sin cantidad (fila de SUM)
        const esSubtotal = !colB && !colC && colE === null && colF === null

        // Detectar insumo: tiene precio o cantidad
        const esInsumo = !colB && colC && !esCategoria && !esCostoCosto && (colE !== null || colF !== null)

        if (esItem) {
          itemActual = colC
          codigoActual = String(colB)
          categoriaActual = null
          filasParsed.push({
            obra_id: obra.id, orden, tipo: 'item',
            codigo_item: codigoActual,
            nombre_item: colC,
            categoria: null,
            descripcion: colC,
            unidad: colD || null,
            precio_unitario: null, cantidad: null, total: null,
            proyecto, nombre_obra, fecha,
          })
          orden++
          continue
        }

        if (esCategoria) {
          categoriaActual = colCUpper.trim()
          filasParsed.push({
            obra_id: obra.id, orden, tipo: 'categoria',
            codigo_item: codigoActual,
            nombre_item: itemActual,
            categoria: categoriaActual,
            descripcion: colC,
            unidad: null, precio_unitario: null, cantidad: null, total: null,
            proyecto, nombre_obra, fecha,
          })
          orden++
          continue
        }

        if (esCostoCosto) {
          // Calcular costo-costo sumando todos los subtotales del ítem
          const subtotalesItem = filasParsed.filter(f =>
            f.codigo_item === codigoActual && f.tipo === 'subtotal'
          )
          const totalCC = subtotalesItem.reduce((a, f) => a + (f.total || 0), 0)
          filasParsed.push({
            obra_id: obra.id, orden, tipo: 'costo_costo',
            codigo_item: codigoActual,
            nombre_item: itemActual,
            categoria: null,
            descripcion: 'Costo-Costo',
            unidad: null, precio_unitario: null, cantidad: null,
            total: totalCC,
            proyecto, nombre_obra, fecha,
          })
          orden++
          continue
        }

        if (esSubtotal) {
          // Calcular subtotal sumando insumos de la categoría actual
          const insumosCateg = filasParsed.filter(f =>
            f.codigo_item === codigoActual && f.categoria === categoriaActual && f.tipo === 'insumo'
          )
          const sumaCateg = insumosCateg.reduce((a, f) => a + (f.total || 0), 0)
          filasParsed.push({
            obra_id: obra.id, orden, tipo: 'subtotal',
            codigo_item: codigoActual,
            nombre_item: itemActual,
            categoria: categoriaActual,
            descripcion: null,
            unidad: null, precio_unitario: null, cantidad: null,
            total: sumaCateg,
            proyecto, nombre_obra, fecha,
          })
          orden++
          continue
        }

        if (esInsumo) {
          const total = colE !== null && colF !== null ? colE * colF : null
          filasParsed.push({
            obra_id: obra.id, orden, tipo: 'insumo',
            codigo_item: codigoActual,
            nombre_item: itemActual,
            categoria: categoriaActual,
            descripcion: colC,
            unidad: colD || null,
            precio_unitario: colE,
            cantidad: colF,
            total,
            proyecto, nombre_obra, fecha,
          })
          orden++
        }
      }

      // Subir a Storage
      const nombreArchivo = `${obra.id}/costo_explotado.xlsx`
      await supabase.storage.from('excels').remove([nombreArchivo])
      const { error: storageError } = await supabase.storage
        .from('excels').upload(nombreArchivo, archivo, { upsert: true })
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

  // Items únicos para calculadora
  const items = [...new Map(
    filas.filter(f => f.tipo === 'item').map(f => [f.codigo_item, f])
  ).values()]

  // Calcular resultado de la calculadora
  function calcular() {
    if (!itemSeleccionado) return []
    return filas
      .filter(f => f.codigo_item === itemSeleccionado.codigo_item && f.tipo === 'insumo' && f.precio_unitario && f.cantidad)
      .map(f => ({
        categoria: f.categoria,
        descripcion: f.descripcion,
        unidad: f.unidad,
        precio_unitario: f.precio_unitario,
        cantidad_unit: f.cantidad,
        cantidad_total: f.cantidad * cantidadCalc,
        total: f.precio_unitario * f.cantidad * cantidadCalc,
      }))
  }

  const resultadoCalc = calcular()
  const CATS = ['MANO DE OBRA', 'MATERIALES', 'ALQUILERES', 'EQUIPOS', 'DIRECTOS FIJOS', 'SUBCONTRATOS', 'ANALISIS']

  const resumenCalc = CATS.map(cat => ({
    cat,
    total: resultadoCalc.filter(r => r.categoria?.toUpperCase().startsWith(cat)).reduce((a, r) => a + r.total, 0)
  })).filter(r => r.total > 0)

  const fmt  = (n) => n != null ? '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
  const fmtN = (n) => n != null ? Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '-'

  if (cargando) return <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Cargando...</div>

  // Agrupar para visualización
  const grupos = []
  let grupoActual = null
  for (const f of filas) {
    if (f.tipo === 'item') {
      grupoActual = { item: f, secciones: [] }
      grupos.push(grupoActual)
    } else if (grupoActual) {
      grupoActual.secciones.push(f)
    }
  }

  return (
    <div>
      {/* Encabezado */}
      {meta && (
        <div style={{ marginBottom: '20px', display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '13px', color: '#555' }}>
          {meta.proyecto    && <span><b style={{ color: '#999' }}>Proyecto:</b> {meta.proyecto}</span>}
          {meta.nombre_obra && <span><b style={{ color: '#999' }}>Obra:</b> {meta.nombre_obra}</span>}
          {meta.fecha       && <span><b style={{ color: '#999' }}>Fecha:</b> {meta.fecha}</span>}
        </div>
      )}

      {/* Upload admin */}
      {esAdmin && (
        <div style={{ marginBottom: '20px', padding: '16px 20px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>{filas.length > 0 ? '🔄 Reemplazar Excel' : '📤 Subir Excel de Costo Explotado'}</div>
            <div style={{ fontSize: '12px', color: '#888' }}>Archivos .xlsx o .xls</div>
          </div>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={handleArchivo} style={{ display: 'none' }} id="upload-ce" />
          <label htmlFor="upload-ce" style={{ padding: '8px 20px', background: '#2563eb', color: 'white', borderRadius: '6px', cursor: subiendo ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '14px', opacity: subiendo ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {subiendo ? 'Procesando...' : 'Elegir archivo'}
          </label>
        </div>
      )}

      {/* Botón calculadora */}
      {(esJefe || esAdmin) && filas.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <button onClick={() => setVistaCalc(!vistaCalc)}
            style={{ padding: '10px 20px', background: vistaCalc ? '#2563eb' : 'white', color: vistaCalc ? 'white' : '#2563eb', border: '1px solid #2563eb', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
            🧮 Calculadora de Rendimientos
          </button>
        </div>
      )}

      {error && <div style={{ padding: '10px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#dc2626', marginBottom: '16px', fontSize: '14px' }}>⚠️ {error}</div>}
      {exito && <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', color: '#16a34a', marginBottom: '16px', fontSize: '14px' }}>✓ {exito}</div>}

      {/* Calculadora */}
      {vistaCalc && (
        <div style={{ marginBottom: '24px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px' }}>
          <h4 style={{ margin: '0 0 16px', color: '#1e3a5f' }}>Calculadora de Rendimientos</h4>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <select value={itemSeleccionado?.codigo_item || ''} onChange={ev => {
              const it = items.find(f => f.codigo_item === ev.target.value)
              setItemSeleccionado(it || null)
              setCantidadCalc(1)
            }} style={{ flex: 2, minWidth: '200px', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}>
              <option value="">Seleccioná un ítem...</option>
              {items.map(f => <option key={f.codigo_item} value={f.codigo_item}>{f.codigo_item} — {f.nombre_item}</option>)}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '13px', color: '#555', whiteSpace: 'nowrap' }}>Cantidad:</label>
              <input type="number" min="0.01" value={cantidadCalc}
                onChange={ev => setCantidadCalc(parseFloat(ev.target.value) || 1)}
                style={{ width: '100px', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', textAlign: 'right' }} />
              {itemSeleccionado?.unidad && <span style={{ fontSize: '13px', color: '#888' }}>{itemSeleccionado.unidad}</span>}
            </div>
          </div>

          {resultadoCalc.length > 0 && (
            <>
              {/* Resumen por categoría */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {resumenCalc.map(r => (
                  <div key={r.cat} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 16px', minWidth: '150px' }}>
                    <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>{r.cat}</div>
                    <div style={{ fontWeight: '700', color: '#1e3a5f', fontSize: '14px' }}>{fmt(r.total)}</div>
                  </div>
                ))}
                <div style={{ background: '#1e3a5f', borderRadius: '8px', padding: '10px 16px', minWidth: '150px' }}>
                  <div style={{ fontSize: '11px', color: '#93c5fd', marginBottom: '4px' }}>TOTAL</div>
                  <div style={{ fontWeight: '700', color: 'white', fontSize: '14px' }}>{fmt(resultadoCalc.reduce((a, r) => a + r.total, 0))}</div>
                </div>
              </div>

              {/* Detalle por categoría */}
              {CATS.filter(cat => resultadoCalc.some(r => r.categoria?.toUpperCase().startsWith(cat))).map(cat => (
                <div key={cat} style={{ marginBottom: '12px' }}>
                  <div style={{ background: '#dbeafe', padding: '6px 12px', fontWeight: '700', color: '#1e3a5f', fontSize: '12px', borderRadius: '4px 4px 0 0' }}>{cat}</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9' }}>
                        <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: '600' }}>Descripción</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600' }}>Unid.</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600' }}>P. Unit.</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600' }}>Cant./Unit.</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600' }}>Cant. Total</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultadoCalc.filter(r => r.categoria?.toUpperCase().startsWith(cat)).map((r, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb', borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 10px' }}>{r.descripcion}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#888' }}>{r.unidad}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmt(r.precio_unitario)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtN(r.cantidad_unit)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600' }}>{fmtN(r.cantidad_total)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600' }}>{fmt(r.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </>
          )}
          {itemSeleccionado && resultadoCalc.length === 0 && (
            <p style={{ color: '#aaa', fontSize: '13px' }}>No hay insumos cargados para este ítem.</p>
          )}
        </div>
      )}

      {/* Tabla del costo explotado */}
      {filas.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#aaa', fontSize: '15px' }}>
          {esAdmin ? 'Subí el Excel para ver el costo explotado.' : 'Aún no se cargó el costo explotado para esta obra.'}
        </div>
      ) : (
        <div>
          {grupos.map((g, gi) => {
            const costoTotal = g.secciones.find(f => f.tipo === 'costo_costo')
            return (
              <div key={gi} style={{ marginBottom: '24px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                {/* Header del ítem */}
                <div style={{ background: '#1e3a5f', color: 'white', padding: '10px 16px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: '700', fontSize: '13px', minWidth: '40px' }}>{g.item.codigo_item}</span>
                  <span style={{ fontWeight: '700', fontSize: '14px', flex: 1 }}>{g.item.nombre_item}</span>
                  {costoTotal?.total > 0 && (
                    <span style={{ fontWeight: '700', fontSize: '14px', color: '#93c5fd' }}>
                      Costo-Costo: {fmt(costoTotal.total)}
                    </span>
                  )}
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: '600', color: '#555' }}>Descripción</th>
                      <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: '600', color: '#555' }}>Unid.</th>
                      <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: '600', color: '#555' }}>P. Unitario</th>
                      <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: '600', color: '#555' }}>Cantidad</th>
                      <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: '600', color: '#555' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.secciones.filter(f => f.tipo !== 'costo_costo').map((f, fi) => {
                      const esCategoria = f.tipo === 'categoria'
                      const esSubtotal  = f.tipo === 'subtotal'
                      return (
                        <tr key={fi} style={{
                          background: esCategoria ? '#dbeafe' : esSubtotal ? '#f1f5f9' : fi % 2 === 0 ? 'white' : '#f9fafb',
                          borderBottom: '1px solid #f1f5f9'
                        }}>
                          <td style={{ padding: '6px 12px', fontWeight: esCategoria || esSubtotal ? '700' : '400', color: esCategoria ? '#1e3a5f' : 'inherit' }}>
                            {esSubtotal ? 'SUBTOTAL' : f.descripcion || ''}
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'right', color: '#888' }}>
                            {esCategoria || esSubtotal ? '' : f.unidad || ''}
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                            {esCategoria || esSubtotal ? '' : fmt(f.precio_unitario)}
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                            {esCategoria || esSubtotal ? '' : fmtN(f.cantidad)}
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: esSubtotal ? '700' : '400', color: esSubtotal ? '#1e3a5f' : '#111' }}>
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
      )}
    </div>
  )
}

export default CostoExplotado