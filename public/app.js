// ============================================================================
// APP MÓVIL Y PANEL EN TIEMPO REAL - LABORATORIO INGENIERÍA DE MÉTODOS
// Distribución: 4 Estaciones (Enrollado 4, Pegado 4, Cortado 1, Ensamblado 4)
// Productos: 4 (Cajita Estándar, Cajita Plus, Nuevo Producto Estándar, Nuevo Producto Plus)
// Incluye Gráfico de Balanceo de Línea y Takt Time en Vivo
// ============================================================================

let appData = null;
let selectedOperatorId = localStorage.getItem('metodos_operario_id') || 'OP-01';
let currentTab = 'operario';
let filtroCajas = 'TODAS';
let selectorCollapsed = false;
let polivalentePickerOpen = false;
let deferredInstallPrompt = null;
let eventSource = null;
let ultimaAlertaMostradaId = localStorage.getItem('metodos_ultima_alerta_id') || null;

function getApiBase() {
  const custom = localStorage.getItem('metodos_server_url');
  if (custom && custom.startsWith('http')) {
    return custom.replace(/\/+$/, '');
  }
  return '';
}

function feedbackTactil(exito = true) {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(exito ? [45] : [80, 50, 80]);
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = exito ? 'sine' : 'sawtooth';
      osc.frequency.setValueAtTime(exito ? 740 : 220, ctx.currentTime);
      if (exito) {
        osc.frequency.exponentialRampToValueAtTime(980, ctx.currentTime + 0.09);
      }
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (exito ? 0.11 : 0.22));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (exito ? 0.12 : 0.23));
    }
  } catch (e) {}
}

// Campana sonora industrial + vibración triple cuando el Docente envía un pedido a las 4 áreas
function sonarAlertaPedidoDocente() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 350]);
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const notas = [587.33, 880, 1174.66];
      notas.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const start = ctx.currentTime + idx * 0.13;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.22, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.36);
      });
    }
  } catch (e) {}
}

async function activarWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      await navigator.wakeLock.request('screen');
    }
  } catch (e) {}
}
document.addEventListener('click', activarWakeLock, { once: true });

function showToast(msg, isError = false) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 2600);
}

// ============================================================================
// CONEXIÓN EN TIEMPO REAL (SSE + DETECCIÓN DE NUEVOS PEDIDOS DEL DOCENTE)
// ============================================================================

function connectRealtime() {
  if (eventSource) {
    eventSource.close();
  }
  const url = `${getApiBase()}/api/events`;
  eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      appData = data;
      verificarNuevaAlertaDocente(data.state?.ultimaAlertaPedido);
      renderAll();
      const dot = document.getElementById('connDot');
      if (dot) dot.style.background = '#10b981';
    } catch (e) {
      console.error('Error parseando SSE:', e);
    }
  };

  eventSource.onerror = () => {
    const dot = document.getElementById('connDot');
    if (dot) dot.style.background = '#f59e0b';
  };
}

function verificarNuevaAlertaDocente(alerta) {
  if (!alerta || !alerta.alertaId) return;
  if (alerta.alertaId !== ultimaAlertaMostradaId) {
    ultimaAlertaMostradaId = alerta.alertaId;
    localStorage.setItem('metodos_ultima_alerta_id', alerta.alertaId);
    sonarAlertaPedidoDocente();
    mostrarModalAlertaPedidoPorArea(alerta);
  }
}

function mostrarModalAlertaPedidoPorArea(alerta) {
  if (!appData || !alerta) return;
  const op = appData.state.operarios.find(o => o.id === selectedOperatorId) || appData.state.operarios[0];
  const notifArea = alerta.notificacionesPorArea?.[op.area] || alerta.notificacionesPorArea?.ENROLLADO;

  document.getElementById('modalOrderCode').textContent =
    `${alerta.pedidoId} • Pedido: ${alerta.resumenProductosTexto || ''}`;
  document.getElementById('modalAreaTitle').textContent =
    notifArea ? notifArea.titulo : `🔔 ORDEN DE REPOSICIÓN PARA ${op.areaNombre}`;
  document.getElementById('modalAreaMainInstruction').textContent =
    notifArea ? notifArea.instruccionPrincipal : '';
  document.getElementById('modalAreaSubDetail').textContent =
    notifArea ? notifArea.detalle : '';

  const n = alerta.notificacionesPorArea || {};
  document.getElementById('modalAllAreasSummary').innerHTML = `
    <div style="font-weight:800; color:#fbbf24; margin-bottom:4px;">📋 RESUMEN DE REPOSICIÓN ENVIADO A LAS 4 ESTACIONES:</div>
    <div>• <strong>1. Enrollado (4 op):</strong> ${n.ENROLLADO?.instruccionPrincipal || ''}</div>
    <div>• <strong>2. Pegado (4 op):</strong> ${n.PEGADO?.instruccionPrincipal || ''}</div>
    <div>• <strong>3. Cortado (1 op):</strong> ${n.CORTADO?.instruccionPrincipal || ''}</div>
    <div>• <strong>4. Ensamblado (4 op):</strong> ${n.ENSAMBLADO?.instruccionPrincipal || ''}</div>
  `;

  const modal = document.getElementById('orderAlertModal');
  if (modal) modal.classList.add('active');
}

function cerrarModalAlertaPedido() {
  const modal = document.getElementById('orderAlertModal');
  if (modal) modal.classList.remove('active');
}

async function sendAction(payload) {
  try {
    const res = await fetch(`${getApiBase()}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      feedbackTactil(false);
      showToast(data.error || 'No se pudo completar la acción', true);
      return data;
    }
    feedbackTactil(true);
    if (data.mensaje) {
      showToast(data.mensaje, false);
    }
    if (data.payload) {
      appData = data.payload;
      verificarNuevaAlertaDocente(appData.state?.ultimaAlertaPedido);
      renderAll();
    }
    return data;
  } catch (err) {
    feedbackTactil(false);
    showToast('Error de conexión con el servidor de laboratorio', true);
  }
}

function switchTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.tab-view').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const targetSection = document.getElementById(`tab-${tabName}`);
  const targetNav = document.getElementById(`nav-${tabName}`);
  if (targetSection) targetSection.classList.add('active');
  if (targetNav) targetNav.classList.add('active');
  renderAll();
}

function selectOperator(opId) {
  selectedOperatorId = opId;
  localStorage.setItem('metodos_operario_id', opId);
  feedbackTactil(true);
  renderAll();
}

function toggleSelectorOperarios() {
  selectorCollapsed = !selectorCollapsed;
  const wrap = document.getElementById('operatorSelectorWrap');
  const btn = document.getElementById('btnToggleOps');
  if (wrap) {
    wrap.style.display = selectorCollapsed ? 'none' : 'flex';
  }
  if (btn) {
    btn.textContent = selectorCollapsed ? 'Mostrar 13 Operarios ▾' : 'Ocultar Selector ▴';
  }
}

function formatSecondsMMSS(totalSec) {
  const s = Math.max(0, Math.floor(totalSec || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

// ============================================================================
// RENDERIZADO GENERAL DE LA INTERFAZ
// ============================================================================

function iniciarProduccionOficial() {
  sendAction({ type: 'INICIAR_PRODUCCION' });
}

function renderProductionStartBanner() {
  const bannerEl = document.getElementById('productionStartBanner');
  if (!bannerEl || !appData) return;

  const estado = appData.state?.session?.estado;
  if (estado === 'LISTO_PARA_INICIAR') {
    bannerEl.innerHTML = `
      <div class="card" style="border:2px solid #10b981; background:linear-gradient(180deg, rgba(16,185,129,0.20), rgba(15,23,42,0.96)); margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
          <div>
            <div style="font-size:16px; font-weight:900; color:#34d399;">
              🚦 LÍNEA LISTA CON AMORTIGUADORES — ESPERANDO INICIO DE PRODUCCIÓN
            </div>
            <div style="font-size:12px; color:#cbd5e1; margin-top:2px;">
              El cronómetro está en <strong>00:00</strong>. Cuando los 13 operarios estén en sus puestos listos para empezar, toca el botón verde para arrancar la producción simultáneamente:
            </div>
          </div>
          <span class="badge-pill" style="background:#f59e0b; color:#000; font-weight:900;">⏳ EN ESPERA (00:00)</span>
        </div>
        <button class="giant-btn btn-emerald" style="margin-bottom:0; min-height:70px; font-size:18px;" onclick="iniciarProduccionOficial()">
          <span>▶️ COMENZAR PRODUCCIÓN DEL LABORATORIO AHORA</span>
          <span class="giant-btn-sub">Arranca el cronómetro oficial, habilita las 4 estaciones y sincroniza los 13 celulares</span>
        </button>
      </div>
    `;
  } else {
    bannerEl.innerHTML = '';
  }
}

function renderAll() {
  if (!appData) return;
  renderHeaderKPIs();
  renderProductionStartBanner();
  renderOperatorSelector();
  renderStationReplenishBanner();
  renderActiveStationPanel();
  renderMiniWip();
  if (currentTab === 'docente') {
    renderDocenteTab();
  } else if (currentTab === 'trazabilidad') {
    renderTraceabilityTab();
  } else if (currentTab === 'throughput') {
    renderThroughputTab();
  } else if (currentTab === 'config') {
    renderConfigTab();
  }
}

function renderHeaderKPIs() {
  const { metrics, serverInfo, state } = appData;
  const th = metrics.throughput;

  document.getElementById('kpiThroughputHora').textContent = `${th.totalPorHora} u/h`;
  document.getElementById('kpiThroughputMin').textContent = `${th.totalPorMinuto} u/m`;
  document.getElementById('kpiPtCajitas').textContent = `${th.unidadesTerminadasEstandar}E / ${th.unidadesTerminadasPlus}P`;
  document.getElementById('kpiPtNuevos').textContent = `${th.unidadesTerminadasNuevoEstandar || 0}E / ${th.unidadesTerminadasNuevoPlus || 0}P`;

  const isWaiting = state.session.estado === 'LISTO_PARA_INICIAR';
  const isPaused = state.session.estado === 'PAUSADO';
  const estadoTexto = isWaiting
    ? '⏳ ESPERANDO INICIO'
    : (isPaused ? '⏸️ PAUSADO' : '⏱️ ' + formatSecondsMMSS(metrics.tiempoEfectivoSeg));
  document.getElementById('clockBadge').textContent = estadoTexto;

  const btnHdrStart = document.getElementById('btnHeaderIniciarProd');
  if (btnHdrStart) {
    btnHdrStart.style.display = isWaiting ? 'inline-block' : 'none';
  }

  document.getElementById('connCountText').textContent = `${serverInfo?.connectedDevices || 1} Cel.`;
  const buf = metrics.estadoAmortiguadores;
  const pedActivos = (state.pedidosDocente || []).filter(p => p.estado !== 'COMPLETADO').length;
  document.getElementById('headerSessionSub').textContent =
    pedActivos > 0
      ? `🔔 ${pedActivos} Pedido(s) Docente Activo(s) • Buffers: Pegado ${buf.pegado.actual} tub | Corte ${buf.cortado.actual} unid | Ensamble ${buf.ensamblado.actual} unid`
      : `4 Estaciones (4-4-1-4): Pegado ${buf.pegado.actual} tub | Corte ${buf.cortado.actual} unid | Ensamble ${buf.ensamblado.actual} unid`;
}

function renderOperatorSelector() {
  const wrap = document.getElementById('operatorSelectorWrap');
  if (!wrap || !appData) return;

  const areaShort = {
    ENROLLADO: '1. Enrollado',
    PEGADO: '2. Pegado',
    CORTADO: '3. Cortado',
    ENSAMBLADO: '4. Ensamblado'
  };

  wrap.innerHTML = appData.state.operarios.map(op => {
    const isActive = op.id === selectedOperatorId;
    const st = appData.metrics.statsOperarios[op.id];
    const count = st ? st.unidadesProducidas : 0;
    const polBadge = op.esPolivalente ? ' 🔄' : '';
    return `
      <button class="op-chip ${isActive ? 'active' : ''}" onclick="selectOperator('${op.id}')" style="${op.esPolivalente && !isActive ? 'border-color:#f59e0b;' : ''}">
        <div>#${op.numero} • ${op.nombre}${polBadge}</div>
        <span class="op-area-tag">${areaShort[op.area] || op.area} (${count})</span>
      </button>
    `;
  }).join('');
}

// ============================================================================
// BANNER KANBAN DE ORDEN DE REPOSICIÓN ACTIVA EN CADA UNA DE LAS 4 ÁREAS
// ============================================================================

function renderStationReplenishBanner() {
  const bannerEl = document.getElementById('stationReplenishBanner');
  if (!bannerEl || !appData) return;

  const pedidos = appData.state.pedidosDocente || [];
  if (pedidos.length === 0) {
    bannerEl.innerHTML = '';
    return;
  }

  const op = appData.state.operarios.find(o => o.id === selectedOperatorId) || appData.state.operarios[0];

  // Buscar un pedido donde ESTA estación específica aún tenga reposición/producción pendiente
  const ped = pedidos.find(p => !(p.progreso?.completadoPorArea?.[op.area]));

  if (!ped) {
    const ultimo = pedidos[0];
    bannerEl.innerHTML = `
      <div style="background:rgba(16,185,129,0.14); border:1px solid #10b981; border-radius:12px; padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div style="font-size:13px; color:#34d399; font-weight:800;">
          ✅ ¡META DE TU ESTACIÓN (${op.areaNombre}) 100% CUMPLIDA PARA EL PEDIDO ${ultimo.id}!
          <span style="color:#cbd5e1; font-weight:500;">Ya no tienes pendientes del docente en tu área.</span>
        </div>
        <button class="btn-secondary" style="font-size:11px; padding:5px 10px;" onclick="sendAction({ type: 'LIMPIAR_PEDIDOS_DOCENTE' })">
          🧹 Archivar Aviso
        </button>
      </div>
    `;
    return;
  }

  const exp = ped.explosion;
  const prog = ped.progreso || {};
  const notifArea = exp.notificacionesPorArea?.[op.area];

  let detalleProgresoHtml = '';
  let pctAvance = 0;

  if (op.area === 'ENROLLADO') {
    const hecho = prog.tubosEnrollados || 0;
    const meta = exp.totalTubosParaPlacas || 1;
    pctAvance = Math.min(100, Math.round((hecho / meta) * 100));
    detalleProgresoHtml = `
      <div style="margin-top:6px; font-size:13px;">
        📌 <strong>Avance de Reposición de Tubos:</strong>
        <strong style="color:#38bdf8; font-size:15px;">${hecho} / ${exp.totalTubosParaPlacas} tubos</strong> enrollados
        (Faltan: <strong style="color:#fbbf24;">${Math.max(0, exp.totalTubosParaPlacas - hecho)} tubos</strong>)
      </div>
    `;
  } else if (op.area === 'PEGADO') {
    const hecho = prog.placasPegadas || 0;
    const meta = exp.totalPlacasPegar || 1;
    pctAvance = Math.min(100, Math.round((hecho / meta) * 100));

    const chipsPlacas = Object.entries(exp.placasRequeridas)
      .filter(([, req]) => req > 0)
      .map(([k, req]) => {
        const sp = appData.specs.PLACA_SPECS[k];
        const base = (ped.lineaBase?.placasPegadas?.[k]) || 0;
        const actual = Math.max(0, (appData.state.contadores.placasPegadas[k] || 0) - base);
        const listo = actual >= req;
        return `<span class="badge-pill" style="border-color:${listo ? '#10b981' : sp.color}; color:${listo ? '#34d399' : '#fff'};">
          ${listo ? '✅' : '⏳'} ${sp.corto}: <strong>${actual}/${req}</strong>
        </span>`;
      }).join(' ');

    detalleProgresoHtml = `
      <div style="margin-top:6px; font-size:12px;">
        📌 <strong>Placas a pegar para reponer el pedido (${hecho}/${exp.totalPlacasPegar}):</strong>
        <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:5px;">${chipsPlacas}</div>
      </div>
    `;
  } else if (op.area === 'CORTADO') {
    const hechoPzas = prog.piezasCortadasHechas ?? prog.placasCortadas ?? 0;
    const metaPzas = prog.piezasCortadasMeta || exp.totalPlacasPegar || 1;
    pctAvance = Math.min(100, Math.round((hechoPzas / metaPzas) * 100));

    const chipsCorte = Object.entries(exp.piezasCortadasRequeridas || {})
      .filter(([, reqPzas]) => reqPzas > 0)
      .map(([piezaKey, reqPzas]) => {
        const sp = Object.values(appData.specs.PLACA_SPECS).find(s => s.piezaResultante === piezaKey);
        const basePzas = (ped.lineaBase?.piezasCortadasTotales?.[piezaKey]) || 0;
        const actualPzas = Math.max(0, (appData.state.contadores.piezasCortadasTotales?.[piezaKey] || 0) - basePzas);
        const listo = actualPzas >= reqPzas;
        return `<span class="badge-pill" style="border-color:${listo ? '#10b981' : '#fbbf24'};">
          ${listo ? '✅' : '✂️'} ${sp ? sp.nombrePiezaResultante : piezaKey}: <strong>${actualPzas}/${reqPzas} pzas</strong>
        </span>`;
      }).join(' ');

    detalleProgresoHtml = `
      <div style="margin-top:6px; font-size:12px;">
        📌 <strong>Piezas cortadas para reponer el pedido (${hechoPzas}/${metaPzas} pzas):</strong>
        <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:5px;">${chipsCorte}</div>
      </div>
    `;
  } else if (op.area === 'ENSAMBLADO') {
    const porProdMeta = exp.porProducto || {
      ESTANDAR: exp.cajasEstandar || 0,
      PLUS: exp.cajasPlus || 0,
      NUEVO_ESTANDAR: exp.nuevoEstandar || 0,
      NUEVO_PLUS: exp.nuevoPlus || 0
    };
    const termPorProd = prog.terminadosPorProducto || {};
    const totalHecho = prog.cajasTotalesEntregadas || 0;
    pctAvance = Math.min(100, Math.round((totalHecho / Math.max(1, exp.totalCajas)) * 100));

    const chipsProd = Object.entries(porProdMeta)
      .filter(([, reqCant]) => reqCant > 0)
      .map(([pk, reqCant]) => {
        const specProd = appData.specs.BOM_CAJAS[pk];
        const hechoCant = termPorProd[pk] || 0;
        const listo = hechoCant >= reqCant;
        return `
          <span class="badge-pill" style="border-color:${listo ? '#10b981' : specProd.color};">
            ${listo ? '✅' : specProd.icono} ${specProd.corto}: <strong style="color:${specProd.color};">${hechoCant} / ${reqCant}</strong>
          </span>
        `;
      }).join('');

    detalleProgresoHtml = `
      <div style="margin-top:6px; font-size:13px; display:flex; gap:8px; flex-wrap:wrap;">
        ${chipsProd}
      </div>
    `;
  }

  bannerEl.innerHTML = `
    <div class="replenish-banner">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <div style="font-size:14px; font-weight:900; color:#fbbf24;">
          ${notifArea ? notifArea.titulo : '🔔 ORDEN DE REPOSICIÓN DEL DOCENTE'}
        </div>
        <span class="badge-pill" style="background:${ped.estado === 'COMPLETADO' ? '#059669' : '#d97706'}; color:#fff;">
          ${ped.id}: ${exp.resumenProductosTexto || ''} (${pctAvance}% en tu área)
        </span>
      </div>
      <div style="font-size:14px; font-weight:800; color:#fff; margin-top:4px;">
        👉 ${notifArea ? notifArea.instruccionPrincipal : ''}
      </div>
      <div style="font-size:11px; color:#cbd5e1; margin-top:2px;">
        ${notifArea ? notifArea.detalle : ''}
      </div>
      ${detalleProgresoHtml}
      <div class="progress-track">
        <div class="progress-fill" style="width:${pctAvance}%;"></div>
      </div>
    </div>
  `;
}

// ============================================================================
// PESTAÑA 2: PANEL DEL DOCENTE (PEDIDOS DE LOS 4 PRODUCTOS)
// ============================================================================

function ajustarInputDocente(inputId, delta) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const nuevo = Math.max(0, (Number(el.value) || 0) + delta);
  el.value = nuevo;
  actualizarVistaPreviaExplosion();
}

function setPedidoRapidoDocente(est, plus, nuevoEst = 0, nuevoPlus = 0) {
  const elE = document.getElementById('docInputEst');
  const elP = document.getElementById('docInputPlus');
  const elNE = document.getElementById('docInputNuevoEst');
  const elNP = document.getElementById('docInputNuevoPlus');
  if (elE) elE.value = est;
  if (elP) elP.value = plus;
  if (elNE) elNE.value = nuevoEst;
  if (elNP) elNP.value = nuevoPlus;
  actualizarVistaPreviaExplosion();
}

function actualizarVistaPreviaExplosion() {
  const previewEl = document.getElementById('docentePreviewExplosion');
  if (!previewEl || !appData) return;

  const est = Math.max(0, Number(document.getElementById('docInputEst')?.value || 0));
  const plus = Math.max(0, Number(document.getElementById('docInputPlus')?.value || 0));
  const nuevoEst = Math.max(0, Number(document.getElementById('docInputNuevoEst')?.value || 0));
  const nuevoPlus = Math.max(0, Number(document.getElementById('docInputNuevoPlus')?.value || 0));
  const total = est + plus + nuevoEst + nuevoPlus;

  const cantPorProd = {
    ESTANDAR: est,
    PLUS: plus,
    NUEVO_ESTANDAR: nuevoEst,
    NUEVO_PLUS: nuevoPlus
  };

  // Calcular explosión en base a BOM_CAJAS
  const piezasReq = {};
  for (const [pk, cant] of Object.entries(cantPorProd)) {
    if (cant <= 0) continue;
    const rec = appData.specs.BOM_CAJAS[pk];
    if (!rec) continue;
    for (const [comp, rCant] of Object.entries(rec.componentes)) {
      piezasReq[comp] = (piezasReq[comp] || 0) + (cant * rCant);
    }
  }

  let totalPlacas = 0;
  let totalTubos = 0;
  const detallePlacasArr = [];
  const detallePiezasArr = [];
  for (const sp of Object.values(appData.specs.PLACA_SPECS)) {
    const reqPzas = piezasReq[sp.piezaResultante] || 0;
    const cantPlacas = reqPzas > 0 ? Math.ceil(reqPzas / sp.rendimientoCorte) : 0;
    if (reqPzas > 0) {
      detallePiezasArr.push(`• <strong>${reqPzas}</strong> ${sp.nombrePiezaResultante}`);
    }
    if (cantPlacas > 0 && sp.tubosRequeridos > 0) {
      totalPlacas += cantPlacas;
      totalTubos += cantPlacas * sp.tubosRequeridos;
      detallePlacasArr.push(`• <strong>${cantPlacas}</strong> ${sp.corto}`);
    }
  }

  const resumenProd = [
    est > 0 ? `${est} Cajita Est.` : null,
    plus > 0 ? `${plus} Cajita Plus` : null,
    nuevoEst > 0 ? `${nuevoEst} Nuevo Est.` : null,
    nuevoPlus > 0 ? `${nuevoPlus} Nuevo Plus` : null
  ].filter(Boolean).join(' + ') || '0 productos';

  previewEl.innerHTML = `
    <div class="passport-block" style="border-color:#3b82f6;">
      <div class="passport-block-title">1. NOTIFICACIÓN A ENROLLADO (4 OP: OP 1-4)</div>
      <div style="font-size:14px; font-weight:800; color:#38bdf8;">Enrollar y reponer ${totalTubos} tubos</div>
      <div style="font-size:11px; color:#94a3b8; margin-top:2px;">~${Math.ceil(totalTubos / 4)} tubos por cada operario para reponer el amortiguador de Pegado.</div>
    </div>

    <div class="passport-block" style="border-color:#06b6d4;">
      <div class="passport-block-title">2. NOTIFICACIÓN A PEGADO (4 OP: OP 5-8)</div>
      <div style="font-size:13px; font-weight:800; color:#22d3ee;">Pegar ${totalPlacas} sub-ensambles:</div>
      <div style="font-size:11px; color:#cbd5e1; margin-top:3px;">
        ${detallePlacasArr.join(' &nbsp;|&nbsp; ') || 'Ninguna placa'}
      </div>
    </div>

    <div class="passport-block" style="border-color:#f59e0b;">
      <div class="passport-block-title">3. NOTIFICACIÓN A CORTADO (1 OP: OP 9)</div>
      <div style="font-size:13px; font-weight:800; color:#fbbf24;">Cortar y enviar a Ensamblado:</div>
      <div style="font-size:11px; color:#cbd5e1; margin-top:3px;">
        ${detallePiezasArr.join(' &nbsp;|&nbsp; ') || 'Ninguna pieza'}
      </div>
    </div>

    <div class="passport-block" style="border-color:#10b981;">
      <div class="passport-block-title">4. NOTIFICACIÓN A ENSAMBLADO (4 OP: OP 10-13)</div>
      <div style="font-size:13px; font-weight:800; color:#34d399;">
        Ensamblar y Terminar ${total} unidad(es):
      </div>
      <div style="font-size:11px; color:#cbd5e1; margin-top:3px;">
        <strong>${resumenProd}</strong><br/>
        Los 4 operarios de Ensamblado terminan directamente los 4 productos y los entregan al Docente.
      </div>
    </div>
  `;
}

function lanzarPedidoDocente() {
  const est = Math.max(0, Number(document.getElementById('docInputEst')?.value || 0));
  const plus = Math.max(0, Number(document.getElementById('docInputPlus')?.value || 0));
  const nuevoEst = Math.max(0, Number(document.getElementById('docInputNuevoEst')?.value || 0));
  const nuevoPlus = Math.max(0, Number(document.getElementById('docInputNuevoPlus')?.value || 0));
  if (est + plus + nuevoEst + nuevoPlus === 0) {
    showToast('Ingresa al menos 1 unidad de alguno de los 4 productos para lanzar el pedido', true);
    return;
  }
  sendAction({
    type: 'CREAR_PEDIDO_DOCENTE',
    cajasEstandar: est,
    cajasPlus: plus,
    nuevoEstandar: nuevoEst,
    nuevoPlus: nuevoPlus
  });
}

function renderDocenteTab() {
  actualizarVistaPreviaExplosion();
  const listEl = document.getElementById('docenteOrdersList');
  if (!listEl || !appData) return;

  const pedidos = appData.state.pedidosDocente || [];
  if (pedidos.length === 0) {
    listEl.innerHTML = `
      <div style="background:#0f172a; border:1px dashed #334155; border-radius:12px; padding:20px; text-align:center; color:#94a3b8;">
        El Docente aún no ha lanzado pedidos en esta corrida. Usa los selectores arriba para pedir cualquiera de los <strong>4 productos</strong> y notificar automáticamente a las 4 estaciones.
      </div>
    `;
    return;
  }

  listEl.innerHTML = pedidos.map(ped => {
    const exp = ped.explosion;
    const prog = ped.progreso || {};
    const hora = new Date(ped.timestampCreacion).toLocaleTimeString();
    const completado = ped.estado === 'COMPLETADO';

    return `
      <div class="box-passport-card" style="border-left-color:${completado ? '#10b981' : '#f59e0b'};">
        <div class="passport-header">
          <div>
            <span class="passport-id">📋 ${ped.id} — Pedido: ${exp.resumenProductosTexto || ''} (${exp.totalCajas} unid.)</span>
            <span class="badge-pill" style="margin-left:6px; background:${completado ? '#059669' : '#d97706'}; color:#fff;">
              ${completado ? `✅ PEDIDO COMPLETADO (${ped.tiempoCumplimientoSeg}s)` : '⏳ EN REPOSICIÓN Y PRODUCCIÓN'}
            </span>
          </div>
          <div style="font-size:12px; color:#94a3b8;">Solicitado a las: <strong>${hora}</strong></div>
        </div>

        <div class="passport-grid">
          <div class="passport-block">
            <div class="passport-block-title">1. ENROLLADO (4 OP - TUBOS)</div>
            <div style="font-size:14px; font-weight:800; color:#38bdf8;">${prog.tubosEnrollados || 0} / ${exp.totalTubosParaPlacas} tubos</div>
          </div>
          <div class="passport-block">
            <div class="passport-block-title">2. PEGADO (4 OP - PLACAS)</div>
            <div style="font-size:14px; font-weight:800; color:#22d3ee;">${prog.placasPegadas || 0} / ${exp.totalPlacasPegar} placas</div>
          </div>
          <div class="passport-block">
            <div class="passport-block-title">3. CORTADO (1 OP - PIEZAS)</div>
            <div style="font-size:14px; font-weight:800; color:#fbbf24;">${prog.piezasCortadasHechas || 0} / ${prog.piezasCortadasMeta || 0} piezas</div>
          </div>
          <div class="passport-block">
            <div class="passport-block-title">4. ENSAMBLADO (4 OP - ENTREGADAS)</div>
            <div style="font-size:14px; font-weight:800; color:#34d399;">
              ${prog.cajasTotalesEntregadas || 0} / ${exp.totalCajas} productos terminados
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// RENDERIZADO DE LA ESTACIÓN ACTIVA (LAS 4 ESTACIONES Y LOS 4 PRODUCTOS)
// ============================================================================

function togglePolivalentePicker() {
  polivalentePickerOpen = !polivalentePickerOpen;
  renderPolivalenteControlBanner();
}

function cambiarAreaPolivalente(operarioId, nuevaArea) {
  polivalentePickerOpen = false;
  sendAction({
    type: 'CAMBIAR_AREA_POLIVALENTE',
    operarioId,
    nuevaArea
  });
}

function renderPolivalenteControlBanner() {
  const bannerEl = document.getElementById('polivalenteControlBanner');
  if (!bannerEl || !appData) return;

  const { state } = appData;
  const op = state.operarios.find(o => o.id === selectedOperatorId) || state.operarios[0];

  if (!op.esPolivalente) {
    bannerEl.innerHTML = '';
    return;
  }

  const areaTitulos = {
    ENROLLADO: '1. Enrollado (Tubos)',
    PEGADO: '2. Pegado (Placas/Bloques)',
    CORTADO: '3. Cortado (Máquina)',
    ENSAMBLADO: '4. Ensamblado (4 Productos)'
  };
  const areaColores = {
    ENROLLADO: '#3b82f6',
    PEGADO: '#06b6d4',
    CORTADO: '#f59e0b',
    ENSAMBLADO: '#10b981'
  };

  const inicioTramo = op.inicioAreaActualTimestamp || state.session.inicioTimestamp;
  const tiempoEnAreaActualSeg = (inicioTramo && state.session.estado !== 'LISTO_PARA_INICIAR')
    ? Math.max(0, Math.floor((Date.now() - inicioTramo) / 1000))
    : 0;
  const horaInicioTramo = inicioTramo ? new Date(inicioTramo).toLocaleTimeString() : '--:--:--';

  const historial = op.historialPolivalencia || [];
  const histHtml = historial.slice(0, 3).map(h => `
    <div style="font-size:11px; color:#cbd5e1; margin-top:3px;">
      ⏱️ <strong>${h.horaCambioTexto}:</strong> Pasó de <span style="color:#94a3b8;">${h.desdeAreaNombre}</span> ➜ <strong style="color:#34d399;">${h.haciaAreaNombre}</strong> (Estuvo ${h.duracionEnAreaAnteriorSeg}s en ${h.desdeArea})
    </div>
  `).join('');

  const opcionesAreasHtml = (op.areasPolivalentes || []).map(areaKey => {
    const esActual = op.area === areaKey;
    const colorArea = areaColores[areaKey] || '#38bdf8';
    return `
      <button class="giant-btn" style="min-height:66px; margin-bottom:0; background:${esActual ? 'rgba(16,185,129,0.22)' : 'rgba(30,41,59,0.95)'}; border:2px solid ${colorArea};"
        onclick="cambiarAreaPolivalente('${op.id}', '${areaKey}')">
        <span style="color:${colorArea}; font-size:15px;">
          ${esActual ? `✅ TRABAJANDO AHORA EN: ${areaTitulos[areaKey]}` : `🚀 IR A APOYAR A: ${areaTitulos[areaKey]}`}
        </span>
        <span class="giant-btn-sub">
          ${esActual ? `Iniciaste esta labor a las ${horaInicioTramo} (${formatSecondsMMSS(tiempoEnAreaActualSeg)} activo)` : `Toca aquí cuando empieces a trabajar en ${areaTitulos[areaKey]} para registrar la hora exacta`}
        </span>
      </button>
    `;
  }).join('');

  bannerEl.innerHTML = `
    <div style="border:2px solid #f59e0b; background:linear-gradient(180deg, rgba(245,158,11,0.18), rgba(15,23,42,0.96)); border-radius:14px; padding:12px; margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div>
          <div style="font-size:14px; font-weight:900; color:#fbbf24;">
            🔄 OPERARIO POLIVALENTE — #${op.numero} ${op.nombre.toUpperCase()} (${(op.areasPolivalentes || []).join(' ⇄ ')})
          </div>
          <div style="font-size:12px; color:#cbd5e1; margin-top:2px;">
            Área actual: <strong style="color:#34d399;">${op.areaNombre}</strong> • Tiempo en esta labor: <strong style="color:#38bdf8;">${formatSecondsMMSS(tiempoEnAreaActualSeg)}</strong> (Inició: ${horaInicioTramo})
          </div>
        </div>
        <button class="btn-secondary" style="background:#f59e0b; border-color:#fde68a; color:#000; font-weight:900; padding:10px 14px; font-size:13px;" onclick="togglePolivalentePicker()">
          🔄 ${polivalentePickerOpen ? 'Cerrar Opciones de Área ▴' : 'CAMBIAR DE ÁREA (IR A OTRA ESTACIÓN) ▾'}
        </button>
      </div>

      <div style="display:${polivalentePickerOpen ? 'grid' : 'none'}; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:8px; margin-top:10px; padding-top:10px; border-top:1px solid rgba(245,158,11,0.35);">
        <div style="grid-column:1 / -1; font-size:11px; font-weight:800; color:#fde68a;">
          👇 SELECCIONA EL ÁREA A DONDE VAS A TRABAJAR AHORA (SE REGISTRARÁ LA HORA EXACTA DE INICIO):
        </div>
        ${opcionesAreasHtml}
      </div>

      ${histHtml ? `<div style="margin-top:8px; padding-top:6px; border-top:1px dashed rgba(255,255,255,0.15);">${histHtml}</div>` : ''}
    </div>
  `;
}

function renderActiveStationPanel() {
  const { state, metrics, specs } = appData;
  const op = state.operarios.find(o => o.id === selectedOperatorId) || state.operarios[0];
  const st = metrics.statsOperarios[op.id] || {};
  const buf = metrics.estadoAmortiguadores;

  renderPolivalenteControlBanner();

  document.getElementById('activeOpTitle').textContent = `👷 #${op.numero} ${op.nombre} — ${op.areaNombre}`;
  document.getElementById('activeOpRole').textContent = op.rol;
  document.getElementById('activeOpCycle').textContent = st.tiempoCicloPromedioSeg ? `${st.tiempoCicloPromedioSeg} s` : '-- s';
  document.getElementById('activeOpCount').textContent = st.unidadesProducidas || 0;
  document.getElementById('activeOpLastCycle').textContent = st.ultimoCicloSeg ? `${st.ultimoCicloSeg} s` : '-- s';

  const container = document.getElementById('stationActionArea');
  const origenEl = document.getElementById('flowOrigenText');
  const actualEl = document.getElementById('flowActualText');
  const destinoEl = document.getElementById('flowDestinoText');

  if (op.area === 'ENROLLADO') {
    origenEl.textContent = `MP: ${state.wip.hojasCartaDisponibles ?? 1200} hojas carta`;
    actualEl.textContent = '1. Enrollado (4 Op)';
    destinoEl.textContent = `Buffer Pegado: ${state.wip.tubosDisponibles} / ${buf.pegado.meta} tub`;

    container.innerHTML = `
      <div style="background:rgba(59,130,246,0.12); border:1px solid #3b82f6; border-radius:10px; padding:9px 12px; margin-bottom:10px; font-size:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <span>🛡️ <strong>Amortiguador de Pegado que alimentas:</strong> <strong style="color:#38bdf8; font-size:14px;">${state.wip.tubosDisponibles} tubos</strong> (Meta inicial: ${buf.pegado.meta} tubos)</span>
        <span class="badge-pill" style="color:${buf.pegado.color};">${buf.pegado.texto}</span>
      </div>

      <button class="giant-btn btn-blue" onclick="sendAction({ type: 'ENROLLADO', operarioId: '${op.id}', cantidad: 50 })">
        <span>➕ ENVIAR 50 TUBOS ENROLLADOS</span>
        <span class="giant-btn-sub">Envía un lote de 50 tubos al Área 2: Pegado (${state.wip.tubosDisponibles} disp.)</span>
      </button>

      <button class="giant-btn btn-emerald" style="margin-bottom:0;" onclick="sendAction({ type: 'ENROLLADO', operarioId: '${op.id}', cantidad: 100 })">
        <span>➕ ENVIAR 100 TUBOS ENROLLADOS</span>
        <span class="giant-btn-sub">Envía un lote de 100 tubos al Área 2: Pegado (${state.wip.tubosDisponibles} disp.)</span>
      </button>
    `;
  } else if (op.area === 'PEGADO') {
    origenEl.textContent = `Amortiguador: ${state.wip.tubosDisponibles} / ${buf.pegado.meta} tubos`;
    actualEl.textContent = '2. Pegado (4 Op)';
    destinoEl.textContent = `Buffer Corte: ${buf.cortado.actual} unid. (${buf.cortado.totalPlacas} placas)`;

    // Agrupar las placas a pegar en 4 marcos visuales (1 por cada uno de los 4 productos)
    const marcosPorProducto = Object.values(specs.BOM_CAJAS).map(prod => {
      const placasGrupo = Object.values(specs.PLACA_SPECS).filter(
        sp => sp.productoGrupo === prod.tipo && sp.tubosRequeridos > 0
      );
      const cortablesProdEnBuffer = buf.cortado.cortablesPorProducto?.[prod.tipo] ?? 0;

      const botonesGrupoHtml = placasGrupo.map(sp => {
        const cantPegadas = state.contadores.placasPegadas[sp.id] || 0;
        const enColaCorte = buf.cortado.conteoPlacasCola[sp.id] || 0;
        return `
          <button class="plate-btn" style="border-color:${sp.color};"
            onclick="sendAction({ type: 'PEGADO', operarioId: '${op.id}', tipoPlaca: '${sp.id}' })">
            <div class="plate-btn-top">
              <span class="plate-btn-title" style="color:${sp.color};">➕ ${sp.corto}</span>
              <span class="plate-badge">-${sp.tubosRequeridos} tubos</span>
            </div>
            <div class="plate-btn-bottom">
              Rinde en corte: <strong>${sp.rendimientoCorte} ${sp.nombrePiezaResultante}</strong><br/>
              <span style="font-size:10px; opacity:0.88;">En Amortiguador Corte: <strong style="color:#fbbf24;">${enColaCorte}</strong> placas • Pegadas hoy: ${cantPegadas}</span>
            </div>
          </button>
        `;
      }).join('');

      return `
        <div style="border:2px solid ${prod.color}; background:rgba(15,23,42,0.88); border-radius:14px; padding:12px; margin-bottom:14px; box-shadow:0 4px 14px rgba(0,0,0,0.28);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.12);">
            <div>
              <div style="font-size:15px; font-weight:900; color:${prod.color};">
                ${prod.icono} MARCO DE PLACAS PARA: ${prod.nombre.toUpperCase()}
              </div>
              <div style="font-size:11px; color:#cbd5e1;">
                ${prod.subtituloPegado || prod.descripcion}
              </div>
            </div>
            <span class="badge-pill" style="border-color:${prod.color}; color:${prod.color}; font-weight:800;">
              🛡️ Amortiguador Corte ${prod.corto}: ${cortablesProdEnBuffer} unid. completas
            </span>
          </div>
          <div class="action-grid-2">
            ${botonesGrupoHtml}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div style="background:rgba(16,185,129,0.12); border:1px solid ${buf.pegado.color}; border-radius:10px; padding:9px 12px; margin-bottom:12px; font-size:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <span>🛡️ <strong>Tu Amortiguador de Entrada (Pegado):</strong> <strong style="color:#38bdf8; font-size:15px;">${state.wip.tubosDisponibles} tubos</strong> (Inició con ${buf.pegado.meta} tubos)</span>
        <span class="badge-pill" style="color:${buf.pegado.color};">${buf.pegado.porcentaje}% • ${buf.pegado.texto}</span>
      </div>
      <div style="font-size:12px; font-weight:800; color:#38bdf8; margin-bottom:8px;">
        📦 PLACAS SEPARADAS EN MARCOS POR CADA UNO DE LOS 4 PRODUCTOS (AMORTIGUADORES INDEPENDIENTES):
      </div>
      ${marcosPorProducto}
    `;
  } else if (op.area === 'CORTADO') {
    origenEl.textContent = `Amortiguador: ${buf.cortado.actual} unid. (${buf.cortado.totalPlacas} placas)`;
    actualEl.textContent = '3. Cortado (1 Op)';
    destinoEl.textContent = `Buffer Ensamble: ${buf.ensamblado.actual} unid.`;

    const kitBtnsHtml = Object.values(specs.BOM_CAJAS).map(prod => {
      const cortadosHoy = state.contadores.kitsCortadosPorProducto?.[prod.tipo] || 0;
      const dispEnCorte = buf.cortado.cortablesPorProducto?.[prod.tipo] ?? 0;
      return `
        <button class="giant-btn ${prod.btnClass}" style="min-height:82px; font-size:15px; margin-bottom:0;"
          onclick="sendAction({ type: 'CORTADO_KIT_CAJA', operarioId: '${op.id}', tipoCaja: '${prod.tipo}' })">
          <span>✂️ CORTAR KIT: ${prod.icono} ${prod.nombre.toUpperCase()}</span>
          <span class="giant-btn-sub">En Amortiguador Corte: ${dispEnCorte} kits • Cortados hoy: ${cortadosHoy}</span>
        </button>
      `;
    }).join('');

    const marcosCortePorProducto = Object.values(specs.BOM_CAJAS).map(prod => {
      const placasGrupo = Object.values(specs.PLACA_SPECS).filter(
        sp => sp.productoGrupo === prod.tipo && sp.tubosRequeridos > 0
      );
      const btnsCorteGrupo = placasGrupo.map(sp => {
        const enBufferCorte = buf.cortado.conteoPlacasCola[sp.id] || 0;
        const stockPiezaEnsamble = state.wip.piezasCortadas[sp.piezaResultante] || 0;
        return `
          <button class="plate-btn" style="border-color:${sp.color}; min-height:86px;"
            onclick="sendAction({ type: 'CORTADO', operarioId: '${op.id}', tipoPlaca: '${sp.id}' })">
            <div class="plate-btn-top">
              <span class="plate-btn-title" style="color:${sp.color};">✂️ Cortar ${sp.corto}</span>
              <span class="plate-badge" style="background:#059669;">+${sp.rendimientoCorte} pzas</span>
            </div>
            <div class="plate-btn-bottom">
              En Amortiguador Corte: <strong style="color:#fbbf24;">${enBufferCorte} placas</strong><br/>
              Sale <strong>+${sp.rendimientoCorte} ${sp.nombrePiezaResultante}</strong> (En Ensamble: ${stockPiezaEnsamble})
            </div>
          </button>
        `;
      }).join('');

      return `
        <div style="border:2px solid ${prod.color}; background:rgba(15,23,42,0.88); border-radius:14px; padding:10px; margin-bottom:12px;">
          <div style="font-size:13px; font-weight:900; color:${prod.color}; margin-bottom:6px;">
            ${prod.icono} CORTAR PLACAS DE: ${prod.nombre.toUpperCase()}
          </div>
          <div class="action-grid-2">
            ${btnsCorteGrupo}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div style="background:rgba(245,158,11,0.12); border:1px solid ${buf.cortado.color}; border-radius:10px; padding:10px 12px; margin-bottom:10px; font-size:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
          <span>🛡️ <strong>Tu Amortiguador de Cortado por Producto:</strong> C.Est: <strong>${buf.cortado.cortablesPorProducto?.ESTANDAR || 0}</strong> | C.Plus: <strong>${buf.cortado.cortablesPorProducto?.PLUS || 0}</strong> | N.Est: <strong>${buf.cortado.cortablesPorProducto?.NUEVO_ESTANDAR || 0}</strong> | N.Plus: <strong>${buf.cortado.cortablesPorProducto?.NUEVO_PLUS || 0}</strong> (${buf.cortado.totalPlacas} placas)</span>
          <span class="badge-pill" style="color:${buf.cortado.color};">${buf.cortado.porcentaje}% de ${buf.cortado.meta} unid.</span>
        </div>
      </div>

      <div style="font-size:12px; font-weight:800; color:#38bdf8; margin-bottom:6px;">
        ⚡ OPCIÓN A: CORTAR KIT COMPLETO DE 1 PRODUCTO (4 PRODUCTOS DISPONIBLES):
      </div>
      <div class="action-grid-2" style="margin-bottom:12px;">
        ${kitBtnsHtml}
      </div>

      <div style="font-size:12px; font-weight:800; color:#94a3b8; margin-bottom:6px;">
        ✂️ OPCIÓN B: CORTAR POR PLACA / BLOQUE INDIVIDUAL AGRUPADO POR PRODUCTO:
      </div>
      ${marcosCortePorProducto}
    `;
  } else if (op.area === 'ENSAMBLADO') {
    const p = state.wip.piezasCortadas;
    const ensMetrics = metrics.estaciones.ensamblado;

    origenEl.textContent = `Amortiguador: ${buf.ensamblado.actual} unid. listas`;
    actualEl.textContent = '4. Ensamblado (4 Op)';
    destinoEl.textContent = `Almacén PT / Entrega Docente (+1 Truput)`;

    // Generar los 4 botones gigantes para los 4 productos que se terminan aquí en Ensamblado
    const botones4Productos = Object.values(specs.BOM_CAJAS).map(prod => {
      const pedPend = (state.pedidosDocente || []).find(pd => (pd.progreso?.faltanPorProducto?.[prod.tipo] || 0) > 0);
      const faltanDoc = pedPend ? (pedPend.progreso.faltanPorProducto[prod.tipo] || 0) : 0;
      const metaDoc = pedPend ? (pedPend.explosion.porProducto?.[prod.tipo] || 0) : 0;
      const armablesAhora = ensMetrics.armablesPorProducto?.[prod.tipo] ?? 0;
      const terminadosHoy = state.contadores.productosTerminados?.[prod.tipo] || 0;

      const detalleCompTexto = prod.descripcion || Object.entries(prod.componentes)
        .map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`)
        .join(', ');

      return `
        <button class="giant-btn ${prod.btnClass}" style="margin-bottom:10px;"
          onclick="sendAction({ type: 'ENSAMBLADO', operarioId: '${op.id}', tipoCaja: '${prod.tipo}' })">
          <span>${faltanDoc > 0
            ? `${prod.icono} TERMINAR ${prod.nombre.toUpperCase()} (DOCENTE: FALTAN ${faltanDoc} DE ${metaDoc})`
            : `${prod.icono} TERMINAR ${prod.nombre.toUpperCase()} (PRODUCTO TERMINADO)`}</span>
          <span class="giant-btn-sub">
            Consume: ${detalleCompTexto}
          </span>
          <span class="badge-pill" style="background:rgba(0,0,0,0.3); color:#fff; margin-top:4px;">
            ${faltanDoc > 0
              ? `🔔 Pendiente Pedido Docente (${metaDoc - faltanDoc}/${metaDoc} listas)`
              : `✅ Suma +1 al Truput Físico (${terminadosHoy} terminados hoy)`}
            • Armables en buffer: ${armablesAhora}
          </span>
        </button>
      `;
    }).join('');

    const chipsInventarioEnsamble = Object.values(specs.PLACA_SPECS).map(sp => {
      const cantDisp = p[sp.piezaResultante] || 0;
      return `<span class="badge-pill" style="border-color:${sp.color};">${sp.nombrePiezaResultante}: <strong style="color:${sp.color};">${cantDisp}</strong></span>`;
    }).join('');

    container.innerHTML = `
      <div style="background:rgba(16,185,129,0.12); border:1px solid ${buf.ensamblado.color}; border-radius:10px; padding:10px 12px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; font-size:12px;">
          <span>🛡️ <strong>Tu Amortiguador de Ensamblado (4 Operarios: Op 10-13):</strong> <strong style="color:#34d399; font-size:15px;">${buf.ensamblado.actual} Unidades Armables</strong> (Meta inicial: ${buf.ensamblado.meta} unid.)</span>
          <span class="badge-pill" style="color:${buf.ensamblado.color};">${buf.ensamblado.porcentaje}% • ${buf.ensamblado.texto}</span>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:5px; font-size:11px; margin-top:8px;">
          ${chipsInventarioEnsamble}
        </div>
      </div>

      <div style="font-size:12px; font-weight:800; color:#34d399; margin-bottom:8px;">
        🎯 TOCA EL PRODUCTO QUE ACABAS DE ENSAMBLAR (LOS 4 FINALIZAN AQUÍ Y SUMAN +1 AL TRUPUT):
      </div>
      ${botones4Productos}
    `;
  }
}

function registrarMermaActiva() {
  const motivo = prompt('Motivo corto del defecto / merma (ej. tubo roto, corte desigual, despegado):', 'Defecto de proceso');
  if (motivo !== null) {
    sendAction({
      type: 'MERMA',
      operarioId: selectedOperatorId,
      motivo: motivo || 'Defecto de proceso'
    });
  }
}

function renderMiniWip() {
  const { metrics } = appData;
  const buf = metrics.estadoAmortiguadores;
  const badge = document.getElementById('bottleneckMiniBadge');
  if (badge) {
    badge.textContent = `${metrics.cuelloDeBotella}`;
  }

  const grid = document.getElementById('miniWipSummary');
  if (!grid || !buf) return;

  grid.innerHTML = `
    <div class="metric-box" style="border-left: 4px solid ${buf.enrollado.color};">
      <div class="metric-box-label">🛡️ 1. Enrollado (4 Operarios)</div>
      <div class="metric-box-value" style="color:#60a5fa;">${buf.enrollado.actual} <span style="font-size:13px; color:#94a3b8;">hojas carta</span></div>
      <div class="metric-box-sub">Op 1 al 4 • Alimenta a Pegado</div>
    </div>

    <div class="metric-box" style="border-left: 4px solid ${buf.pegado.color};">
      <div class="metric-box-label">🛡️ 2. Amortiguador Pegado (4 Op)</div>
      <div class="metric-box-value" style="color:#38bdf8;">${buf.pegado.actual} <span style="font-size:13px; color:#94a3b8;">/ ${buf.pegado.meta} tubos</span></div>
      <div class="metric-box-sub">${buf.pegado.texto}</div>
    </div>

    <div class="metric-box" style="border-left: 4px solid ${buf.cortado.color};">
      <div class="metric-box-label">🛡️ 3. Amortiguador Cortado (1 Op)</div>
      <div class="metric-box-value" style="color:#fbbf24;">${buf.cortado.actual} <span style="font-size:13px; color:#94a3b8;">/ ${buf.cortado.meta} unid.</span></div>
      <div class="metric-box-sub"><strong>${buf.cortado.totalPlacas} placas</strong> en cola de corte</div>
    </div>

    <div class="metric-box" style="border-left: 4px solid ${buf.ensamblado.color};">
      <div class="metric-box-label">🛡️ 4. Amortiguador Ensamblado (4 Op)</div>
      <div class="metric-box-value" style="color:#34d399;">${buf.ensamblado.actual} <span style="font-size:13px; color:#94a3b8;">/ ${buf.ensamblado.meta} unid.</span></div>
      <div class="metric-box-sub">Op 10 al 13 • Fin de los 4 Productos</div>
    </div>
  `;
}

// ============================================================================
// PESTAÑA 3: TRAZABILIDAD DE LOS 4 PRODUCTOS (DE DÓNDE VIENE Y A DÓNDE VA)
// ============================================================================

function setFiltroCajas(f) {
  filtroCajas = f;
  renderTraceabilityTab();
}

function renderTraceabilityTab() {
  const { state, specs } = appData;
  const listEl = document.getElementById('traceabilityBoxesList');
  if (!listEl) return;

  let cajasFiltradas = state.cajas || [];
  if (filtroCajas !== 'TODAS') {
    cajasFiltradas = cajasFiltradas.filter(c => c.tipo === filtroCajas);
  }

  if (cajasFiltradas.length === 0) {
    listEl.innerHTML = `
      <div style="background:#0f172a; border:1px dashed #334155; border-radius:12px; padding:24px; text-align:center; color:#94a3b8;">
        No hay productos registrados en este filtro actualmente.
      </div>
    `;
  } else {
    listEl.innerHTML = cajasFiltradas.map(c => {
      const prodSpec = specs.BOM_CAJAS[c.tipo] || { icono: '📦', color: '#10b981' };
      const horaFin = c.tiempos.terminadoTimestamp ? new Date(c.tiempos.terminadoTimestamp).toLocaleTimeString() : '';

      return `
        <div class="box-passport-card" style="border-left-color:${prodSpec.color};">
          <div class="passport-header">
            <div>
              <span class="passport-id" style="color:${prodSpec.color};">${prodSpec.icono} ${c.id} — ${c.nombreProducto}</span>
              <span class="badge-pill" style="margin-left:6px; background:#059669; color:#fff;">
                ✅ PRODUCTO TERMINADO (+1 TRUPUT)
              </span>
              ${c.esAmortiguador ? `<span class="badge-pill" style="margin-left:4px; border-color:#38bdf8; color:#38bdf8;">🛡️ Usó Amortiguador Inicial</span>` : ''}
            </div>
            <div style="font-size:12px; color:#94a3b8;">
              Terminado: <strong>${horaFin}</strong>
              ${c.leadTimeTotalSeg ? ` • Lead Time: <strong style="color:#38bdf8;">${c.leadTimeTotalSeg}s</strong>` : ''}
            </div>
          </div>

          <div class="passport-grid">
            <div class="passport-block">
              <div class="passport-block-title">📥 ¿DE DÓNDE VIENE EL PRODUCTO? (LAS 4 ESTACIONES)</div>
              <div><strong>1. Enrollado (4 op):</strong> ${(c.origen.operariosEnrollado || []).join(', ') || 'Amortiguador'}</div>
              <div><strong>2. Pegado (4 op):</strong> ${(c.origen.operariosPegado || []).join(', ') || 'Amortiguador'}</div>
              <div><strong>Placas usadas:</strong> <span style="color:#38bdf8;">${(c.origen.placasUtilizadas || []).join(', ') || 'Amortiguador'}</span></div>
              <div><strong>3. Cortado (1 op):</strong> ${(c.origen.operariosCorte || []).join(', ') || 'Operario 9'}</div>
              <div><strong>4. Ensamblado (4 op):</strong> <span style="color:#34d399; font-weight:700;">${c.origen.operarioEnsambladoNombre} (${c.origen.operarioEnsambladoId})</span></div>
            </div>

            <div class="passport-block">
              <div class="passport-block-title">📤 ¿A DÓNDE VA EL PRODUCTO? (RUTA Y PEDIDO DEL DOCENTE)</div>
              <div><strong>Ubicación Actual:</strong> <span style="color:#34d399; font-weight:700;">${c.estacionActual}</span></div>
              <div style="margin-top:4px;"><strong>Ruta en las 4 Estaciones:</strong><br/>${c.destino.rutaProceso}</div>
              <div style="margin-top:4px;"><strong>Pedido / Destino Asignado:</strong> <span style="color:#38bdf8; font-weight:800;">${c.destino.destinoFinalCliente}</span></div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  const tbody = document.getElementById('liveEventsTableBody');
  if (tbody) {
    tbody.innerHTML = (state.eventos || []).slice(0, 60).map(ev => `
      <tr>
        <td style="white-space:nowrap;">${new Date(ev.timestamp).toLocaleTimeString()}</td>
        <td><strong>${ev.operarioNombre}</strong> <span style="color:#94a3b8;">(${ev.operarioId})</span></td>
        <td><span class="badge-pill">${ev.area}</span></td>
        <td>${ev.etiqueta}</td>
        <td style="color:#94a3b8;">${ev.origen || '-'}</td>
        <td style="color:#38bdf8; font-weight:600;">${ev.destino || '-'}</td>
        <td>${ev.cicloSeg ? `${ev.cicloSeg} s` : '-'}</td>
      </tr>
    `).join('');
  }
}

// ============================================================================
// PESTAÑA 4: THROUGHPUT FÍSICO, BALANCEO DE LÍNEA (TAKT TIME) Y RESUMEN
// ============================================================================

function actualizarConfigTakt() {
  const dem = Number(document.getElementById('inputTaktDemanda')?.value || 6);
  const min = Number(document.getElementById('inputTaktMinutos')?.value || 15);
  sendAction({
    type: 'CONFIG_TAKT',
    demandaMetaUnidades: dem,
    tiempoDisponibleMin: min
  });
}

function renderLineBalancingChart() {
  const container = document.getElementById('lineBalancingChartContainer');
  if (!container || !appData) return;

  const bal = appData.metrics.balanceoLinea;
  if (!bal) return;

  const inpDem = document.getElementById('inputTaktDemanda');
  const inpMin = document.getElementById('inputTaktMinutos');
  if (inpDem && document.activeElement !== inpDem) inpDem.value = bal.demandaMetaUnidades;
  if (inpMin && document.activeElement !== inpMin) inpMin.value = bal.tiempoDisponibleMin;

  const escalaMaxSeg = Math.max(
    bal.taktTimeSeg * 1.25,
    bal.maxCicloEstacionSeg * 1.15,
    60
  );
  const posTaktPct = Math.min(96, Math.round((bal.taktTimeSeg / escalaMaxSeg) * 100));

  const barrasHtml = (bal.estaciones || []).map(est => {
    const pctBarra = Math.min(100, Math.round((est.cicloEstacionPorCajaSeg / escalaMaxSeg) * 100));
    const colorBarra = est.superaTakt
      ? 'linear-gradient(90deg, #e11d48, #f43f5e)'
      : (est.cicloEstacionPorCajaSeg > 0 && est.cicloEstacionPorCajaSeg === bal.maxCicloEstacionSeg
          ? 'linear-gradient(90deg, #d97706, #fbbf24)'
          : 'linear-gradient(90deg, #059669, #34d399)');

    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; margin-bottom:4px; flex-wrap:wrap; gap:4px;">
          <div>
            <strong>${est.nombre}</strong>
            <span class="badge-pill" style="margin-left:6px; font-size:11px;">👥 ${est.operarios} Op.</span>
            <span style="color:#94a3b8; font-size:11px; margin-left:6px;">
              (Ciclo indiv.: ${est.cicloIndividualPromSeg !== null ? `${est.cicloIndividualPromSeg} ${est.unidadIndividual}` : 'Midiendo...'})
            </span>
          </div>
          <div>
            <strong style="color:${est.superaTakt ? '#fda4af' : '#34d399'}; font-size:14px;">
              ${est.cicloEstacionPorCajaSeg} s / unid
            </strong>
            <span class="badge-pill" style="margin-left:6px; border-color:${est.superaTakt ? '#f43f5e' : '#10b981'}; color:${est.superaTakt ? '#fda4af' : '#34d399'};">
              ${est.superaTakt ? `🔴 SUPERA TAKT (${est.porcentajeRespectoTakt}%)` : `🟢 OK (${est.porcentajeRespectoTakt}% del Takt)`}
            </span>
          </div>
        </div>

        <div style="position:relative; height:24px; background:#1e293b; border-radius:8px; overflow:hidden; border:1px solid #334155;">
          <div style="height:100%; width:${pctBarra}%; background:${colorBarra}; transition:width 0.35s ease;"></div>
          <!-- Línea vertical de Takt Time -->
          <div style="position:absolute; top:0; bottom:0; left:${posTaktPct}%; width:3px; background:#38bdf8; box-shadow:0 0 8px #38bdf8;" title="Takt Time: ${bal.taktTimeSeg} s/unid"></div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="eng-grid" style="margin-bottom:14px;">
      <div class="metric-box" style="border-color:#38bdf8;">
        <div class="metric-box-label">⏱️ TAKT TIME DEL CLIENTE / DOCENTE</div>
        <div class="metric-box-value" style="color:#38bdf8;">${bal.taktTimeSeg} s / unid</div>
        <div class="metric-box-sub">${bal.taktTimeMin} min/unid (${bal.demandaMetaUnidades} unid en ${bal.tiempoDisponibleMin} min)</div>
      </div>

      <div class="metric-box" style="border-color:${bal.cumpleTaktTime ? '#10b981' : '#f43f5e'};">
        <div class="metric-box-label">🔥 ESTACIÓN RESTRICCIÓN (CICLO MÁS LENTO)</div>
        <div class="metric-box-value" style="color:${bal.cumpleTaktTime ? '#fbbf24' : '#fda4af'}; font-size:16px;">
          ${bal.estacionCuelloDeBotellaCiclo}
        </div>
        <div class="metric-box-sub">
          ${bal.cumpleTaktTime ? '✅ Todas las estaciones están dentro del Takt Time' : '⚠️ Supera el Takt Time: requiere apoyo o amortiguador'}
        </div>
      </div>

      <div class="metric-box" style="border-color:#a855f7;">
        <div class="metric-box-label">⚖️ EFICIENCIA DE BALANCEO DE LÍNEA</div>
        <div class="metric-box-value" style="color:#c084fc;">${bal.eficienciaBalanceoPct}%</div>
        <div class="metric-box-sub">Fórmula: Σ Ciclos Estaciones / (4 Estaciones × Ciclo Máx)</div>
      </div>
    </div>

    <div style="background:#0b1120; border:1px solid #1e293b; border-radius:12px; padding:14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#94a3b8; margin-bottom:10px; flex-wrap:wrap; gap:6px;">
        <span>📊 <strong>TIEMPO DE CICLO EFECTIVO POR UNIDAD EN CADA ÁREA VS. LÍNEA AZUL DE TAKT TIME (${bal.taktTimeSeg} s/unid)</strong></span>
        <span style="color:#38bdf8; font-weight:800;">┃ Línea Azul = Takt Time (${bal.taktTimeSeg} s)</span>
      </div>
      ${barrasHtml}
    </div>
  `;
}

function renderThroughputTab() {
  const { state, metrics, specs } = appData;
  const th = metrics.throughput;
  const buf = metrics.estadoAmortiguadores;

  const btnIniciarTab = document.getElementById('btnIniciarProdTab');
  const btnPausar = document.getElementById('btnPausarReloj');
  const btnReanudar = document.getElementById('btnReanudarReloj');
  if (btnPausar && btnReanudar) {
    const isWaiting = state.session.estado === 'LISTO_PARA_INICIAR';
    const isPaused = state.session.estado === 'PAUSADO';
    if (btnIniciarTab) btnIniciarTab.style.display = isWaiting ? 'inline-block' : 'none';
    btnPausar.style.display = (!isWaiting && !isPaused) ? 'inline-block' : 'none';
    btnReanudar.style.display = isPaused ? 'inline-block' : 'none';
  }

  const thGrid = document.getElementById('throughputMetricsGrid');
  if (thGrid) {
    thGrid.innerHTML = `
      <div class="metric-box" style="border-color:#10b981;">
        <div class="metric-box-label">🏆 THROUGHPUT FÍSICO TOTAL (4 PRODUCTOS)</div>
        <div class="metric-box-value" style="color:#34d399;">${th.totalPorHora} unid / hora</div>
        <div class="metric-box-sub">
          <strong>${th.totalPorMinuto} unid / min</strong> • Total PT: <strong>${th.unidadesTerminadasTotal} unid.</strong> en ${metrics.tiempoEfectivoMin} min
        </div>
      </div>

      <div class="metric-box" style="border-color:#10b981;">
        <div class="metric-box-label">📦 1. CAJITA ESTÁNDAR & ✨ 2. CAJITA PLUS</div>
        <div class="metric-box-value" style="color:#fbbf24; font-size:18px;">
          Est: ${th.unidadesTerminadasEstandar} | Plus: ${th.unidadesTerminadasPlus}
        </div>
        <div class="metric-box-sub">
          Est: <strong>${th.estandarPorHora} u/h</strong> • Plus: <strong>${th.plusPorHora} u/h</strong>
        </div>
      </div>

      <div class="metric-box" style="border-color:#3b82f6;">
        <div class="metric-box-label">🔷 3. NUEVO ESTÁNDAR & 💎 4. NUEVO PLUS</div>
        <div class="metric-box-value" style="color:#60a5fa; font-size:18px;">
          N.Est: ${th.unidadesTerminadasNuevoEstandar || 0} | N.Plus: ${th.unidadesTerminadasNuevoPlus || 0}
        </div>
        <div class="metric-box-sub">
          N.Est: <strong>${th.nuevoEstandarPorHora || 0} u/h</strong> • N.Plus: <strong>${th.nuevoPlusPorHora || 0} u/h</strong>
        </div>
      </div>

      <div class="metric-box" style="border-color:#a855f7;">
        <div class="metric-box-label">⏱️ TIEMPO ENTRE SALIDAS & LEAD TIME</div>
        <div class="metric-box-value" style="color:#c084fc;">
          ${th.tiempoEntreSalidasSeg ? `${th.tiempoEntreSalidasSeg} s / unid` : '--'}
        </div>
        <div class="metric-box-sub">
          Lead Time Promedio: <strong>${th.leadTimePromedioSeg ? `${th.leadTimePromedioSeg} s` : 'Calculando...'}</strong>
        </div>
      </div>
    `;
  }

  // Renderizar el nuevo Gráfico de Balanceo de Línea y Takt Time
  renderLineBalancingChart();

  const tocBanner = document.getElementById('tocAlertBanner');
  if (tocBanner) {
    tocBanner.textContent = `🔍 Diagnóstico TOC: ${metrics.cuelloDeBotella}`;
  }

  // CUADRO RESUMEN CONSOLIDADO DE TODO LO PRODUCIDO (4 ESTACIONES Y 4 PRODUCTOS)
  const masterBody = document.getElementById('masterSummaryTableBody');
  if (masterBody) {
    const e = metrics.estaciones;
    const cfg = state.amortiguadoresConfig;
    const min = Math.max(0.01, metrics.tiempoEfectivoMin);
    const tubosConsumidosEnPegado = Object.entries(state.contadores.placasPegadas).reduce((acc, [k, cant]) => {
      const sp = specs.PLACA_SPECS[k];
      return acc + (cant * (sp ? sp.tubosRequeridos : 0));
    }, 0);

    const filasPlacas = Object.values(specs.PLACA_SPECS).map(sp => {
      const pegadas = state.contadores.placasPegadas[sp.id] || 0;
      const cortadas = state.contadores.placasCortadas[sp.id] || 0;
      const enColaCorte = buf.cortado.conteoPlacasCola[sp.id] || 0;
      const pzasGeneradas = state.contadores.piezasCortadasTotales[sp.piezaResultante] || 0;
      const pzasEnWipEnsamble = state.wip.piezasCortadas[sp.piezaResultante] || 0;
      return `
        <tr>
          <td><span style="color:${sp.color}; font-weight:700;">▪ ${sp.nombre}</span> <span style="color:#94a3b8; font-size:11px;">(${sp.tubosRequeridos} tub)</span></td>
          <td>En Buffer Corte</td>
          <td><strong>${pegadas} placas pegadas</strong></td>
          <td>${cortadas} placas cortadas</td>
          <td>${enColaCorte} placas en Corte | <strong>${pzasEnWipEnsamble} ${sp.nombrePiezaResultante}</strong> en Ensamble</td>
          <td>Generó <strong>${pzasGeneradas} ${sp.nombrePiezaResultante}</strong></td>
          <td>${(pegadas / min).toFixed(2)} plac/min</td>
        </tr>
      `;
    }).join('');

    masterBody.innerHTML = `
      <tr style="background:rgba(59,130,246,0.10);">
        <td><strong>1. Enrollado (4 Operarios: Op 1-4)</strong></td>
        <td><strong>${cfg.pegadoTubos} tubos</strong> (en Pegado)</td>
        <td><strong style="color:#38bdf8; font-size:14px;">${e.enrollado.tubosProducidos} tubos nuevos</strong></td>
        <td>${tubosConsumidosEnPegado} tubos usados en Pegado</td>
        <td><strong style="color:#38bdf8;">${state.wip.tubosDisponibles} tubos disponibles</strong></td>
        <td>${e.enrollado.tubosProducidos} tubos entregados</td>
        <td><strong>${e.enrollado.tasaTubosPorMin} tub/min</strong></td>
      </tr>
      <tr style="background:rgba(245,158,11,0.08);">
        <td><strong>2 y 3. Total Placas Pegadas (4 Op) y Cortadas (1 Op)</strong></td>
        <td><strong>${buf.cortado.meta} unid. equiv.</strong></td>
        <td><strong style="color:#fbbf24; font-size:14px;">${e.pegado.placasPegadas} placas pegadas</strong></td>
        <td><strong>${e.cortado.placasCortadas} placas/kits cortados</strong></td>
        <td><strong style="color:#fbbf24;">${buf.cortado.actual} unid. equiv.</strong> (${buf.cortado.totalPlacas} placas)</td>
        <td>Piezas enviadas a Ensamblado</td>
        <td><strong>${e.pegado.tasaPlacasPorMin} plac/min</strong></td>
      </tr>
      ${filasPlacas}
      <tr style="background:rgba(16,185,129,0.14);">
        <td><strong>4A. 📦 CAJITA ESTÁNDAR (Ensamblado Op 10-13)</strong></td>
        <td><strong>${cfg.ensambladoCajasEstandar} unid.</strong> (en piezas)</td>
        <td><strong style="color:#34d399; font-size:15px;">${th.unidadesTerminadasEstandar} Cajitas Estándar</strong></td>
        <td>Termina en Área 4: Ensamblado</td>
        <td>Piezas para <strong>${buf.ensamblado.cajasEst}</strong> más</td>
        <td><strong style="color:#34d399; font-size:15px;">✅ ${th.unidadesTerminadasEstandar} CAJITA ESTÁNDAR PT</strong></td>
        <td><strong style="color:#34d399;">${th.estandarPorMinuto} u/min (${th.estandarPorHora} u/h)</strong></td>
      </tr>
      <tr style="background:rgba(236,72,153,0.14);">
        <td><strong>4B. ✨ CAJITA PLUS (Ensamblado Op 10-13)</strong></td>
        <td><strong>${cfg.ensambladoCajasPlus} unid.</strong> (en piezas)</td>
        <td><strong style="color:#f472b6; font-size:15px;">${th.unidadesTerminadasPlus} Cajitas Plus</strong></td>
        <td>Termina en Área 4: Ensamblado</td>
        <td>Piezas para <strong>${buf.ensamblado.cajasPlus}</strong> más</td>
        <td><strong style="color:#f472b6; font-size:15px;">✅ ${th.unidadesTerminadasPlus} CAJITA PLUS PT</strong></td>
        <td><strong style="color:#f472b6;">${th.plusPorMinuto} u/min (${th.plusPorHora} u/h)</strong></td>
      </tr>
      <tr style="background:rgba(59,130,246,0.14);">
        <td><strong>4C. 🔷 NUEVO PRODUCTO ESTÁNDAR (Ensamblado Op 10-13)</strong></td>
        <td><strong>${cfg.ensambladoNuevoEstandar || 0} unid.</strong> (en piezas)</td>
        <td><strong style="color:#60a5fa; font-size:15px;">${th.unidadesTerminadasNuevoEstandar || 0} Nuevos Estándar</strong></td>
        <td>Termina en Área 4: Ensamblado</td>
        <td>Piezas para <strong>${buf.ensamblado.armablesPorProducto?.NUEVO_ESTANDAR || 0}</strong> más</td>
        <td><strong style="color:#60a5fa; font-size:15px;">✅ ${th.unidadesTerminadasNuevoEstandar || 0} NUEVO ESTÁNDAR PT</strong></td>
        <td><strong style="color:#60a5fa;">${th.nuevoEstandarPorMinuto || 0} u/min (${th.nuevoEstandarPorHora || 0} u/h)</strong></td>
      </tr>
      <tr style="background:rgba(168,85,247,0.14);">
        <td><strong>4D. 💎 NUEVO PRODUCTO PLUS (Ensamblado Op 10-13)</strong></td>
        <td><strong>${cfg.ensambladoNuevoPlus || 0} unid.</strong> (en piezas)</td>
        <td><strong style="color:#c084fc; font-size:15px;">${th.unidadesTerminadasNuevoPlus || 0} Nuevos Plus</strong></td>
        <td>Termina en Área 4: Ensamblado</td>
        <td>Piezas para <strong>${buf.ensamblado.armablesPorProducto?.NUEVO_PLUS || 0}</strong> más</td>
        <td><strong style="color:#c084fc; font-size:15px;">✅ ${th.unidadesTerminadasNuevoPlus || 0} NUEVO PLUS PT</strong></td>
        <td><strong style="color:#c084fc;">${th.nuevoPlusPorMinuto || 0} u/min (${th.nuevoPlusPorHora || 0} u/h)</strong></td>
      </tr>
      <tr style="background:rgba(59,130,246,0.22); font-size:13px;">
        <td><strong>🏆 TOTAL GENERAL SISTEMA (LOS 4 PRODUCTOS)</strong></td>
        <td><strong>600 tub / ${buf.cortado.meta} Corte / ${buf.ensamblado.meta} Ensamble</strong></td>
        <td><strong>${th.unidadesTerminadasTotal} productos ensamblados</strong></td>
        <td>Mermas reportadas: <strong style="color:#fda4af;">${state.contadores.mermasTotales}</strong></td>
        <td>4 Estaciones Activas (4-4-1-4)</td>
        <td><strong style="color:#fff; font-size:16px;">🏆 ${th.unidadesTerminadasTotal} PRODUCTOS TERMINADOS</strong></td>
        <td><strong style="color:#34d399; font-size:14px;">${th.totalPorMinuto} u/min (${th.totalPorHora} u/h)</strong></td>
      </tr>
    `;
  }

  // Tabla de las 4 estaciones con sus Amortiguadores
  const stBody = document.getElementById('stationsMetricsTableBody');
  if (stBody) {
    const e = metrics.estaciones;
    const cfg = state.amortiguadoresConfig;
    stBody.innerHTML = `
      <tr>
        <td><strong>1. Área de Enrollado</strong></td>
        <td><strong>4 Operarios (Op 1-4)</strong></td>
        <td>${cfg.enrolladoHojasCarta} hojas carta</td>
        <td><strong style="color:#38bdf8;">${e.enrollado.hojasDisponibles} hojas disponibles</strong></td>
        <td><span class="badge-pill" style="color:${buf.enrollado.color};">${buf.enrollado.texto}</span></td>
        <td>${e.enrollado.tubosProducidos} tubos nuevos</td>
        <td>${e.enrollado.tasaTubosPorMin} tub/min</td>
      </tr>
      <tr>
        <td><strong>2. Área de Pegado</strong></td>
        <td><strong>4 Operarios (Op 5-8)</strong></td>
        <td><strong>${cfg.pegadoTubos} tubos</strong></td>
        <td><strong style="color:#38bdf8; font-size:14px;">${buf.pegado.actual} tubos</strong></td>
        <td><span class="badge-pill" style="color:${buf.pegado.color};">${buf.pegado.porcentaje}% • ${buf.pegado.texto}</span></td>
        <td>${e.pegado.placasPegadas} placas nuevas</td>
        <td>${e.pegado.tasaPlacasPorMin} plac/min</td>
      </tr>
      <tr>
        <td><strong>3. Área de Cortado</strong></td>
        <td><strong>1 Operario (Op 9)</strong></td>
        <td><strong>${buf.cortado.meta} unid. equiv.</strong></td>
        <td><strong style="color:#fbbf24; font-size:14px;">${buf.cortado.actual} unid.</strong> (${buf.cortado.totalPlacas} placas)</td>
        <td><span class="badge-pill" style="color:${buf.cortado.color};">${buf.cortado.porcentaje}% • ${buf.cortado.texto}</span></td>
        <td>${e.cortado.placasCortadas} cortes</td>
        <td>${e.cortado.tasaCortesPorMin} cort/min</td>
      </tr>
      <tr>
        <td><strong>4. Área de Ensamblado</strong></td>
        <td><strong>4 Operarios (Op 10-13)</strong></td>
        <td><strong>${buf.ensamblado.meta} unid.</strong></td>
        <td><strong style="color:#34d399; font-size:14px;">${buf.ensamblado.actual} unid. listas</strong></td>
        <td><span class="badge-pill" style="color:${buf.ensamblado.color};">${buf.ensamblado.porcentaje}% • ${buf.ensamblado.texto}</span></td>
        <td>${e.ensamblado.cajasEnsambladasTotal} productos terminados</td>
        <td>${e.ensamblado.tasaEnsamblesPorMin} unid/min</td>
      </tr>
    `;
  }

  const bomBody = document.getElementById('bomStatusTableBody');
  if (bomBody) {
    const reqEst = specs.BOM_CAJAS.ESTANDAR.componentes;
    const reqPlus = specs.BOM_CAJAS.PLUS.componentes;
    const reqNE = specs.BOM_CAJAS.NUEVO_ESTANDAR.componentes;
    const reqNP = specs.BOM_CAJAS.NUEVO_PLUS.componentes;
    bomBody.innerHTML = Object.values(specs.PLACA_SPECS).map(sp => {
      const placasEnCorte = buf.cortado.conteoPlacasCola[sp.id] || 0;
      const stockActualEnsamble = state.wip.piezasCortadas[sp.piezaResultante] || 0;
      const rE = reqEst[sp.piezaResultante] || 0;
      const rP = reqPlus[sp.piezaResultante] || 0;
      const rNE = reqNE[sp.piezaResultante] || 0;
      const rNP = reqNP[sp.piezaResultante] || 0;
      return `
        <tr>
          <td><strong style="color:${sp.color};">${sp.nombre}</strong></td>
          <td>${sp.tubosRequeridos} tubos</td>
          <td><span class="badge-pill" style="color:#fbbf24;">${placasEnCorte} placas</span></td>
          <td><strong>${sp.nombrePiezaResultante}</strong></td>
          <td>Sale <strong>${sp.rendimientoCorte}</strong> pzas</td>
          <td><span class="badge-pill" style="font-size:13px; color:#34d399;">${stockActualEnsamble} pzas listas</span></td>
          <td>C.Est: <strong>${rE}</strong> | C.Plus: <strong>${rP}</strong> | N.Est: <strong>${rNE}</strong> | N.Plus: <strong>${rNP}</strong></td>
        </tr>
      `;
    }).join('');
  }

  const opsBody = document.getElementById('operatorsStatsTableBody');
  if (opsBody) {
    opsBody.innerHTML = state.operarios.map(op => {
      const st = metrics.statsOperarios[op.id] || {};
      const histPol = (op.historialPolivalencia || []);
      const polTexto = op.esPolivalente
        ? `<div style="font-size:10px; color:#fbbf24; margin-top:2px;">🔄 Polivalente (${histPol.length} cambios)${histPol[0] ? ` • Último a las ${histPol[0].horaCambioTexto}` : ''}</div>`
        : '';
      return `
        <tr>
          <td><strong>#${op.numero} (${op.id})</strong></td>
          <td>${op.nombre}${polTexto}</td>
          <td>${op.areaNombre}</td>
          <td><strong style="color:#38bdf8; font-size:14px;">${st.unidadesProducidas || 0}</strong></td>
          <td><strong style="color:#34d399;">${st.tiempoCicloPromedioSeg ? `${st.tiempoCicloPromedioSeg} s` : '--'}</strong></td>
          <td>${st.ultimoCicloSeg ? `${st.ultimoCicloSeg} s` : '--'}</td>
          <td style="color:${st.mermas > 0 ? '#f43f5e' : '#64748b'}; font-weight:700;">${st.mermas || 0}</td>
        </tr>
      `;
    }).join('');
  }
}

// ============================================================================
// PESTAÑA 5: CONFIGURACIÓN DE AMORTIGUADORES EN LAS 4 ESTACIONES Y 13 CELULARES
// ============================================================================

function renderConfigTab() {
  const { state, serverInfo } = appData;
  const cfg = state.amortiguadoresConfig || {};

  const setValIfNotFocused = (id, val) => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el && val !== undefined) {
      el.value = val;
    }
  };

  setValIfNotFocused('bufEnrolladoHojas', cfg.enrolladoHojasCarta ?? 1200);
  setValIfNotFocused('bufPegadoTubos', cfg.pegadoTubos ?? 600);
  setValIfNotFocused('bufCortadoEst', cfg.cortadoCajasEstandar ?? 13);
  setValIfNotFocused('bufCortadoPlus', cfg.cortadoCajasPlus ?? 13);
  setValIfNotFocused('bufCortadoNuevoEst', cfg.cortadoNuevoEstandar ?? 0);
  setValIfNotFocused('bufCortadoNuevoPlus', cfg.cortadoNuevoPlus ?? 0);
  setValIfNotFocused('bufEnsambladoEst', cfg.ensambladoCajasEstandar ?? 3);
  setValIfNotFocused('bufEnsambladoPlus', cfg.ensambladoCajasPlus ?? 3);
  setValIfNotFocused('bufEnsambladoNuevoEst', cfg.ensambladoNuevoEstandar ?? 0);
  setValIfNotFocused('bufEnsambladoNuevoPlus', cfg.ensambladoNuevoPlus ?? 0);

  const wifiBox = document.getElementById('wifiUrlsBox');
  if (wifiBox && serverInfo) {
    const urls = (serverInfo.ips || ['localhost']).map(ip => `http://${ip}:${serverInfo.port}`);
    wifiBox.innerHTML = urls.map(u => `<div style="margin:3px 0;">🔗 <a href="${u}" style="color:#38bdf8;" target="_blank">${u}</a></div>`).join('');
  }

  // Renderizar Link Público Multi-Red (4G/5G/Diferentes Redes) y QR Code
  const pubBox = document.getElementById('publicTunnelUrlBox');
  const qrImg = document.getElementById('publicQrImg');
  const statusBadge = document.getElementById('multiNetworkStatusBadge');
  const tunnel = serverInfo?.publicTunnel;
  const activePublicUrl = tunnel?.url || (window.location.origin.includes('trycloudflare.com') || window.location.origin.includes('lhr.life') || window.location.origin.includes('onrender.com') ? window.location.origin : null);

  if (pubBox) {
    if (activePublicUrl) {
      pubBox.innerHTML = `🌐 <a href="${activePublicUrl}" target="_blank" style="color:#34d399; text-decoration:underline;">${activePublicUrl}</a>`;
      if (statusBadge) {
        statusBadge.textContent = `🌐 MULTI-RED ACTIVO (${tunnel?.provider || 'Internet 4G/5G'})`;
        statusBadge.style.background = '#059669';
      }
      if (qrImg) {
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(activePublicUrl)}`;
        if (qrImg.src !== qrApiUrl) {
          qrImg.src = qrApiUrl;
        }
      }
    } else {
      pubBox.innerHTML = `⏳ Estableciendo túnel público Multi-Red (tarda ~4 segundos)... Si no aparece, pulsa "🔄 Generar Nuevo Link".`;
      if (statusBadge) {
        statusBadge.textContent = `⏳ CONECTANDO TÚNEL...`;
        statusBadge.style.background = '#d97706';
      }
      if (qrImg && serverInfo?.ips?.[0]) {
        const fallbackUrl = `http://${serverInfo.ips[0]}:${serverInfo.port}`;
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(fallbackUrl)}`;
      }
    }
  }

  setValIfNotFocused('inputLoteDestino', state.session.loteDestinoActual || '');

  const chkFlex = document.getElementById('chkInventarioFlexible');
  if (chkFlex) {
    chkFlex.checked = !!state.session.modoInventarioFlexible;
  }

  setValIfNotFocused('inputCustomServerUrl', localStorage.getItem('metodos_server_url') || '');

  const opsList = document.getElementById('operatorsConfigList');
  if (opsList && !opsList.dataset.rendered) {
    opsList.innerHTML = state.operarios.map(op => `
      <div class="passport-block">
        <div class="passport-block-title">#${op.numero} • ${op.areaNombre}</div>
        <div style="display:flex; gap:6px; margin-top:4px;">
          <input type="text" class="input-field" id="inp-${op.id}" value="${op.nombre}" />
          <button class="btn-secondary" onclick="guardarNombreOperario('${op.id}')">Guardar</button>
        </div>
      </div>
    `).join('');
    opsList.dataset.rendered = 'true';
  }
}

function aplicarAmortiguadoresYReiniciar() {
  const payload = {
    type: 'CONFIG_AMORTIGUADORES',
    usarAmortiguadoresAlIniciar: true,
    reiniciarConAmortiguadores: true,
    enrolladoHojasCarta: Number(document.getElementById('bufEnrolladoHojas')?.value || 1200),
    pegadoTubos: Number(document.getElementById('bufPegadoTubos')?.value || 600),
    cortadoCajasEstandar: Number(document.getElementById('bufCortadoEst')?.value || 13),
    cortadoCajasPlus: Number(document.getElementById('bufCortadoPlus')?.value || 13),
    cortadoNuevoEstandar: Number(document.getElementById('bufCortadoNuevoEst')?.value || 0),
    cortadoNuevoPlus: Number(document.getElementById('bufCortadoNuevoPlus')?.value || 0),
    ensambladoCajasEstandar: Number(document.getElementById('bufEnsambladoEst')?.value || 3),
    ensambladoCajasPlus: Number(document.getElementById('bufEnsambladoPlus')?.value || 3),
    ensambladoNuevoEstandar: Number(document.getElementById('bufEnsambladoNuevoEst')?.value || 0),
    ensambladoNuevoPlus: Number(document.getElementById('bufEnsambladoNuevoPlus')?.value || 0)
  };
  sendAction(payload);
}

function restaurarAmortiguadoresPorDefecto() {
  document.getElementById('bufEnrolladoHojas').value = 1200;
  document.getElementById('bufPegadoTubos').value = 600;
  document.getElementById('bufCortadoEst').value = 13;
  document.getElementById('bufCortadoPlus').value = 13;
  document.getElementById('bufCortadoNuevoEst').value = 0;
  document.getElementById('bufCortadoNuevoPlus').value = 0;
  document.getElementById('bufEnsambladoEst').value = 3;
  document.getElementById('bufEnsambladoPlus').value = 3;
  document.getElementById('bufEnsambladoNuevoEst').value = 0;
  document.getElementById('bufEnsambladoNuevoPlus').value = 0;
  aplicarAmortiguadoresYReiniciar();
}

function reiniciarSinAmortiguadores() {
  if (confirm('¿Deseas reiniciar la línea en CERO (sin amortiguadores iniciales en ninguna estación)?')) {
    sendAction({ type: 'RESET_SIMULACION', conAmortiguadores: false });
  }
}

function guardarNombreOperario(opId) {
  const inp = document.getElementById(`inp-${opId}`);
  if (!inp) return;
  sendAction({
    type: 'ACTUALIZAR_OPERARIO',
    operarioId: opId,
    nombre: inp.value
  });
}

function guardarConfigSesion() {
  const inputLote = document.getElementById('inputLoteDestino');
  const chkFlex = document.getElementById('chkInventarioFlexible');
  sendAction({
    type: 'CONFIG_SESION',
    loteDestinoActual: inputLote ? inputLote.value : undefined,
    modoInventarioFlexible: chkFlex ? chkFlex.checked : undefined
  });
}

function controlReloj(accionReloj) {
  sendAction({
    type: 'CONFIG_SESION',
    accionReloj
  });
}

function ejecutarSimulacionDemo() {
  sendAction({ type: 'SIMULAR_LOTE' });
}

function obtenerUrlMultiRedActual() {
  const tunnelUrl = appData?.serverInfo?.publicTunnel?.url;
  if (tunnelUrl) return tunnelUrl;
  if (!window.location.hostname.includes('localhost') && !window.location.hostname.startsWith('192.168.') && !window.location.hostname.startsWith('10.')) {
    return window.location.origin;
  }
  const ip = appData?.serverInfo?.ips?.[0] || 'localhost';
  const port = appData?.serverInfo?.port || 3000;
  return `http://${ip}:${port}`;
}

function copiarLinkMultiRed() {
  const url = obtenerUrlMultiRedActual();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast(`📋 Link copiado: ${url}`);
    }).catch(() => {
      prompt('Copia este link para los 13 celulares:', url);
    });
  } else {
    prompt('Copia este link para los 13 celulares:', url);
  }
}

function compartirLinkWhatsApp() {
  const url = obtenerUrlMultiRedActual();
  const msg = `📦 *LABORATORIO INGENIERÍA DE MÉTODOS (4 Estaciones y 4 Productos)*\n\n🌐 *Entra aquí desde tu celular (funciona con tus propios datos 4G/5G o cualquier Wi-Fi):*\n${url}\n\n👷 Selecciona tu número de Operario (1 al 13) arriba a la izquierda.`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
}

function regenerarTunelMultiRed() {
  sendAction({ type: 'REINICIAR_TUNEL' });
}

function guardarServerRemoto() {
  const inp = document.getElementById('inputCustomServerUrl');
  if (!inp) return;
  const val = inp.value.trim();
  if (val) {
    localStorage.setItem('metodos_server_url', val);
    showToast(`Conectando a servidor: ${val}`);
  } else {
    localStorage.removeItem('metodos_server_url');
    showToast('Usando servidor local por defecto');
  }
  connectRealtime();
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('btnInstallPwa');
  if (btn) {
    btn.style.display = 'inline-block';
    btn.onclick = async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      btn.style.display = 'none';
    };
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

fetch(`${getApiBase()}/api/state`)
  .then(r => r.json())
  .then(data => {
    appData = data;
    renderAll();
  })
  .catch(() => {});

connectRealtime();
