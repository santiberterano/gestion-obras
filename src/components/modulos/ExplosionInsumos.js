import React, { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../supabaseClient'

function ExplosionInsumos({ obra, perfil }) {
  const [filas, setFilas] = useState([])
  const [meta, setMeta] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState(null)
  const [exito, setExito] = useState(null)
  const inputRef = useRef()

  const esAdmin = perfil?.area === 'administracion'

  useEffect(() => {
    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obra.id])

  async function cargarDatos() {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase
      .from('explosion_insumos')
      .select('*')
      .eq('obra_id', obra.id)
      .order('orden', { ascending: true })

    if (error) { setError('Error al cargar datos.'); setCargando(false); return }

    if (data && data.length > 0) {
      setMeta({
        proyecto: data[0].proyecto,
        nombre_obra: data[0].nombre_obra,
        fecha: data[0].fecha,
      })
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
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      const proyecto    = String(rows[1]?.[1] || '').trim()
      const nombre_obra = String(rows[2]?.[1] || '').trim()
      const fecha       = String(rows[3]?.[1] || '').trim() || null

      const filasParsed = []
      let orden = 0

      for (let i = 7; i < rows.length; i++) {
        const r = rows[i]

        const colA            = String(r[0] || '').trim()
        const descripcion     = String(r[1] || '').trim()
        const unidad          = String(r[2] || '').trim()
        const precio_unitario = parseFloat(r[3]) || null
        const cantidad        = parseFloat(r[4]) || null
        const subtotal        = parseFloat(r[5]) || null
        const incidencia      = parseFloat(r[6]) || null
        const fechaItem       = r[7] ? String(r[7]).trim() : null

        if (!colA && !descripcion && !subtotal) continue
        if (descripcion === 'Descripción' || descripcion === 'Descripcion') continue

        const esTipo = descripcion &&
                       descripcion === descripcion.toUpperCase() &&
                       descripcion.length > 2 &&
                       !descripcion.includes('TOTAL') &&
                       !descripcion.includes('DOLAR') &&
                       !descripcion.includes('DÓLAR') &&
                       precio_unitario === null &&
                       cantidad === null

        const esTotal    = descripcion.toUpperCase().includes('TOTAL')
        const esDolar    = descripcion.toUpperCase().includes('DOLAR') ||
                           descripcion.toUpperCase().includes('DÓLAR')
        const esSubtotal = !descripcion && subtotal !== null

        let tipo = 'item'
        if (esTipo)          tipo = 'tipo'
        else if (esTotal)    tipo = 'total'
        else if (esDolar)    tipo = 'dolar'
        else if (esSubtotal) tipo = 'subtotal'

        filasParsed.push({
          obra_id:        obra.id,
          orden,
          tipo,
          descripcion:     descripcion || null,
          unidad:          unidad || null,
          precio_unitario: isNaN(precio_unitario) ? null : precio_unitario,
          cantidad:        isNaN(cantidad) ? null : cantidad,
          subtotal:        isNaN(subtotal) ? null : subtotal,
          incidencia:      isNaN(incidencia) ? null : incidencia,
          fecha_item:      fechaItem,
          proyecto,
          nombre_obra,
          fecha,
        })
        orden++
      }

      const nombreArchivo = `${obra.id}/explosion_insumos.xlsx`
      await supabase.storage.from('excels').remove([nombreArchivo])
      const { error: storageError } = await supabase.storage
        .from('excels')
        .upload(nombreArchivo, archivo, { upsert: true })
      if (storageError) throw new Error('Error subiendo archivo: ' + storageError.message)

      await supabase.from('explosion_insumos').delete().eq('obra_id', obra.id)
      const { error: insertError } = await supabase.from('explosion_insumos').insert(filasParsed)
      if (insertError) throw new Error('Error guardando datos: ' + insertError.message)

      // Calcular subtotales por tipo
      await supabase.from('explosion_insumos').select('id').eq('obra_id', obra.id).eq('tipo', 'tipo').then(async ({ data: tipos }) => {
        for (const t of tipos || []) {
          const { data: items } = await supabase
            .from('explosion_insumos')
            .select('subtotal, orden')
            .eq('obra_id', obra.id)
            .eq('tipo', 'item')
            .gt('orden', t.orden)
          const suma = (items || []).reduce((acc, i) => acc + (i.subtotal || 0), 0)
          await supabase.from('explosion_insumos').update({ subtotal: suma }).eq('id', t.id)
        }
      })

      setExito('Excel cargado correctamente.')
      await cargarDatos()
    } catch (err) {
      setError(err.message || 'Error procesando el archivo.')
    }
    setSubiendo(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  function agrupar(filas) {
    const grupos = []
    let grupoActual = null
    for (const f of filas) {
      if (f.tipo === 'tipo') {
        grupoActual = { encabezado: f, items: [] }
        grupos.push(grupoActual)
      } else if (f.tipo === 'total' || f.tipo === 'dolar') {
        grupos.push({ encabezado: null, items: [f] })
      } else if (grupoActual) {
        grupoActual.items.push(f)
      } else {
        grupos.push({ encabezado: null, items: [f] })
      }
    }
    return grupos
  }

  const fmt    = (n) => n != null ? '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
  const fmtPct = (n) => n != null ? (Number(n) * 100).toFixed(2) + '%' : '-'

  const filaTotal = filas.find(f => f.tipo === 'total')
  const filaDolar = filas.find(f => f.tipo === 'dolar')

  if (cargando) return <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Cargando...</div>

  const grupos = agrupar(filas)

  return (
    <div>
      {meta && (
        <div style={{ marginBottom: '20px', display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '13px', color: '#555' }}>
          {meta.proyecto    && <span><b style={{ color: '#999' }}>Proyecto:</b> {meta.proyecto}</span>}
          {meta.nombre_obra && <span><b style={{ color: '#999' }}>Obra:</b> {meta.nombre_obra}</span>}
          {meta.fecha       && <span><b style={{ color: '#999' }}>Fecha:</b> {meta.fecha}</span>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '16px', alignItems: 'center' }}>
            {filaDolar?.precio_unitario && (
              <span style={{ fontSize: '13px', color: '#666' }}>
                U$S: <b>${Number(filaDolar.precio_unitario).toLocaleString('es-AR')}</b>
              </span>
            )}
            {filaTotal?.subtotal && (
              <span style={{ fontWeight: '700', fontSize: '15px', color: '#2563eb' }}>
                Total: ${Number(filaTotal.subtotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            )}
          </span>
        </div>
      )}

      {esAdmin && (
        <div style={{
          marginBottom: '20px', padding: '16px 20px',
          background: '#f8fafc', border: '1px dashed #cbd5e1',
          borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap'
        }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>
              {filas.length > 0 ? '🔄 Reemplazar Excel' : '📤 Subir Excel de Explosión de Insumos'}
            </div>
            <div style={{ fontSize: '12px', color: '#888' }}>Archivos .xlsx o .xls</div>
          </div>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={handleArchivo} style={{ display: 'none' }} id="upload-ei" />
          <label htmlFor="upload-ei" style={{
            padding: '8px 20px', background: '#2563eb', color: 'white',
            borderRadius: '6px', cursor: subiendo ? 'not-allowed' : 'pointer',
            fontWeight: '600', fontSize: '14px', opacity: subiendo ? 0.6 : 1, whiteSpace: 'nowrap'
          }}>
            {subiendo ? 'Procesando...' : 'Elegir archivo'}
          </label>
        </div>
      )}

      {error && <div style={{ padding: '10px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#dc2626', marginBottom: '16px', fontSize: '14px' }}>⚠️ {error}</div>}
      {exito && <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', color: '#16a34a', marginBottom: '16px', fontSize: '14px' }}>✓ {exito}</div>}

      {filas.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#aaa', fontSize: '15px' }}>
          {esAdmin ? 'Subí el Excel para ver la explosión de insumos.' : 'Aún no se cargó la explosión de insumos para esta obra.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#1e3a5f', color: 'white' }}>
                {['Descripción', 'Unid.', 'P. Unitario', 'Cantidad', 'Subtotal', 'Incidencia', 'Fecha'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Descripción' ? 'left' : 'right', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '12px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g, gi) => (
                <React.Fragment key={'grupo-' + gi}>
                  {g.encabezado && (
                    <tr style={{ background: '#dbeafe' }}>
                      <td colSpan={4} style={{ padding: '8px 12px', fontWeight: '700', color: '#1e3a5f', fontSize: '13px' }}>
                        {g.encabezado.descripcion}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700', color: '#1e3a5f', fontSize: '13px' }}>
                        {Number(g.encabezado.subtotal) > 0 ? fmt(Number(g.encabezado.subtotal)) : ''}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  )}
                  {g.items.map((f, fi) => {
                    const esSubtotal = f.tipo === 'subtotal'
                    const esTotal    = f.tipo === 'total'
                    const esDolar    = f.tipo === 'dolar'
                    return (
                      <tr key={fi} style={{
                        background: esTotal ? '#1e3a5f' : esDolar || esSubtotal ? '#f1f5f9' : fi % 2 === 0 ? '#ffffff' : '#f9fafb',
                        borderBottom: esSubtotal ? '2px solid #cbd5e1' : '1px solid #f1f5f9'
                      }}>
                        <td style={{ padding: '7px 12px', fontWeight: (esSubtotal || esTotal || esDolar) ? '700' : '400', color: esTotal ? 'white' : 'inherit' }}>
                          {esSubtotal ? 'SUBTOTAL' : f.descripcion || ''}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', color: esTotal ? 'white' : '#888' }}>
                          {esSubtotal || esTotal || esDolar ? '' : f.unidad || ''}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', color: esTotal ? 'white' : 'inherit' }}>
                          {esSubtotal || esTotal ? '' : fmt(f.precio_unitario)}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', color: esTotal ? 'white' : 'inherit' }}>
                          {esSubtotal || esTotal || esDolar ? '' : fmt(f.cantidad)}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: (esSubtotal || esTotal || esDolar) ? '700' : '400', color: esTotal ? 'white' : esSubtotal ? '#1e3a5f' : '#111' }}>
                          {fmt(f.subtotal)}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', color: esTotal ? 'white' : '#888' }}>
                          {esSubtotal || esTotal || esDolar ? '' : fmtPct(f.incidencia)}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', color: esTotal ? 'white' : '#888' }}>
                          {esSubtotal || esTotal || esDolar ? '' : f.fecha_item || ''}
                        </td>
                      </tr>
                    )
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default ExplosionInsumos