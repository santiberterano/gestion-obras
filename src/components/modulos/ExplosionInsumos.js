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
  const [vistaJefe, setVistaJefe] = useState(null) // 'pedido' | 'stock' | 'historial'
  const [pedidoItems, setPedidoItems] = useState([])
  const [observaciones, setObservaciones] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [historial, setHistorial] = useState([])
  const inputRef = useRef()

  const esAdmin   = perfil?.area === 'administracion'
  const esJefe    = perfil?.area === 'jefe_obra'

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

  async function cargarHistorial() {
    const { data } = await supabase
      .from('solicitudes')
      .select('*, solicitud_items(*)')
      .eq('obra_id', obra.id)
      .order('created_at', { ascending: false })
    setHistorial(data || [])
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

      for (let i = 11; i < rows.length; i++) {
        const r = rows[i]

        const descripcion     = String(r[1] || '').trim()
        const unidad          = String(r[2] || '').trim()
        const precio_unitario = parseFloat(r[3]) || null
        const cantidad        = parseFloat(r[4]) || null
        const subtotal        = parseFloat(r[5]) || null
        const incidencia      = parseFloat(r[6]) || null
        const fechaItem       = r[7] ? String(r[7]).trim() : null

        if (!descripcion && !subtotal) continue

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
          obra_id: obra.id, orden, tipo,
          descripcion: descripcion || null,
          unidad: unidad || null,
          precio_unitario: isNaN(precio_unitario) ? null : precio_unitario,
          cantidad: isNaN(cantidad) ? null : cantidad,
          subtotal: isNaN(subtotal) ? null : subtotal,
          incidencia: isNaN(incidencia) ? null : incidencia,
          fecha_item: fechaItem,
          proyecto, nombre_obra, fecha,
        })
        orden++
      }

      const nombreArchivo = `${obra.id}/explosion_insumos.xlsx`
      await supabase.storage.from('excels').remove([nombreArchivo])
      const { error: storageError } = await supabase.storage
        .from('excels').upload(nombreArchivo, archivo, { upsert: true })
      if (storageError) throw new Error('Error subiendo archivo: ' + storageError.message)

      await supabase.from('explosion_insumos').delete().eq('obra_id', obra.id)
      const { error: insertError } = await supabase.from('explosion_insumos').insert(filasParsed)
      if (insertError) throw new Error('Error guardando datos: ' + insertError.message)

      // Calcular subtotales por tipo
      const tipos = filasParsed.filter(f => f.tipo === 'tipo')
      for (let t = 0; t < tipos.length; t++) {
        const ordenInicio = tipos[t].orden
        const ordenFin    = t + 1 < tipos.length ? tipos[t + 1].orden : 999999
        const suma = filasParsed
          .filter(f => f.tipo === 'item' && f.orden > ordenInicio && f.orden < ordenFin)
          .reduce((acc, f) => acc + (f.subtotal || 0), 0)
        const { data: fila } = await supabase
          .from('explosion_insumos').select('id')
          .eq('obra_id', obra.id).eq('orden', ordenInicio).single()
        if (fila) await supabase.from('explosion_insumos').update({ subtotal: suma }).eq('id', fila.id)
      }

      setExito('Excel cargado correctamente.')
      await cargarDatos()
    } catch (err) {
      setError(err.message || 'Error procesando el archivo.')
    }
    setSubiendo(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  function agregarItemPedido(insumo) {
  const existe = pedidoItems.find(p => p.insumo_id === insumo.id)
  if (existe) return
  setPedidoItems(prev => [...prev, {
    insumo_id: insumo.id,
    explosion_item_id: insumo.id,
    descripcion: insumo.descripcion,
    unidad: insumo.unidad,
    cantidad_max: insumo.cantidad,
    cantidad: 1,
    es_otro: false,
  }])
}

  function actualizarCantidad(insumo_id, valor) {
    setPedidoItems(prev => prev.map(p =>
      p.insumo_id === insumo_id ? { ...p, cantidad: valor } : p
    ))
  }

  function quitarItem(insumo_id) {
    setPedidoItems(prev => prev.filter(p => p.insumo_id !== insumo_id))
  }

  function agregarOtro() {
    setPedidoItems(prev => [...prev, {
      insumo_id: 'otro-' + Date.now(),
      descripcion: '',
      unidad: '',
      cantidad: 1,
      es_otro: true,
    }])
  }

  async function enviarPedido() {
    if (pedidoItems.length === 0) return
    setEnviando(true)
    try {
      // Número correlativo
      const { data: ultimas } = await supabase
        .from('solicitudes').select('numero')
        .eq('obra_id', obra.id).order('numero', { ascending: false }).limit(1)
      const numero = ultimas?.[0]?.numero ? ultimas[0].numero + 1 : 1

      const { data: solicitud, error: solError } = await supabase
        .from('solicitudes').insert({
          obra_id: obra.id,
          numero,
          usuario_id: perfil.id,
          estado: 'pendiente',
          observaciones,
        }).select().single()
      if (solError) throw new Error('Error creando solicitud')

      const items = pedidoItems.map(p => ({
        solicitud_id: solicitud.id,
        descripcion: p.descripcion,
        unidad: p.unidad || '',
        cantidad: parseFloat(p.cantidad) || 1,
        es_otro: p.es_otro,
      }))
      await supabase.from('solicitud_items').insert(items)

      setPedidoItems([])
      setObservaciones('')
      setVistaJefe(null)
      setExito(`Solicitud SC-${String(numero).padStart(3, '0')} enviada correctamente.`)
    } catch (err) {
      setError(err.message)
    }
    setEnviando(false)
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
  const grupos    = agrupar(filas)
  const insumos   = filas.filter(f => f.tipo === 'item')

  if (cargando) return <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Cargando...</div>

  return (
    <div>
      {/* Encabezado */}
      {meta && (
        <div style={{ marginBottom: '20px', display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '13px', color: '#555' }}>
          {meta.proyecto    && <span><b style={{ color: '#999' }}>Proyecto:</b> {meta.proyecto}</span>}
          {meta.nombre_obra && <span><b style={{ color: '#999' }}>Obra:</b> {meta.nombre_obra}</span>}
          {meta.fecha       && <span><b style={{ color: '#999' }}>Fecha:</b> {meta.fecha}</span>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '16px', alignItems: 'center' }}>
            {filaDolar?.precio_unitario && <span style={{ fontSize: '13px', color: '#666' }}>U$S: <b>${Number(filaDolar.precio_unitario).toLocaleString('es-AR')}</b></span>}
            {filaTotal?.subtotal && <span style={{ fontWeight: '700', fontSize: '15px', color: '#2563eb' }}>Total: ${Number(filaTotal.subtotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>}
          </span>
        </div>
      )}

      {/* Upload admin */}
      {esAdmin && (
        <div style={{ marginBottom: '20px', padding: '16px 20px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>{filas.length > 0 ? '🔄 Reemplazar Excel' : '📤 Subir Excel de Explosión de Insumos'}</div>
            <div style={{ fontSize: '12px', color: '#888' }}>Archivos .xlsx o .xls</div>
          </div>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={handleArchivo} style={{ display: 'none' }} id="upload-ei" />
          <label htmlFor="upload-ei" style={{ padding: '8px 20px', background: '#2563eb', color: 'white', borderRadius: '6px', cursor: subiendo ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '14px', opacity: subiendo ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {subiendo ? 'Procesando...' : 'Elegir archivo'}
          </label>
        </div>
      )}

      {/* Botones jefe de obra */}
      {esJefe && filas.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button
            onClick={() => { setVistaJefe(vistaJefe === 'pedido' ? null : 'pedido') }}
            style={{ padding: '10px 20px', background: vistaJefe === 'pedido' ? '#2563eb' : 'white', color: vistaJefe === 'pedido' ? 'white' : '#2563eb', border: '1px solid #2563eb', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
            🛒 Cargar Pedido
          </button>
          <button
            onClick={() => setVistaJefe(vistaJefe === 'stock' ? null : 'stock')}
            style={{ padding: '10px 20px', background: vistaJefe === 'stock' ? '#2563eb' : 'white', color: vistaJefe === 'stock' ? 'white' : '#2563eb', border: '1px solid #2563eb', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
            📦 Ver Stock
          </button>
          <button
            onClick={() => { setVistaJefe(vistaJefe === 'historial' ? null : 'historial'); cargarHistorial() }}
            style={{ padding: '10px 20px', background: vistaJefe === 'historial' ? '#2563eb' : 'white', color: vistaJefe === 'historial' ? 'white' : '#2563eb', border: '1px solid #2563eb', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
            📋 Historial de Pedidos
          </button>
        </div>
      )}

      {error && <div style={{ padding: '10px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#dc2626', marginBottom: '16px', fontSize: '14px' }}>⚠️ {error}</div>}
      {exito && <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', color: '#16a34a', marginBottom: '16px', fontSize: '14px' }}>✓ {exito}</div>}

      {/* Vista Cargar Pedido */}
      {vistaJefe === 'pedido' && (
        <div style={{ marginBottom: '24px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px' }}>
          <h4 style={{ margin: '0 0 16px', color: '#1e3a5f' }}>Nueva Solicitud de Compra</h4>

          {/* Items seleccionados */}
          {pedidoItems.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              {pedidoItems.map((p, i) => (
                <div key={p.insumo_id} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', background: 'white', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  {p.es_otro ? (
                    <>
                      <input
                        placeholder="Descripción del insumo"
                        value={p.descripcion}
                        onChange={ev => setPedidoItems(prev => prev.map((x, xi) => xi === i ? { ...x, descripcion: ev.target.value } : x))}
                        style={{ flex: 2, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '13px' }}
                      />
                      <input
                        placeholder="Unidad"
                        value={p.unidad}
                        onChange={ev => setPedidoItems(prev => prev.map((x, xi) => xi === i ? { ...x, unidad: ev.target.value } : x))}
                        style={{ width: '70px', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '13px' }}
                      />
                    </>
                  ) : (
                    <span style={{ flex: 2, fontSize: '13px' }}>{p.descripcion} <span style={{ color: '#888' }}>({p.unidad})</span></span>
                  )}
                  <input
                    type="number"
                    min="0.01"
                    max={p.cantidad_max || undefined}
                    value={p.cantidad}
                    onChange={ev => actualizarCantidad(p.insumo_id, ev.target.value)}
                    style={{ width: '80px', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '13px', textAlign: 'right' }}
                  />
                  <button onClick={() => quitarItem(p.insumo_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '16px' }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Selector de insumos */}
          <div style={{ marginBottom: '12px' }}>
            <select
              onChange={ev => {
                const ins = insumos.find(f => f.id === parseInt(ev.target.value))
                if (ins) agregarItemPedido(ins)
                ev.target.value = ''
              }}
              defaultValue=""
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', marginBottom: '8px' }}
            >
              <option value="">+ Agregar insumo de la explosión...</option>
              {insumos.map(f => (
                <option key={f.id} value={f.id}>{f.descripcion} ({f.unidad})</option>
              ))}
            </select>
            <button
              onClick={agregarOtro}
              style={{ padding: '7px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', color: '#555' }}>
              + Agregar otro (no previsto)
            </button>
          </div>

          {/* Observaciones */}
          <textarea
            placeholder="Observaciones (opcional)"
            value={observaciones}
            onChange={ev => setObservaciones(ev.target.value)}
            rows={2}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', marginBottom: '12px', boxSizing: 'border-box', resize: 'vertical' }}
          />

          <button
            onClick={enviarPedido}
            disabled={pedidoItems.length === 0 || enviando}
            style={{ padding: '10px 24px', background: pedidoItems.length === 0 ? '#94a3b8' : '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '14px', cursor: pedidoItems.length === 0 ? 'not-allowed' : 'pointer' }}>
            {enviando ? 'Enviando...' : 'Enviar Solicitud'}
          </button>
        </div>
      )}

      {/* Vista Historial */}
      {vistaJefe === 'historial' && (
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ margin: '0 0 16px', color: '#1e3a5f' }}>Historial de Solicitudes</h4>
          {historial.length === 0 ? (
            <p style={{ color: '#aaa' }}>No hay solicitudes aún.</p>
          ) : historial.map(s => (
            <div key={s.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: '700', color: '#1e3a5f' }}>SC-{String(s.numero).padStart(3, '0')}</span>
                <span style={{
                  padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
                  background: s.estado === 'pendiente' ? '#fef9c3' : s.estado === 'aprobada' ? '#dcfce7' : '#f0fdf4',
                  color: s.estado === 'pendiente' ? '#ca8a04' : s.estado === 'aprobada' ? '#16a34a' : '#666'
                }}>{s.estado}</span>
                <span style={{ fontSize: '12px', color: '#999' }}>{new Date(s.created_at).toLocaleDateString('es-AR')}</span>
              </div>
              {s.solicitud_items?.map(it => (
                <div key={it.id} style={{ fontSize: '13px', color: '#555', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  {it.descripcion} — <b>{it.cantidad} {it.unidad}</b>
                  {it.es_otro && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#2563eb' }}>no previsto</span>}
                </div>
              ))}
              {s.observaciones && <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#888' }}>Obs: {s.observaciones}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Vista Stock */}
      {vistaJefe === 'stock' && (
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ margin: '0 0 16px', color: '#1e3a5f' }}>Stock Disponible</h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#1e3a5f', color: 'white' }}>
                  {['Descripción', 'Unid.', 'Cant. Original', 'Cant. Pedida', 'Disponible'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Descripción' ? 'left' : 'right', fontWeight: '600', fontSize: '12px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {insumos.map((f, fi) => {
                  const pedida     = f.cantidad_pedida || 0
                  const disponible = (f.cantidad || 0) - pedida
                  return (
                    <tr key={fi} style={{
                      background: fi % 2 === 0 ? '#ffffff' : '#f9fafb',
                      borderBottom: '1px solid #f1f5f9'
                    }}>
                      <td style={{ padding: '7px 12px' }}>{f.descripcion}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: '#888' }}>{f.unidad}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right' }}>{Number(f.cantidad || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: pedida > 0 ? '#dc2626' : '#888' }}>{Number(pedida).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: '600', color: disponible < 0 ? '#dc2626' : disponible === 0 ? '#ca8a04' : '#16a34a' }}>
                        {Number(disponible).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabla de insumos */}
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
                        {g.encabezado.subtotal ? fmt(g.encabezado.subtotal) : ''}
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