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
  const [vista, setVista] = useState('lista') // 'lista' | 'nuevo' | 'ver'
  const [certActual, setCertActual] = useState(null)

  // Campos del formulario
  const [desaciopioPct, setDesaciopioPct] = useState('')
  const [indiceBaseMes, setIndiceBaseMes] = useState('')
  const [indiceBaseValor, setIndiceBaseValor] = useState('')
  const [ajusteMesTexto, setAjusteMesTexto] = useState('')
  const [ajusteMesValor, setAjusteMesValor] = useState('')

  const esJefe  = perfil?.area === 'jefe_obra'
  const esAdmin = perfil?.area === 'administracion'
  const esCompras = perfil?.area === 'compras'

  useEffect(() => {
    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obra.id])

  async function cargarDatos() {
    setCargando(true)
    const { data: itemsData } = await supabase
      .from('planilla_items').select('*').eq('obra_id', obra.id).order('orden', { ascending: true })
    const { data: avancesData } = await supabase
      .from('medicion_avances').select('*').eq('obra_id', obra.id)
    const { data: certsData } = await supabase
      .from('certificados').select('*').eq('obra_id', obra.id).order('numero', { ascending: true })

    setItems(itemsData || [])
    setAvances(avancesData || [])
    setCertificados(certsData || [])
    setCargando(false)
  }

  // Meses con medición real cargada
  const mesesConReal = [...new Set(avances.filter(a => a.tipo === 'real').map(a => a.mes))].sort((a,b) => a-b)
  const mesesCertificados = certificados.map(c => c.mes)
  const proximoMesCert = mesesConReal.find(m => !mesesCertificados.includes(m))

  // Construir filas del certificado para un mes dado
  function construirFilas(mes) {
    const filas = []
    let itemNum = 1

    for (const it of items) {
      if (it.tipo === 'rubro') {
        // TAREAS PRELIMINARES — incluir ítems directos
        const itemsDirectos = []
        for (const it2 of items) {
          if (it2.tipo === 'item') {
            const idxRubro = items.indexOf(it)
            const idxItem  = items.indexOf(it2)
            const idxSigTitulo = items.findIndex((x, i) => i > idxRubro && (x.tipo === 'titulo' || x.tipo === 'rubro'))
            if (idxItem > idxRubro && (idxSigTitulo === -1 || idxItem < idxSigTitulo)) {
              itemsDirectos.push(it2)
            }
          }
        }
        if (itemsDirectos.length > 0) {
          const totalRubro = itemsDirectos.reduce((s, i) => s + (i.precio_venta || 0), 0)
          // % acumulado anterior (del certificado previo)
          const certPrev = certificados.filter(c => c.mes < mes).sort((a,b) => b.mes - a.mes)[0]
          const pctAcumAnterior = certPrev
            ? itemsDirectos.reduce((s, i) => {
                const av = avances.find(a => a.planilla_item_id === i.id && a.mes === certPrev.mes && a.tipo === 'real')
                return s + (av?.porcentaje || 0) * (i.precio_venta || 0)
              }, 0) / (totalRubro || 1)
            : 0
          // % acumulado actual
          const pctAcumActual = itemsDirectos.reduce((s, i) => {
            const av = avances.find(a => a.planilla_item_id === i.id && a.mes === mes && a.tipo === 'real')
            return s + (av?.porcentaje || 0) * (i.precio_venta || 0)
          }, 0) / (totalRubro || 1)

          filas.push({
            num: itemNum++,
            descripcion: it.descripcion,
            precioTotal: totalRubro,
            pctAcumAnterior,
            pctAvanceActual: pctAcumActual - pctAcumAnterior,
            pctAcumActual,
          })
        }
      } else if (it.tipo === 'titulo') {
        const itemsDelTitulo = []
        const idxTitulo = items.indexOf(it)
        for (const it2 of items) {
          if (it2.tipo === 'item') {
            const idxItem = items.indexOf(it2)
            const idxSigTitulo = items.findIndex((x, i) => i > idxTitulo && (x.tipo === 'titulo' || x.tipo === 'rubro'))
            if (idxItem > idxTitulo && (idxSigTitulo === -1 || idxItem < idxSigTitulo)) {
              itemsDelTitulo.push(it2)
            }
          }
        }
        if (itemsDelTitulo.length > 0) {
          const totalTitulo = itemsDelTitulo.reduce((s, i) => s + (i.precio_venta || 0), 0)
          const certPrev = certificados.filter(c => c.mes < mes).sort((a,b) => b.mes - a.mes)[0]
          const pctAcumAnterior = certPrev
            ? itemsDelTitulo.reduce((s, i) => {
                const av = avances.find(a => a.planilla_item_id === i.id && a.mes === certPrev.mes && a.tipo === 'real')
                return s + (av?.porcentaje || 0) * (i.precio_venta || 0)
              }, 0) / (totalTitulo || 1)
            : 0
          const pctAcumActual = itemsDelTitulo.reduce((s, i) => {
            const av = avances.find(a => a.planilla_item_id === i.id && a.mes === mes && a.tipo === 'real')
            return s + (av?.porcentaje || 0) * (i.precio_venta || 0)
          }, 0) / (totalTitulo || 1)

          filas.push({
            num: itemNum++,
            descripcion: it.descripcion,
            precioTotal: totalTitulo,
            pctAcumAnterior,
            pctAvanceActual: pctAcumActual - pctAcumAnterior,
            pctAcumActual,
          })
        }
      }
    }
    return filas
  }

  function calcularTotales(filas, cert) {
    const totalObra = filas.reduce((s, f) => s + f.precioTotal, 0)
    const obraBasica = filas.reduce((s, f) => s + f.pctAvanceActual * f.precioTotal, 0)
    const desacopioPct = parseFloat(cert?.desacopio_pct || desaciopioPct || 0) / 100
    const desacopio = obraBasica * desacopioPct
    const montoCert = obraBasica - desacopio
    const indiceBase = parseFloat(cert?.indice_base_valor || indiceBaseValor || 0)
    const ajusteMes  = parseFloat(cert?.ajuste_mes_valor  || ajusteMesValor  || 0)
    const indiceAjuste = indiceBase > 0 ? (ajusteMes - indiceBase) / indiceBase : 0
    const ajusteCert = montoCert * indiceAjuste
    const montoTotal = montoCert + ajusteCert
    return { totalObra, obraBasica, desacopio, montoCert, indiceAjuste, ajusteCert, montoTotal }
  }

  async function guardarCertificado() {
    setGuardando(true)
    setError(null)
    try {
      if (!proximoMesCert) throw new Error('No hay medición real disponible para certificar.')
      const numero = certificados.length + 1

      // Precargar índices del certificado anterior si existen
      const certPrev = certificados[certificados.length - 1]

      const { error: insErr } = await supabase.from('certificados').insert({
        obra_id: obra.id,
        numero,
        mes: proximoMesCert,
        fecha: new Date().toISOString().split('T')[0],
        desacopio_pct: parseFloat(desaciopioPct || certPrev?.desacopio_pct || 0),
        indice_base_mes: indiceBaseMes || certPrev?.indice_base_mes || '',
        indice_base_valor: parseFloat(indiceBaseValor || certPrev?.indice_base_valor || 0),
        ajuste_mes_texto: ajusteMesTexto,
        ajuste_mes_valor: parseFloat(ajusteMesValor || 0),
      })
      if (insErr) throw new Error('Error guardando certificado: ' + insErr.message)

      setExito(`Certificado N° ${numero} generado correctamente.`)
      setVista('lista')
      resetForm()
      await cargarDatos()
    } catch (err) {
      setError(err.message)
    }
    setGuardando(false)
  }

  function resetForm() {
    setDesaciopioPct('')
    setIndiceBaseMes('')
    setIndiceBaseValor('')
    setAjusteMesTexto('')
    setAjusteMesValor('')
  }

  function abrirNuevo() {
    const certPrev = certificados[certificados.length - 1]
    if (certPrev) {
      setDesaciopioPct(String(certPrev.desacopio_pct || ''))
      setIndiceBaseMes(certPrev.indice_base_mes || '')
      setIndiceBaseValor(String(certPrev.indice_base_valor || ''))
    }
    setVista('nuevo')
    setError(null)
    setExito(null)
  }

  function descargarExcel(cert) {
    const mes = cert.mes
    const filas = construirFilas(mes)
    const totales = calcularTotales(filas, cert)
    const fmtPct = (n) => (Number(n) * 100).toFixed(2) + '%'
    const fmtNum = (n) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    const wb = XLSX.utils.book_new()
    const data = []

    // Fila 1: Título
    data.push(['CERTIFICADO DE OBRA', '', '', '', '', '', '', '', ''])
    data.push([])
    data.push([])
    // Fila 4: datos obra
    data.push(['', obra.nombre, '', '', '', '', '', '', `N° ${cert.numero}`])
    data.push(['', obra.es_obra_basica ? 'Obra Básica' : 'Obra Adicional', '', '', '', '', '', '', cert.fecha])
    data.push(['', obra.codigo, '', '', '', '', '', '', ''])
    data.push([])
    // Encabezado tabla
    data.push([
      'ITEM', 'DESCRIPCIÓN', 'PRECIO TOTAL',
      '% ACUM. ANTERIOR', '% AVANCE ACTUAL', '% ACUM. ACTUAL',
      'MONTO ACUM. ANTERIOR', 'MONTO AVANCE ACTUAL', 'MONTO ACUM. ACTUAL'
    ])
    // Filas de ítems
    for (const f of filas) {
      data.push([
        f.num,
        f.descripcion,
        f.precioTotal,
        fmtPct(f.pctAcumAnterior),
        fmtPct(f.pctAvanceActual),
        fmtPct(f.pctAcumActual),
        fmtNum(f.pctAcumAnterior * f.precioTotal),
        fmtNum(f.pctAvanceActual * f.precioTotal),
        fmtNum(f.pctAcumActual * f.precioTotal),
      ])
    }
    // Total
    data.push(['', 'PRECIO TOTAL', fmtNum(totales.totalObra), '', '', '', '', '', ''])
    data.push([])
    // Resumen
    data.push(['', 'OBRA BÁSICA', fmtNum(totales.obraBasica)])
    data.push(['', 'DESACOPIO', fmtNum(totales.desacopio)])
    data.push(['', 'MONTO DEL CERTIFICADO', fmtNum(totales.montoCert)])
    data.push(['', 'AJUSTE', fmtNum(totales.ajusteCert)])
    data.push(['', 'MONTO TOTAL A COBRAR', fmtNum(totales.montoTotal)])
    data.push([])
    // Cuadro de ajuste
    data.push(['', 'MONTO DE CERTIFICADO', fmtNum(totales.montoCert)])
    data.push(['', `ÍNDICE BASE (${cert.indice_base_mes})`, fmtNum(cert.indice_base_valor)])
    data.push(['', `AJUSTE MES (${cert.ajuste_mes_texto})`, fmtNum(cert.ajuste_mes_valor)])
    data.push(['', 'ÍNDICE DE AJUSTE', fmtPct(totales.indiceAjuste)])
    data.push(['', 'AJUSTE CERTIFICADO', fmtNum(totales.ajusteCert)])

    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [6, 40, 18, 18, 18, 18, 18, 18, 18].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, ws, `Certificado ${cert.numero}`)
    XLSX.writeFile(wb, `Certificado_${cert.numero}_${obra.nombre.replace(/\s+/g,'_')}.xlsx`)
  }

  const fmt = (n) => n != null ? '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
  const fmtPct = (n) => (Number(n) * 100).toFixed(2) + '%'

  if (cargando) return <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Cargando...</div>

  if (items.length === 0) return (
    <div style={{ padding: '60px', textAlign: 'center', color: '#aaa' }}>
      Primero generá la Planilla de Cotización desde Costo Previsto.
    </div>
  )

  // Vista formulario nuevo certificado
  if (vista === 'nuevo') {
    const filas = construirFilas(proximoMesCert)
    const certPrev = certificados[certificados.length - 1]
    const desacPct = parseFloat(desaciopioPct || certPrev?.desacopio_pct || 0)
    const totales = calcularTotales(filas, {
      desacopio_pct: desacPct,
      indice_base_valor: parseFloat(indiceBaseValor || certPrev?.indice_base_valor || 0),
      ajuste_mes_valor: parseFloat(ajusteMesValor || 0),
    })
    const numeroCert = certificados.length + 1

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, color: '#1e3a5f' }}>Certificado N° {numeroCert} — Mes {String(proximoMesCert).padStart(2,'0')}</h3>
          <button onClick={() => { setVista('lista'); resetForm() }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '18px' }}>✕</button>
        </div>

        {error && <div style={{ padding: '10px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#dc2626', marginBottom: '16px', fontSize: '14px' }}>⚠️ {error}</div>}

        {/* Datos variables */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>Desacopio (%)</label>
            <input type="number" value={desaciopioPct} onChange={e => setDesaciopioPct(e.target.value)} placeholder="ej: 5"
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>Índice Base (mes/año)</label>
            <input type="text" value={indiceBaseMes} onChange={e => setIndiceBaseMes(e.target.value)} placeholder="ej: Enero 2024"
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>Valor Índice Base</label>
            <input type="number" value={indiceBaseValor} onChange={e => setIndiceBaseValor(e.target.value)} placeholder="ej: 1000"
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>Ajuste Mes (texto)</label>
            <input type="text" value={ajusteMesTexto} onChange={e => setAjusteMesTexto(e.target.value)} placeholder="ej: Junio 2026"
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>Valor Ajuste Mes</label>
            <input type="number" value={ajusteMesValor} onChange={e => setAjusteMesValor(e.target.value)} placeholder="ej: 1350"
              style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }} />
          </div>
        </div>

        {/* Tabla de ítems */}
        <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#1e3a5f', color: 'white' }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>N°</th>
                <th style={{ padding: '8px', textAlign: 'left', minWidth: '200px' }}>Descripción</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Precio Total</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>% Acum. Ant.</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>% Avance Act.</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>% Acum. Act.</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>$ Acum. Ant.</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>$ Avance Act.</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>$ Acum. Act.</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb', borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '7px 8px', color: '#666' }}>{f.num}</td>
                  <td style={{ padding: '7px 8px', fontWeight: '500' }}>{f.descripcion}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>{fmt(f.precioTotal)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#666' }}>{fmtPct(f.pctAcumAnterior)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#2563eb', fontWeight: '600' }}>{fmtPct(f.pctAvanceActual)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>{fmtPct(f.pctAcumActual)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#666' }}>{fmt(f.pctAcumAnterior * f.precioTotal)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#2563eb', fontWeight: '600' }}>{fmt(f.pctAvanceActual * f.precioTotal)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: '600' }}>{fmt(f.pctAcumActual * f.precioTotal)}</td>
                </tr>
              ))}
              <tr style={{ background: '#1e3a5f', color: 'white' }}>
                <td colSpan={2} style={{ padding: '8px', fontWeight: '700' }}>PRECIO TOTAL</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmt(totales.totalObra)}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmtPct(filas.reduce((s,f) => s + f.pctAcumAnterior * f.precioTotal, 0) / (totales.totalObra || 1))}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmtPct(filas.reduce((s,f) => s + f.pctAvanceActual * f.precioTotal, 0) / (totales.totalObra || 1))}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmtPct(filas.reduce((s,f) => s + f.pctAcumActual * f.precioTotal, 0) / (totales.totalObra || 1))}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmt(filas.reduce((s,f) => s + f.pctAcumAnterior * f.precioTotal, 0))}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmt(filas.reduce((s,f) => s + f.pctAvanceActual * f.precioTotal, 0))}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmt(filas.reduce((s,f) => s + f.pctAcumActual * f.precioTotal, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Resumen y cuadro de ajuste */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
            <h4 style={{ margin: '0 0 12px', color: '#1e3a5f', fontSize: '13px' }}>Resumen del Certificado</h4>
            {[
              { label: 'Obra Básica', valor: totales.obraBasica },
              { label: `Desacopio (${desacPct}%)`, valor: -totales.desacopio },
              { label: 'Monto del Certificado', valor: totales.montoCert, bold: true },
              { label: 'Ajuste', valor: totales.ajusteCert },
              { label: 'Monto Total a Cobrar', valor: totales.montoTotal, bold: true, highlight: true },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 4 ? '1px solid #f1f5f9' : 'none' }}>
                <span style={{ fontSize: '13px', color: '#555', fontWeight: r.bold ? '700' : '400' }}>{r.label}</span>
                <span style={{ fontSize: '13px', fontWeight: r.bold ? '700' : '400', color: r.highlight ? '#16a34a' : r.valor < 0 ? '#dc2626' : '#111' }}>{fmt(Math.abs(r.valor))}</span>
              </div>
            ))}
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
            <h4 style={{ margin: '0 0 12px', color: '#1e3a5f', fontSize: '13px' }}>Cuadro de Ajuste</h4>
            {[
              { label: 'Monto de Certificado', valor: fmt(totales.montoCert) },
              { label: `Índice Base (${indiceBaseMes || '—'})`, valor: indiceBaseValor || '—' },
              { label: `Ajuste Mes (${ajusteMesTexto || '—'})`, valor: ajusteMesValor || '—' },
              { label: 'Índice de Ajuste', valor: fmtPct(totales.indiceAjuste) },
              { label: 'Ajuste Certificado', valor: fmt(totales.ajusteCert) },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 4 ? '1px solid #f1f5f9' : 'none' }}>
                <span style={{ fontSize: '13px', color: '#555' }}>{r.label}</span>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#111' }}>{r.valor}</span>
              </div>
            ))}
          </div>
        </div>

        {esJefe && (
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button onClick={() => { setVista('lista'); resetForm() }}
              style={{ padding: '8px 20px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', color: '#555' }}>
              Cancelar
            </button>
            <button onClick={guardarCertificado} disabled={guardando}
              style={{ padding: '8px 24px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '14px', cursor: guardando ? 'not-allowed' : 'pointer', opacity: guardando ? 0.6 : 1 }}>
              {guardando ? 'Guardando...' : '✓ Confirmar y Guardar Certificado'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // Vista ver certificado
  if (vista === 'ver' && certActual) {
    const filas = construirFilas(certActual.mes)
    const totales = calcularTotales(filas, certActual)
    const numeroCert = certActual.numero

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <h3 style={{ margin: 0, color: '#1e3a5f' }}>Certificado N° {numeroCert} — {certActual.fecha}</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => descargarExcel(certActual)}
              style={{ padding: '8px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
              ⬇ Descargar Excel
            </button>
            <button onClick={() => { setVista('lista'); setCertActual(null) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '18px' }}>✕</button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#1e3a5f', color: 'white' }}>
                <th style={{ padding: '8px' }}>N°</th>
                <th style={{ padding: '8px', textAlign: 'left', minWidth: '200px' }}>Descripción</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Precio Total</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>% Acum. Ant.</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>% Avance Act.</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>% Acum. Act.</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>$ Acum. Ant.</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>$ Avance Act.</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>$ Acum. Act.</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb', borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '7px 8px', color: '#666', textAlign: 'center' }}>{f.num}</td>
                  <td style={{ padding: '7px 8px', fontWeight: '500' }}>{f.descripcion}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>{fmt(f.precioTotal)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#666' }}>{fmtPct(f.pctAcumAnterior)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#2563eb', fontWeight: '600' }}>{fmtPct(f.pctAvanceActual)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>{fmtPct(f.pctAcumActual)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#666' }}>{fmt(f.pctAcumAnterior * f.precioTotal)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#2563eb', fontWeight: '600' }}>{fmt(f.pctAvanceActual * f.precioTotal)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: '600' }}>{fmt(f.pctAcumActual * f.precioTotal)}</td>
                </tr>
              ))}
              <tr style={{ background: '#1e3a5f', color: 'white' }}>
                <td colSpan={2} style={{ padding: '8px', fontWeight: '700' }}>PRECIO TOTAL</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmt(totales.totalObra)}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmtPct(filas.reduce((s,f) => s + f.pctAcumAnterior * f.precioTotal, 0) / (totales.totalObra || 1))}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmtPct(filas.reduce((s,f) => s + f.pctAvanceActual * f.precioTotal, 0) / (totales.totalObra || 1))}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmtPct(filas.reduce((s,f) => s + f.pctAcumActual * f.precioTotal, 0) / (totales.totalObra || 1))}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmt(filas.reduce((s,f) => s + f.pctAcumAnterior * f.precioTotal, 0))}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmt(filas.reduce((s,f) => s + f.pctAvanceActual * f.precioTotal, 0))}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>{fmt(filas.reduce((s,f) => s + f.pctAcumActual * f.precioTotal, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
            <h4 style={{ margin: '0 0 12px', color: '#1e3a5f', fontSize: '13px' }}>Resumen</h4>
            {[
              { label: 'Obra Básica', valor: fmt(totales.obraBasica) },
              { label: `Desacopio (${certActual.desacopio_pct}%)`, valor: fmt(totales.desacopio) },
              { label: 'Monto del Certificado', valor: fmt(totales.montoCert) },
              { label: 'Ajuste', valor: fmt(totales.ajusteCert) },
              { label: 'Monto Total a Cobrar', valor: fmt(totales.montoTotal) },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 4 ? '1px solid #f1f5f9' : 'none' }}>
                <span style={{ fontSize: '13px', color: '#555' }}>{r.label}</span>
                <span style={{ fontSize: '13px', fontWeight: '600' }}>{r.valor}</span>
              </div>
            ))}
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
            <h4 style={{ margin: '0 0 12px', color: '#1e3a5f', fontSize: '13px' }}>Cuadro de Ajuste</h4>
            {[
              { label: 'Monto de Certificado', valor: fmt(totales.montoCert) },
              { label: `Índice Base (${certActual.indice_base_mes})`, valor: certActual.indice_base_valor },
              { label: `Ajuste Mes (${certActual.ajuste_mes_texto})`, valor: certActual.ajuste_mes_valor },
              { label: 'Índice de Ajuste', valor: fmtPct(totales.indiceAjuste) },
              { label: 'Ajuste Certificado', valor: fmt(totales.ajusteCert) },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 4 ? '1px solid #f1f5f9' : 'none' }}>
                <span style={{ fontSize: '13px', color: '#555' }}>{r.label}</span>
                <span style={{ fontSize: '13px', fontWeight: '600' }}>{r.valor}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Vista lista de certificados
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, color: '#1e3a5f' }}>Certificados de Obra</h3>
        {esJefe && proximoMesCert && (
          <button onClick={abrirNuevo}
            style={{ padding: '8px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
            + Nuevo Certificado (Mes {String(proximoMesCert).padStart(2,'0')})
          </button>
        )}
      </div>

      {error  && <div style={{ padding: '10px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#dc2626', marginBottom: '16px', fontSize: '14px' }}>⚠️ {error}</div>}
      {exito  && <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', color: '#16a34a', marginBottom: '16px', fontSize: '14px' }}>✓ {exito}</div>}

      {!esJefe && !esAdmin && !esCompras && (
        <p style={{ color: '#aaa' }}>No tenés acceso a esta sección.</p>
      )}

      {certificados.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#aaa', fontSize: '14px' }}>
          {esJefe && proximoMesCert
            ? 'No hay certificados aún. Creá el primero.'
            : 'Aún no hay certificados generados para esta obra.'
          }
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {certificados.map(cert => {
            const filas = construirFilas(cert.mes)
            const totales = calcularTotales(filas, cert)
            return (
              <div key={cert.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ background: '#1e3a5f', color: 'white', borderRadius: '6px', padding: '6px 14px', fontWeight: '700', fontSize: '13px', whiteSpace: 'nowrap' }}>
                  N° {cert.numero}
                </div>
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <div style={{ fontSize: '11px', color: '#888' }}>Mes {String(cert.mes).padStart(2,'0')} · {cert.fecha}</div>
                  <div style={{ fontWeight: '700', color: '#16a34a', fontSize: '15px' }}>{fmt(totales.montoTotal)}</div>
                </div>
                <div style={{ fontSize: '12px', color: '#666' }}>
                  Obra Básica: {fmt(totales.obraBasica)}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => { setCertActual(cert); setVista('ver') }}
                    style={{ padding: '6px 14px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', fontWeight: '600', fontSize: '12px', cursor: 'pointer', color: '#555' }}>
                    Ver
                  </button>
                  <button onClick={() => descargarExcel(cert)}
                    style={{ padding: '6px 14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '12px', cursor: 'pointer' }}>
                    ⬇ Excel
                  </button>
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