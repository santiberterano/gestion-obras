import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

function Obra({ obra, perfil, onVolver }) {
  const [tab, setTab] = useState('costo')
  const [costos, setCostos] = useState([])
  const [stock, setStock] = useState([])
  const [pedidos, setPedidos] = useState([])

  useEffect(() => {
    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargarDatos() {
    const [c, s, p] = await Promise.all([
      supabase.from('costo_previsto').select('*').eq('obra_id', obra.id),
      supabase.from('stock').select('*').eq('obra_id', obra.id),
      supabase.from('pedidos').select('*').eq('obra_id', obra.id),
    ])
    setCostos(c.data || [])
    setStock(s.data || [])
    setPedidos(p.data || [])
  }

  const puedeEditar = (modulo) => {
    const permisos = {
      costo: ['computo'],
      stock: ['compras', 'produccion'],
      pedidos: ['compras', 'jefe_obra'],
    }
    return permisos[modulo]?.includes(perfil.area)
  }

  const tabStyle = (t) => ({
    padding: '10px 20px',
    cursor: 'pointer',
    border: 'none',
    borderBottom: tab === t ? '3px solid #2563eb' : '3px solid transparent',
    background: 'none',
    fontWeight: tab === t ? 'bold' : 'normal',
    color: tab === t ? '#2563eb' : '#666',
  })

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <button onClick={onVolver} style={{ marginBottom: '16px', background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: '14px' }}>
        ← Volver a obras
      </button>
      <h2 style={{ marginBottom: '4px' }}>{obra.nombre}</h2>
      <p style={{ color: '#666', marginBottom: '24px' }}>{obra.descripcion}</p>

      <div style={{ borderBottom: '1px solid #e5e7eb', marginBottom: '24px' }}>
        <button style={tabStyle('costo')} onClick={() => setTab('costo')}>Costo Previsto</button>
        <button style={tabStyle('stock')} onClick={() => setTab('stock')}>Stock</button>
        <button style={tabStyle('pedidos')} onClick={() => setTab('pedidos')}>Pedidos</button>
      </div>

      {tab === 'costo' && (
        <div>
          <h3 style={{ marginBottom: '16px' }}>Costo Previsto {!puedeEditar('costo') && <span style={{ fontSize: '12px', color: '#999' }}>(solo lectura)</span>}</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Item</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Unidad</th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Cantidad</th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Precio Unit.</th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {costos.length === 0 && <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#999' }}>Sin datos</td></tr>}
              {costos.map(c => (
                <tr key={c.id}>
                  <td style={{ padding: '10px', borderBottom: '1px solid #f3f4f6' }}>{c.item}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #f3f4f6' }}>{c.unidad}</td>
                  <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>{c.cantidad}</td>
                  <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>${c.precio_unitario}</td>
                  <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>${c.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'stock' && (
        <div>
          <h3 style={{ marginBottom: '16px' }}>Stock Disponible {!puedeEditar('stock') && <span style={{ fontSize: '12px', color: '#999' }}>(solo lectura)</span>}</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Material</th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Cantidad</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Unidad</th>
              </tr>
            </thead>
            <tbody>
              {stock.length === 0 && <tr><td colSpan={3} style={{ padding: '20px', textAlign: 'center', color: '#999' }}>Sin datos</td></tr>}
              {stock.map(s => (
                <tr key={s.id}>
                  <td style={{ padding: '10px', borderBottom: '1px solid #f3f4f6' }}>{s.material}</td>
                  <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>{s.cantidad}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #f3f4f6' }}>{s.unidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'pedidos' && (
        <div>
          <h3 style={{ marginBottom: '16px' }}>Lista de Pedidos {!puedeEditar('pedidos') && <span style={{ fontSize: '12px', color: '#999' }}>(solo lectura)</span>}</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Material</th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Cantidad</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Unidad</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.length === 0 && <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: '#999' }}>Sin datos</td></tr>}
              {pedidos.map(p => (
                <tr key={p.id}>
                  <td style={{ padding: '10px', borderBottom: '1px solid #f3f4f6' }}>{p.material}</td>
                  <td style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>{p.cantidad}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #f3f4f6' }}>{p.unidad}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{
                      padding: '4px 10px', borderRadius: '20px', fontSize: '12px',
                      background: p.estado === 'recibido' ? '#dcfce7' : p.estado === 'enviado' ? '#fef9c3' : '#f3f4f6',
                      color: p.estado === 'recibido' ? '#16a34a' : p.estado === 'enviado' ? '#ca8a04' : '#666'
                    }}>
                      {p.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default Obra