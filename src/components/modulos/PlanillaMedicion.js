import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'

function PlanillaMedicion({ obra, perfil }) {
  const [items, setItems]                   = useState([])
  const [avances, setAvances]               = useState([])
  const [duracionMeses, setDuracionMeses]   = useState(null)
  const [cargando, setCargando]             = useState(true)
  const [error, setError]                   = useState(null)
  const [exito, setExito]                   = useState(null)
  const [guardando, setGuardando]           = useState(false)
  const [vistaJefe, setVistaJefe]           = useState(null)
  const [tipoCarga, setTipoCarga]           = useState(null)
  const [mesSeleccionado, setMesSeleccionado] = useState(null)
  const [mostrarMonto, setMostrarMonto]     = useState(false)
  const [mostrarPrecios, setMostrarPrecios] = useState(false)
  const [porcentajes, setPorcentajes]       = useState({})
  const [expandidos, setExpandidos]         = useState({})

  const esJefe = perfil?.area === 'jefe_obra'

  useEffect(() => { cargarDatos() }, [obra.id]) // eslint-disable-line

  async function cargarDatos() {
    setCargando(true)
    const { data: itemsData }  = await supabase.from('planilla_items').select('*').eq('obra_id', obra.id).order('orden', { ascending: true })
    const { data: avancesData }= await supabase.from('medicion_avances').select('*').eq('obra_id', obra.id).order('mes', { ascending: true })
    const { data: configData } = await supabase.from('planilla_config').select('duracion_meses').eq('obra_id', obra.id).maybeSingle()
    setItems(itemsData || [])
    setAvances(avancesData || [])
    setDuracionMeses(configData?.duracion_meses || null)
    setCargando(false)
  }

  const meses         = duracionMeses ? Array.from({ length: duracionMeses }, (_, i) => i + 1) : []
  const mesesVisibles = mesSeleccionado ? [mesSeleccionado] : meses
  const tieneProyInicial = avances.some(a => a.tipo === 'proyeccion_inicial')
  const mesesConReal  = [...new Set(avances.filter(a => a.tipo === 'real').map(a => a.mes))].sort((a,b) => a-b)
  const proximoMesReal = mesesConReal.length > 0 ? Math.max(...mesesConReal) + 1 : 1

  function getAvance(itemId, mes, tipo) {
    return avances.find(a => a.planilla_item_id === itemId && a.mes === mes && a.tipo === tipo)
  }

  const secciones = []
  let seccionActual = null
  for (const it of items) {
    if (it.tipo === 'rubro') { secciones.push({ esRubro: true, item: it }); seccionActual = null }
    else if (it.tipo === 'titulo') { seccionActual = { esRubro: false, esTitulo: true, item: it, items: [] }; secciones.push(seccionActual) }
    else if (it.tipo === 'item') {
      if (seccionActual) seccionActual.items.push(it)
      else secciones.push({ esItemSuelto: true, item: it })
    }
  }

  function toggleExpandido(key) { setExpandidos(prev => ({ ...prev, [key]: !prev[key] })) }
  function expandirTodo()  { const keys = {}; secciones.forEach((s, i) => { if (s.esTitulo) keys[`s-${i}`] = true }); setExpandidos(keys) }
  function colapsarTodo()  { setExpandidos({}) }

  function abrirCarga(tipo) {
    const pcts = {}
    const itemsItems = items.filter(it => it.tipo === 'item')
    if (tipo === 'proyeccion_corregida') {
      const mesesFuturos = meses.filter(m => !mesesConReal.includes(m))
      for (const it of itemsItems) {
        for (const m of mesesFuturos) {
          const av = getAvance(it.id, m, 'proyeccion_corregida') || getAvance(it.id, m, 'proyeccion_inicial')
          if (av) pcts[`${it.id}-${m}`] = (av.porcentaje * 100).toFixed(2)
        }
      }
    }
    setPorcentajes(pcts); setTipoCarga(tipo); setError(null); setExito(null)
  }

  async function guardar() {
    setGuardando(true); setError(null)
    try {
      const itemsItems = items.filter(it => it.tipo === 'item')
      const registros  = []

      if (tipoCarga === 'proyeccion_inicial') {
        if (tieneProyInicial) throw new Error('La proyección inicial ya fue cargada y no puede modificarse.')
        for (const it of itemsItems) {
          for (const m of meses) {
            const pctStr = porcentajes[`${it.id}-${m}`]
            if (!pctStr || pctStr === '') continue
            const pct = parseFloat(String(pctStr).replace(',', '.')) / 100
            if (isNaN(pct) || pct === 0) continue
            registros.push({ obra_id: obra.id, planilla_item_id: it.id, mes: m, tipo: 'proyeccion_inicial', porcentaje: pct, monto: it.precio_venta ? pct * it.precio_venta : null })
          }
        }
      } else if (tipoCarga === 'real') {
        if (mesesConReal.includes(proximoMesReal)) throw new Error('La medición real de este mes ya fue registrada.')
        // Fix límite meses: solo deshabilitar si duracionMeses está definido y se superó
        if (duracionMeses !== null && proximoMesReal > duracionMeses) throw new Error('Se superó la duración de la obra.')
        for (const it of itemsItems) {
          const pctStr = porcentajes[`${it.id}-${proximoMesReal}`]
          if (!pctStr || pctStr === '') continue
          const pct = parseFloat(String(pctStr).replace(',', '.')) / 100
          if (isNaN(pct) || pct === 0) continue
          registros.push({ obra_id: obra.id, planilla_item_id: it.id, mes: proximoMesReal, tipo: 'real', porcentaje: pct, monto: it.precio_venta ? pct * it.precio_venta : null })
        }
      } else if (tipoCarga === 'proyeccion_corregida') {
        const mesesFuturos = meses.filter(m => !mesesConReal.includes(m))
        await supabase.from('medicion_avances').delete().eq('obra_id', obra.id).eq('tipo', 'proyeccion_corregida').in('mes', mesesFuturos)
        for (const it of itemsItems) {
          for (const m of mesesFuturos) {
            const pctStr = porcentajes[`${it.id}-${m}`]
            if (!pctStr || pctStr === '') continue
            const pct = parseFloat(String(pctStr).replace(',', '.')) / 100
            if (isNaN(pct) || pct === 0) continue
            registros.push({ obra_id: obra.id, planilla_item_id: it.id, mes: m, tipo: 'proyeccion_corregida', porcentaje: pct, monto: it.precio_venta ? pct * it.precio_venta : null })
          }
        }
      }

      if (registros.length > 0) {
        const { error: insErr } = await supabase.from('medicion_avances').insert(registros)
        if (insErr) throw new Error('Error guardando: ' + insErr.message)
      }

      const labels = { proyeccion_inicial: 'Proyección inicial', real: `Medición real Mes ${String(proximoMesReal).padStart(2,'0')}`, proyeccion_corregida: 'Proyección corregida' }
      setExito(`${labels[tipoCarga]} guardada correctamente.`)
      setTipoCarga(null); setPorcentajes({})
      if (esJefe) setVistaJefe('ver')
      await cargarDatos()
    } catch (err) { setError(err.message) }
    setGuardando(false)
  }

  const fmt    = (n) => n != null ? '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
  const fmtPct = (n) => n != null ? (Number(n) * 100).toFixed(1) + '%' : '-'
  const totalVenta = items.filter(it => it.tipo === 'item').reduce((s, it) => s + (it.precio_venta || 0), 0)

  const tiposVisibles = [
    { tipo: 'proyeccion_inicial',  label: 'P.Ini', color: '#2d4a6e',  bgHeader: '#2d4a6e' },
    { tipo: 'real',                label: 'Real',  color: 'var(--c-success)', bgHeader: '#0f5132' },
    { tipo: 'proyeccion_corregida',label: 'P.Cor', color: '#ca8a04',  bgHeader: '#7c5a00' },
  ]

  // ── Estilos compartidos ──────────────────────────────────
  const btnMes = (active) => ({
    padding: '3px 10px', fontSize: '11px', cursor: 'pointer', borderRadius: '4px',
    border: '1px solid ' + (active ? 'var(--c-gold)' : 'var(--c-border)'),
    background: active ? 'var(--c-gold)' : 'white',
    color: active ? 'white' : 'var(--c-text2)',
  })

  const btnVista = (active) => ({
    padding: '10px 20px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', borderRadius: '8px',
    border: '1px solid var(--c-gold)',
    background: active ? 'var(--c-gold)' : 'white',
    color: active ? 'white' : 'var(--c-gold)',
  })

  const btnCarga = (active, disabled) => ({
    padding: '12px 20px', fontWeight: '600', fontSize: '13px', borderRadius: '8px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: '1px solid ' + (disabled ? 'var(--c-border)' : active ? 'var(--c-gold)' : 'var(--c-border2)'),
    background: disabled ? 'var(--c-surface2)' : active ? 'var(--c-gold)' : 'white',
    color: disabled ? 'var(--c-text3)' : active ? 'white' : 'var(--c-text2)',
  })

  const inputPct = { width: '58px', padding: '3px 6px', border: '1px solid var(--c-border)', borderRadius: '4px', fontSize: '12px', textAlign: 'right' }

  function calcPctPonderado(itemsList, m, tipo) {
    const suma  = itemsList.reduce((s, it) => { const av = getAvance(it.id, m, tipo); return s + (av?.porcentaje || 0) * (it.precio_venta || 0) }, 0)
    const total = itemsList.reduce((s, it) => s + (it.precio_venta || 0), 0)
    return total > 0 ? suma / total : null
  }

  function calcMonto(itemsList, m, tipo) {
    return itemsList.reduce((s, it) => { const av = getAvance(it.id, m, tipo); return s + (av?.monto || 0) }, 0)
  }

  function renderItemRow(it, fi) {
    return (
      <tr key={it.id} style={{ background: fi % 2 === 0 ? 'white' : 'var(--c-surface2)', borderBottom: '1px solid var(--c-border)' }}>
        <td style={{ padding: '5px 12px 5px 32px', fontSize: '12px', color: 'var(--c-text)' }}>{it.descripcion}</td>
        {mostrarPrecios && <td style={{ padding: '5px 6px', textAlign: 'right', color: 'var(--c-text3)', fontSize: '11px' }}>{it.unidad}</td>}
        {mostrarPrecios && <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: '11px', color: 'var(--c-text2)' }}>{it.cantidad != null ? Number(it.cantidad).toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '-'}</td>}
        {mostrarPrecios && <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '600', fontSize: '11px' }}>{fmt(it.precio_venta)}</td>}
        {mesesVisibles.map(m => (
          tiposVisibles.map(tv => {
            const av = getAvance(it.id, m, tv.tipo)
            return (
              <React.Fragment key={`${m}-${tv.tipo}`}>
                <td style={{ padding: '5px 3px', textAlign: 'right', color: tv.color, fontSize: '11px' }}>{av ? fmtPct(av.porcentaje) : '-'}</td>
                {mostrarMonto && <td style={{ padding: '5px 3px', textAlign: 'right', color: tv.color, fontSize: '10px' }}>{av?.monto ? fmt(av.monto) : '-'}</td>}
              </React.Fragment>
            )
          })
        ))}
      </tr>
    )
  }

  if (cargando) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--c-text3)' }}>Cargando...</div>

  if (items.length === 0) return (
    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--c-text3)', fontSize: '15px' }}>
      La planilla de medición se genera desde <b>Costo Previsto → Generar Planilla de Cotización</b>.
    </div>
  )

  return (
    <div>
      {/* ── Barra sticky ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'white', borderBottom: '2px solid var(--c-border)', padding: '8px 0', marginBottom: '16px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: 'var(--c-text3)', whiteSpace: 'nowrap' }}>Mes:</span>
        <button onClick={() => setMesSeleccionado(null)} style={btnMes(!mesSeleccionado)}>Todos</button>
        {meses.map(m => (
          <button key={m} onClick={() => setMesSeleccionado(m)} style={btnMes(mesSeleccionado === m)}>
            M{String(m).padStart(2,'0')}
          </button>
        ))}
        <div style={{ width: '1px', height: '18px', background: 'var(--c-border)' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer', color: 'var(--c-text2)' }}>
          <input type="checkbox" checked={mostrarPrecios} onChange={e => setMostrarPrecios(e.target.checked)} /> Precios
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer', color: 'var(--c-text2)' }}>
          <input type="checkbox" checked={mostrarMonto} onChange={e => setMostrarMonto(e.target.checked)} /> Montos $
        </label>
        <div style={{ width: '1px', height: '18px', background: 'var(--c-border)' }} />
        <button onClick={expandirTodo}  style={{ padding: '3px 10px', background: 'white', border: '1px solid var(--c-border)', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', color: 'var(--c-text2)', whiteSpace: 'nowrap' }}>+ Expandir todo</button>
        <button onClick={colapsarTodo}  style={{ padding: '3px 10px', background: 'white', border: '1px solid var(--c-border)', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', color: 'var(--c-text2)', whiteSpace: 'nowrap' }}>− Colapsar todo</button>
        <div style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: '700', color: 'var(--c-gold)', whiteSpace: 'nowrap' }}>{fmt(totalVenta)}</div>
      </div>

      {/* ── Leyenda colores ── */}
      <div style={{ marginBottom: '12px', display: 'flex', gap: '16px', fontSize: '11px' }}>
        {duracionMeses && <span style={{ color: 'var(--c-text3)' }}>Duración: {duracionMeses} meses</span>}
        <span style={{ color: '#2d4a6e',          fontWeight: '600' }}>■ Proy. Inicial</span>
        <span style={{ color: 'var(--c-success)', fontWeight: '600' }}>■ Real</span>
        <span style={{ color: '#ca8a04',          fontWeight: '600' }}>■ Proy. Corregida</span>
      </div>

      {/* ── Botones jefe ── */}
      {esJefe && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <button onClick={() => { setVistaJefe('ver'); setTipoCarga(null) }} style={btnVista(vistaJefe === 'ver' || !vistaJefe)}>
            📊 Ver Avance de Obra
          </button>
          <button onClick={() => { setVistaJefe('cargar'); setTipoCarga(null) }} style={btnVista(vistaJefe === 'cargar')}>
            ✏️ Cargar Avances
          </button>
        </div>
      )}

      {/* ── Panel opciones de carga ── */}
      {esJefe && vistaJefe === 'cargar' && !tipoCarga && (
        <div style={{ background: 'var(--c-surface2)', border: '1px solid var(--c-border)', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 16px', color: 'var(--c-text)', fontSize: '14px' }}>Cargar Avances</h4>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button onClick={() => abrirCarga('proyeccion_inicial')} disabled={tieneProyInicial} style={btnCarga(false, tieneProyInicial)}>
              {tieneProyInicial ? '✓ Proyección Inicial (ya cargada)' : '📋 Cargar Proyección Inicial'}
            </button>
            <button
              onClick={() => abrirCarga('real')}
              disabled={duracionMeses !== null && proximoMesReal > duracionMeses}
              style={btnCarga(false, duracionMeses !== null && proximoMesReal > duracionMeses)}>
              ✅ Medición Real — Mes {String(proximoMesReal).padStart(2,'0')}
            </button>
            <button onClick={() => abrirCarga('proyeccion_corregida')} disabled={!tieneProyInicial} style={btnCarga(false, !tieneProyInicial)}>
              📊 Proyección Corregida (meses futuros)
            </button>
          </div>
        </div>
      )}

      {error && <div style={{ padding: '10px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: 'var(--c-danger)', marginBottom: '16px', fontSize: '14px' }}>⚠️ {error}</div>}
      {exito && <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', color: 'var(--c-success)', marginBottom: '16px', fontSize: '14px' }}>✓ {exito}</div>}

      {/* ── Formulario de carga ── */}
      {tipoCarga && (
        <div style={{ background: 'var(--c-surface2)', border: '1px solid var(--c-border)', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ margin: 0, color: 'var(--c-text)', fontSize: '14px' }}>
              {tipoCarga === 'proyeccion_inicial'   && 'Proyección Inicial — todos los meses'}
              {tipoCarga === 'real'                 && `Medición Real — Mes ${String(proximoMesReal).padStart(2,'00')}`}
              {tipoCarga === 'proyeccion_corregida' && `Proyección Corregida — meses ${meses.filter(m => !mesesConReal.includes(m)).join(', ')}`}
            </h4>
            <button onClick={() => setTipoCarga(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text3)', fontSize: '18px' }}>✕</button>
          </div>
          <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--c-text)', color: 'white' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', minWidth: '200px' }}>Ítem</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Precio Venta</th>
                  {tipoCarga === 'real'
                    ? <th style={{ padding: '8px 12px', textAlign: 'right', background: '#0f5132' }}>% Mes {String(proximoMesReal).padStart(2,'0')}</th>
                    : meses.filter(m => tipoCarga === 'proyeccion_inicial' || !mesesConReal.includes(m)).map(m => (
                        <th key={m} style={{ padding: '8px 6px', textAlign: 'right', fontSize: '11px', whiteSpace: 'nowrap' }}>Mes {String(m).padStart(2,'0')}</th>
                      ))
                  }
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Monto (último mes)</th>
                </tr>
              </thead>
              <tbody>
                {secciones.map((s, si) => {
                  if (s.esRubro) return (
                    <tr key={`r-${si}`} style={{ background: 'var(--c-gold-dim)' }}>
                      <td colSpan={99} style={{ padding: '7px 12px', fontWeight: '700', color: 'var(--c-text)', fontSize: '12px' }}>{s.item.descripcion}</td>
                    </tr>
                  )
                  if (s.esItemSuelto) {
                    const it = s.item
                    const mesesEdit  = tipoCarga === 'real' ? [proximoMesReal] : meses.filter(m => tipoCarga === 'proyeccion_inicial' || !mesesConReal.includes(m))
                    const ultimoPct  = [...mesesEdit].reverse().map(m => parseFloat(String(porcentajes[`${it.id}-${m}`] || '').replace(',','.'))).find(v => !isNaN(v) && v > 0) || 0
                    const monto      = it.precio_venta && ultimoPct > 0 ? (ultimoPct / 100) * it.precio_venta : null
                    return (
                      <tr key={`is-${si}`} style={{ background: 'white', borderBottom: '1px solid var(--c-border)' }}>
                        <td style={{ padding: '6px 12px', color: 'var(--c-text)' }}>{it.descripcion}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--c-text2)' }}>{fmt(it.precio_venta)}</td>
                        {mesesEdit.map(m => (
                          <td key={m} style={{ padding: '4px 4px', textAlign: 'right' }}>
                            <input type="number" min="0" max="100" step="0.1" value={porcentajes[`${it.id}-${m}`] || ''} onChange={ev => setPorcentajes(prev => ({ ...prev, [`${it.id}-${m}`]: ev.target.value }))} style={inputPct} />
                          </td>
                        ))}
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: monto ? 'var(--c-gold)' : 'var(--c-text3)', fontSize: '12px' }}>{monto ? fmt(monto) : '-'}</td>
                      </tr>
                    )
                  }
                  return (
                    <React.Fragment key={`t-${si}`}>
                      <tr style={{ background: 'var(--c-surface2)' }}>
                        <td colSpan={99} style={{ padding: '6px 12px', fontWeight: '700', color: 'var(--c-text)', fontSize: '11px' }}>{s.item.descripcion}</td>
                      </tr>
                      {s.items.map((it, fi) => {
                        const mesesEdit = tipoCarga === 'real' ? [proximoMesReal] : meses.filter(m => tipoCarga === 'proyeccion_inicial' || !mesesConReal.includes(m))
                        const ultimoPct = [...mesesEdit].reverse().map(m => parseFloat(String(porcentajes[`${it.id}-${m}`] || '').replace(',','.'))).find(v => !isNaN(v) && v > 0) || 0
                        const monto     = it.precio_venta && ultimoPct > 0 ? (ultimoPct / 100) * it.precio_venta : null
                        return (
                          <tr key={it.id} style={{ background: fi % 2 === 0 ? 'white' : 'var(--c-surface2)', borderBottom: '1px solid var(--c-border)' }}>
                            <td style={{ padding: '6px 12px 6px 24px', color: 'var(--c-text)' }}>{it.descripcion}</td>
                            <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--c-text2)' }}>{fmt(it.precio_venta)}</td>
                            {mesesEdit.map(m => (
                              <td key={m} style={{ padding: '4px 4px', textAlign: 'right' }}>
                                <input type="number" min="0" max="100" step="0.1" value={porcentajes[`${it.id}-${m}`] || ''} onChange={ev => setPorcentajes(prev => ({ ...prev, [`${it.id}-${m}`]: ev.target.value }))} style={inputPct} />
                              </td>
                            ))}
                            <td style={{ padding: '6px 12px', textAlign: 'right', color: monto ? 'var(--c-gold)' : 'var(--c-text3)', fontSize: '12px' }}>{monto ? fmt(monto) : '-'}</td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button onClick={() => setTipoCarga(null)} style={{ padding: '8px 20px', background: 'white', border: '1px solid var(--c-border)', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', color: 'var(--c-text2)' }}>Cancelar</button>
            <button onClick={guardar} disabled={guardando} style={{ padding: '8px 24px', background: guardando ? 'var(--c-border)' : 'var(--c-gold)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: guardando ? 'not-allowed' : 'pointer', opacity: guardando ? 0.6 : 1 }}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* ── Tabla de visualización ── */}
      {(!esJefe || vistaJefe === 'ver' || !vistaJefe) && !tipoCarga && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', minWidth: '500px' }}>
            <thead>
              <tr style={{ background: 'var(--c-text)', color: 'white' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', minWidth: '200px' }}>Descripción</th>
                {mostrarPrecios && <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: '10px' }}>Unid.</th>}
                {mostrarPrecios && <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: '10px' }}>Cant.</th>}
                {mostrarPrecios && <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: '10px' }}>P.V.</th>}
                {mesesVisibles.map(m => (
                  tiposVisibles.map(tv => (
                    <React.Fragment key={`${m}-${tv.tipo}`}>
                      <th style={{ padding: '8px 3px', textAlign: 'right', fontSize: '9px', whiteSpace: 'nowrap', background: tv.bgHeader }}>
                        M{String(m).padStart(2,'0')} {tv.label}
                      </th>
                      {mostrarMonto && <th style={{ padding: '8px 3px', textAlign: 'right', fontSize: '9px', whiteSpace: 'nowrap', background: tv.bgHeader, opacity: 0.8 }}>$</th>}
                    </React.Fragment>
                  ))
                ))}
              </tr>
            </thead>
            <tbody>
              {secciones.map((s, si) => {
                if (s.esRubro) return (
                  <tr key={`r-${si}`} style={{ background: 'var(--c-text)' }}>
                    <td colSpan={99} style={{ padding: '8px 12px', fontWeight: '700', color: 'white', fontSize: '12px' }}>{s.item.descripcion}</td>
                  </tr>
                )
                if (s.esItemSuelto) return renderItemRow(s.item, si)
                const key      = `s-${si}`
                const expandido = !!expandidos[key]
                return (
                  <React.Fragment key={key}>
                    <tr style={{ background: 'var(--c-gold-dim)', cursor: 'pointer', borderBottom: '1px solid var(--c-gold-ring)' }} onClick={() => toggleExpandido(key)}>
                      <td style={{ padding: '7px 12px', fontWeight: '700', color: 'var(--c-text)', fontSize: '12px' }}>
                        <span style={{ marginRight: '8px', fontSize: '10px', color: 'var(--c-text3)' }}>{expandido ? '▼' : '▶'}</span>
                        {s.item.descripcion}
                      </td>
                      {mostrarPrecios && <td colSpan={2} />}
                      {mostrarPrecios && <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: '700', color: 'var(--c-text)', fontSize: '11px' }}>
                        {fmt(s.items.reduce((acc, it) => acc + (it.precio_venta || 0), 0))}
                      </td>}
                      {mesesVisibles.map(m => tiposVisibles.map(tv => {
                        const p  = calcPctPonderado(s.items, m, tv.tipo)
                        const mo = calcMonto(s.items, m, tv.tipo)
                        return (
                          <React.Fragment key={`${m}-${tv.tipo}`}>
                            <td style={{ padding: '7px 3px', textAlign: 'right', fontWeight: '700', color: tv.color, fontSize: '11px' }}>{p != null ? fmtPct(p) : '-'}</td>
                            {mostrarMonto && <td style={{ padding: '7px 3px', textAlign: 'right', fontWeight: '700', color: tv.color, fontSize: '10px' }}>{mo > 0 ? fmt(mo) : '-'}</td>}
                          </React.Fragment>
                        )
                      }))}
                    </tr>
                    {expandido && s.items.map((it, fi) => renderItemRow(it, fi))}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default PlanillaMedicion