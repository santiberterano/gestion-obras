import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'

// Paleta CONSCA+
const C = {
  negro: '#0A0A0A',
  grisOscuro: '#1A1A1A',
  grisMedio: '#252525',
  grisPanel: '#1E1E1E',
  grisClaro: '#3A3A3A',
  grisTexto: '#9A9A9A',
  grisBorde: '#2E2E2E',
  grisBorde2: '#383838',
  amarillo: '#F5A800',
  amarilloSuave: 'rgba(245,168,0,0.12)',
  blanco: '#FFFFFF',
  blancoSuave: '#E0E0E0',
  // colores datos
  azulIni: '#4A90D9',
  azulIniBg: '#1A2A3A',
  verdeReal: '#4CAF7D',
  verdeRealBg: '#0F2A1A',
  naranjaCor: '#F5A800',
  naranjaCorBg: '#2A1E00',
}

const estiloBase = {
  fontFamily: "'Roboto', sans-serif",
}

function PlanillaMedicion({ obra, perfil }) {
  const [items, setItems] = useState([])
  const [avances, setAvances] = useState([])
  const [duracionMeses, setDuracionMeses] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [exito, setExito] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [vistaJefe, setVistaJefe] = useState(null)
  const [tipoCarga, setTipoCarga] = useState(null)
  const [mesSeleccionado, setMesSeleccionado] = useState(null)
  const [mostrarMonto, setMostrarMonto] = useState(false)
  const [mostrarPrecios, setMostrarPrecios] = useState(false)
  const [porcentajes, setPorcentajes] = useState({})
  const [expandidos, setExpandidos] = useState({})

  const esJefe = perfil?.area === 'jefe_obra'

  useEffect(() => {
    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obra.id])

  async function cargarDatos() {
    setCargando(true)
    const { data: itemsData } = await supabase
      .from('planilla_items').select('*').eq('obra_id', obra.id).order('orden', { ascending: true })
    const { data: avancesData } = await supabase
      .from('medicion_avances').select('*').eq('obra_id', obra.id).order('mes', { ascending: true })
    const { data: configData } = await supabase
      .from('planilla_config').select('duracion_meses').eq('obra_id', obra.id).maybeSingle()

    setItems(itemsData || [])
    setAvances(avancesData || [])
    setDuracionMeses(configData?.duracion_meses || null)
    setCargando(false)
  }

  const meses = duracionMeses ? Array.from({ length: duracionMeses }, (_, i) => i + 1) : []
  const mesesVisibles = mesSeleccionado ? [mesSeleccionado] : meses
  const tieneProyInicial = avances.some(a => a.tipo === 'proyeccion_inicial')
  const mesesConReal = [...new Set(avances.filter(a => a.tipo === 'real').map(a => a.mes))].sort((a,b) => a-b)
  const proximoMesReal = mesesConReal.length > 0 ? Math.max(...mesesConReal) + 1 : 1

  function getAvance(itemId, mes, tipo) {
    return avances.find(a => a.planilla_item_id === itemId && a.mes === mes && a.tipo === tipo)
  }

  // ─── Estructura de secciones ───────────────────────────────────────────────
  // FIX: los items sueltos (sin titulo) se agrupan bajo el rubro como sección colapsable
  const secciones = []
  let seccionActual = null
  let rubroActual = null

  for (const it of items) {
    if (it.tipo === 'rubro') {
      // Cerramos sección implícita anterior si existía
      seccionActual = null
      rubroActual = it
      secciones.push({ esRubro: true, item: it })
    } else if (it.tipo === 'titulo') {
      seccionActual = { esRubro: false, esTitulo: true, item: it, items: [] }
      rubroActual = null
      secciones.push(seccionActual)
    } else if (it.tipo === 'item') {
      if (seccionActual) {
        // Hay un título abierto → agregar ahí
        seccionActual.items.push(it)
      } else if (rubroActual) {
        // Ítems directos bajo un rubro (sin título intermedio) → sección implícita colapsable
        // Buscamos si ya existe una sección implícita para este rubro
        const ultimaSeccion = secciones[secciones.length - 1]
        if (ultimaSeccion && ultimaSeccion.esSeccionImplicita && ultimaSeccion.rubroId === rubroActual.id) {
          ultimaSeccion.items.push(it)
        } else {
          const rubroRef = rubroActual
          const nuevaSeccion = { esSeccionImplicita: true, rubroId: rubroRef.id, item: rubroRef, items: [it] }
          secciones.push(nuevaSeccion)
          const idxRubro = secciones.findIndex(s => s.esRubro && s.item.id === rubroRef.id)
          if (idxRubro !== -1) secciones[idxRubro]._oculto = true
          seccionActual = nuevaSeccion
        }
      } else {
        secciones.push({ esItemSuelto: true, item: it })
      }
    }
  }

  function toggleExpandido(key) {
    setExpandidos(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function expandirTodo() {
    const keys = {}
    secciones.forEach((s, i) => {
      if (s.esTitulo || s.esSeccionImplicita) keys[`s-${i}`] = true
    })
    setExpandidos(keys)
  }

  function colapsarTodo() {
    setExpandidos({})
  }

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
    setPorcentajes(pcts)
    setTipoCarga(tipo)
    setError(null)
    setExito(null)
  }

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      const itemsItems = items.filter(it => it.tipo === 'item')
      const registros = []

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
      setTipoCarga(null)
      setPorcentajes({})
      if (esJefe) setVistaJefe('ver')
      await cargarDatos()
    } catch (err) {
      setError(err.message)
    }
    setGuardando(false)
  }

  const fmt    = (n) => n != null ? '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
  const fmtPct = (n) => n != null ? (Number(n) * 100).toFixed(1) + '%' : '-'
  const totalVenta = items.filter(it => it.tipo === 'item').reduce((s, it) => s + (it.precio_venta || 0), 0)

  const tiposVisibles = [
    { tipo: 'proyeccion_inicial', label: 'P.Ini', color: C.azulIni,     bgHeader: C.azulIniBg },
    { tipo: 'real',               label: 'Real',  color: C.verdeReal,   bgHeader: C.verdeRealBg },
    { tipo: 'proyeccion_corregida', label: 'P.Cor', color: C.naranjaCor, bgHeader: C.naranjaCorBg },
  ]

  function calcPctPonderado(itemsList, m, tipo) {
    const suma = itemsList.reduce((s, it) => { const av = getAvance(it.id, m, tipo); return s + (av?.porcentaje || 0) * (it.precio_venta || 0) }, 0)
    const total = itemsList.reduce((s, it) => s + (it.precio_venta || 0), 0)
    return total > 0 ? suma / total : null
  }

  function calcMonto(itemsList, m, tipo) {
    return itemsList.reduce((s, it) => { const av = getAvance(it.id, m, tipo); return s + (av?.monto || 0) }, 0)
  }

  function renderItemRow(it, fi) {
    return (
      <tr key={it.id} style={{ background: fi % 2 === 0 ? C.grisOscuro : C.grisMedio, borderBottom: `1px solid ${C.grisBorde}` }}>
        <td style={{ padding: '5px 12px 5px 32px', fontSize: '12px', color: C.blancoSuave }}>{it.descripcion}</td>
        {mostrarPrecios && <td style={{ padding: '5px 6px', textAlign: 'right', color: C.grisTexto, fontSize: '11px' }}>{it.unidad}</td>}
        {mostrarPrecios && <td style={{ padding: '5px 6px', textAlign: 'right', color: C.grisTexto, fontSize: '11px' }}>{it.cantidad != null ? Number(it.cantidad).toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '-'}</td>}
        {mostrarPrecios && <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '600', fontSize: '11px', color: C.blancoSuave }}>{fmt(it.precio_venta)}</td>}
        {mesesVisibles.map(m => (
          tiposVisibles.map(tv => {
            const av = getAvance(it.id, m, tv.tipo)
            return (
              <React.Fragment key={`${m}-${tv.tipo}`}>
                <td style={{ padding: '5px 3px', textAlign: 'right', color: av ? tv.color : C.grisClaro, fontSize: '11px' }}>{av ? fmtPct(av.porcentaje) : '-'}</td>
                {mostrarMonto && <td style={{ padding: '5px 3px', textAlign: 'right', color: av?.monto ? tv.color : C.grisClaro, fontSize: '10px' }}>{av?.monto ? fmt(av.monto) : '-'}</td>}
              </React.Fragment>
            )
          })
        ))}
      </tr>
    )
  }

  // ─── Render de sección colapsable (título o sección implícita de rubro) ───
  function renderSeccionColapsable(s, si) {
    const key = `s-${si}`
    const expandido = !!expandidos[key]
    const esImpl = s.esSeccionImplicita

    return (
      <React.Fragment key={key}>
        {/* Fila de cabecera del rubro/titulo colapsable */}
        <tr
          style={{ background: esImpl ? C.negro : '#1C2840', cursor: 'pointer', userSelect: 'none' }}
          onClick={() => toggleExpandido(key)}
        >
          <td style={{
            padding: esImpl ? '9px 12px' : '7px 12px 7px 24px',
            fontWeight: '700',
            color: esImpl ? C.amarillo : '#7EB3E8',
            fontSize: esImpl ? '12px' : '11px',
            letterSpacing: esImpl ? '0.06em' : '0.03em',
            textTransform: esImpl ? 'uppercase' : 'none',
          }}>
            <span style={{ marginRight: '8px', fontSize: '10px', opacity: 0.7 }}>{expandido ? '▼' : '▶'}</span>
            {s.item.descripcion}
          </td>
          {mostrarPrecios && <td colSpan={2} />}
          {mostrarPrecios && (
            <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: '700', color: esImpl ? C.amarillo : '#7EB3E8', fontSize: '11px' }}>
              {fmt(s.items.reduce((acc, it) => acc + (it.precio_venta || 0), 0))}
            </td>
          )}
          {mesesVisibles.map(m => tiposVisibles.map(tv => {
            const p = calcPctPonderado(s.items, m, tv.tipo)
            const mo = calcMonto(s.items, m, tv.tipo)
            return (
              <React.Fragment key={`${m}-${tv.tipo}`}>
                <td style={{ padding: '7px 3px', textAlign: 'right', fontWeight: '700', color: p != null ? tv.color : C.grisClaro, fontSize: '11px' }}>{p != null ? fmtPct(p) : '-'}</td>
                {mostrarMonto && <td style={{ padding: '7px 3px', textAlign: 'right', fontWeight: '700', color: mo > 0 ? tv.color : C.grisClaro, fontSize: '10px' }}>{mo > 0 ? fmt(mo) : '-'}</td>}
              </React.Fragment>
            )
          }))}
        </tr>
        {expandido && s.items.map((it, fi) => renderItemRow(it, fi))}
      </React.Fragment>
    )
  }

  // ─── Render formulario de carga ────────────────────────────────────────────
  function renderFilaCarga(it, fi, mesesEdit) {
    const ultimoPct = [...mesesEdit].reverse().map(m => parseFloat(String(porcentajes[`${it.id}-${m}`] || '').replace(',','.'))).find(v => !isNaN(v) && v > 0) || 0
    const monto = it.precio_venta && ultimoPct > 0 ? (ultimoPct / 100) * it.precio_venta : null
    return (
      <tr key={it.id} style={{ background: fi % 2 === 0 ? C.grisOscuro : C.grisMedio, borderBottom: `1px solid ${C.grisBorde}` }}>
        <td style={{ padding: '6px 12px 6px 24px', color: C.blancoSuave, fontSize: '12px' }}>{it.descripcion}</td>
        <td style={{ padding: '6px 12px', textAlign: 'right', color: C.grisTexto, fontSize: '12px' }}>{fmt(it.precio_venta)}</td>
        {mesesEdit.map(m => (
          <td key={m} style={{ padding: '4px 4px', textAlign: 'right' }}>
            <input type="number" min="0" max="100" step="0.1"
              value={porcentajes[`${it.id}-${m}`] || ''}
              onChange={ev => setPorcentajes(prev => ({ ...prev, [`${it.id}-${m}`]: ev.target.value }))}
              style={{
                width: '58px', padding: '3px 6px',
                border: `1px solid ${C.grisBorde2}`,
                borderRadius: '3px', fontSize: '12px', textAlign: 'right',
                background: C.grisClaro, color: C.blanco,
                fontFamily: "'Roboto', sans-serif",
                outline: 'none',
              }} />
          </td>
        ))}
        <td style={{ padding: '6px 12px', textAlign: 'right', color: monto ? C.amarillo : C.grisClaro, fontSize: '12px', fontWeight: monto ? '600' : '400' }}>{monto ? fmt(monto) : '-'}</td>
      </tr>
    )
  }

  if (cargando) return (
    <div style={{ ...estiloBase, padding: '40px', textAlign: 'center', color: C.grisTexto }}>
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
      Cargando...
    </div>
  )

  if (items.length === 0) return (
    <div style={{ ...estiloBase, padding: '60px', textAlign: 'center', color: C.grisTexto, fontSize: '15px' }}>
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
      La planilla de medición se genera desde <b style={{ color: C.blancoSuave }}>Costo Previsto → Generar Planilla de Cotización</b>.
    </div>
  )

  // ─── Estilos de botones reutilizables ──────────────────────────────────────
  const btnBase = {
    fontFamily: "'Roboto', sans-serif",
    fontWeight: '600',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '12px',
    letterSpacing: '0.03em',
    transition: 'all 0.15s',
  }

  return (
    <div style={{ ...estiloBase, background: C.negro, minHeight: '100%', color: C.blanco }}>
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap" rel="stylesheet" />

      {/* ── Barra sticky de controles ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: '#f8f7f4',
        borderBottom: `2px solid ${C.amarillo}`,
        padding: '8px 12px',
        marginBottom: '16px',
        display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <span style={{ fontSize: '11px', color: C.grisTexto, whiteSpace: 'nowrap', fontWeight: '500', letterSpacing: '0.08em' }}>MES:</span>
        <button onClick={() => setMesSeleccionado(null)} style={{
          ...btnBase,
          padding: '3px 10px',
          background: !mesSeleccionado ? C.amarillo : 'transparent',
          color: !mesSeleccionado ? C.negro : C.grisTexto,
          border: `1px solid ${!mesSeleccionado ? C.amarillo : C.grisBorde2}`,
        }}>Todos</button>
        {meses.map(m => (
          <button key={m} onClick={() => setMesSeleccionado(m)} style={{
            ...btnBase,
            padding: '3px 10px',
            background: mesSeleccionado === m ? C.amarillo : 'transparent',
            color: mesSeleccionado === m ? C.negro : C.grisTexto,
            border: `1px solid ${mesSeleccionado === m ? C.amarillo : C.grisBorde2}`,
          }}>M{String(m).padStart(2,'0')}</button>
        ))}

        <div style={{ width: '1px', height: '18px', background: C.grisBorde2 }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', cursor: 'pointer', color: C.grisTexto, userSelect: 'none' }}>
          <input type="checkbox" checked={mostrarPrecios} onChange={e => setMostrarPrecios(e.target.checked)}
            style={{ accentColor: C.amarillo }} /> Precios
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', cursor: 'pointer', color: C.grisTexto, userSelect: 'none' }}>
          <input type="checkbox" checked={mostrarMonto} onChange={e => setMostrarMonto(e.target.checked)}
            style={{ accentColor: C.amarillo }} /> Montos $
        </label>

        <div style={{ width: '1px', height: '18px', background: C.grisBorde2 }} />

        <button onClick={expandirTodo} style={{ ...btnBase, padding: '3px 10px', background: 'transparent', border: `1px solid ${C.grisBorde2}`, color: C.grisTexto }}>▼ Expandir</button>
        <button onClick={colapsarTodo} style={{ ...btnBase, padding: '3px 10px', background: 'transparent', border: `1px solid ${C.grisBorde2}`, color: C.grisTexto }}>▶ Colapsar</button>

        <div style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: '700', color: C.amarillo, whiteSpace: 'nowrap' }}>
          {fmt(totalVenta)}
        </div>
      </div>

      {/* ── Info / leyenda ── */}
      <div style={{ marginBottom: '12px', display: 'flex', gap: '20px', fontSize: '11px', padding: '0 4px', flexWrap: 'wrap' }}>
        {duracionMeses && <span style={{ color: C.grisTexto }}>Duración: <b style={{ color: C.blancoSuave }}>{duracionMeses} meses</b></span>}
        <span style={{ color: C.azulIni, fontWeight: '600' }}>■ Proy. Inicial</span>
        <span style={{ color: C.verdeReal, fontWeight: '600' }}>■ Real</span>
        <span style={{ color: C.naranjaCor, fontWeight: '600' }}>■ Proy. Corregida</span>
      </div>

      {/* ── Botones jefe de obra ── */}
      {esJefe && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <button onClick={() => { setVistaJefe('ver'); setTipoCarga(null) }} style={{
            ...btnBase,
            padding: '10px 20px', fontSize: '13px',
            background: vistaJefe === 'ver' || !vistaJefe ? C.amarillo : 'transparent',
            color: vistaJefe === 'ver' || !vistaJefe ? C.negro : C.amarillo,
            border: `1px solid ${C.amarillo}`,
          }}>
            📊 Ver Avance de Obra
          </button>
          <button onClick={() => { setVistaJefe('cargar'); setTipoCarga(null) }} style={{
            ...btnBase,
            padding: '10px 20px', fontSize: '13px',
            background: vistaJefe === 'cargar' ? C.amarillo : 'transparent',
            color: vistaJefe === 'cargar' ? C.negro : C.amarillo,
            border: `1px solid ${C.amarillo}`,
          }}>
            ✏️ Cargar Avances
          </button>
        </div>
      )}

      {/* ── Panel opciones de carga ── */}
      {esJefe && vistaJefe === 'cargar' && !tipoCarga && (
        <div style={{ background: C.grisPanel, border: `1px solid ${C.grisBorde2}`, borderRadius: '4px', padding: '20px', marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 16px', color: C.amarillo, fontSize: '12px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Cargar Avances</h4>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => abrirCarga('proyeccion_inicial')} disabled={tieneProyInicial} style={{
              ...btnBase, padding: '10px 18px',
              background: tieneProyInicial ? C.grisMedio : 'transparent',
              color: tieneProyInicial ? C.grisTexto : C.azulIni,
              border: `1px solid ${tieneProyInicial ? C.grisBorde : C.azulIni}`,
              cursor: tieneProyInicial ? 'not-allowed' : 'pointer',
            }}>
              {tieneProyInicial ? '✓ Proy. Inicial (ya cargada)' : '📋 Cargar Proyección Inicial'}
            </button>
            <button onClick={() => abrirCarga('real')} disabled={proximoMesReal > (duracionMeses || 0)} style={{
              ...btnBase, padding: '10px 18px',
              background: 'transparent', color: C.verdeReal,
              border: `1px solid ${C.verdeReal}`,
            }}>
              ✅ Medición Real — Mes {String(proximoMesReal).padStart(2,'0')}
            </button>
            <button onClick={() => abrirCarga('proyeccion_corregida')} disabled={!tieneProyInicial} style={{
              ...btnBase, padding: '10px 18px',
              background: tieneProyInicial ? 'transparent' : C.grisMedio,
              color: tieneProyInicial ? C.naranjaCor : C.grisTexto,
              border: `1px solid ${tieneProyInicial ? C.naranjaCor : C.grisBorde}`,
              cursor: tieneProyInicial ? 'pointer' : 'not-allowed',
            }}>
              📊 Proyección Corregida
            </button>
          </div>
        </div>
      )}

      {/* ── Mensajes ── */}
      {error && (
        <div style={{ padding: '10px 16px', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '3px', color: '#f87171', marginBottom: '16px', fontSize: '13px' }}>
          ⚠️ {error}
        </div>
      )}
      {exito && (
        <div style={{ padding: '10px 16px', background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: '3px', color: C.verdeReal, marginBottom: '16px', fontSize: '13px' }}>
          ✓ {exito}
        </div>
      )}

      {/* ── Formulario de carga ── */}
      {tipoCarga && (
        <div style={{ background: C.grisPanel, border: `1px solid ${C.grisBorde2}`, borderRadius: '4px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ margin: 0, color: C.amarillo, fontSize: '12px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {tipoCarga === 'proyeccion_inicial' && 'Proyección Inicial — todos los meses'}
              {tipoCarga === 'real' && `Medición Real — Mes ${String(proximoMesReal).padStart(2,'0')}`}
              {tipoCarga === 'proyeccion_corregida' && `Proyección Corregida — meses futuros`}
            </h4>
            <button onClick={() => setTipoCarga(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.grisTexto, fontSize: '18px', lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: C.negro }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', minWidth: '200px', color: C.grisTexto, fontWeight: '500', fontSize: '11px', letterSpacing: '0.06em' }}>ÍTEM</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: C.grisTexto, fontWeight: '500', fontSize: '11px' }}>PRECIO VENTA</th>
                  {tipoCarga === 'real'
                    ? <th style={{ padding: '8px 12px', textAlign: 'right', background: C.verdeRealBg, color: C.verdeReal, fontSize: '11px' }}>% MES {String(proximoMesReal).padStart(2,'0')}</th>
                    : meses.filter(m => tipoCarga === 'proyeccion_inicial' || !mesesConReal.includes(m)).map(m => (
                        <th key={m} style={{ padding: '8px 6px', textAlign: 'right', fontSize: '10px', whiteSpace: 'nowrap', color: C.grisTexto }}>M{String(m).padStart(2,'0')}</th>
                      ))
                  }
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: C.grisTexto, fontWeight: '500', fontSize: '11px' }}>MONTO PREVIEW</th>
                </tr>
              </thead>
              <tbody>
                {secciones.map((s, si) => {
                  if (s._oculto) return null
                  if (s.esRubro) return (
                    <tr key={`r-${si}`} style={{ background: C.negro }}>
                      <td colSpan={99} style={{ padding: '8px 12px', fontWeight: '700', color: C.amarillo, fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{s.item.descripcion}</td>
                    </tr>
                  )
                  if (s.esItemSuelto) {
                    const it = s.item
                    const mesesEdit = tipoCarga === 'real' ? [proximoMesReal] : meses.filter(m => tipoCarga === 'proyeccion_inicial' || !mesesConReal.includes(m))
                    return renderFilaCarga(it, si, mesesEdit)
                  }
                  // Sección implícita de rubro o título normal — ambas se renderizan igual en el form
                  const mesesEdit = tipoCarga === 'real' ? [proximoMesReal] : meses.filter(m => tipoCarga === 'proyeccion_inicial' || !mesesConReal.includes(m))
                  return (
                    <React.Fragment key={`t-${si}`}>
                      {!s.esSeccionImplicita && (
                        <tr style={{ background: '#1C2840' }}>
                          <td colSpan={99} style={{ padding: '6px 12px', fontWeight: '700', color: '#7EB3E8', fontSize: '11px' }}>{s.item.descripcion}</td>
                        </tr>
                      )}
                      {s.items.map((it, fi) => renderFilaCarga(it, fi, mesesEdit))}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button onClick={() => setTipoCarga(null)} style={{ ...btnBase, padding: '8px 20px', fontSize: '13px', background: 'transparent', border: `1px solid ${C.grisBorde2}`, color: C.grisTexto }}>Cancelar</button>
            <button onClick={guardar} disabled={guardando} style={{
              ...btnBase, padding: '8px 24px', fontSize: '13px',
              background: guardando ? C.grisClaro : C.amarillo,
              color: guardando ? C.grisTexto : C.negro,
              border: 'none',
              cursor: guardando ? 'not-allowed' : 'pointer',
              opacity: guardando ? 0.7 : 1,
            }}>
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
              <tr style={{ background: C.negro, borderBottom: `2px solid ${C.amarillo}` }}>
                <th style={{ padding: '9px 12px', textAlign: 'left', minWidth: '200px', color: C.grisTexto, fontWeight: '500', fontSize: '10px', letterSpacing: '0.08em' }}>DESCRIPCIÓN</th>
                {mostrarPrecios && <th style={{ padding: '9px 6px', textAlign: 'right', fontSize: '10px', color: C.grisTexto }}>UNID.</th>}
                {mostrarPrecios && <th style={{ padding: '9px 6px', textAlign: 'right', fontSize: '10px', color: C.grisTexto }}>CANT.</th>}
                {mostrarPrecios && <th style={{ padding: '9px 6px', textAlign: 'right', fontSize: '10px', color: C.grisTexto }}>P.V.</th>}
                {mesesVisibles.map(m => (
                  tiposVisibles.map(tv => (
                    <React.Fragment key={`${m}-${tv.tipo}`}>
                      <th style={{ padding: '9px 3px', textAlign: 'right', fontSize: '9px', whiteSpace: 'nowrap', background: tv.bgHeader, color: tv.color, fontWeight: '700' }}>
                        M{String(m).padStart(2,'0')} {tv.label}
                      </th>
                      {mostrarMonto && <th style={{ padding: '9px 3px', textAlign: 'right', fontSize: '9px', whiteSpace: 'nowrap', background: tv.bgHeader, color: tv.color, opacity: 0.7 }}>$</th>}
                    </React.Fragment>
                  ))
                ))}
              </tr>
            </thead>
            <tbody>
              {secciones.map((s, si) => {
                if (s._oculto) return null

                if (s.esRubro) return (
                  <tr key={`r-${si}`} style={{ background: C.negro, borderTop: `1px solid ${C.amarillo}`, borderBottom: `1px solid ${C.grisBorde}` }}>
                    <td colSpan={99} style={{ padding: '9px 12px', fontWeight: '900', color: C.amarillo, fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      {s.item.descripcion}
                    </td>
                  </tr>
                )

                if (s.esItemSuelto) return renderItemRow(s.item, si)

                // Sección colapsable (título o implícita de rubro)
                return renderSeccionColapsable(s, si)
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default PlanillaMedicion