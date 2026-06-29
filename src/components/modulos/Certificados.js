import React, { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../supabaseClient'

function Certificados({ obra, perfil }) {
  const [items, setItems] = useState([])
  const [avances, setAvances] = useState([])
  const [certificados, setCertificados] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [exito, setExito] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [vista, setVista] = useState('lista')
  const [certActual, setCertActual] = useState(null)

  const [desaciopioPct, setDesaciopioPct] = useState('')
  const [indiceBaseMes, setIndiceBaseMes] = useState('')
  const [indiceBaseValor, setIndiceBaseValor] = useState('')
  const [ajusteMesTexto, setAjusteMesTexto] = useState('')
  const [ajusteMesValor, setAjusteMesValor] = useState('')

  const esJefe    = perfil?.area === 'jefe_obra'
  const esAdmin   = perfil?.area === 'administracion'
  const esCompras = perfil?.area === 'compras'

  useEffect(() => { cargarDatos() }, [obra.id]) // eslint-disable-line

  async function cargarDatos() {
    setCargando(true)
    const { data: itemsData }  = await supabase.from('planilla_items').select('*').eq('obra_id', obra.id).order('orden', { ascending: true })
    const { data: avancesData }= await supabase.from('medicion_avances').select('*').eq('obra_id', obra.id)
    const { data: certsData }  = await supabase.from('certificados').select('*').eq('obra_id', obra.id).order('numero', { ascending: true })
    setItems(itemsData || [])
    setAvances(avancesData || [])
    setCertificados(certsData || [])
    setCargando(false)
  }

  const mesesConReal      = [...new Set(avances.filter(a => a.tipo === 'real').map(a => a.mes))].sort((a,b) => a-b)
  const mesesCertificados = certificados.map(c => c.mes)
  const proximoMesCert    = mesesConReal.find(m => !mesesCertificados.includes(m))

  function construirFilas(mes) {
    const filas = []
    let itemNum = 1
    for (const it of items) {
      if (it.tipo === 'rubro') {
        const itemsDirectos = []
        for (const it2 of items) {
          if (it2.tipo === 'item') {
            const idxRubro = items.indexOf(it)
            const idxItem  = items.indexOf(it2)
            const idxSig   = items.findIndex((x, i) => i > idxRubro && (x.tipo === 'titulo' || x.tipo === 'rubro'))
            if (idxItem > idxRubro && (idxSig === -1 || idxItem < idxSig)) itemsDirectos.push(it2)
          }
        }
        if (itemsDirectos.length > 0) {
          const totalRubro = itemsDirectos.reduce((s, i) => s + (i.precio_venta || 0), 0)
          const certPrev   = certificados.filter(c => c.mes < mes).sort((a,b) => b.mes - a.mes)[0]
          const pctAcumAnterior = certPrev
            ? itemsDirectos.reduce((s, i) => { const av = avances.find(a => a.planilla_item_id === i.id && a.mes === certPrev.mes && a.tipo === 'real'); return s + (av?.porcentaje || 0) * (i.precio_venta || 0) }, 0) / (totalRubro || 1) : 0
          const pctAcumActual   = itemsDirectos.reduce((s, i) => { const av = avances.find(a => a.planilla_item_id === i.id && a.mes === mes && a.tipo === 'real'); return s + (av?.porcentaje || 0) * (i.precio_venta || 0) }, 0) / (totalRubro || 1)
          filas.push({ num: itemNum++, descripcion: it.descripcion, precioTotal: totalRubro, pctAcumAnterior, pctAvanceActual: pctAcumActual - pctAcumAnterior, pctAcumActual })
        }
      } else if (it.tipo === 'titulo') {
        const itemsDelTitulo = []
        const idxTitulo = items.indexOf(it)
        for (const it2 of items) {
          if (it2.tipo === 'item') {
            const idxItem = items.indexOf(it2)
            const idxSig  = items.findIndex((x, i) => i > idxTitulo && (x.tipo === 'titulo' || x.tipo === 'rubro'))
            if (idxItem > idxTitulo && (idxSig === -1 || idxItem < idxSig)) itemsDelTitulo.push(it2)
          }
        }
        if (itemsDelTitulo.length > 0) {
          const totalTitulo     = itemsDelTitulo.reduce((s, i) => s + (i.precio_venta || 0), 0)
          const certPrev        = certificados.filter(c => c.mes < mes).sort((a,b) => b.mes - a.mes)[0]
          const pctAcumAnterior = certPrev
            ? itemsDelTitulo.reduce((s, i) => { const av = avances.find(a => a.planilla_item_id === i.id && a.mes === certPrev.mes && a.tipo === 'real'); return s + (av?.porcentaje || 0) * (i.precio_venta || 0) }, 0) / (totalTitulo || 1) : 0
          const pctAcumActual   = itemsDelTitulo.reduce((s, i) => { const av = avances.find(a => a.planilla_item_id === i.id && a.mes === mes && a.tipo === 'real'); return s + (av?.porcentaje || 0) * (i.precio_venta || 0) }, 0) / (totalTitulo || 1)
          filas.push({ num: itemNum++, descripcion: it.descripcion, precioTotal: totalTitulo, pctAcumAnterior, pctAvanceActual: pctAcumActual - pctAcumAnterior, pctAcumActual })
        }
      }
    }
    return filas
  }

  function calcularTotales(filas, cert) {
    const totalObra    = filas.reduce((s, f) => s + f.precioTotal, 0)
    const obraBasica   = filas.reduce((s, f) => s + f.pctAvanceActual * f.precioTotal, 0)
    const desacopioPct = parseFloat(cert?.desacopio_pct || desaciopioPct || 0) / 100
    const desacopio    = obraBasica * desacopioPct
    const montoCert    = obraBasica - desacopio
    const indiceBase   = parseFloat(cert?.indice_base_valor || indiceBaseValor || 0)
    const ajusteMes    = parseFloat(cert?.ajuste_mes_valor  || ajusteMesValor  || 0)
    const indiceAjuste = indiceBase > 0 ? (ajusteMes - indiceBase) / indiceBase : 0
    const ajusteCert   = montoCert * indiceAjuste
    const montoTotal   = montoCert + ajusteCert
    return { totalObra, obraBasica, desacopio, montoCert, indiceAjuste, ajusteCert, montoTotal }
  }

  async function guardarCertificado() {
    setGuardando(true); setError(null)
    try {
      if (!proximoMesCert) throw new Error('No hay medición real disponible para certificar.')
      const numero   = certificados.length + 1
      const certPrev = certificados[certificados.length - 1]
      const { error: insErr } = await supabase.from('certificados').insert({
        obra_id: obra.id, numero, mes: proximoMesCert,
        fecha: new Date().toISOString().split('T')[0],
        desacopio_pct:     parseFloat(desaciopioPct    || certPrev?.desacopio_pct    || 0),
        indice_base_mes:   indiceBaseMes || certPrev?.indice_base_mes || '',
        indice_base_valor: parseFloat(indiceBaseValor  || certPrev?.indice_base_valor || 0),
        ajuste_mes_texto:  ajusteMesTexto,
        ajuste_mes_valor:  parseFloat(ajusteMesValor   || 0),
      })
      if (insErr) throw new Error('Error guardando certificado: ' + insErr.message)
      setExito(`Certificado N° ${numero} generado correctamente.`)
      setVista('lista'); resetForm(); await cargarDatos()
    } catch (err) { setError(err.message) }
    setGuardando(false)
  }

  function resetForm() { setDesaciopioPct(''); setIndiceBaseMes(''); setIndiceBaseValor(''); setAjusteMesTexto(''); setAjusteMesValor('') }

  function abrirNuevo() {
    const certPrev = certificados[certificados.length - 1]
    if (certPrev) { setDesaciopioPct(String(certPrev.desacopio_pct || '')); setIndiceBaseMes(certPrev.indice_base_mes || ''); setIndiceBaseValor(String(certPrev.indice_base_valor || '')) }
    setVista('nuevo'); setError(null); setExito(null)
  }

  function descargarExcel(cert) {
    const mes    = cert.mes
    const filas  = construirFilas(mes)
    const totales = calcularTotales(filas, cert)
    const fmtPct = (n) => (Number(n) * 100).toFixed(2) + '%'
    const fmtNum = (n) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const wb = XLSX.utils.book_new()
    const data = []
    data.push(['CERTIFICADO DE OBRA', '', '', '', '', '', '', '', ''])
    data.push([]); data.push([])
    data.push(['', obra.nombre, '', '', '', '', '', '', `N° ${cert.numero}`])
    data.push(['', obra.es_obra_basica ? 'Obra Básica' : 'Obra Adicional', '', '', '', '', '', '', cert.fecha])
    data.push(['', obra.codigo, '', '', '', '', '', '', '']); data.push([])
    data.push(['ITEM', 'DESCRIPCIÓN', 'PRECIO TOTAL', '% ACUM. ANTERIOR', '% AVANCE ACTUAL', '% ACUM. ACTUAL', 'MONTO ACUM. ANTERIOR', 'MONTO AVANCE ACTUAL', 'MONTO ACUM. ACTUAL'])
    for (const f of filas) data.push([f.num, f.descripcion, f.precioTotal, fmtPct(f.pctAcumAnterior), fmtPct(f.pctAvanceActual), fmtPct(f.pctAcumActual), fmtNum(f.pctAcumAnterior * f.precioTotal), fmtNum(f.pctAvanceActual * f.precioTotal), fmtNum(f.pctAcumActual * f.precioTotal)])
    data.push(['', 'PRECIO TOTAL', fmtNum(totales.totalObra), '', '', '', '', '', '']); data.push([])
    data.push(['', 'OBRA BÁSICA', fmtNum(totales.obraBasica)]); data.push(['', 'DESACOPIO', fmtNum(totales.desacopio)]); data.push(['', 'MONTO DEL CERTIFICADO', fmtNum(totales.montoCert)]); data.push(['', 'AJUSTE', fmtNum(totales.ajusteCert)]); data.push(['', 'MONTO TOTAL A COBRAR', fmtNum(totales.montoTotal)]); data.push([])
    data.push(['', 'MONTO DE CERTIFICADO', fmtNum(totales.montoCert)]); data.push(['', `ÍNDICE BASE (${cert.indice_base_mes})`, fmtNum(cert.indice_base_valor)]); data.push(['', `AJUSTE MES (${cert.ajuste_mes_texto})`, fmtNum(cert.ajuste_mes_valor)]); data.push(['', 'ÍNDICE DE AJUSTE', fmtPct(totales.indiceAjuste)]); data.push(['', 'AJUSTE CERTIFICADO', fmtNum(totales.ajusteCert)])
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [6, 40, 18, 18, 18, 18, 18, 18, 18].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, ws, `Certificado ${cert.numero}`)
    XLSX.writeFile(wb, `Certificado_${cert.numero}_${obra.nombre.replace(/\s+/g,'_')}.xlsx`)
  }

  const fmt    = (n) => n != null ? '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
  const fmtPct = (n) => (Number(n) * 100).toFixed(2) + '%'

  // ── Estilos compartidos ──────────────────────────────────
  const inputStyle  = { width: '100%', padding: '8px 10px', border: '1px solid var(--c-border)', borderRadius: '6px', fontSize: '13px', color: 'var(--c-text)', background: 'white' }
  const labelStyle  = { fontSize: '12px', color: 'var(--c-text3)', display: 'block', marginBottom: '4px' }
  const btnPrimary  = (disabled) => ({ padding: '8px 24px', background: disabled ? 'var(--c-border)' : 'var(--c-gold)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 })
  const btnSecondary= { padding: '8px 20px', background: 'white', border: '1px solid var(--c-border)', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', color: 'var(--c-text2)' }
  const btnBlue     = { padding: '6px 14px', background: 'var(--c-gold)', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '12px', cursor: 'pointer' }
  const panelStyle  = { background: 'var(--c-surface2)', border: '1px solid var(--c-border)', borderRadius: '10px', padding: '16px' }
  const thStyle     = { padding: '8px', textAlign: 'right' }
  const thLeftStyle = { padding: '8px', textAlign: 'left' }

  function TablaItemsHeader() {
    return (
      <tr style={{ background: 'var(--c-text)', color: 'white' }}>
        <th style={thLeftStyle}>N°</th>
        <th style={{ ...thLeftStyle, minWidth: '200px' }}>Descripción</th>
        <th style={thStyle}>Precio Total</th>
        <th style={thStyle}>% Acum. Ant.</th>
        <th style={{ ...thStyle, background: 'var(--c-gold)' }}>% Avance Act.</th>
        <th style={thStyle}>% Acum. Act.</th>
        <th style={thStyle}>$ Acum. Ant.</th>
        <th style={{ ...thStyle, background: 'var(--c-gold)' }}>$ Avance Act.</th>
        <th style={thStyle}>$ Acum. Act.</th>
      </tr>
    )
  }

  function FilaItem({ f, i }) {
    return (
      <tr style={{ background: i % 2 === 0 ? 'white' : 'var(--c-surface2)', borderBottom: '1px solid var(--c-border)' }}>
        <td style={{ padding: '7px 8px', color: 'var(--c-text3)' }}>{f.num}</td>
        <td style={{ padding: '7px 8px', fontWeight: '500', color: 'var(--c-text)' }}>{f.descripcion}</td>
        <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--c-text2)' }}>{fmt(f.precioTotal)}</td>
        <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--c-text3)' }}>{fmtPct(f.pctAcumAnterior)}</td>
        <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--c-gold)', fontWeight: '600' }}>{fmtPct(f.pctAvanceActual)}</td>
        <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--c-text2)' }}>{fmtPct(f.pctAcumActual)}</td>
        <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--c-text3)' }}>{fmt(f.pctAcumAnterior * f.precioTotal)}</td>
        <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--c-gold)', fontWeight: '600' }}>{fmt(f.pctAvanceActual * f.precioTotal)}</td>
        <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: '600', color: 'var(--c-text)' }}>{fmt(f.pctAcumActual * f.precioTotal)}</td>
      </tr>
    )
  }

  function FilaTotalTabla({ filas, totales }) {
    return (
      <tr style={{ background: 'var(--c-text)', color: 'white' }}>
        <td colSpan={2} style={{ padding: '8px', fontWeight: '700' }}>PRECIO TOTAL</td>
        <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmt(totales.totalObra)}</td>
        <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmtPct(filas.reduce((s,f) => s + f.pctAcumAnterior * f.precioTotal, 0) / (totales.totalObra || 1))}</td>
        <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmtPct(filas.reduce((s,f) => s + f.pctAvanceActual * f.precioTotal, 0) / (totales.totalObra || 1))}</td>
        <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmtPct(filas.reduce((s,f) => s + f.pctAcumActual * f.precioTotal, 0) / (totales.totalObra || 1))}</td>
        <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmt(filas.reduce((s,f) => s + f.pctAcumAnterior * f.precioTotal, 0))}</td>
        <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmt(filas.reduce((s,f) => s + f.pctAvanceActual * f.precioTotal, 0))}</td>
        <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmt(filas.reduce((s,f) => s + f.pctAcumActual * f.precioTotal, 0))}</td>
      </tr>
    )
  }

  if (cargando) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--c-text3)' }}>Cargando...</div>

  if (items.length === 0) return (
    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--c-text3)' }}>
      Primero generá la Planilla de Cotización desde Costo Previsto.
    </div>
  )

  // ── Vista: Nuevo certificado ───────────────────────────
  if (vista === 'nuevo') {
    const filas      = construirFilas(proximoMesCert)
    const certPrev   = certificados[certificados.length - 1]
    const desacPct   = parseFloat(desaciopioPct || certPrev?.desacopio_pct || 0)
    const totales    = calcularTotales(filas, { desacopio_pct: desacPct, indice_base_valor: parseFloat(indiceBaseValor || certPrev?.indice_base_valor || 0), ajuste_mes_valor: parseFloat(ajusteMesValor || 0) })
    const numeroCert = certificados.length + 1

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, color: 'var(--c-text)' }}>Certificado N° {numeroCert} — Mes {String(proximoMesCert).padStart(2,'0')}</h3>
          <button onClick={() => { setVista('lista'); resetForm() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text3)', fontSize: '18px' }}>✕</button>
        </div>

        {error && <div style={{ padding: '10px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: 'var(--c-danger)', marginBottom: '16px', fontSize: '14px' }}>⚠️ {error}</div>}

        {/* Campos variables */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px', ...panelStyle }}>
          {[
            { label: 'Desacopio (%)', val: desaciopioPct, set: setDesaciopioPct, type: 'number', ph: 'ej: 5' },
            { label: 'Índice Base (mes/año)', val: indiceBaseMes, set: setIndiceBaseMes, type: 'text', ph: 'ej: Enero 2024' },
            { label: 'Valor Índice Base', val: indiceBaseValor, set: setIndiceBaseValor, type: 'number', ph: 'ej: 1000' },
            { label: 'Ajuste Mes (texto)', val: ajusteMesTexto, set: setAjusteMesTexto, type: 'text', ph: 'ej: Junio 2026' },
            { label: 'Valor Ajuste Mes', val: ajusteMesValor, set: setAjusteMesValor, type: 'number', ph: 'ej: 1350' },
          ].map(f => (
            <div key={f.label}>
              <label style={labelStyle}>{f.label}</label>
              <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} style={inputStyle} />
            </div>
          ))}
        </div>

        {/* Tabla ítems */}
        <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead><TablaItemsHeader /></thead>
            <tbody>
              {filas.map((f, i) => <FilaItem key={i} f={f} i={i} />)}
              <FilaTotalTabla filas={filas} totales={totales} />
            </tbody>
          </table>
        </div>

        {/* Resumen y ajuste */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div style={panelStyle}>
            <h4 style={{ margin: '0 0 12px', color: 'var(--c-text)', fontSize: '13px' }}>Resumen del Certificado</h4>
            {[
              { label: 'Obra Básica',               valor: totales.obraBasica,  bold: false },
              { label: `Desacopio (${desacPct}%)`,  valor: -totales.desacopio,  bold: false },
              { label: 'Monto del Certificado',      valor: totales.montoCert,   bold: true },
              { label: 'Ajuste',                     valor: totales.ajusteCert,  bold: false },
              { label: 'Monto Total a Cobrar',       valor: totales.montoTotal,  bold: true, highlight: true },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 4 ? '1px solid var(--c-border)' : 'none' }}>
                <span style={{ fontSize: '13px', color: 'var(--c-text2)', fontWeight: r.bold ? '700' : '400' }}>{r.label}</span>
                <span style={{ fontSize: '13px', fontWeight: r.bold ? '700' : '400', color: r.highlight ? 'var(--c-success)' : r.valor < 0 ? 'var(--c-danger)' : 'var(--c-text)' }}>{fmt(Math.abs(r.valor))}</span>
              </div>
            ))}
          </div>
          <div style={panelStyle}>
            <h4 style={{ margin: '0 0 12px', color: 'var(--c-text)', fontSize: '13px' }}>Cuadro de Ajuste</h4>
            {[
              { label: 'Monto de Certificado',                valor: fmt(totales.montoCert) },
              { label: `Índice Base (${indiceBaseMes || '—'})`, valor: indiceBaseValor || '—' },
              { label: `Ajuste Mes (${ajusteMesTexto || '—'})`, valor: ajusteMesValor  || '—' },
              { label: 'Índice de Ajuste',                    valor: fmtPct(totales.indiceAjuste) },
              { label: 'Ajuste Certificado',                  valor: fmt(totales.ajusteCert) },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 4 ? '1px solid var(--c-border)' : 'none' }}>
                <span style={{ fontSize: '13px', color: 'var(--c-text2)' }}>{r.label}</span>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--c-text)' }}>{r.valor}</span>
              </div>
            ))}
          </div>
        </div>

        {esJefe && (
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button onClick={() => { setVista('lista'); resetForm() }} style={btnSecondary}>Cancelar</button>
            <button onClick={guardarCertificado} disabled={guardando} style={btnPrimary(guardando)}>
              {guardando ? 'Guardando...' : '✓ Confirmar y Guardar Certificado'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Vista: Ver certificado ─────────────────────────────
  if (vista === 'ver' && certActual) {
    const filas   = construirFilas(certActual.mes)
    const totales = calcularTotales(filas, certActual)

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <h3 style={{ margin: 0, color: 'var(--c-text)' }}>Certificado N° {certActual.numero} — {certActual.fecha}</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => descargarExcel(certActual)} style={btnBlue}>⬇ Descargar Excel</button>
            <button onClick={() => { setVista('lista'); setCertActual(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text3)', fontSize: '18px' }}>✕</button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead><TablaItemsHeader /></thead>
            <tbody>
              {filas.map((f, i) => <FilaItem key={i} f={f} i={i} />)}
              <FilaTotalTabla filas={filas} totales={totales} />
            </tbody>
          </table>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={panelStyle}>
            <h4 style={{ margin: '0 0 12px', color: 'var(--c-text)', fontSize: '13px' }}>Resumen</h4>
            {[
              { label: 'Obra Básica',                         valor: fmt(totales.obraBasica) },
              { label: `Desacopio (${certActual.desacopio_pct}%)`, valor: fmt(totales.desacopio) },
              { label: 'Monto del Certificado',               valor: fmt(totales.montoCert) },
              { label: 'Ajuste',                              valor: fmt(totales.ajusteCert) },
              { label: 'Monto Total a Cobrar',                valor: fmt(totales.montoTotal) },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 4 ? '1px solid var(--c-border)' : 'none' }}>
                <span style={{ fontSize: '13px', color: 'var(--c-text2)' }}>{r.label}</span>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--c-text)' }}>{r.valor}</span>
              </div>
            ))}
          </div>
          <div style={panelStyle}>
            <h4 style={{ margin: '0 0 12px', color: 'var(--c-text)', fontSize: '13px' }}>Cuadro de Ajuste</h4>
            {[
              { label: 'Monto de Certificado',                    valor: fmt(totales.montoCert) },
              { label: `Índice Base (${certActual.indice_base_mes})`, valor: certActual.indice_base_valor },
              { label: `Ajuste Mes (${certActual.ajuste_mes_texto})`,  valor: certActual.ajuste_mes_valor },
              { label: 'Índice de Ajuste',                        valor: fmtPct(totales.indiceAjuste) },
              { label: 'Ajuste Certificado',                      valor: fmt(totales.ajusteCert) },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 4 ? '1px solid var(--c-border)' : 'none' }}>
                <span style={{ fontSize: '13px', color: 'var(--c-text2)' }}>{r.label}</span>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--c-text)' }}>{r.valor}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Vista: Lista ───────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, color: 'var(--c-text)' }}>Certificados de Obra</h3>
        {esJefe && proximoMesCert && (
          <button onClick={abrirNuevo} style={btnPrimary(false)}>
            + Nuevo Certificado (Mes {String(proximoMesCert).padStart(2,'0')})
          </button>
        )}
      </div>

      {error && <div style={{ padding: '10px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: 'var(--c-danger)', marginBottom: '16px', fontSize: '14px' }}>⚠️ {error}</div>}
      {exito && <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', color: 'var(--c-success)', marginBottom: '16px', fontSize: '14px' }}>✓ {exito}</div>}

      {!esJefe && !esAdmin && !esCompras && <p style={{ color: 'var(--c-text3)' }}>No tenés acceso a esta sección.</p>}

      {certificados.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--c-text3)', fontSize: '14px' }}>
          {esJefe && proximoMesCert ? 'No hay certificados aún. Creá el primero.' : 'Aún no hay certificados generados para esta obra.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {certificados.map(cert => {
            const filas   = construirFilas(cert.mes)
            const totales = calcularTotales(filas, cert)
            return (
              <div key={cert.id} style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: '10px', padding: '16px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ background: 'var(--c-text)', color: 'white', borderRadius: '6px', padding: '6px 14px', fontWeight: '700', fontSize: '13px', whiteSpace: 'nowrap' }}>
                  N° {cert.numero}
                </div>
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--c-text3)' }}>Mes {String(cert.mes).padStart(2,'0')} · {cert.fecha}</div>
                  <div style={{ fontWeight: '700', color: 'var(--c-success)', fontSize: '15px' }}>{fmt(totales.montoTotal)}</div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--c-text2)' }}>Obra Básica: {fmt(totales.obraBasica)}</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => { setCertActual(cert); setVista('ver') }} style={{ ...btnSecondary, padding: '6px 14px', fontSize: '12px' }}>Ver</button>
                  <button onClick={() => descargarExcel(cert)} style={{ ...btnBlue }}>⬇ Excel</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Certificados