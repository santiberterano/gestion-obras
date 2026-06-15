import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../supabaseClient'

function CostoPrevisto({ obra, perfil }) {
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
  }, [obra.id])

  async function cargarDatos() {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase
      .from('costo_previsto')
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

      const proyecto = String(rows[1]?.[1] || '').trim()
      const nombre_obra = String(rows[2]?.[1] || '').trim()
      const fechaRaw = rows[3]?.[1]
      let fecha = null
      if (fechaRaw) {
        if (typeof fechaRaw === 'number') {
          const d = XLSX.SSF.parse_date_code(fechaRaw)
          fecha = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
        } else {
          fecha = String(fechaRaw).trim()
        }
      }

      const filasParsed = []
      let orden = 0

      // Arrancar desde fila 8 (índice 7), salteando el encabezado de columnas
      for (let i = 7; i < rows.length; i++) {
        const r = rows[i]
        const codigo = String(r[1] || '').trim()
        const descripcion = String(r[2] || '').trim()
        const unidad = String(r[3] || '').trim()
        const precio_unitario = parseFloat(r[4]) || null
        const cantidad = parseFloat(r[5]) || null
        const total = parseFloat(r[6]) || null
        const incidencia = parseFloat(r[7]) || null

        // Saltar filas vacías y encabezados
        if (!descripcion && !total) continue
        if (descripcion === 'Descripción') continue

        // Código entero (ej: 0, 1, 14) = título de sección en negrita
        const codigoEsEntero = codigo && /^\d+$/.test(codigo)

        // Rubro: sin código, descripción en mayúsculas
        const esRubro = !codigo && descripcion && descripcion === descripcion.toUpperCase() && descripcion.length > 2
        // Título: código entero con descripción en mayúsculas
        const esTitulo = codigoEsEntero && descripcion && descripcion === descripcion.toUpperCase()
        // Subtotal: sin código, sin descripción, con total
        const esSubtotal = !codigo && !descripcion && total

        let tipo = 'item'
        if (esRubro) tipo = 'rubro'
        else if (esTitulo) tipo = 'titulo'
        else if (esSubtotal) tipo = 'subtotal'

        filasParsed.push({
          obra_id: obra.id,
          orden,
          tipo,
          codigo: codigo || null,
          descripcion: descripcion || null,
          unidad: unidad || null,
          precio_unitario,
          cantidad,
          total,
          incidencia,
          proyecto,
          nombre_obra,
          fecha,
        })
        orden++
      }

      const nombreArchivo = `${obra.id}/costo_previsto.xlsx`
      await supabase.storage.from('excels').remove([nombreArchivo])
      const { error: storageError } = await supabase.storage
        .from('excels')
        .upload(nombreArchivo, archivo, { upsert: true })
      if (storageError) throw new Error('Error subiendo archivo: ' + storageError.message)

      await supabase.from('costo_previsto').delete().eq('obra_id', obra.id)
      const { error: insertError } = await supabase.from('costo_previsto').insert(filasParsed)
      if (insertError) throw new Error('Error guardando datos: ' + insertError.message)

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
      if (f.tipo === 'rubro') {
        grupoActual = { rubro: f, items: [] }
        grupos.push(grupoActual)
      } else if (grupoActual) {
        grupoActual.items.push(f)
      } else {
        grupos.push({ rubro: null, items: [f] })
      }
    }
    return grupos
  }

  const fmt = (n) => n != null ? Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
  const fmtPct = (n) => n != null ? (Number(n) * 100).toFixed(2) + '%' : '-'

  const filaTotal = filas.find(f => f.descripcion && f.descripcion.includes('TOTAL COSTO'))
  const totalFinal = filaTotal?.total || null

  if (cargando) return <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Cargando...</div>

  const grupos = agrupar(filas)

  return (
    <div>
      {/* Encabezado */}
      {meta && (
        <div style={{ marginBottom: '20px', display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '13px', color: '#555' }}>
          {meta.proyecto && <span><b style={{ color: '#999' }}>Proyecto:</b> {meta.proyecto}</span>}
          {meta.nombre_obra && <span><b style={{ color: '#999' }}>Obra:</b> {meta.nombre_obra}</span>}
          {meta.fecha && <span><b style={{ color: '#999' }}>Fecha:</b> {meta.fecha}</span>}
          {totalFinal && (
            <span style={{ marginLeft: 'auto', fontWeight: '700', fontSize: '15px', color: '#2563eb' }}>
              Total: ${Number(totalFinal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </span>
          )}
        </div>
      )}

      {/* Zona de carga (solo admin) */}
      {esAdmin && (
        <div style={{
          marginBottom: '20px', padding: '16px 20px',
          background: '#f8fafc', border: '1px dashed #cbd5e1',
          borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap'
        }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>
              {filas.length > 0 ? '🔄 Reemplazar Excel' : '📤 Subir Excel de Costo Previsto'}
            </div>
            <div style={{ fontSize: '12px', color: '#888' }}>Solo archivos .xlsx</div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            onChange={handleArchivo}
            style={{ display: 'none' }}
            id="upload-cp"
          />
          <label htmlFor="upload-cp" style={{
            padding: '8px 20px', background: '#2563eb', color: 'white',
            borderRadius: '6px', cursor: subiendo ? 'not-allowed' : 'pointer',
            fontWeight: '600', fontSize: '14px',
            opacity: subiendo ? 0.6 : 1,
            whiteSpace: 'nowrap'
          }}>
            {subiendo ? 'Procesando...' : 'Elegir archivo'}
          </label>
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#dc2626', marginBottom: '16px', fontSize: '14px' }}>
          ⚠️ {error}
        </div>
      )}
      {exito && (
        <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', color: '#16a34a', marginBottom: '16px', fontSize: '14px' }}>
          ✓ {exito}
        </div>
      )}

      {/* Tabla */}
      {filas.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#aaa', fontSize: '15px' }}>
          {esAdmin ? 'Subí el Excel para ver el costo previsto.' : 'Aún no se cargó el costo previsto para esta obra.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#1e3a5f', color: 'white' }}>
                {['Código', 'Descripción', 'Unid.', 'P. Unitario', 'Cantidad', 'Total', 'Incidencia'].map(h => (
                  <th key={h} style={{
                    padding: '10px 12px', textAlign: h === 'Descripción' ? 'left' : 'right',
                    fontWeight: '600', whiteSpace: 'nowrap', fontSize: '12px'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g, gi) => (
                <>
                  {/* Rubro: fila azul sin código */}
                  {g.rubro && (
                    <tr key={'rubro-' + gi} style={{ background: '#dbeafe' }}>
                      <td colSpan={7} style={{ padding: '8px 12px', fontWeight: '700', color: '#1e3a5f', fontSize: '13px', letterSpacing: '0.02em' }}>
                        {g.rubro.descripcion}
                      </td>
                    </tr>
                  )}
                  {/* Ítems, títulos y subtotales */}
                  {g.items.map((f, fi) => {
                    const esSubtotal = f.tipo === 'subtotal'
                    const esTitulo = f.tipo === 'titulo'
                    return (
                      <tr key={'item-' + gi + '-' + fi} style={{
                        background: esSubtotal ? '#f1f5f9' : esTitulo ? '#f8fafc' : fi % 2 === 0 ? '#ffffff' : '#f9fafb',
                        borderBottom: esSubtotal ? '2px solid #cbd5e1' : esTitulo ? '1px solid #e2e8f0' : '1px solid #f1f5f9'
                      }}>
                        <td style={{ padding: '7px 12px', color: '#666', whiteSpace: 'nowrap' }}>
                          {esSubtotal ? '' : f.codigo || ''}
                        </td>
                        <td style={{ padding: '7px 12px', fontWeight: (esSubtotal || esTitulo) ? '700' : '400', color: esTitulo ? '#1e3a5f' : 'inherit' }}>
                          {esSubtotal ? 'SUBTOTAL' : f.descripcion || ''}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', color: '#888' }}>
                          {(esSubtotal || esTitulo) ? '' : f.unidad || ''}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                          {(esSubtotal || esTitulo) ? '' : fmt(f.precio_unitario)}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                          {(esSubtotal || esTitulo) ? '' : fmt(f.cantidad)}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: esSubtotal ? '700' : '400', color: esSubtotal ? '#1e3a5f' : '#111' }}>
                          {esTitulo ? '' : fmt(f.total)}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', color: '#888' }}>
                          {(esSubtotal || esTitulo) ? '' : fmtPct(f.incidencia)}
                        </td>
                      </tr>
                    )
                  })}
                </>
              ))}

              {/* Total general */}
              {totalFinal && (
                <tr style={{ background: '#1e3a5f' }}>
                  <td colSpan={5} style={{ padding: '12px', fontWeight: '700', color: 'white', fontSize: '14px' }}>
                    TOTAL COSTO PREVISTO
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'white', fontSize: '15px' }}>
                    ${Number(totalFinal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default CostoPrevisto