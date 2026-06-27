import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const ESTADOS = [
  { key: 'en_curso',   label: 'En curso',    desc: 'Obras activas en ejecución' },
  { key: 'contratada', label: 'Contratadas', desc: 'Ganadas, sin inicio' },
  { key: 'estudiada',  label: 'Estudiadas',  desc: 'Presupuestadas, sin ganar' },
  { key: 'finalizada', label: 'Finalizadas', desc: 'Obras terminadas' },
];

const ESTADOS_LIST = ['estudiada', 'contratada', 'en_curso', 'finalizada'];

const ESTADO_LABELS = {
  estudiada:  'Estudiada',
  contratada: 'Contratada',
  en_curso:   'En curso',
  finalizada: 'Finalizada',
};

const KPI_TABS = [
  { key: 'ratios',     label: 'Ratios de negocio' },
  { key: 'produccion', label: 'Producción' },
  { key: 'desvios',    label: 'Desvíos' },
  { key: 'categoria',  label: 'Por categoría' },
  { key: 'clientes',   label: 'Clientes' },
];

const CATEGORIA_LABELS = {
  gris:                 'Gris',
  llave_en_mano:        'Llave en mano',
  tareas_seleccionadas: 'Tareas seleccionadas',
  remodelacion:         'Remodelación',
};

const PIE_COLORS = ['#f5a623', '#2563eb', '#16a34a', '#a855f7', '#6b7280'];

function fmtM(n)    { if (!n && n !== 0) return '—'; return Number(n).toLocaleString('es-AR'); }
function fmtPeso(n) { if (!n && n !== 0) return '—'; return '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 }); }

function Donut({ value, total, color, size = 64 }) {
  const r = 24, circ = 2 * Math.PI * r;
  const filled = total > 0 ? (value / total) * circ : 0;
  const p = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="#e8e6e0" strokeWidth="8" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeDashoffset={circ * 0.25} strokeLinecap="round" />
      <text x="32" y="36" textAnchor="middle" fill="#1a1a1a" fontSize="11" fontWeight="600">{p}%</text>
    </svg>
  );
}

function PieChart({ slices, size = 110 }) {
  const r = 38, circ = 2 * Math.PI * r;
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {slices.map((sl, i) => {
        const dash = total > 0 ? (sl.value / total) * circ : 0;
        const el = (
          <circle key={i} cx="50" cy="50" r={r} fill="none"
            stroke={PIE_COLORS[i % PIE_COLORS.length]} strokeWidth="24"
            strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset} />
        );
        offset += dash;
        return el;
      })}
      <circle cx="50" cy="50" r="26" fill="#f8f7f4" />
    </svg>
  );
}

function useSlider(count, visible = 3) {
  const [pos, setPos] = useState(0);
  const trackRef = useRef(null);
  const max = Math.max(0, count - visible);
  function go(dir) { setPos(p => Math.max(0, Math.min(max, p + dir))); }
  function goTo(i) { setPos(Math.max(0, Math.min(max, i))); }
  useEffect(() => {
    if (!trackRef.current) return;
    const cardW = trackRef.current.parentElement.offsetWidth / visible;
    trackRef.current.style.transform = `translateX(-${pos * (cardW + 12)}px)`;
  }, [pos, visible]);
  return { pos, go, goTo, max, trackRef };
}

function KpiSlider({ children, count, visible = 3 }) {
  const { pos, go, goTo, max, trackRef } = useSlider(count, visible);
  const dots = Math.max(1, max + 1);
  return (
    <div className="slider-outer">
      <button className="slider-arrow slider-arrow--left" onClick={() => go(-1)}>‹</button>
      <div className="slider-viewport">
        <div className="slider-track" ref={trackRef}>{children}</div>
      </div>
      <button className="slider-arrow slider-arrow--right" onClick={() => go(1)}>›</button>
      {dots > 1 && (
        <div className="slider-dots">
          {Array.from({ length: dots }).map((_, i) => (
            <button key={i}
              className={`slider-dot${pos === i ? ' slider-dot--active' : ''}`}
              onClick={() => goTo(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Modal de confirmación genérico ──────────────────────────────────────────
function Modal({ titulo, mensaje, onConfirmar, onCancelar, confirmLabel = 'Confirmar', danger = false }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 400, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <h3 style={{ margin: '0 0 12px', color: 'var(--c-text)', fontSize: 16 }}>{titulo}</h3>
        <p style={{ margin: '0 0 24px', color: 'var(--c-text2)', fontSize: 14 }}>{mensaje}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancelar} style={{ padding: '8px 18px', background: 'white', border: '1px solid var(--c-border)', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            Cancelar
          </button>
          <button onClick={onConfirmar} style={{ padding: '8px 18px', background: danger ? '#ef4444' : 'var(--c-accent)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal asignar jefe ────────────────────────────────────────────────────
function ModalAsignarJefe({ obra, onGuardar, onCancelar }) {
  const [jefes, setJefes]       = useState([])
  const [seleccionado, setSeleccionado] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    supabase.from('perfiles').select('id, nombre').eq('area', 'jefe_obra')
      .then(({ data }) => setJefes(data || []))
  }, [])

  async function guardar() {
    if (!seleccionado) return
    setGuardando(true)
    // Eliminar asignaciones anteriores para esta obra
    await supabase.from('usuario_obra').delete().eq('obra_id', obra.id)
    // Insertar nueva asignación
    await supabase.from('usuario_obra').insert({ obra_id: obra.id, usuario_id: seleccionado })
    setGuardando(false)
    onGuardar()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 400, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>Asignar jefe de obra</h3>
        <p style={{ margin: '0 0 18px', color: 'var(--c-text2)', fontSize: 13 }}>{obra.nombre}</p>
        <select
          value={seleccionado}
          onChange={e => setSeleccionado(e.target.value)}
          style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--c-border)', borderRadius: 6, fontSize: 13, marginBottom: 20, background: 'white' }}
        >
          <option value="">— Seleccioná un jefe —</option>
          {jefes.map(j => <option key={j.id} value={j.id}>{j.nombre}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancelar} style={{ padding: '8px 18px', background: 'white', border: '1px solid var(--c-border)', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={!seleccionado || guardando}
            style={{ padding: '8px 18px', background: 'var(--c-gold)', color: 'white', border: 'none', borderRadius: 6, cursor: seleccionado ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: 13, opacity: !seleccionado ? 0.5 : 1 }}>
            {guardando ? 'Guardando...' : 'Asignar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal cambiar estado ──────────────────────────────────────────────────
function ModalCambiarEstado({ obra, onGuardar, onCancelar }) {
  const [nuevoEstado, setNuevoEstado] = useState(obra.estado)
  const [guardando, setGuardando]     = useState(false)

  async function guardar() {
    if (nuevoEstado === obra.estado) { onCancelar(); return }
    setGuardando(true)
    await supabase.from('obras').update({ estado: nuevoEstado }).eq('id', obra.id)
    setGuardando(false)
    onGuardar()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 400, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>Cambiar estado</h3>
        <p style={{ margin: '0 0 18px', color: 'var(--c-text2)', fontSize: 13 }}>{obra.nombre}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {ESTADOS_LIST.map(est => (
            <button
              key={est}
              onClick={() => setNuevoEstado(est)}
              style={{
                padding: '10px 14px', borderRadius: 8, border: '2px solid',
                borderColor: nuevoEstado === est ? 'var(--c-gold)' : 'var(--c-border)',
                background: nuevoEstado === est ? '#fff8ed' : 'white',
                color: 'var(--c-text)', fontWeight: nuevoEstado === est ? 700 : 400,
                cursor: 'pointer', textAlign: 'left', fontSize: 13,
              }}
            >
              {ESTADO_LABELS[est]}
              {obra.estado === est && <span style={{ fontSize: 11, color: 'var(--c-text3)', marginLeft: 8 }}>(actual)</span>}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancelar} style={{ padding: '8px 18px', background: 'white', border: '1px solid var(--c-border)', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando || nuevoEstado === obra.estado}
            style={{ padding: '8px 18px', background: 'var(--c-gold)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: nuevoEstado === obra.estado ? 0.5 : 1 }}>
            {guardando ? 'Guardando...' : 'Mover'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────
export default function AdminDashboard({ perfil }) {
  const navigate = useNavigate();
  const [obras, setObras]     = useState([]);
  const [jefes, setJefes]     = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ratios');

  // Modales
  const [modalEliminar,    setModalEliminar]    = useState(null); // obra
  const [modalAsignar,     setModalAsignar]     = useState(null); // obra
  const [modalCambiarEst,  setModalCambiarEst]  = useState(null); // obra

  const esAdmin = perfil?.area === 'administracion';

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const { data: obrasData } = await supabase
      .from('obras')
      .select('id, codigo, nombre, estado, costo_previsto_total, m2, categoria_obra, cliente, es_obra_basica')
      .order('created_at', { ascending: false });
    setObras(obrasData || []);

    const { data: asignaciones } = await supabase
      .from('usuario_obra')
      .select('obra_id, perfiles(nombre)');
    const map = {};
    (asignaciones || []).forEach(a => {
      if (!map[a.obra_id]) map[a.obra_id] = [];
      if (a.perfiles?.nombre) map[a.obra_id].push(a.perfiles.nombre);
    });
    setJefes(map);
    setLoading(false);
  }

  async function eliminarObra(obra) {
    await supabase.from('obras').delete().eq('id', obra.id);
    setModalEliminar(null);
    fetchData();
  }

  async function handleLogout() { await supabase.auth.signOut(); }

  const obrasPorEstado = estado => obras.filter(o => o.estado === estado);
  const ganadas        = obras.filter(o => ['contratada', 'en_curso', 'finalizada'].includes(o.estado));
  const totalEmitido   = obras.reduce((s, o) => s + (o.costo_previsto_total || 0), 0);
  const totalGanado    = ganadas.reduce((s, o) => s + (o.costo_previsto_total || 0), 0);
  const totalM2        = obras.reduce((s, o) => s + (o.m2 || 0), 0);
  const avgM2          = obras.length > 0 ? Math.round(totalM2 / obras.length) : 0;

  const porCategoria = Object.entries(CATEGORIA_LABELS).map(([key, label]) => {
    const subset = obras.filter(o => o.categoria_obra === key);
    return { label, count: subset.length, m2: subset.reduce((s, o) => s + (o.m2 || 0), 0), monto: subset.reduce((s, o) => s + (o.costo_previsto_total || 0), 0) };
  }).filter(c => c.count > 0);

  const clienteMap = {};
  obras.forEach(o => {
    const c = o.cliente || 'Sin cliente';
    clienteMap[c] = (clienteMap[c] || 0) + (o.m2 || 0);
  });
  const clienteSlices = Object.entries(clienteMap)
    .map(([nombre, m2]) => ({ nombre, m2, value: m2 }))
    .sort((a, b) => b.value - a.value).slice(0, 5);

  if (loading) return (
    <div className="admin-dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <span style={{ color: 'var(--c-text3)', fontSize: 13 }}>Cargando...</span>
    </div>
  );

  return (
    <div className="admin-dashboard">

      {/* Modales */}
      {modalEliminar && (
        <Modal
          titulo="Eliminar obra"
          mensaje={`¿Seguro que querés eliminar "${modalEliminar.nombre}"? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          danger
          onConfirmar={() => eliminarObra(modalEliminar)}
          onCancelar={() => setModalEliminar(null)}
        />
      )}
      {modalAsignar && (
        <ModalAsignarJefe
          obra={modalAsignar}
          onGuardar={() => { setModalAsignar(null); fetchData(); }}
          onCancelar={() => setModalAsignar(null)}
        />
      )}
      {modalCambiarEst && (
        <ModalCambiarEstado
          obra={modalCambiarEst}
          onGuardar={() => { setModalCambiarEst(null); fetchData(); }}
          onCancelar={() => setModalCambiarEst(null)}
        />
      )}

      {/* Header */}
      <header className="consca-header">
        <span className="consca-logo">CONSCA<span>+</span></span>
        <button className="consca-nav-btn consca-nav-btn--active">Admin</button>
        <div className="consca-header__spacer" />
        <div className="consca-user">
          <div className="consca-avatar">
            {perfil?.nombre?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'AD'}
          </div>
          <span>{perfil?.nombre}</span>
          <button className="btn-logout" onClick={handleLogout}>Salir</button>
        </div>
      </header>

      <div className="admin-main">

        {/* Estados */}
        <div className="estados-header">
          <div className="section-label" style={{ margin: 0 }}>Estado de obras</div>
          <button className="btn-nueva-obra" onClick={() => navigate('/nueva-obra')}>+ Nueva obra</button>
        </div>

        <div className="estados-grid">
          {ESTADOS.map(est => {
            const lista = obrasPorEstado(est.key);
            return (
              <div key={est.key} className={`estado-card estado-card--${est.key}`}>
                <div className="estado-card__header">
                  <div className={`estado-dot estado-dot--${est.key}`} />
                  <div className="estado-card__nombre">{est.label}</div>
                  <div className="estado-card__count">{lista.length}</div>
                </div>
                <div className="estado-card__desc">{est.desc}</div>
                <div className="obras-mini">
                  {lista.slice(0, 4).map(obra => {
                    const nombres = jefes[obra.id] || [];
                    return (
                      <div key={obra.id} className="obra-mini">
                        {/* Click en nombre → ir a obra */}
                        <div className="obra-mini__top" onClick={() => navigate(`/obras/${obra.id}`)} style={{ cursor: 'pointer' }}>
                          <span className="obra-mini__nombre">{obra.nombre}</span>
                          <span className="obra-mini__cod">{obra.codigo}</span>
                        </div>
                        {nombres.length > 0
                          ? <div className="obra-mini__jefe">Jefe: <span>{nombres.join(', ')}</span></div>
                          : <div className="obra-mini__jefe" style={{ color: 'var(--c-text3)' }}>Sin asignar</div>
                        }
                        {/* Botones de acción */}
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <button
                            onClick={() => setModalCambiarEst(obra)}
                            style={{ flex: 1, padding: '4px 8px', fontSize: 10, fontWeight: 600, border: '1px solid var(--c-border)', borderRadius: 4, background: 'white', cursor: 'pointer', color: 'var(--c-text2)' }}
                          >
                            Mover →
                          </button>
                          <button
                            onClick={() => setModalAsignar(obra)}
                            style={{ flex: 1, padding: '4px 8px', fontSize: 10, fontWeight: 600, border: '1px solid var(--c-border)', borderRadius: 4, background: 'white', cursor: 'pointer', color: 'var(--c-text2)' }}
                          >
                            👤 Jefe
                          </button>
                          {esAdmin && (
                            <button
                              onClick={() => setModalEliminar(obra)}
                              style={{ padding: '4px 8px', fontSize: 10, fontWeight: 600, border: '1px solid #fca5a5', borderRadius: 4, background: '#fef2f2', cursor: 'pointer', color: '#dc2626' }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {lista.length > 4 && (
                    <div className="obra-mini__mas">+{lista.length - 4} más</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* KPIs */}
        <div className="kpi-section">
          <div className="kpi-header">
            <div className="kpi-main-title">Info</div>
            <div className="kpi-main-sub">Cómputo y presupuesto</div>
          </div>
          <div className="kpi-tabs">
            {KPI_TABS.map(t => (
              <button key={t.key}
                className={`kpi-tab${activeTab === t.key ? ' kpi-tab--active' : ''}`}
                onClick={() => setActiveTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === 'ratios' && (
            <KpiSlider count={3} visible={3}>
              <div className="kpi-card">
                <div className="kpi-card__label">Presupuestos ganados</div>
                <div className="donut-wrap">
                  <Donut value={ganadas.length} total={obras.length} color="#f5a623" />
                  <div>
                    <div className="donut-info__val">{ganadas.length} / {obras.length}</div>
                    <div className="donut-info__sub">Emitido: {fmtPeso(totalEmitido)}<br />Ganado: {fmtPeso(totalGanado)}</div>
                  </div>
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-card__label">Avance de certificación</div>
                <div className="donut-wrap">
                  <Donut value={0} total={1} color="#16a34a" />
                  <div>
                    <div className="donut-info__val">—</div>
                    <div className="donut-info__sub">Presupuestado: {fmtPeso(totalGanado)}<br />Certificado: pendiente</div>
                  </div>
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-card__label">Tareas adicionales</div>
                <div className="donut-wrap">
                  <Donut value={0} total={1} color="#ef4444" />
                  <div>
                    <div className="donut-info__val">—</div>
                    <div className="donut-info__sub">Presupuestado: {fmtPeso(totalGanado)}<br />Adicionales: pendiente</div>
                  </div>
                </div>
              </div>
            </KpiSlider>
          )}
          {activeTab === 'produccion' && (
            <KpiSlider count={4} visible={3}>
              <div className="kpi-card"><div className="kpi-card__label">Presupuestos emitidos</div><div className="kpi-card__value">{obras.length}<span className="kpi-card__unit">obras</span></div></div>
              <div className="kpi-card"><div className="kpi-card__label">M² totales presupuestados</div><div className="kpi-card__value">{fmtM(totalM2)}<span className="kpi-card__unit">m²</span></div></div>
              <div className="kpi-card"><div className="kpi-card__label">Promedio M² por obra</div><div className="kpi-card__value">{fmtM(avgM2)}<span className="kpi-card__unit">m²</span></div></div>
              <div className="kpi-card"><div className="kpi-card__label">Tiempo promedio estudio</div><div className="kpi-card__value">—<span className="kpi-card__unit">días</span></div><div className="kpi-card__detail">Requiere fechas de inicio y cierre</div></div>
            </KpiSlider>
          )}
          {activeTab === 'desvios' && (
            <KpiSlider count={2} visible={3}>
              <div className="kpi-card kpi-card--wide"><div className="kpi-card__label">Desvío por obra</div><p style={{ fontSize: 12, color: 'var(--c-text3)', marginTop: 12 }}>Pendiente de conectar con costo_explotado.</p></div>
              <div className="kpi-card"><div className="kpi-card__label" style={{ marginBottom: 14 }}>Familias destacadas</div><div className="familia-badge"><div className="familia-badge__label">Mayor desvío</div><div className="familia-badge__name" style={{ color: 'var(--c-danger)' }}>—</div></div><div className="familia-badge"><div className="familia-badge__label">Menor desvío</div><div className="familia-badge__name" style={{ color: 'var(--c-success)' }}>—</div></div></div>
            </KpiSlider>
          )}
          {activeTab === 'categoria' && (
            <KpiSlider count={1} visible={3}>
              <div className="kpi-card kpi-card--full">
                <div className="kpi-card__label">Obras por categoría</div>
                {porCategoria.length === 0
                  ? <p style={{ fontSize: 12, color: 'var(--c-text3)', marginTop: 12 }}>Sin categorías asignadas.</p>
                  : <table className="cat-table"><thead><tr><th>Categoría</th><th>Obras</th><th>M²</th><th>Monto</th></tr></thead>
                    <tbody>{porCategoria.map(c => (<tr key={c.label}><td>{c.label}</td><td>{c.count}</td><td>{fmtM(c.m2)} m²</td><td className="monto">{fmtPeso(c.monto)}</td></tr>))}
                    <tr className="total"><td>Total</td><td>{obras.length}</td><td>{fmtM(totalM2)} m²</td><td>{fmtPeso(totalEmitido)}</td></tr></tbody></table>
                }
              </div>
            </KpiSlider>
          )}
          {activeTab === 'clientes' && (
            <KpiSlider count={1} visible={3}>
              <div className="kpi-card kpi-card--full">
                <div className="kpi-card__label">M² por cliente</div>
                {clienteSlices.length === 0
                  ? <p style={{ fontSize: 12, color: 'var(--c-text3)', marginTop: 12 }}>Sin clientes asignados.</p>
                  : <div className="pie-wrap"><PieChart slices={clienteSlices} /><div className="pie-legend">{clienteSlices.map((sl, i) => (<div key={sl.nombre} className="pie-leg-item"><div className="pie-leg-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />{sl.nombre}<span className="pie-leg-m2">{fmtM(sl.m2)} m²</span></div>))}</div></div>
                }
              </div>
            </KpiSlider>
          )}
        </div>
      </div>
    </div>
  );
}