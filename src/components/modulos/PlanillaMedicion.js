import React, { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../supabaseClient'

function PlanillaMedicion({ obra, perfil }) {
  const [items, setItems] = useState([])
  const [avances, setAvances] = useState([])
  const [meta, setMeta] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState(null)
  const [exito, setExito] = useState(null)
  const [vista, setVista] = useState(null) // 'proy_inicial' | 'definitiva'
  const [mesActivo, setMesActivo] = useState(null)
  const [porcentajes, setPorcentajes] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [mostrarPrecios, setMostrarPrecios] = useState(true)
  const inputRef = useRef()

  const esAdmin = perfil?.area === 'administracion'
  const esJefe  = perfil?.area === 'jefe_obra'

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
      .order('mes', { ascending: true })

    if (itemsData && itemsData.length > 0) {
      setMeta({ proyecto: itemsData[0].proyecto, nombre_obra: itemsData[0].nombre_obra })
      setItems(itemsData)
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

      const nombre_obra = String(rows[1]?.[1] || '').trim()
      const proyecto    = String(rows[1]?.[2] || '').trim()

      const itemsParsed = []
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

        const esRubro = colA && /^\d+$/.test(colA) && colB
        const esItem  = colA && /^\d+\.\d+/.test(colA) && colB
        if (!esRubro && !esItem) continue

        itemsParsed.push({
          obra_id: obra.id, orden,
          tipo: esRubro ? 'rubro' : 'item',
          codigo: colA, descripcion: colB,
          unidad: colC || null,
          cantidad: colD, precio_unitario: colE, total: colF,
          proyecto, nombre_obra, fecha_base: null,
        })
        orden++
      }

      await supabase.from('planilla_avances').delete().eq('obra_id', obra.id)
      await supabase.from('planilla_medicion').delete().eq('obra_id', obra.id)
      const { error: insertError } = await supabase.from('planilla_medicion').insert(itemsParsed)
      if (insertError) throw new Error('Error guardando ítems: ' + insertError.message)

      setExito('Planilla base cargada correctamente.')
      await cargarDatos()
    } catch (err) {
      setError(err.message || 'Error procesando el archivo.')
    }
    setSubiendo(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  // Meses ya cargados por tipo
  const mesesProyInicial = [...new Set(avances.filter(a => a.tipo_registro === 'proy_inicial').map(a => a.mes))].sort((a,b) => a-b)
  const mesesDefinitivos = [...new Set(avances.filter(a => a.tipo_registro === 'definitivo').map(a => a.mes))].sort((a,b) => a-b)
  const todosMeses = [...new Set([...mesesProyInicial, ...mesesDefinitivos])].sort((a,b) => a-b)

  const proximoMesProyInicial = mesesProyInicial.length > 0 ? Math.max(...mesesProyInicial) + 1 : 1
  // Definitiva solo se puede cargar si existe proyección inicial de ese mes, y es el siguiente a la última definitiva
  const proximoMesDefinitiva = mesesDefinitivos.length > 0 ? Math.max(...mesesDefinitivos) + 1 : 1
  const puedeDefinitiva = mesesProyInicial.includes(proximoMesDefinitiva)

  function abrirCarga(tipo) {
    const mes = tipo === 'proy_inicial' ? proximoMesProyInicial : proximoMesDefinitiva
    setMesActivo(mes)
    setPorcentajes({})
    setVista(tipo)
    setError(null)
    setExito(null)
  }

  async function guardarAvances() {
    setGuardando(true)
    setError(null)
    try {
      const itemsItems = items.filter(it => it.tipo === 'item')
      const registros = []

      for (const it of itemsItems) {
        const pctStr = porcentajes[it.id]
        if (!pctStr || pctStr === '' || pctStr === '0') continue
        const pct = parseFloat(String(pctStr).replace(',', '.')) / 100
        if (isNaN(pct)) continue
        const monto = it.total ? pct * it.total : null

        registros.push({
          planilla_item_id: it.id,
          obra_id: obra.id,
          mes: mesActivo,
          tipo_registro: vista,
          porcentaje: pct,
          monto,
          fecha: null,
        })
      }

      if (registros.length > 0) {
        const { error: insErr } = await supabase.from('planilla_avances').insert(registros)
        if (insErr) throw new Error('Error guardando avances: ' + insErr.message)
      }

      const labels = { proy_inicial: 'Proyección', definitiva: 'Medición definitiva' }
      setExito(`${labels[vista]} Mes ${String(mesActivo).padStart(2,'0')} guardada correctamente.`)
      setVista(null)
      setPorcentajes({})
      await cargarDatos()
    } catch (err) {
      setError(err.message)
    }
    setGuardando(false)
  }

  function totalCertificado(mes) {
    return avances.filter(a => a.tipo_registro === 'definitivo' && a.mes === mes)
      .reduce((s, a) => s + (a.monto || 0), 0)
  }
  const totalObra = items.filter(it => it.tipo === 'rubro').reduce((s, it) => s + (it.total || 0), 0)

  const fmt    = (n) => n != null ? '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
  const fmtPct = (n) => n != null ? (Number(n) * 100).toFixed(1) + '%' : '-'

  if (cargando) return <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Cargando...</div>

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
      {meta && (
        <div style={{ marginBottom: '20px', display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '13px', color: '#555', alignItems: 'center' }}>
          {meta.nombre_obra && <span><b style={{ color: '#999' }}>Obra:</b> {meta.nombre_obra}</span>}
          {totalObra > 0 && <span style={{ fontWeight: '700', fontSize: '15px', color: '#2563eb' }}>Total Obra: {fmt(totalObra)}</span>}
          {items.length > 0 && (
            <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#666', cursor: 'pointer' }}>
              <input type="checkbox" checked={mostrarPrecios} onChange={ev => setMostrarPrecios(ev.target.checked)} />
              Mostrar precios
            </label>
          )}
        </div>
      )}

      {/* Upload admin */}
      {esAdmin && (
        <div style={{ marginBottom: '20px', padding: '16px 20px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>{items.length > 0 ? '🔄 Reemplazar planilla base' : '📤 Subir Planilla de Medición'}</div>
            <div style={{ fontSize: '12px', color: '#888' }}>Carga los ítems base del Excel (.xlsx). Reemplazar borra todo el historial de avances.</div>
          </div>
          <input ref={inputRef} type="file" accept=".xlsx" onChange={handleArchivo} style={{ display: 'none' }} id="upload-pm" />
          <label htmlFor="upload-pm" style={{ padding: '8px 20px', background: '#2563eb', color: 'white', borderRadius: '6px', cursor: subiendo ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '14px', opacity: subiendo ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {subiendo ? 'Procesando...' : 'Elegir archivo'}
          </label>
        </div>
      )}

      {/* Botones de carga */}
      {items.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {esAdmin && (
            <button onClick={() => abrirCarga('proy_inicial')}
              style={{ padding: '10px 18px', background: 'white', color: '#2563eb', border: '1px solid #2563eb', borderRadius: '8px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
              📋 Cargar Proyección Mes {String(proximoMesProyInicial).padStart(2,'0')}
            </button>
          )}
          {esJefe && (
            <button onClick={() => puedeDefinitiva && abrirCarga('definitiva')}
              disabled={!puedeDefinitiva}
              title={!puedeDefinitiva ? `Falta cargar la proyección del Mes ${String(proximoMesDefinitiva).padStart(2,'0')}` : ''}
              style={{ padding: '10px 18px', background: puedeDefinitiva ? 'white' : '#f3f4f6', color: puedeDefinitiva ? '#16a34a' : '#aaa', border: '1px solid ' + (puedeDefinitiva ? '#16a34a' : '#e2e8f0'), borderRadius: '8px', fontWeight: '600', fontSize: '13px', cursor: puedeDefinitiva ? 'pointer' : 'not-allowed' }}>
              ✅ Medición Definitiva Mes {String(proximoMesDefinitiva).padStart(2,'0')}
            </button>
          )}
        </div>
      )}

      {error && <div style={{ padding: '10px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#dc2626', marginBottom: '16px', fontSize: '14px' }}>⚠️ {error}</div>}
      {exito && <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', color: '#16a34a', marginBottom: '16px', fontSize: '14px' }}>✓ {exito}</div>}

      {/* Formulario de carga */}
      {vista && (
        <div style={{ marginBottom: '24px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ margin: 0, color: '#1e3a5f' }}>
              {vista === 'proy_inicial' && `Proyección — Mes ${String(mesActivo).padStart(2,'0')}`}
              {vista === 'definitiva' && `Medición Definitiva — Mes ${String(mesActivo).padStart(2,'0')}`}
            </h4>
            <button onClick={() => { setVista(null); setPorcentajes({}) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '18px' }}>✕</button>
          </div>

          <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#1e3a5f', color: 'white' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '600' }}>Ítem</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '600' }}>Descripción</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600' }}>Total</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600' }}>% Avance</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600' }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g, gi) => (
                  <React.Fragment key={gi}>
                    <tr style={{ background: '#dbeafe' }}>
                      <td style={{ padding: '7px 12px', fontWeight: '700', color: '#1e3a5f' }}>{g.rubro.codigo}</td>
                      <td colSpan={4} style={{ padding: '7px 12px', fontWeight: '700', color: '#1e3a5f' }}>{g.rubro.descripcion}</td>
                    </tr>
                    {g.items.map((it, fi) => {
                      const pctStr = porcentajes[it.id] || ''
                      const pct = parseFloat(String(pctStr).replace(',', '.')) / 100
                      const monto = !isNaN(pct) && it.total ? pct * it.total : null
                      return (
                        <tr key={it.id} style={{ background: fi % 2 === 0 ? 'white' : '#f9fafb', borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 12px', color: '#666', whiteSpace: 'nowrap' }}>{it.codigo}</td>
                          <td style={{ padding: '6px 12px' }}>{it.descripcion}</td>
                          <td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmt(it.total)}</td>
                          <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                              <input
                                type="number" min="0" max="100" step="0.01"
                                value={pctStr}
                                onChange={ev => setPorcentajes(prev => ({ ...prev, [it.id]: ev.target.value }))}
                                style={{ width: '70px', padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '13px', textAlign: 'right' }}
                              />
                              <span style={{ color: '#888', fontSize: '12px' }}>%</span>
                            </div>
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'right', color: monto ? '#2563eb' : '#aaa' }}>
                            {monto ? fmt(monto) : '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button onClick={() => { setVista(null); setPorcentajes({}) }}
              style={{ padding: '8px 20px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', color: '#555' }}>
              Cancelar
            </button>
            <button onClick={guardarAvances} disabled={guardando}
              style={{ padding: '8px 24px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '14px', cursor: guardando ? 'not-allowed' : 'pointer', opacity: guardando ? 0.6 : 1 }}>
              {guardando ? 'Guardando...' : 'Guardar (no se podrá modificar después)'}
            </button>
          </div>
        </div>
      )}

      {/* Resumen meses definitivos */}
      {mesesDefinitivos.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {mesesDefinitivos.map(m => {
            const cert = totalCertificado(m)
            const pct  = totalObra > 0 ? cert / totalObra : 0
            return (
              <div key={m} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', minWidth: '160px' }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>MES {String(m).padStart(2,'0')} — DEFINITIVO</div>
                <div style={{ fontWeight: '700', color: '#2563eb', fontSize: '14px' }}>{fmt(cert)}</div>
                <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '2px' }}>{fmtPct(pct)} acumulado</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Tabla principal */}
      {items.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#aaa', fontSize: '15px' }}>
          {esAdmin ? 'Subí la planilla base para comenzar.' : 'Aún no se cargó la planilla de medición.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#1e3a5f', color: 'white' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '600', whiteSpace: 'nowrap' }}>Ítem</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '600' }}>Descripción</th>
                {mostrarPrecios && <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap' }}>Unid.</th>}
                {mostrarPrecios && <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap' }}>Cant.</th>}
                {mostrarPrecios && <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap' }}>P. Unit.</th>}
                {mostrarPrecios && <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap' }}>Total</th>}
                {todosMeses.map(m => (
                  <React.Fragment key={m}>
                    {mesesProyInicial.includes(m) && <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap', background: '#334d6e' }}>Proy.{String(m).padStart(2,'0')}</th>}
                    {mesesDefinitivos.includes(m) && <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600', whiteSpace: 'nowrap', background: '#1a5c3a' }}>Def.{String(m).padStart(2,'0')}</th>}
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g, gi) => (
                <React.Fragment key={gi}>
                  <tr style={{ background: '#dbeafe' }}>
                    <td style={{ padding: '7px 12px', fontWeight: '700', color: '#1e3a5f' }}>{g.rubro.codigo}</td>
                    <td style={{ padding: '7px 12px', fontWeight: '700', color: '#1e3a5f' }} colSpan={mostrarPrecios ? 1 : 1}>{g.rubro.descripcion}</td>
                    {mostrarPrecios && <td colSpan={3} />}
                    {mostrarPrecios && <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: '700', color: '#1e3a5f' }}>{fmt(g.rubro.total)}</td>}
                    {todosMeses.map(m => (
                      <React.Fragment key={m}>
                        {mesesProyInicial.includes(m) && (
                          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: '700', color: '#1e3a5f' }}>
                            {fmt(g.items.reduce((s, it) => {
                              const av = avances.find(a => a.planilla_item_id === it.id && a.tipo_registro === 'proy_inicial' && a.mes === m)
                              return s + (av?.monto || 0)
                            }, 0))}
                          </td>
                        )}
                        {mesesDefinitivos.includes(m) && (
                          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: '700', color: '#1e3a5f' }}>
                            {fmt(g.items.reduce((s, it) => {
                              const av = avances.find(a => a.planilla_item_id === it.id && a.tipo_registro === 'definitivo' && a.mes === m)
                              return s + (av?.monto || 0)
                            }, 0))}
                          </td>
                        )}
                      </React.Fragment>
                    ))}
                  </tr>
                  {g.items.map((it, fi) => (
                    <tr key={it.id} style={{ background: fi % 2 === 0 ? 'white' : '#f9fafb', borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 12px', color: '#666' }}>{it.codigo}</td>
                      <td style={{ padding: '6px 12px' }}>{it.descripcion}</td>
                      {mostrarPrecios && <td style={{ padding: '6px 12px', textAlign: 'right', color: '#888' }}>{it.unidad}</td>}
                      {mostrarPrecios && <td style={{ padding: '6px 12px', textAlign: 'right' }}>{it.cantidad != null ? Number(it.cantidad).toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '-'}</td>}
                      {mostrarPrecios && <td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmt(it.precio_unitario)}</td>}
                      {mostrarPrecios && <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: '600' }}>{fmt(it.total)}</td>}
                      {todosMeses.map(m => {
                        const avPI = avances.find(a => a.planilla_item_id === it.id && a.tipo_registro === 'proy_inicial' && a.mes === m)
                        const avD  = avances.find(a => a.planilla_item_id === it.id && a.tipo_registro === 'definitivo' && a.mes === m)
                        return (
                          <React.Fragment key={m}>
                            {mesesProyInicial.includes(m) && <td style={{ padding: '6px 12px', textAlign: 'right', color: '#334d6e' }}>{avPI ? fmtPct(avPI.porcentaje) : '-'}</td>}
                            {mesesDefinitivos.includes(m) && <td style={{ padding: '6px 12px', textAlign: 'right', color: '#1a5c3a' }}>{avD ? fmtPct(avD.porcentaje) : '-'}</td>}
                          </React.Fragment>
                        )
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default PlanillaMedicion