import React, { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../supabaseClient'

function CostoPrevisto({ obra, perfil }) {
  const [filas, setFilas] = useState([])
  const [meta, setMeta] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState(null)
  const [exito, setExito] = useState(null)
  const [seccion, setSeccion] = useState('ver')
  const [pasoWizard, setPasoWizard] = useState(1)
  const [indirectos, setIndirectos] = useState({})
  const [coeficiente, setCoeficiente] = useState('')
  const [duracionMeses, setDuracionMeses] = useState('')
  const [planillaGenerada, setPlanillaGenerada] = useState([])
  const [guardandoPlanilla, setGuardandoPlanilla] = useState(false)
  const [cargandoConfig, setCargandoConfig] = useState(false)
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
      .from('costo_previsto')
      .select('*')
      .eq('obra_id', obra.id)
      .order('orden', { ascending: true })

    if (error) { setError('Error al cargar datos.'); setCargando(false); return }

    if (data && data.length > 0) {
      setMeta({ proyecto: data[0].proyecto, nombre_obra: data[0].nombre_obra, fecha: data[0].fecha })
      setFilas(data)
    }
    setCargando(false)
  }

  async function cargarConfigPlanilla() {
    setCargandoConfig(true)
    try {
      const { data: config } = await supabase
        .from('planilla_config')
        .select('*')
        .eq('obra_id', obra.id)
        .maybeSingle()

      const { data: inds } = await supabase
        .from('planilla_indirectos')
        .select('*')
        .eq('obra_id', obra.id)

      const { data: planItems } = await supabase
        .from('planilla_items')
        .select('*')
        .eq('obra_id', obra.id)
        .order('orden', { ascending: true })

      if (config) {
        setCoeficiente(String(config.coeficiente))
        setDuracionMeses(String(config.duracion_meses || ''))
      }
      if (inds && inds.length > 0) {
        const indObj = {}
        inds.forEach(i => { indObj[i.costo_previsto_id] = true })
        setIndirectos(indObj)
      }
      if (planItems && planItems.length > 0) {
        setPlanillaGenerada(planItems)
        setPasoWizard(3)
      } else {
        setPasoWizard(1)
      }
    } catch (err) {
      console.error('Error cargando config:', err)
    }
    setCargandoConfig(false)
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

      for (let i = 7; i < rows.length; i++) {
        const r = rows[i]
        const codigo = String(r[1] || '').trim()
        const descripcion = String(r[2] || '').trim()
        const unidad = String(r[3] || '').trim()
        const precio_unitario = parseFloat(r[4]) || null
        const cantidad = parseFloat(r[5]) || null
        const total = parseFloat(r[6]) || null
        const incidencia = parseFloat(r[7]) || null

        if (!descripcion && !total) continue
        if (descripcion === 'Descripción') continue

        const codigoEsEntero = codigo && /^\d+$/.test(codigo)
        const esRubro    = !codigo && descripcion && descripcion === descripcion.toUpperCase() && descripcion.length > 2
        const esTitulo   = codigoEsEntero && descripcion && descripcion === descripcion.toUpperCase()
        const esSubtotal = !codigo && !descripcion && total

        let tipo = 'item'
        if (esRubro)         tipo = 'rubro'
        else if (esTitulo)   tipo = 'titulo'
        else if (esSubtotal) tipo = 'subtotal'

        filasParsed.push({
          obra_id: obra.id, orden, tipo,
          codigo: codigo || null, descripcion: descripcion || null,
          unidad: unidad || null, precio_unitario, cantidad, total, incidencia,
          proyecto, nombre_obra, fecha,
        })
        orden++
      }

      const nombreArchivo = `${obra.id}/costo_previsto.xlsx`
      await supabase.storage.from('excels').remove([nombreArchivo])
      const { error: storageError } = await supabase.storage.from('excels').upload(nombreArchivo, archivo, { upsert: true })
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

  const itemsReales = filas.filter(f => f.tipo === 'item' && f.total)

  function toggleIndirecto(id) {
    setIndirectos(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function calcularPlanilla() {
    const coef = parseFloat(coeficiente)
    if (!coef || coef <= 0) return []

    const idsIndirectos = Object.keys(indirectos).filter(id => indirectos[id]).map(Number)
    const itemsCertificables = itemsReales.filter(f => !idsIndirectos.includes(f.id))
    const totalIndirectos = itemsReales.filter(f => idsIndirectos.includes(f.id)).reduce((s, f) => s + (f.total || 0), 0)
    const totalCertificable = itemsCertificables.reduce((s, f) => s + (f.total || 0), 0)

    return itemsCertificables.map(f => {
      const proporcion = totalCertificable > 0 ? (f.total || 0) / totalCertificable : 0
      const indirectosAbsorbidos = proporcion * totalIndirectos
      const costoAjustado = (f.total || 0) + indirectosAbsorbidos
      const precioVenta = costoAjustado * coef
      return { ...f, indirectos_absorbidos: indirectosAbsorbidos, costo_ajustado: costoAjustado, precio_venta: precioVenta }
    })
  }

  async function guardarYGenerarPlanilla() {
    setGuardandoPlanilla(true)
    setError(null)
    try {
      const coef = parseFloat(coeficiente)
      const dur  = parseInt(duracionMeses)
      if (!coef || coef <= 0) throw new Error('Ingresá un coeficiente válido.')
      if (!dur  || dur < 1)   throw new Error('Ingresá una duración válida.')

      const planilla = calcularPlanilla()
      if (planilla.length === 0) throw new Error('No hay ítems certificables.')

      // Guardar config
      await supabase.from('planilla_config').delete().eq('obra_id', obra.id)
      await supabase.from('planilla_config').insert({ obra_id: obra.id, coeficiente: coef, duracion_meses: dur })

      // Guardar indirectos
      await supabase.from('planilla_indirectos').delete().eq('obra_id', obra.id)
      const idsInd = Object.keys(indirectos).filter(id => indirectos[id]).map(Number)
      if (idsInd.length > 0) {
        await supabase.from('planilla_indirectos').insert(idsInd.map(id => ({ obra_id: obra.id, costo_previsto_id: id })))
      }

      // Armar items con rubros — recorriendo filas en orden
      const planillaMap = {}
      planilla.forEach(f => { planillaMap[f.id] = f })
      const itemsConRubro = []
      let orden = 0

      for (const fila of filas) {
        if (fila.tipo === 'rubro') {
          // Buscar si tiene ítems certificables debajo
          const idxRubro = filas.indexOf(fila)
          const idxSigRubro = filas.findIndex((x, i) => i > idxRubro && x.tipo === 'rubro')
          const filasDelRubro = filas.slice(idxRubro + 1, idxSigRubro === -1 ? undefined : idxSigRubro)
          const tieneItems = filasDelRubro.some(f => planillaMap[f.id])
          if (!tieneItems) continue
          const totalRubro = filasDelRubro.reduce((s, f) => s + (planillaMap[f.id]?.precio_venta || 0), 0)
          itemsConRubro.push({
            obra_id: obra.id, costo_previsto_id: fila.id, orden,
            tipo: 'rubro', codigo: null, descripcion: fila.descripcion,
            unidad: null, cantidad: null, precio_unitario: null,
            costo_original: null, indirectos_absorbidos: null,
            costo_ajustado: null, precio_venta: totalRubro,
          })
          orden++
        } else if (fila.tipo === 'titulo') {
          const idxTitulo = filas.indexOf(fila)
          const idxSigTitulo = filas.findIndex((x, i) => i > idxTitulo && (x.tipo === 'titulo' || x.tipo === 'rubro'))
          const filasDelTitulo = filas.slice(idxTitulo + 1, idxSigTitulo === -1 ? undefined : idxSigTitulo)
          const tieneItems = filasDelTitulo.some(f => planillaMap[f.id])
          if (!tieneItems) continue
          itemsConRubro.push({
            obra_id: obra.id, costo_previsto_id: fila.id, orden,
            tipo: 'titulo', codigo: fila.codigo, descripcion: fila.descripcion,
            unidad: null, cantidad: null, precio_unitario: null,
            costo_original: null, indirectos_absorbidos: null,
            costo_ajustado: null, precio_venta: null,
          })
          orden++
        } else if (fila.tipo === 'item' && planillaMap[fila.id]) {
          const it = planillaMap[fila.id]
          itemsConRubro.push({
            obra_id: obra.id, costo_previsto_id: fila.id, orden,
            tipo: 'item', codigo: fila.codigo, descripcion: fila.descripcion,
            unidad: fila.unidad, cantidad: fila.cantidad, precio_unitario: fila.precio_unitario,
            costo_original: fila.total,
            indirectos_absorbidos: it.indirectos_absorbidos,
            costo_ajustado: it.costo_ajustado,
            precio_venta: it.precio_venta,
          })
          orden++
        }
      }

      // Guardar planilla_items
      await supabase.from('planilla_items').delete().eq('obra_id', obra.id)
      const { error: piErr } = await supabase.from('planilla_items').insert(itemsConRubro)
      if (piErr) throw new Error('Error guardando planilla: ' + piErr.message)

      // Actualizar planilla_medicion
      await supabase.from('planilla_avances').delete().eq('obra_id', obra.id)
      await supabase.from('planilla_medicion').delete().eq('obra_id', obra.id)
      const medicionItems = itemsConRubro.map((it, i) => ({
        obra_id: obra.id, orden: i,
        tipo: it.tipo,
        codigo: it.codigo || it.descripcion?.substring(0,10) || '',
        descripcion: it.descripcion,
        unidad: it.unidad || null,
        cantidad: it.cantidad || null,
        precio_unitario: it.tipo === 'item' && it.cantidad ? it.precio_venta / it.cantidad : null,
        total: it.precio_venta,
        proyecto: meta?.proyecto || '',
        nombre_obra: meta?.nombre_obra || '',
        fecha_base: null,
        duracion_meses: dur,
      }))
      await supabase.from('planilla_medicion').insert(medicionItems)

      setPlanillaGenerada(itemsConRubro)
      setExito('Planilla generada correctamente.')
      setPasoWizard(3)
    } catch (err) {
      setError(err.message)
    }
    setGuardandoPlanilla(false)
  }

  function descargarExcel() {
    const coef = parseFloat(coeficiente)
    const dur  = parseInt(duracionMeses)
    const wb = XLSX.utils.book_new()

    const titulo = [
      [`PLANILLA DE MEDICIÓN — ${meta?.nombre_obra || obra.nombre}`],
      [`Coeficiente de pase: ${coef} | Duración: ${dur} meses | Generada: ${new Date().toLocaleDateString('es-AR')}`],
      [],
      ['ÍTEM', 'DESCRIPCIÓN', 'UNIDAD', 'CANTIDAD', 'PRECIO UNIT. VENTA', 'TOTAL VENTA'],
    ]

    const filasDatos = planillaGenerada.map(it => [
      it.codigo || '',
      it.descripcion,
      it.tipo === 'titulo' ? '' : it.unidad || '',
      it.tipo === 'titulo' ? '' : (it.cantidad || ''),
      it.tipo === 'item' && it.cantidad ? it.precio_venta / it.cantidad : '',
      it.tipo === 'titulo' ? '' : (it.precio_venta || 0),
    ])

    const ws = XLSX.utils.aoa_to_sheet([...titulo, ...filasDatos])
    ws['!cols'] = [10, 45, 10, 12, 18, 18].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, ws, 'Planilla')
    XLSX.writeFile(wb, `Planilla_${(meta?.nombre_obra || obra.nombre).replace(/\s+/g, '_')}.xlsx`)
  }

  function agrupar(fs) {
    const grupos = []
    let grupoActual = null
    for (const f of fs) {
      if (f.tipo === 'rubro') { grupoActual = { rubro: f, items: [] }; grupos.push(grupoActual) }
      else if (grupoActual) grupoActual.items.push(f)
      else grupos.push({ rubro: null, items: [f] })
    }
    return grupos
  }

  const fmt    = (n) => n != null ? Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
  const fmtPct = (n) => n != null ? (Number(n) * 100).toFixed(2) + '%' : '-'
  const filaTotal  = filas.find(f => f.descripcion && f.descripcion.includes('TOTAL COSTO'))
  const totalFinal = filaTotal?.total || null
  const grupos     = agrupar(filas)

  if (cargando) return <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Cargando...</div>

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '2px solid #e2e8f0' }}>
        <button onClick={() => setSeccion('ver')}
          style={{ padding: '8px 20px', background: 'none', border: 'none', borderBottom: seccion === 'ver' ? '2px solid #2563eb' : '2px solid transparent', color: seccion === 'ver' ? '#2563eb' : '#666', fontWeight: '600', fontSize: '14px', cursor: 'pointer', marginBottom: '-2px' }}>
          Ver Costo Previsto
        </button>
        {esAdmin && filas.length > 0 && (
          <button onClick={() => { setSeccion('wizard'); cargarConfigPlanilla() }}
            style={{ padding: '8px 20px', background: 'none', border: 'none', borderBottom: seccion === 'wizard' ? '2px solid #2563eb' : '2px solid transparent', color: seccion === 'wizard' ? '#2563eb' : '#666', fontWeight: '600', fontSize: '14px', cursor: 'pointer', marginBottom: '-2px' }}>
            Generar Planilla de Medición
          </button>
        )}
      </div>

      {error && <div style={{ padding: '10px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#dc2626', marginBottom: '16px', fontSize: '14px' }}>⚠️ {error}</div>}
      {exito && <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', color: '#16a34a', marginBottom: '16px', fontSize: '14px' }}>✓ {exito}</div>}

      {/* ===== VER ===== */}
      {seccion === 'ver' && (
        <>
          {meta && (
            <div style={{ marginBottom: '20px', display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '13px', color: '#555' }}>
              {meta.proyecto    && <span><b style={{ color: '#999' }}>Proyecto:</b> {meta.proyecto}</span>}
              {meta.nombre_obra && <span><b style={{ color: '#999' }}>Obra:</b> {meta.nombre_obra}</span>}
              {meta.fecha       && <span><b style={{ color: '#999' }}>Fecha:</b> {meta.fecha}</span>}
              {totalFinal && <span style={{ marginLeft: 'auto', fontWeight: '700', fontSize: '15px', color: '#2563eb' }}>Total: ${Number(totalFinal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>}
            </div>
          )}
          {esAdmin && (
            <div style={{ marginBottom: '20px', padding: '16px 20px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>{filas.length > 0 ? '🔄 Reemplazar Excel' : '📤 Subir Excel de Costo Previsto'}</div>
                <div style={{ fontSize: '12px', color: '#888' }}>Solo archivos .xlsx</div>
              </div>
              <input ref={inputRef} type="file" accept=".xlsx" onChange={handleArchivo} style={{ display: 'none' }} id="upload-cp" />
              <label htmlFor="upload-cp" style={{ padding: '8px 20px', background: '#2563eb', color: 'white', borderRadius: '6px', cursor: subiendo ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '14px', opacity: subiendo ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                {subiendo ? 'Procesando...' : 'Elegir archivo'}
              </label>
            </div>
          )}
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
                      <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Descripción' ? 'left' : 'right', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '12px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g, gi) => (
                    <React.Fragment key={gi}>
                      {g.rubro && (
                        <tr style={{ background: '#dbeafe' }}>
                          <td colSpan={7} style={{ padding: '8px 12px', fontWeight: '700', color: '#1e3a5f', fontSize: '13px' }}>{g.rubro.descripcion}</td>
                        </tr>
                      )}
                      {g.items.map((f, fi) => {
                        const esSubtotal = f.tipo === 'subtotal'
                        const esTitulo   = f.tipo === 'titulo'
                        return (
                          <tr key={fi} style={{ background: esSubtotal ? '#f1f5f9' : esTitulo ? '#f8fafc' : fi % 2 === 0 ? '#ffffff' : '#f9fafb', borderBottom: esSubtotal ? '2px solid #cbd5e1' : '1px solid #f1f5f9' }}>
                            <td style={{ padding: '7px 12px', color: '#666', whiteSpace: 'nowrap' }}>{esSubtotal ? '' : f.codigo || ''}</td>
                            <td style={{ padding: '7px 12px', fontWeight: (esSubtotal || esTitulo) ? '700' : '400', color: esTitulo ? '#1e3a5f' : 'inherit' }}>{esSubtotal ? 'SUBTOTAL' : f.descripcion || ''}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', color: '#888' }}>{(esSubtotal || esTitulo) ? '' : f.unidad || ''}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right' }}>{(esSubtotal || esTitulo) ? '' : fmt(f.precio_unitario)}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right' }}>{(esSubtotal || esTitulo) ? '' : fmt(f.cantidad)}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: esSubtotal ? '700' : '400', color: esSubtotal ? '#1e3a5f' : '#111' }}>{esTitulo ? '' : fmt(f.total)}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', color: '#888' }}>{(esSubtotal || esTitulo) ? '' : fmtPct(f.incidencia)}</td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  ))}
                  {totalFinal && (
                    <tr style={{ background: '#1e3a5f' }}>
                      <td colSpan={5} style={{ padding: '12px', fontWeight: '700', color: 'white', fontSize: '14px' }}>TOTAL COSTO PREVISTO</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'white', fontSize: '15px' }}>${Number(totalFinal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                      <td />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ===== WIZARD ===== */}
      {seccion === 'wizard' && (
        <div>
          {cargandoConfig ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Cargando configuración...</div>
          ) : (
            <>
              {/* Stepper */}
              <div style={{ display: 'flex', gap: '0', marginBottom: '24px' }}>
                {[{ n: 1, label: 'Gastos Indirectos' }, { n: 2, label: 'Coeficiente y Duración' }, { n: 3, label: 'Ver y Descargar' }].map((paso, i) => (
                  <div key={paso.n} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: pasoWizard >= paso.n ? '#2563eb' : '#e2e8f0', color: pasoWizard >= paso.n ? 'white' : '#aaa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px' }}>{paso.n}</div>
                      <div style={{ fontSize: '11px', color: pasoWizard >= paso.n ? '#2563eb' : '#aaa', marginTop: '4px', textAlign: 'center', whiteSpace: 'nowrap' }}>{paso.label}</div>
                    </div>
                    {i < 2 && <div style={{ height: '2px', flex: 1, background: pasoWizard > paso.n ? '#2563eb' : '#e2e8f0', marginBottom: '20px' }} />}
                  </div>
                ))}
              </div>

              {/* Paso 1 */}
              {pasoWizard === 1 && (
                <div>
                  <h4 style={{ color: '#1e3a5f', marginBottom: '8px' }}>Paso 1 — Marcá los ítems que son gastos indirectos</h4>
                  <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>Estos ítems no aparecerán en la planilla de medición. Su costo se redistribuirá proporcionalmente entre los demás ítems.</p>
                  <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#1e3a5f', color: 'white' }}>
                          <th style={{ padding: '8px 12px', width: '40px' }}>Indirecto</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Código</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Descripción</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grupos.map((g, gi) => (
                          <React.Fragment key={gi}>
                            {g.rubro && (
                              <tr style={{ background: '#dbeafe' }}>
                                <td />
                                <td colSpan={3} style={{ padding: '7px 12px', fontWeight: '700', color: '#1e3a5f' }}>{g.rubro.descripcion}</td>
                              </tr>
                            )}
                            {g.items.filter(f => f.tipo === 'item' && f.total).map((f, fi) => (
                              <tr key={fi} style={{ background: indirectos[f.id] ? '#fef9c3' : fi % 2 === 0 ? 'white' : '#f9fafb', borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                                  <input type="checkbox" checked={!!indirectos[f.id]} onChange={() => toggleIndirecto(f.id)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                                </td>
                                <td style={{ padding: '7px 12px', color: '#666' }}>{f.codigo}</td>
                                <td style={{ padding: '7px 12px' }}>{f.descripcion}</td>
                                <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: '600' }}>${fmt(f.total)}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', color: '#666' }}>{Object.values(indirectos).filter(Boolean).length} ítems marcados como indirectos</div>
                    <button onClick={() => setPasoWizard(2)} style={{ padding: '8px 24px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
                      Siguiente →
                    </button>
                  </div>
                </div>
              )}

              {/* Paso 2 */}
              {pasoWizard === 2 && (
                <div>
                  <h4 style={{ color: '#1e3a5f', marginBottom: '8px' }}>Paso 2 — Coeficiente de pase y duración</h4>
                  <p style={{ fontSize: '13px', color: '#666', marginBottom: '20px' }}>El coeficiente multiplica el costo ajustado para obtener el precio de venta.</p>
                  <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '24px' }}>
                    <div>
                      <label style={{ fontSize: '13px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>Coeficiente de pase</label>
                      <input type="number" min="1" step="0.01" value={coeficiente} onChange={ev => setCoeficiente(ev.target.value)} placeholder="ej: 1.35"
                        style={{ width: '150px', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '13px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>Duración de la obra (meses)</label>
                      <input type="number" min="1" max="60" value={duracionMeses} onChange={ev => setDuracionMeses(ev.target.value)} placeholder="ej: 12"
                        style={{ width: '150px', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px' }} />
                    </div>
                  </div>

                  {coeficiente && parseFloat(coeficiente) > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e3a5f', marginBottom: '8px' }}>Preview de precios de venta</div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ background: '#1e3a5f', color: 'white' }}>
                              <th style={{ padding: '8px 12px', textAlign: 'left' }}>Descripción</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right' }}>Costo Original</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right' }}>Indirectos</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right' }}>Costo Ajustado</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right', background: '#1a5c3a' }}>Precio Venta</th>
                            </tr>
                          </thead>
                          <tbody>
                            {calcularPlanilla().map((f, i) => (
                              <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb', borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 12px' }}>{f.descripcion}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right' }}>${fmt(f.total)}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right', color: '#ca8a04' }}>${fmt(f.indirectos_absorbidos)}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right' }}>${fmt(f.costo_ajustado)}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: '700', color: '#16a34a' }}>${fmt(f.precio_venta)}</td>
                              </tr>
                            ))}
                            <tr style={{ background: '#1e3a5f' }}>
                              <td style={{ padding: '8px 12px', fontWeight: '700', color: 'white' }}>TOTAL</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', color: 'white', fontWeight: '700' }}>${fmt(calcularPlanilla().reduce((s,f) => s+f.total,0))}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', color: '#fde68a', fontWeight: '700' }}>${fmt(calcularPlanilla().reduce((s,f) => s+f.indirectos_absorbidos,0))}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', color: 'white', fontWeight: '700' }}>${fmt(calcularPlanilla().reduce((s,f) => s+f.costo_ajustado,0))}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', color: '#86efac', fontWeight: '700', fontSize: '14px' }}>${fmt(calcularPlanilla().reduce((s,f) => s+f.precio_venta,0))}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between' }}>
                    <button onClick={() => setPasoWizard(1)} style={{ padding: '8px 20px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', color: '#555' }}>← Anterior</button>
                    <button onClick={guardarYGenerarPlanilla} disabled={guardandoPlanilla || !coeficiente || !duracionMeses}
                      style={{ padding: '8px 24px', background: !coeficiente || !duracionMeses ? '#94a3b8' : '#16a34a', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '14px', cursor: !coeficiente || !duracionMeses ? 'not-allowed' : 'pointer' }}>
                      {guardandoPlanilla ? 'Generando...' : 'Generar Planilla →'}
                    </button>
                  </div>
                </div>
              )}

              {/* Paso 3 */}
              {pasoWizard === 3 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                    <h4 style={{ color: '#1e3a5f', margin: 0 }}>Planilla de Medición generada</h4>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => setPasoWizard(1)} style={{ padding: '8px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', color: '#555' }}>
                        ✏️ Modificar
                      </button>
                      <button onClick={descargarExcel} disabled={planillaGenerada.length === 0}
                        style={{ padding: '8px 20px', background: planillaGenerada.length > 0 ? '#2563eb' : '#94a3b8', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '14px', cursor: planillaGenerada.length > 0 ? 'pointer' : 'not-allowed' }}>
                        ⬇ Descargar Excel
                      </button>
                    </div>
                  </div>

                  {planillaGenerada.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#aaa' }}>No hay datos generados todavía.</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: '#1e3a5f', color: 'white' }}>
                            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '600' }}>Descripción</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600' }}>Unid.</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600' }}>Cantidad</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600' }}>P. Unit. Venta</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600' }}>Total Venta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {planillaGenerada.map((f, i) => (
                            <tr key={i} style={{ background: f.tipo === 'rubro' ? '#dbeafe' : f.tipo === 'titulo' ? '#f8fafc' : i % 2 === 0 ? 'white' : '#f9fafb', borderBottom: f.tipo === 'titulo' ? '1px solid #e2e8f0' : '1px solid #f1f5f9' }}>
                              <td style={{ padding: '7px 12px', fontWeight: (f.tipo === 'rubro' || f.tipo === 'titulo') ? '700' : '400', color: (f.tipo === 'rubro' || f.tipo === 'titulo') ? '#1e3a5f' : 'inherit' }}>{f.descripcion}</td>
                              <td style={{ padding: '7px 12px', textAlign: 'right', color: '#888' }}>{(f.tipo === 'rubro' || f.tipo === 'titulo') ? '' : f.unidad || ''}</td>
                              <td style={{ padding: '7px 12px', textAlign: 'right' }}>{(f.tipo === 'rubro' || f.tipo === 'titulo') ? '' : fmt(f.cantidad)}</td>
                              <td style={{ padding: '7px 12px', textAlign: 'right' }}>{(f.tipo === 'rubro' || f.tipo === 'titulo') ? '' : (f.cantidad ? fmt(f.precio_venta / f.cantidad) : '-')}</td>
                              <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: '600', color: (f.tipo === 'rubro' || f.tipo === 'titulo') ? '#1e3a5f' : '#111' }}>{f.tipo === 'titulo' ? '' : '$' + fmt(f.precio_venta)}</td>
                            </tr>
                          ))}
                          <tr style={{ background: '#1e3a5f' }}>
                            <td colSpan={4} style={{ padding: '12px', fontWeight: '700', color: 'white', fontSize: '14px' }}>TOTAL PRECIO DE VENTA</td>
                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: 'white', fontSize: '15px' }}>${fmt(planillaGenerada.reduce((s,f) => s + (f.precio_venta||0), 0))}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div style={{ marginTop: '16px', padding: '12px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', fontSize: '13px', color: '#16a34a' }}>
                    ✓ La planilla está disponible en el módulo <b>Planilla de Medición</b> para cargar avances.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default CostoPrevisto