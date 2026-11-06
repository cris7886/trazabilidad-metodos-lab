// ============================================================================
// PERSISTENCIA EN SUPABASE (BASE DE DATOS POSTGRESQL EN LA NUBE)
// ----------------------------------------------------------------------------
// - Guarda el estado completo de la línea para recuperarlo si Render reinicia.
// - Guarda TODO el historial (eventos, productos terminados, pedidos y sesiones)
//   sin límite, aunque en memoria solo se conserven los últimos 600 eventos.
// - Si no se configuran las variables SUPABASE_URL y SUPABASE_SERVICE_KEY,
//   el módulo queda desactivado y la app sigue funcionando con el archivo local.
// ============================================================================

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '').trim();
const habilitado = !!(SUPABASE_URL && SUPABASE_KEY);

const estadoConexion = {
  habilitado,
  ultimoGuardadoOk: null,
  ultimoError: null,
  ultimoErrorTimestamp: null,
  guardadosExitosos: 0
};

const eventosEnviados = new Set();
const productosEnviados = new Set();
const firmaPedidosEnviados = new Map();

let estadoPendiente = null;
let temporizador = null;
let guardando = false;

function construirHeaders(prefer) {
  const headers = {
    apikey: SUPABASE_KEY,
    'Content-Type': 'application/json'
  };
  // Las claves antiguas (JWT "eyJ...") también requieren el header Authorization
  if (SUPABASE_KEY.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  }
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function peticion(ruta, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, {
    method,
    headers: construirHeaders(prefer),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status} en ${ruta.split('?')[0]}: ${texto.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  const texto = await res.text();
  return texto ? JSON.parse(texto) : null;
}

function upsert(tabla, filas, conflicto, soloInsertarNuevos = false) {
  if (!filas || filas.length === 0) return Promise.resolve();
  const resolucion = soloInsertarNuevos ? 'resolution=ignore-duplicates' : 'resolution=merge-duplicates';
  return peticion(`${tabla}?on_conflict=${conflicto}`, {
    method: 'POST',
    body: filas,
    prefer: `${resolucion},return=minimal`
  });
}

const aISO = (v) => (v ? new Date(v).toISOString() : null);

// Clave única de cada sesión de simulación (permite varias simulaciones el mismo día)
function obtenerClaveSesion(state) {
  const s = state.session || {};
  const sufijo = s.creadaTimestamp ? '-' + new Date(s.creadaTimestamp).toISOString().slice(11, 19).replace(/:/g, '') : '';
  return `${s.id || 'SIM'}${sufijo}`;
}

async function cargarEstadoActual() {
  if (!habilitado) return null;
  try {
    const filas = await peticion('lab_estado?id=eq.actual&select=state');
    estadoConexion.ultimoError = null;
    return filas && filas[0] ? filas[0].state : null;
  } catch (err) {
    estadoConexion.ultimoError = err.message;
    estadoConexion.ultimoErrorTimestamp = Date.now();
    console.error('⚠️ No se pudo leer el estado desde Supabase:', err.message);
    return null;
  }
}

async function guardarAhora() {
  if (!habilitado || !estadoPendiente) return;
  if (guardando) {
    programarReintento(1000);
    return;
  }
  guardando = true;
  const state = estadoPendiente;
  estadoPendiente = null;

  try {
    const snapshot = JSON.parse(JSON.stringify(state));
    const clave = obtenerClaveSesion(snapshot);
    const ahoraISO = new Date().toISOString();
    const terminados = Object.values(snapshot.contadores?.productosTerminados || {})
      .reduce((a, b) => a + (Number(b) || 0), 0);

    // 1) Estado vivo (para recuperar la línea tras un reinicio de Render)
    await upsert('lab_estado', [{
      id: 'actual',
      sesion_clave: clave,
      state: snapshot,
      updated_at: ahoraISO
    }], 'id');

    // 2) Ficha de la sesión (una fila por cada simulación realizada)
    await upsert('lab_sesiones', [{
      sesion_clave: clave,
      sesion_id: snapshot.session?.id || null,
      nombre: snapshot.session?.nombre || null,
      estado: snapshot.session?.estado || null,
      creada_en: aISO(snapshot.session?.creadaTimestamp),
      inicio_produccion: aISO(snapshot.session?.inicioTimestamp),
      total_terminados: terminados,
      terminados_por_producto: snapshot.contadores?.productosTerminados || {},
      state: snapshot,
      updated_at: ahoraISO
    }], 'sesion_clave');

    // 3) Eventos nuevos de la bitácora (historial completo, sin límite de 600)
    const eventosNuevos = (snapshot.eventos || [])
      .map(ev => ({ ev, id: ev.id || `${ev.timestamp}-${ev.tipoAccion || ''}-${ev.operarioId || ''}` }))
      .filter(({ id }) => !eventosEnviados.has(`${clave}|${id}`))
      .map(({ ev, id }) => ({
        sesion_clave: clave,
        id,
        ts: aISO(ev.timestamp),
        operario_id: ev.operarioId || null,
        operario_nombre: ev.operarioNombre || null,
        area: ev.area || null,
        tipo_accion: ev.tipoAccion || null,
        etiqueta: ev.etiqueta || null,
        cantidad: Number.isFinite(Number(ev.cantidad)) ? Number(ev.cantidad) : null,
        ciclo_seg: Number.isFinite(Number(ev.cicloSeg)) && ev.cicloSeg !== null ? Number(ev.cicloSeg) : null,
        origen: ev.origen || null,
        destino: ev.destino || null,
        data: ev
      }));
    await upsert('lab_eventos', eventosNuevos, 'sesion_clave,id', true);
    eventosNuevos.forEach(e => eventosEnviados.add(`${clave}|${e.id}`));

    // 4) Productos terminados (EST-001, PLUS-001, N-EST-001, N-PLUS-001...)
    const productosNuevos = (snapshot.cajas || [])
      .filter(c => c && c.id && !productosEnviados.has(`${clave}|${c.id}`))
      .map(c => ({
        sesion_clave: clave,
        id: c.id,
        tipo: c.tipo || null,
        nombre_producto: c.nombreProducto || null,
        terminado_en: aISO(c.tiempos?.terminadoTimestamp),
        lead_time_seg: Number.isFinite(Number(c.leadTimeTotalSeg)) ? Number(c.leadTimeTotalSeg) : null,
        operario_ensamblado: c.origen?.operarioEnsambladoId || null,
        pedido_destino: c.destino?.destinoFinalCliente || null,
        uso_amortiguador: !!c.esAmortiguador,
        data: c
      }));
    await upsert('lab_productos', productosNuevos, 'sesion_clave,id', true);
    productosNuevos.forEach(p => productosEnviados.add(`${clave}|${p.id}`));

    // 5) Pedidos del docente (se actualizan cuando cambia su estado/avance)
    const pedidosCambiados = (snapshot.pedidosDocente || [])
      .filter(p => p && p.id)
      .filter(p => {
        const firma = `${p.estado}|${p.timestampCompletado || ''}|${JSON.stringify(p.progreso || {}).length}`;
        const k = `${clave}|${p.id}`;
        if (firmaPedidosEnviados.get(k) === firma) return false;
        p.__firma = firma;
        return true;
      })
      .map(p => {
        const firma = p.__firma;
        delete p.__firma;
        return {
          fila: {
            sesion_clave: clave,
            id: p.id,
            nombre: p.nombre || null,
            estado: p.estado || null,
            creado_en: aISO(p.timestampCreacion),
            completado_en: aISO(p.timestampCompletado),
            tiempo_cumplimiento_seg: Number.isFinite(Number(p.tiempoCumplimientoSeg)) && p.tiempoCumplimientoSeg !== null ? Number(p.tiempoCumplimientoSeg) : null,
            resumen: p.explosion?.resumenProductosTexto || null,
            nota_voz: p.notaVoz || null,
            data: p,
            updated_at: ahoraISO
          },
          firma
        };
      });
    await upsert('lab_pedidos', pedidosCambiados.map(x => x.fila), 'sesion_clave,id');
    pedidosCambiados.forEach(x => firmaPedidosEnviados.set(`${clave}|${x.fila.id}`, x.firma));

    estadoConexion.ultimoGuardadoOk = Date.now();
    estadoConexion.ultimoError = null;
    estadoConexion.guardadosExitosos += 1;
  } catch (err) {
    estadoConexion.ultimoError = err.message;
    estadoConexion.ultimoErrorTimestamp = Date.now();
    console.error('⚠️ Error guardando en Supabase (se reintentará):', err.message);
    // Reintentar con el estado más reciente
    if (!estadoPendiente) estadoPendiente = state;
    programarReintento(5000);
  } finally {
    guardando = false;
  }
}

function programarReintento(ms) {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    temporizador = null;
    guardarAhora();
  }, ms);
}

// Se llama en cada saveState(); agrupa los cambios y guarda como máximo cada ~1.5 s
function programarGuardado(state) {
  if (!habilitado) return;
  estadoPendiente = state;
  if (!temporizador) {
    programarReintento(1500);
  }
}

// Guardado inmediato (al apagar el servidor, por ejemplo en un redeploy de Render)
async function guardarInmediato(state) {
  if (!habilitado) return;
  clearTimeout(temporizador);
  temporizador = null;
  estadoPendiente = state;
  // Esperar a que termine un guardado en curso
  for (let i = 0; i < 50 && guardando; i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  await guardarAhora();
}

async function listarSesiones() {
  if (!habilitado) return [];
  return peticion('lab_sesiones?select=sesion_clave,sesion_id,estado,creada_en,inicio_produccion,total_terminados,terminados_por_producto,updated_at&order=updated_at.desc&limit=100');
}

async function obtenerSesion(clave) {
  if (!habilitado) return null;
  const filas = await peticion(`lab_sesiones?sesion_clave=eq.${encodeURIComponent(clave)}&select=state`);
  return filas && filas[0] ? filas[0].state : null;
}

async function obtenerEventosSesion(clave) {
  if (!habilitado) return [];
  return peticion(`lab_eventos?sesion_clave=eq.${encodeURIComponent(clave)}&select=data&order=ts.desc&limit=10000`)
    .then(filas => (filas || []).map(f => f.data));
}

module.exports = {
  habilitado,
  estadoConexion,
  cargarEstadoActual,
  programarGuardado,
  guardarInmediato,
  listarSesiones,
  obtenerSesion,
  obtenerEventosSesion,
  obtenerClaveSesion
};
