import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const ESTADOS_INICIALES = [
  { value: 'estudiada',  label: 'Estudiada — en presupuestación' },
  { value: 'contratada', label: 'Contratada — ganada, sin inicio' },
  { value: 'en_curso',   label: 'En curso — ya iniciada' },
];

const CATEGORIAS = [
  { value: 'gris',                 label: 'Gris' },
  { value: 'llave_en_mano',        label: 'Llave en mano' },
  { value: 'tareas_seleccionadas', label: 'Tareas seleccionadas' },
  { value: 'remodelacion',         label: 'Remodelación' },
];

function initials(nombre) {
  return nombre.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function validate(form) {
  const errors = {};
  if (!form.codigo.trim())  errors.codigo = 'Requerido';
  if (!form.nombre.trim())  errors.nombre = 'Requerido';
  if (!form.estado)         errors.estado = 'Seleccioná un estado';
  if (!form.categoria_obra) errors.categoria_obra = 'Seleccioná una categoría';
  if (form.dolar !== '' && isNaN(Number(form.dolar)))
    errors.dolar = 'Debe ser un número';
  if (form.costo_previsto_total !== '' && isNaN(Number(form.costo_previsto_total)))
    errors.costo_previsto_total = 'Debe ser un número';
  if (form.m2 !== '' && isNaN(Number(form.m2)))
    errors.m2 = 'Debe ser un número';
  return errors;
}

export default function NuevaObra() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    codigo: '', nombre: '', estado: 'estudiada', version: '',
    dolar: '', costo_previsto_total: '', m2: '',
    categoria_obra: '', cliente: '', es_obra_basica: false,
  });

  const [errors, setErrors]     = useState({});
  const [globalError, setGlobal] = useState('');
  const [saving, setSaving]     = useState(false);
  const [jefes, setJefes]       = useState([]);
  const [jefeSelec, setJefeSelec] = useState(null);

  useEffect(() => {
    supabase.from('perfiles').select('id, nombre').eq('area', 'jefe_obra').order('nombre')
      .then(({ data }) => setJefes(data || []));
  }, []);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => { const n = { ...e }; delete n[field]; return n; });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSaving(true);
    setGlobal('');

    const payload = {
      codigo:               form.codigo.trim(),
      nombre:               form.nombre.trim(),
      estado:               form.estado,
      version:              form.version.trim() || null,
      dolar:                form.dolar !== '' ? Number(form.dolar) : null,
      costo_previsto_total: form.costo_previsto_total !== '' ? Number(form.costo_previsto_total) : null,
      m2:                   form.m2 !== '' ? Number(form.m2) : null,
      categoria_obra:       form.categoria_obra || null,
      cliente:              form.cliente.trim() || null,
      es_obra_basica:       form.es_obra_basica,
    };

    const { data: obraData, error: obraErr } = await supabase
      .from('obras').insert([payload]).select().single();

    if (obraErr) { setGlobal('Error al crear la obra: ' + obraErr.message); setSaving(false); return; }

    if (jefeSelec) {
      const { error: asigErr } = await supabase
        .from('usuario_obra').insert([{ obra_id: obraData.id, usuario_id: jefeSelec }]);
      if (asigErr) console.warn('No se pudo asignar el jefe:', asigErr.message);
    }

    setSaving(false);
    navigate(`/obras/${obraData.id}`);
  }

  return (
    <div className="nueva-obra">
      {/* Header */}
      <header className="consca-header">
        <span className="consca-logo">CONSCA<span>+</span></span>
        <div className="consca-header__spacer" />
      </header>

      <div className="nueva-obra__inner">
        <button className="nueva-obra__back" onClick={() => navigate(-1)}>← Volver</button>
        <h1 className="nueva-obra__title">Nueva obra</h1>
        <p className="nueva-obra__sub">Completá los datos principales. Podés agregar más información después.</p>

        {globalError && <div className="form-global-error">{globalError}</div>}

        <form onSubmit={handleSubmit} noValidate>

          <div className="form-group--half">
            <div className="form-group">
              <label className="form-label">Código <span>*</span></label>
              <input className="form-input" placeholder="ej. 603"
                value={form.codigo} onChange={e => set('codigo', e.target.value)} />
              {errors.codigo && <div className="form-error">{errors.codigo}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Versión</label>
              <input className="form-input" placeholder="ej. v2"
                value={form.version} onChange={e => set('version', e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Nombre / descripción <span>*</span></label>
            <input className="form-input" placeholder="ej. Casa Aguerre — Miramar"
              value={form.nombre} onChange={e => set('nombre', e.target.value)} />
            {errors.nombre && <div className="form-error">{errors.nombre}</div>}
          </div>

          <div className="form-group--half">
            <div className="form-group">
              <label className="form-label">Estado inicial <span>*</span></label>
              <select className="form-select" value={form.estado} onChange={e => set('estado', e.target.value)}>
                {ESTADOS_INICIALES.map(est => (
                  <option key={est.value} value={est.value}>{est.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Categoría <span>*</span></label>
              <select className="form-select" value={form.categoria_obra} onChange={e => set('categoria_obra', e.target.value)}>
                <option value="">Seleccionar...</option>
                {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              {errors.categoria_obra && <div className="form-error">{errors.categoria_obra}</div>}
            </div>
          </div>

          <div className="form-group--half">
            <div className="form-group">
              <label className="form-label">Valor del dólar</label>
              <div className="form-input--prefix-wrap">
                <span className="prefix">$</span>
                <input className="form-input" type="number" min="0" step="0.01" placeholder="0.00"
                  value={form.dolar} onChange={e => set('dolar', e.target.value)} />
              </div>
              {errors.dolar && <div className="form-error">{errors.dolar}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Costo previsto total</label>
              <div className="form-input--prefix-wrap">
                <span className="prefix">$</span>
                <input className="form-input" type="number" min="0" placeholder="0.00"
                  value={form.costo_previsto_total} onChange={e => set('costo_previsto_total', e.target.value)} />
              </div>
              {errors.costo_previsto_total && <div className="form-error">{errors.costo_previsto_total}</div>}
            </div>
          </div>

          <div className="form-group--half">
            <div className="form-group">
              <label className="form-label">Superficie</label>
              <div className="form-input--prefix-wrap">
                <span className="prefix" style={{ left: 'auto', right: 14 }}>m²</span>
                <input className="form-input" type="number" min="0" placeholder="0"
                  value={form.m2} onChange={e => set('m2', e.target.value)} style={{ paddingRight: 40 }} />
              </div>
              {errors.m2 && <div className="form-error">{errors.m2}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Estudio / cliente</label>
              <input className="form-input" placeholder="ej. Estudio Bértola"
                value={form.cliente} onChange={e => set('cliente', e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <div className="toggle-row" onClick={() => set('es_obra_basica', !form.es_obra_basica)}>
              <div>
                <div className="toggle-row__label">Es obra básica</div>
                <div className="toggle-row__desc">Afecta el cálculo de desacopio en certificados</div>
              </div>
              <div className={`toggle-pill${form.es_obra_basica ? ' toggle-pill--on' : ''}`}>
                <div className="toggle-pill__thumb" />
              </div>
            </div>
          </div>

          <div className="form-section-title">Asignación de jefe de obra</div>

          {jefes.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 8 }}>
              No hay usuarios con rol jefe de obra cargados aún.
            </p>
          ) : (
            <div className="jefe-grid">
              {jefes.map(j => (
                <div key={j.id}
                  className={`jefe-option${jefeSelec === j.id ? ' jefe-option--selected' : ''}`}
                  onClick={() => setJefeSelec(jefeSelec === j.id ? null : j.id)}>
                  <div className="jefe-avatar">{initials(j.nombre)}</div>
                  <div className="jefe-nombre">{j.nombre}</div>
                  <div className="jefe-check"><div className="jefe-check-inner" /></div>
                </div>
              ))}
              <p className="jefe-skip">Podés dejarlo sin asignar y hacerlo después desde el dashboard.</p>
            </div>
          )}

          <button className="btn-crear" type="submit" disabled={saving}>
            {saving ? 'Creando obra...' : 'Crear obra'}
          </button>
        </form>
      </div>
    </div>
  );
}