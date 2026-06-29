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
  const [vistaJefe, setVistaJefe] = useState(null)
  const [vistaCompras, setVistaCompras] = useState(null)
  const [pedidoItems, setPedidoItems] = useState([])
  const [observaciones, setObservaciones] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [historial, setHistorial] = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  const inputRef = useRef()

  const esAdmin   = perfil?.area === 'administracion'
  const esJefe    = perfil?.area === 'jefe_obra'
  const esCompras = perfil?.area === 'compras'

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

  function descargarExcel() {
    const wb = XLSX.utils.book_new()
    const filasTitulo = [
      [`SOLICITUDES DE COMPRA — ${meta?.nombre_obra || obra.nombre}`],
      [`Proyecto: ${meta?.proyecto || ''} | Exportado: ${new Date().toLocaleDateString('es-AR')}`],
      [],
      ['N° SC', 'Fecha', 'Estado', 'Descripción Ítem', 'Unidad', 'Cantidad', 'No Previsto', 'Observaciones'],
    ]
    const filasData = []
    for (const s of historial) {
      for (const it of s.solicitud_items || []) {
        filasData.push([
          s.numero,
          new Date(s.created_at).toLocaleDateString('es-AR'),
          s.estado,
          it.descripcion,
          it.unidad,
          it.cantidad,
          it.es_otro ? 'Sí' : 'No',
          s.observaciones || '',
        ])
      }
    }
    const ws = XLSX.utils.aoa_to_sheet([...filasTitulo, ...filasData])
    ws['!cols'] = [8, 12, 15, 45, 10, 12, 13, 35].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, ws, 'Solicitudes')
    XLSX.writeFile(wb, `SC_${obra.nombre.replace(/\s+/g, '_')}.xlsx`)
  }

  async function cargarSolicitudes() {
    const { data } = await supabase
      .from('solicitudes')
      .select('*, solicitud_items(*)')
      .eq('obra_id', obra.id)
      .order('numero', { ascending: true })
    setSolicitudes(data || [])
  }

  async function cambiarEstado(solicitudId, nuevoEstado) {
    setError(null)
    try {
      // Obtener solicitud actual para verificar stock_descontado
      const { data: solActual } = await supabase
        .from('solicitudes')
        .select('stock_descontado')
        .eq('id', solicitudId)
        .single()

      await supabase.from('solicitudes').update({ estado: nuevoEstado }).eq('id', solicitudId)

      // Descontar stock solo al aprobar y solo si no fue descontado antes
      if (nuevoEstado === 'aprobada' && !solActual?.stock_descontado) {
        const { data: items } = await supabase
          .from('solicitud_items')
          .select('*')
          .eq('solicitud_id', solicitudId)

        for (const item of items || []) {
          if (item.explosion_item_id) {
            const { data: insumo } = await supabase
              .from('explosion_insumos')
              .select('cantidad_pedida')
              .eq('id', item.explosion_item_id)
              .single()
            if (insumo) {
              await supabase
                .from('explosion_insumos')
                .update({ cantidad_pedida: (insumo.cantidad_pedida || 0) + item.cantidad })
                .eq('id', item.explosion_item_id)
            }
          }
        }

        await supabase.from('solicitudes').update({ stock_descontado: true }).eq('id', solicitudId)
        await cargarDatos()
      }

      await cargarSolicitudes()
      await cargarDatos()
      setExito('Estado actualizado correctamente.')
    } catch (err) {
      setError('Error al actualizar estado.')
    }
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
      explosion_item_id: null,
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
        explosion_item_id: p.es_otro ? null : p.explosion_item_id,
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

  const estadoColor = {
    pendiente:          { bg: '#fef9c3', color: '#ca8a04' },
    aprobada:           { bg: 'var(--c-gold-dim)', color: 'var(--c-gold)' },
    'entrega parcial':  { bg: '#fef3c7', color: '#d97706' },
    entregada:          { bg: '#dcfce7', color: 'var(--c-success)' },
    rechazada:          { bg: '#fee2e2', color: 'var(--c-danger)' },
  }

  if (cargando) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--c-text3)' }}>Cargando...</div>

  return (
    <div>
      {/* Encabezado */}
      {meta && (
        <div style={{ marginBottom: '20px', display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--c-text2)' }}>
          {meta.proyecto    && <span><b style={{ color: 'var(--c-text3)' }}>Proyecto:</b> {meta.proyecto}</span>}
          {meta.nombre_obra && <span><b style={{ color: 'var(--c-text3)' }}>Obra:</b> {meta.nombre_obra}</span>}
          {meta.fecha       && <span><b style={{ color: 'var(--c-text3)' }}>Fecha:</b> {meta.fecha}</span>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '16px', alignItems: 'center' }}>
            {filaDolar?.precio_unitario && <span style={{ fontSize: '13px', color: 'var(--c-text2)' }}>U$S: <b>${Number(filaDolar.precio_unitario).toLocaleString('es-AR')}</b></span>}
            {filaTotal?.subtotal && <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--c-gold)' }}>Total: ${Number(filaTotal.subtotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>}
          </span>
        </div>
      )}

      {/* Upload admin */}
      {esAdmin && (
        <div style={{ marginBottom: '20px', padding: '16px 20px', background: 'var(--c-surface2)', border: '1px dashed #cbd5e1', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>{filas.length > 0 ? '🔄 Reemplazar Excel' : '📤 Subir Excel de Explosión de Insumos'}</div>
            <div style={{ fontSize: '12px', color: 'var(--c-text3)' }}>Archivos .xlsx o .xls</div>
          </div>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={handleArchivo} style={{ display: 'none' }} id="upload-ei" />
          <label htmlFor="upload-ei" style={{ padding: '8px 20px', background: 'var(--c-gold)', color: 'white', borderRadius: '6px', cursor: subiendo ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '14px', opacity: subiendo ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {subiendo ? 'Procesando...' : 'Elegir archivo'}
          </label>
        </div>
      )}

      {/* Botones jefe de obra */}
      {esJefe && filas.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {['pedido', 'stock', 'historial'].map((v, i) => (
            <button key={v}
              onClick={() => { setVistaJefe(vistaJefe === v ? null : v); if (v === 'historial') cargarHistorial() }}
              style={{ padding: '10px 20px', background: vistaJefe === v ? 'var(--c-gold)' : 'white', color: vistaJefe === v ? 'white' : 'var(--c-gold)', border: '1px solid #2563eb', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
              {['🛒 Cargar Pedido', '📦 Ver Stock', '📋 Historial'][i]}
            </button>
          ))}
        </div>
      )}

      {/* Botones compras */}
      {esCompras && filas.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {['gestionar', 'stock', 'historial'].map((v, i) => (
            <button key={v}
              onClick={() => { setVistaCompras(vistaCompras === v ? null : v); if (v === 'historial') cargarHistorial(); if (v === 'gestionar') cargarSolicitudes() }}
              style={{ padding: '10px 20px', background: vistaCompras === v ? 'var(--c-gold)' : 'white', color: vistaCompras === v ? 'white' : 'var(--c-gold)', border: '1px solid #2563eb', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
              {['📋 Gestionar Solicitudes', '📦 Ver Stock', '🗂 Historial'][i]}
            </button>
          ))}
        </div>
      )}

      {error && <div style={{ padding: '10px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: 'var(--c-danger)', marginBottom: '16px', fontSize: '14px' }}>⚠️ {error}</div>}
      {exito && <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', color: 'var(--c-success)', marginBottom: '16px', fontSize: '14px' }}>✓ {exito}</div>}

      {/* Vista Cargar Pedido (jefe) */}
      {esJefe && vistaJefe === 'pedido' && (
        <div style={{ marginBottom: '24px', background: 'var(--c-surface2)', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px' }}>
          <h4 style={{ margin: '0 0 16px', color: 'var(--c-text)' }}>Nueva Solicitud de Compra</h4>
          {pedidoItems.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              {pedidoItems.map((p, i) => (
                <div key={p.insumo_id} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', background: 'white', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  {p.es_otro ? (
                    <>
                      <input placeholder="Descripción" value={p.descripcion}
                        onChange={ev => setPedidoItems(prev => prev.map((x, xi) => xi === i ? { ...x, descripcion: ev.target.value } : x))}
                        style={{ flex: 2, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '13px' }} />
                      <input placeholder="Unidad" value={p.unidad}
                        onChange={ev => setPedidoItems(prev => prev.map((x, xi) => xi === i ? { ...x, unidad: ev.target.value } : x))}
                        style={{ width: '70px', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '13px' }} />
                    </>
                  ) : (
                    <span style={{ flex: 2, fontSize: '13px' }}>{p.descripcion} <span style={{ color: 'var(--c-text3)' }}>({p.unidad})</span></span>
                  )}
                  <input type="number" min="0.01" max={p.cantidad_max || undefined} value={p.cantidad}
                    onChange={ev => actualizarCantidad(p.insumo_id, ev.target.value)}
                    style={{ width: '80px', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '13px', textAlign: 'right' }} />
                  <button onClick={() => quitarItem(p.insumo_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-danger)', fontSize: '16px' }}>✕</button>
                </div>
              ))}
            </div>
          )}
          <select onChange={ev => { const ins = insumos.find(f => f.id === parseInt(ev.target.value)); if (ins) agregarItemPedido(ins); ev.target.value = '' }} defaultValue=""
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', marginBottom: '8px' }}>
            <option value="">+ Agregar insumo de la explosión...</option>
            {insumos.map(f => <option key={f.id} value={f.id}>{f.descripcion} ({f.unidad})</option>)}
          </select>
          <button onClick={agregarOtro} style={{ padding: '7px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', color: 'var(--c-text2)', marginBottom: '12px' }}>
            + Agregar otro (no previsto)
          </button>
          <textarea placeholder="Observaciones (opcional)" value={observaciones} onChange={ev => setObservaciones(ev.target.value)} rows={2}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', marginBottom: '12px', boxSizing: 'border-box', resize: 'vertical' }} />
          <button onClick={enviarPedido} disabled={pedidoItems.length === 0 || enviando}
            style={{ padding: '10px 24px', background: pedidoItems.length === 0 ? 'var(--c-border2)' : 'var(--c-gold)', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '14px', cursor: pedidoItems.length === 0 ? 'not-allowed' : 'pointer' }}>
            {enviando ? 'Enviando...' : 'Enviar Solicitud'}
          </button>
        </div>
      )}

      {/* Vista Gestionar Solicitudes (compras) */}
      {esCompras && vistaCompras === 'gestionar' && (
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ margin: '0 0 16px', color: 'var(--c-text)' }}>Solicitudes de Compra</h4>
          {solicitudes.length === 0 ? (
            <p style={{ color: 'var(--c-text3)' }}>No hay solicitudes aún.</p>
          ) : solicitudes.map(s => {
            const ec = estadoColor[s.estado] || { bg: '#f3f4f6', color: 'var(--c-text2)' }
            return (
              <div key={s.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontWeight: '700', color: 'var(--c-text)', fontSize: '15px' }}>SC-{String(s.numero).padStart(3, '0')}</span>
                  <span style={{ fontSize: '12px', color: 'var(--c-text3)' }}>{new Date(s.created_at).toLocaleDateString('es-AR')}</span>
                  <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', background: ec.bg, color: ec.color }}>{s.estado}</span>
                  {/* Botones de cambio de estado - solo compras */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {s.estado === 'pendiente' && (
                      <>
                        <button onClick={() => cambiarEstado(s.id, 'aprobada')}
                          style={{ padding: '4px 12px', background: 'var(--c-gold)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>
                          Aprobar
                        </button>
                        <button onClick={() => cambiarEstado(s.id, 'rechazada')}
                          style={{ padding: '4px 12px', background: 'var(--c-danger)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>
                          Rechazar
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {s.solicitud_items?.map(it => (
                  <div key={it.id} style={{ fontSize: '13px', color: 'var(--c-text2)', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                    {it.descripcion} — <b>{it.cantidad} {it.unidad}</b>
                    {it.es_otro && <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--c-gold)' }}>no previsto</span>}
                  </div>
                ))}
                {s.observaciones && <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--c-text3)' }}>Obs: {s.observaciones}</p>}
              </div>
            )
          })}
        </div>
      )}

      {/* Vista Stock (jefe y compras) */}
      {(vistaJefe === 'stock' || vistaCompras === 'stock') && (
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ margin: '0 0 16px', color: 'var(--c-text)' }}>Stock Disponible</h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--c-text)', color: 'white' }}>
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
                    <tr key={fi} style={{ background: fi % 2 === 0 ? '#ffffff' : 'var(--c-surface2)', borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '7px 12px' }}>{f.descripcion}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--c-text3)' }}>{f.unidad}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right' }}>{Number(f.cantidad || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: pedida > 0 ? 'var(--c-danger)' : '#888' }}>{Number(pedida).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: '600', color: disponible < 0 ? 'var(--c-danger)' : disponible === 0 ? '#ca8a04' : 'var(--c-success)' }}>
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

      {/* Vista Historial (jefe y compras) */}
      {(vistaJefe === 'historial' || vistaCompras === 'historial') && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ margin: 0, color: 'var(--c-text)' }}>Historial de Solicitudes</h4>
            <button onClick={descargarExcel}
              style={{ padding: '8px 16px', background: 'var(--c-gold)', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
              ⬇ Descargar Excel
            </button>
          </div>
          {historial.length === 0 ? (
            <p style={{ color: 'var(--c-text3)' }}>No hay solicitudes aún.</p>
          ) : historial.map(s => {
            const ec = estadoColor[s.estado] || { bg: '#f3f4f6', color: 'var(--c-text2)' }
            return (
              <div key={s.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontWeight: '700', color: 'var(--c-text)' }}>SC-{String(s.numero).padStart(3, '0')}</span>
                  <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', background: ec.bg, color: ec.color }}>{s.estado}</span>
                  <span style={{ fontSize: '12px', color: 'var(--c-text3)' }}>{new Date(s.created_at).toLocaleDateString('es-AR')}</span>
                  {/* Botones de entrega - solo jefe de obra */}
                  {esJefe && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {s.estado === 'aprobada' && (
                        <>
                          <button onClick={() => cambiarEstado(s.id, 'entrega parcial')}
                            style={{ padding: '4px 12px', background: '#d97706', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>
                            Entrega Parcial
                          </button>
                          <button onClick={() => cambiarEstado(s.id, 'entregada')}
                            style={{ padding: '4px 12px', background: 'var(--c-success)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>
                            Entregada
                          </button>
                        </>
                      )}
                      {s.estado === 'entrega parcial' && (
                        <button onClick={() => cambiarEstado(s.id, 'entregada')}
                          style={{ padding: '4px 12px', background: 'var(--c-success)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>
                          Entregada
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {s.solicitud_items?.map(it => (
                  <div key={it.id} style={{ fontSize: '13px', color: 'var(--c-text2)', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                    {it.descripcion} — <b>{it.cantidad} {it.unidad}</b>
                    {it.es_otro && <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--c-gold)' }}>no previsto</span>}
                  </div>
                ))}
                {s.observaciones && <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--c-text3)' }}>Obs: {s.observaciones}</p>}
              </div>
            )
          })}
        </div>
      )}

      {/* Tabla de insumos */}
      {filas.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--c-text3)', fontSize: '15px' }}>
          {esAdmin ? 'Subí el Excel para ver la explosión de insumos.' : 'Aún no se cargó la explosión de insumos para esta obra.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--c-text)', color: 'white' }}>
                {['Descripción', 'Unid.', 'P. Unitario', 'Cantidad', 'Subtotal', 'Incidencia', 'Fecha'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Descripción' ? 'left' : 'right', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '12px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g, gi) => (
                <React.Fragment key={'grupo-' + gi}>
                  {g.encabezado && (
                    <tr style={{ background: 'var(--c-gold-dim)' }}>
                      <td colSpan={4} style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--c-text)', fontSize: '13px' }}>
                        {g.encabezado.descripcion}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700', color: 'var(--c-text)', fontSize: '13px' }}>
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
                        background: esTotal ? 'var(--c-text)' : esDolar || esSubtotal ? 'var(--c-border)' : fi % 2 === 0 ? '#ffffff' : 'var(--c-surface2)',
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
                        <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: (esSubtotal || esTotal || esDolar) ? '700' : '400', color: esTotal ? 'white' : esSubtotal ? 'var(--c-text)' : '#111' }}>
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