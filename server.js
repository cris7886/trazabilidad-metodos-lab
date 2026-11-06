const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { generarLibroXlsxBuffer } = require('./excel-generator');
const supabaseStore = require('./supabase-store');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'lab-state.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================================
// DEFINICIÓN DE INGENIERÍA DE MÉTODOS: 4 ESTACIONES, 13 OPERARIOS Y 4 PRODUCTOS
// Distribución: Enrollado (4), Pegado (4), Cortado (1), Ensamblado (4)
// Productos:
//   1) Cajita Estándar
//   2) Cajita Plus
//   3) Nuevo Producto Estándar
//   4) Nuevo Producto Plus
// ============================================================================

const PLACA_SPECS = {
  // ==========================================================================
  // GRUPO 1: SUB-ENSAMBLES DE CAJITA ESTÁNDAR (CON FIDEO)
  // ==========================================================================
  EST_PLACA_18_FIDEO: {
    id: 'EST_PLACA_18_FIDEO',
    productoGrupo: 'ESTANDAR',
    nombre: 'Placa 18 con Fideo (Pared Larga Est.)',
    corto: 'Placa 18 c/Fideo',
    tubosRequeridos: 18,
    piezaResultante: 'EST_PARED_LARGA',
    nombrePiezaResultante: 'Paredes Largas Cajita Estándar',
    rendimientoCorte: 5,
    usoProducto: '1. Cajita Estándar (rinde 5 paredes largas)',
    color: '#10b981'
  },
  EST_PLACA_9_FIDEO: {
    id: 'EST_PLACA_9_FIDEO',
    productoGrupo: 'ESTANDAR',
    nombre: 'Placa 9 con Fideo (Pared Corta Est.)',
    corto: 'Placa 9 c/Fideo',
    tubosRequeridos: 9,
    piezaResultante: 'EST_PARED_CORTA',
    nombrePiezaResultante: 'Paredes Cortas Cajita Estándar',
    rendimientoCorte: 5,
    usoProducto: '1. Cajita Estándar (rinde 5 paredes cortas)',
    color: '#059669'
  },
  EST_PLACA_9_BASE: {
    id: 'EST_PLACA_9_BASE',
    productoGrupo: 'ESTANDAR',
    nombre: 'Placa 9 (Base Cajita Estándar)',
    corto: 'Placa 9 (Base Est.)',
    tubosRequeridos: 9,
    piezaResultante: 'EST_BASE',
    nombrePiezaResultante: 'Bases Cajita Estándar',
    rendimientoCorte: 2,
    usoProducto: '1. Cajita Estándar (rinde 2 bases)',
    color: '#14b8a6'
  },
  EST_PLACA_13_FIDEO: {
    id: 'EST_PLACA_13_FIDEO',
    productoGrupo: 'ESTANDAR',
    nombre: 'Placa 13 con Fideo (Tapa Estándar)',
    corto: 'Placa 13 c/Fideo (Tapa)',
    tubosRequeridos: 13,
    piezaResultante: 'EST_TAPA',
    nombrePiezaResultante: 'Tapa Cajita Estándar (+2 Mermas)',
    rendimientoCorte: 1,
    usoProducto: '1. Cajita Estándar (rinde 1 tapa + 2 mermas p/ Nuevo Est.)',
    color: '#f59e0b'
  },
  EST_PIRAMIDE_3_FIDEO: {
    id: 'EST_PIRAMIDE_3_FIDEO',
    productoGrupo: 'ESTANDAR',
    nombre: 'Grupo de 3 Pirámide con Fideo (Agarrador Est.)',
    corto: 'Pirámide 3 c/Fideo',
    tubosRequeridos: 3,
    piezaResultante: 'EST_AGARRADOR',
    nombrePiezaResultante: 'Agarradores c/Fideo (Cajita Est.)',
    rendimientoCorte: 5,
    usoProducto: '1. Cajita Estándar (rinde 5 agarradores)',
    color: '#34d399'
  },
  EST_GRUPO_9_3X3: {
    id: 'EST_GRUPO_9_3X3',
    productoGrupo: 'ESTANDAR',
    nombre: 'Grupo de 9 (3x3 Patitas Cajita Est.)',
    corto: 'Grupo 9 (3x3 Est.)',
    tubosRequeridos: 9,
    piezaResultante: 'EST_PATITA',
    nombrePiezaResultante: 'Patitas Cajita Estándar',
    rendimientoCorte: 12,
    usoProducto: '1. Cajita Estándar (rinde 12 patitas)',
    color: '#0d9488'
  },

  // ==========================================================================
  // GRUPO 2: SUB-ENSAMBLES DE CAJITA PLUS (CON BASE DE PAPEL / SIN FIDEO)
  // ==========================================================================
  PLUS_PLACA_18_PAPEL: {
    id: 'PLUS_PLACA_18_PAPEL',
    productoGrupo: 'PLUS',
    nombre: 'Placa 18 con Papel (Pared Larga Plus)',
    corto: 'Placa 18 c/Papel',
    tubosRequeridos: 18,
    piezaResultante: 'PLUS_PARED_LARGA',
    nombrePiezaResultante: 'Paredes Largas Plus (c/Papel)',
    rendimientoCorte: 5,
    usoProducto: '2. Cajita Plus (rinde 5 paredes largas plus)',
    color: '#ec4899'
  },
  PLUS_PLACA_9_PAPEL_PARED: {
    id: 'PLUS_PLACA_9_PAPEL_PARED',
    productoGrupo: 'PLUS',
    nombre: 'Placa 9 con Papel (Pared Corta Plus)',
    corto: 'Placa 9 c/Papel (Pared)',
    tubosRequeridos: 9,
    piezaResultante: 'PLUS_PARED_CORTA',
    nombrePiezaResultante: 'Paredes Cortas Plus (c/Papel)',
    rendimientoCorte: 5,
    usoProducto: '2. Cajita Plus (rinde 5 paredes cortas plus)',
    color: '#db2777'
  },
  PLUS_PLACA_9_PAPEL_BASE: {
    id: 'PLUS_PLACA_9_PAPEL_BASE',
    productoGrupo: 'PLUS',
    nombre: 'Placa 9 con Papel (Base Plus)',
    corto: 'Placa 9 c/Papel (Base)',
    tubosRequeridos: 9,
    piezaResultante: 'PLUS_BASE',
    nombrePiezaResultante: 'Bases Plus (c/Papel)',
    rendimientoCorte: 2,
    usoProducto: '2. Cajita Plus (rinde 2 bases plus)',
    color: '#f472b6'
  },
  PLUS_PIRAMIDE_3_SIN_FIDEO: {
    id: 'PLUS_PIRAMIDE_3_SIN_FIDEO',
    productoGrupo: 'PLUS',
    nombre: 'Grupo 3 Pirámide sin Fideo (Agarrador Plus)',
    corto: 'Pirámide 3 (Sin Fideo)',
    tubosRequeridos: 3,
    piezaResultante: 'PLUS_AGARRADOR',
    nombrePiezaResultante: 'Agarradores Plus (Sin Fideo)',
    rendimientoCorte: 5,
    usoProducto: '2. Cajita Plus (rinde 5 agarradores)',
    color: '#e879f9'
  },
  PLUS_GRUPO_9_3X3: {
    id: 'PLUS_GRUPO_9_3X3',
    productoGrupo: 'PLUS',
    nombre: 'Grupo de 9 (3x3 Patitas Cajita Plus)',
    corto: 'Grupo 9 (3x3 Plus)',
    tubosRequeridos: 9,
    piezaResultante: 'PLUS_PATITA',
    nombrePiezaResultante: 'Patitas Cajita Plus',
    rendimientoCorte: 12,
    usoProducto: '2. Cajita Plus (rinde 12 patitas)',
    color: '#d946ef'
  },
  PLUS_PLACA_11_PAPEL: {
    id: 'PLUS_PLACA_11_PAPEL',
    productoGrupo: 'PLUS',
    nombre: 'Placa 11 con Papel (Tapas Plus)',
    corto: 'Placa 11 c/Papel (Tapa)',
    tubosRequeridos: 11,
    piezaResultante: 'PLUS_TAPA',
    nombrePiezaResultante: 'Tapas Cajita Plus (c/Papel)',
    rendimientoCorte: 2,
    usoProducto: '2. Cajita Plus (rinde 2 tapas plus)',
    color: '#fb7185'
  },

  // ==========================================================================
  // GRUPO 3: SUB-ENSAMBLES DE NUEVO PRODUCTO ESTÁNDAR
  // ==========================================================================
  NEST_PLACA_14_135: {
    id: 'NEST_PLACA_14_135',
    productoGrupo: 'NUEVO_ESTANDAR',
    nombre: 'Placa 14 Tubos (h=13.5 cm — Nuevo Est.)',
    corto: 'Placa 14 (13.5cm N.Est)',
    tubosRequeridos: 14,
    piezaResultante: 'NEST_PZA_14_H135',
    nombrePiezaResultante: 'Placas 14 (13.5cm Nuevo Est.)',
    rendimientoCorte: 2,
    usoProducto: '3. Nuevo Producto Estándar (rinde 2 placas de 13.5 cm)',
    color: '#3b82f6'
  },
  NEST_PLACA_10_135: {
    id: 'NEST_PLACA_10_135',
    productoGrupo: 'NUEVO_ESTANDAR',
    nombre: 'Placa 10 Tubos (h=13.5 cm — Nuevo Est.)',
    corto: 'Placa 10 (13.5cm N.Est)',
    tubosRequeridos: 10,
    piezaResultante: 'NEST_PZA_10_H135',
    nombrePiezaResultante: 'Placas 10 (13.5cm Nuevo Est.)',
    rendimientoCorte: 2,
    usoProducto: '3. Nuevo Producto Estándar (rinde 2 placas de 13.5 cm)',
    color: '#0ea5e9'
  },
  NEST_PLACA_3_LARGA: {
    id: 'NEST_PLACA_3_LARGA',
    productoGrupo: 'NUEVO_ESTANDAR',
    nombre: 'Placa 3 Tubos (23.7/9 cm — Nuevo Est.)',
    corto: 'Placa 3 (23.7cm N.Est)',
    tubosRequeridos: 3,
    piezaResultante: 'NEST_PZA_3_LARGA',
    nombrePiezaResultante: 'Placas 3 (9cm Nuevo Est.)',
    rendimientoCorte: 2,
    usoProducto: '3. Nuevo Producto Estándar (2 placas rinden 4 de 9 cm)',
    color: '#60a5fa'
  },
  LOTE_MERMA_TAPA_EST: {
    id: 'LOTE_MERMA_TAPA_EST',
    productoGrupo: 'NUEVO_ESTANDAR',
    nombre: 'Merma de Tapa Caja Estándar (Reutilizada)',
    corto: 'Merma Tapa Caja Est.',
    tubosRequeridos: 0,
    piezaResultante: 'MERMA_TAPA_EST',
    nombrePiezaResultante: 'Mermas de Tapa Caja Estándar',
    rendimientoCorte: 2,
    usoProducto: '3. Nuevo Producto Estándar (usa 2 mermas de Tapa Estándar)',
    color: '#eab308'
  },

  // ==========================================================================
  // GRUPO 4: SUB-ENSAMBLES DE NUEVO PRODUCTO PLUS
  // ==========================================================================
  NPLUS_PLACA_14_135: {
    id: 'NPLUS_PLACA_14_135',
    productoGrupo: 'NUEVO_PLUS',
    nombre: 'Placa 14 Tubos (h=13.5 cm — Nuevo Plus)',
    corto: 'Placa 14 (13.5cm N.Plus)',
    tubosRequeridos: 14,
    piezaResultante: 'NPLUS_PZA_14_H135',
    nombrePiezaResultante: 'Placas 14 (13.5cm Nuevo Plus)',
    rendimientoCorte: 2,
    usoProducto: '4. Nuevo Producto Plus (rinde 2 placas de 13.5 cm)',
    color: '#a855f7'
  },
  NPLUS_PLACA_10_135: {
    id: 'NPLUS_PLACA_10_135',
    productoGrupo: 'NUEVO_PLUS',
    nombre: 'Placa 10 Tubos (h=13.5 cm — Nuevo Plus)',
    corto: 'Placa 10 (13.5cm N.Plus)',
    tubosRequeridos: 10,
    piezaResultante: 'NPLUS_PZA_10_H135',
    nombrePiezaResultante: 'Placas 10 (13.5cm Nuevo Plus)',
    rendimientoCorte: 2,
    usoProducto: '4. Nuevo Producto Plus (rinde 2 placas de 13.5 cm)',
    color: '#9333ea'
  },
  NPLUS_PLACA_14_5: {
    id: 'NPLUS_PLACA_14_5',
    productoGrupo: 'NUEVO_PLUS',
    nombre: 'Placa 14 Tubos (h=5 cm — Nuevo Plus)',
    corto: 'Placa 14 (5cm N.Plus)',
    tubosRequeridos: 14,
    piezaResultante: 'NPLUS_PZA_14_H5',
    nombrePiezaResultante: 'Placas 14 (5cm Nuevo Plus)',
    rendimientoCorte: 5,
    usoProducto: '4. Nuevo Producto Plus (rinde 5 placas de 5 cm)',
    color: '#c084fc'
  },
  NPLUS_PLACA_10_5: {
    id: 'NPLUS_PLACA_10_5',
    productoGrupo: 'NUEVO_PLUS',
    nombre: 'Placa 10 Tubos (h=5 cm — Nuevo Plus)',
    corto: 'Placa 10 (5cm N.Plus)',
    tubosRequeridos: 10,
    piezaResultante: 'NPLUS_PZA_10_H5',
    nombrePiezaResultante: 'Placas 10 (5cm Nuevo Plus)',
    rendimientoCorte: 5,
    usoProducto: '4. Nuevo Producto Plus (rinde 5 placas de 5 cm)',
    color: '#8b5cf6'
  },
  NPLUS_PLACA_3_LARGA: {
    id: 'NPLUS_PLACA_3_LARGA',
    productoGrupo: 'NUEVO_PLUS',
    nombre: 'Placa 3 Tubos (23.7/9 cm — Nuevo Plus)',
    corto: 'Placa 3 (23.7cm N.Plus)',
    tubosRequeridos: 3,
    piezaResultante: 'NPLUS_PZA_3_LARGA',
    nombrePiezaResultante: 'Placas 3 (9cm Nuevo Plus)',
    rendimientoCorte: 2,
    usoProducto: '4. Nuevo Producto Plus (2 placas rinden 4 de 9 cm)',
    color: '#7c3aed'
  },
  NPLUS_PLACA_3_FIDEO_5: {
    id: 'NPLUS_PLACA_3_FIDEO_5',
    productoGrupo: 'NUEVO_PLUS',
    nombre: 'Placa 3 con Fideo (Agarrador 5 cm — Nuevo Plus)',
    corto: 'Placa 3 c/Fideo (5cm)',
    tubosRequeridos: 3,
    piezaResultante: 'NPLUS_PZA_3_FIDEO_H5',
    nombrePiezaResultante: 'Agarrador 3 c/Fideo (5cm N.Plus)',
    rendimientoCorte: 5,
    usoProducto: '4. Nuevo Producto Plus (rinde 5 placas de 5 cm)',
    color: '#f43f5e'
  },
  NPLUS_PLACA_13_TAPA: {
    id: 'NPLUS_PLACA_13_TAPA',
    productoGrupo: 'NUEVO_PLUS',
    nombre: 'Placa 13 Tubos (Tapas 13.5 cm — Nuevo Plus)',
    corto: 'Placa 13 (Tapas 13.5cm)',
    tubosRequeridos: 13,
    piezaResultante: 'NPLUS_PZA_13_TAPA_H135',
    nombrePiezaResultante: 'Tapas 13 (13.5cm Nuevo Plus)',
    rendimientoCorte: 2,
    usoProducto: '4. Nuevo Producto Plus (rinde 2 tapas de 13.5 cm)',
    color: '#fb923c'
  }
};

// Los 4 Productos Terminados de la Línea (cada uno con su propio amortiguador e inventario separado)
const BOM_CAJAS = {
  ESTANDAR: {
    tipo: 'ESTANDAR',
    prefijo: 'EST',
    icono: '📦',
    color: '#10b981',
    btnClass: 'btn-emerald',
    nombre: 'Cajita Estándar',
    corto: 'Cajita Estándar',
    subtituloPegado: 'Piezas con Fideo: Placa 18 c/Fideo (x5), Placa 9 c/Fideo (x5), Placa 9 Base (x2), Placa 13 c/Fideo Tapa (x1), Pirámide 3 c/Fideo (x5), Grupo 9 3x3 (x12)',
    descripcion: '2 Paredes Largas c/Fideo, 2 Paredes Cortas c/Fideo, 1 Base, 1 Tapa Estándar c/Fideo, 3 Agarradores c/Fideo, 4 Patitas',
    tubosEquivalentes: 33.1,
    placaTapaRef: 'EST_PLACA_13_FIDEO',
    placasDelProducto: [
      'EST_PLACA_18_FIDEO',
      'EST_PLACA_9_FIDEO',
      'EST_PLACA_9_BASE',
      'EST_PLACA_13_FIDEO',
      'EST_PIRAMIDE_3_FIDEO',
      'EST_GRUPO_9_3X3'
    ],
    componentes: {
      EST_PARED_LARGA: 2,
      EST_PARED_CORTA: 2,
      EST_BASE: 1,
      EST_TAPA: 1,
      EST_AGARRADOR: 3,
      EST_PATITA: 4
    }
  },
  PLUS: {
    tipo: 'PLUS',
    prefijo: 'PLUS',
    icono: '✨',
    color: '#ec4899',
    btnClass: 'btn-pink',
    nombre: 'Cajita Plus',
    corto: 'Cajita Plus',
    subtituloPegado: 'Piezas con Base de Papel: Placa 18 c/Papel (x5), Placa 9 c/Papel Pared (x5), Placa 9 c/Papel Base (x2), Pirámide 3 sin Fideo (x5), Grupo 9 3x3 (x12), Placa 11 c/Papel (x2)',
    descripcion: '2 Paredes Largas Plus c/Papel, 2 Paredes Cortas Plus c/Papel, 1 Base Plus c/Papel, 1 Tapa Plus c/Papel, 3 Agarradores sin Fideo, 4 Patitas',
    tubosEquivalentes: 25.6,
    placaTapaRef: 'PLUS_PLACA_11_PAPEL',
    placasDelProducto: [
      'PLUS_PLACA_18_PAPEL',
      'PLUS_PLACA_9_PAPEL_PARED',
      'PLUS_PLACA_9_PAPEL_BASE',
      'PLUS_PIRAMIDE_3_SIN_FIDEO',
      'PLUS_GRUPO_9_3X3',
      'PLUS_PLACA_11_PAPEL'
    ],
    componentes: {
      PLUS_PARED_LARGA: 2,
      PLUS_PARED_CORTA: 2,
      PLUS_BASE: 1,
      PLUS_TAPA: 1,
      PLUS_AGARRADOR: 3,
      PLUS_PATITA: 4
    }
  },
  NUEVO_ESTANDAR: {
    tipo: 'NUEVO_ESTANDAR',
    prefijo: 'N-EST',
    icono: '🔷',
    color: '#3b82f6',
    btnClass: 'btn-blue',
    nombre: 'Nuevo Producto Estándar',
    corto: 'Nuevo Prod. Estándar',
    subtituloPegado: 'Placas Nuevo Estándar: Placa 14 h=13.5cm (rinde 2), Placa 10 h=13.5cm (rinde 2), Placa 3 h=23.7/9cm (rinde 2) + 2 Mermas Tapa Estándar',
    descripcion: '2 Placas 14 (13.5cm), 1 Placa 10 (13.5cm), 2 Placas 3 (23.7/9cm), 2 Mermas Tapa Caja Estándar',
    tubosEquivalentes: 22.0,
    placaTapaRef: 'NEST_PLACA_14_135',
    placasDelProducto: [
      'NEST_PLACA_14_135',
      'NEST_PLACA_10_135',
      'NEST_PLACA_3_LARGA'
    ],
    componentes: {
      NEST_PZA_14_H135: 2,
      NEST_PZA_10_H135: 1,
      NEST_PZA_3_LARGA: 2,
      MERMA_TAPA_EST: 2
    }
  },
  NUEVO_PLUS: {
    tipo: 'NUEVO_PLUS',
    prefijo: 'N-PLUS',
    icono: '💎',
    color: '#a855f7',
    btnClass: 'btn-amber',
    nombre: 'Nuevo Producto Plus',
    corto: 'Nuevo Prod. Plus',
    subtituloPegado: 'Placas Nuevo Plus: Placa 14 13.5cm (x2), Placa 10 13.5cm (x2), Placa 14 5cm (x5), Placa 10 5cm (x5), Placa 3 23.7/9cm (x2), Placa 3 c/Fideo 5cm (x5), Placa 13 Tapas 13.5cm (x2)',
    descripcion: '2 Placas 14 (13.5cm), 1 Placa 10 (13.5cm), 2 Placas 14 (5cm), 1 Placa 10 (5cm), 2 Placas 3 (23.7/9cm), 1 Placa 3 c/Fideo (5cm), 2 Placas 13 Tapas (13.5cm)',
    tubosEquivalentes: 43.2,
    placaTapaRef: 'NPLUS_PLACA_13_TAPA',
    placasDelProducto: [
      'NPLUS_PLACA_14_135',
      'NPLUS_PLACA_10_135',
      'NPLUS_PLACA_14_5',
      'NPLUS_PLACA_10_5',
      'NPLUS_PLACA_3_LARGA',
      'NPLUS_PLACA_3_FIDEO_5',
      'NPLUS_PLACA_13_TAPA'
    ],
    componentes: {
      NPLUS_PZA_14_H135: 2,
      NPLUS_PZA_10_H135: 1,
      NPLUS_PZA_14_H5: 2,
      NPLUS_PZA_10_H5: 1,
      NPLUS_PZA_3_LARGA: 2,
      NPLUS_PZA_3_FIDEO_H5: 1,
      NPLUS_PZA_13_TAPA_H135: 2
    }
  }
};

const PRODUCT_KEYS = ['ESTANDAR', 'PLUS', 'NUEVO_ESTANDAR', 'NUEVO_PLUS'];

const DEFAULT_AMORTIGUADORES = {
  usarAmortiguadoresAlIniciar: true,
  enrolladoHojasCarta: 1200,         // Estación 1: Hojas de papel reciclado disponibles
  pegadoTubos: 600,                  // Estación 2: Comienza con 600 tubos enrollados
  cortadoCajasEstandar: 13,          // Estación 3: 13 Cajitas Estándar en placas por cortar
  cortadoCajasPlus: 13,              // Estación 3: 13 Cajitas Plus en placas por cortar
  cortadoNuevoEstandar: 3,           // Estación 3: 3 Nuevo Producto Estándar en placas por cortar
  cortadoNuevoPlus: 3,               // Estación 3: 3 Nuevo Producto Plus en placas por cortar
  ensambladoCajasEstandar: 3,        // Estación 4: 3 Cajitas Estándar en piezas cortadas
  ensambladoCajasPlus: 3,            // Estación 4: 3 Cajitas Plus en piezas cortadas
  ensambladoNuevoEstandar: 3,        // Estación 4: 3 Nuevo Producto Estándar en piezas cortadas
  ensambladoNuevoPlus: 3             // Estación 4: 3 Nuevo Producto Plus en piezas cortadas
};

const AREA_NOMBRES = {
  ENROLLADO: '1. Enrollado (Tubos)',
  PEGADO: '2. Pegado (Placas/Bloques)',
  CORTADO: '3. Cortado (Máquina)',
  ENSAMBLADO: '4. Ensamblado (4 Productos)'
};

// Distribución oficial de los 13 operarios en 4 estaciones:
// Enrollado (4: Op 1-4), Pegado (4: Op 5-8), Cortado (1: Op 9), Ensamblado (4: Op 10-13)
// Operarios Polivalentes:
//   - Operario 8 (OP-08): Polivalente entre 2. Pegado <-> 4. Ensamblado
//   - Operario 9 (OP-09): Polivalente entre 3. Cortado <-> 2. Pegado
const DEFAULT_OPERATORS = [
  { id: 'OP-01', numero: 1, nombre: 'Operario 1', area: 'ENROLLADO', areaBase: 'ENROLLADO', areaNombre: '1. Enrollado (Tubos)', rol: 'Enrollador de Papel Carta (1/4)', esPolivalente: false, areasPolivalentes: ['ENROLLADO'] },
  { id: 'OP-02', numero: 2, nombre: 'Operario 2', area: 'ENROLLADO', areaBase: 'ENROLLADO', areaNombre: '1. Enrollado (Tubos)', rol: 'Enrollador de Papel Carta (2/4)', esPolivalente: false, areasPolivalentes: ['ENROLLADO'] },
  { id: 'OP-03', numero: 3, nombre: 'Operario 3', area: 'ENROLLADO', areaBase: 'ENROLLADO', areaNombre: '1. Enrollado (Tubos)', rol: 'Enrollador de Papel Carta (3/4)', esPolivalente: false, areasPolivalentes: ['ENROLLADO'] },
  { id: 'OP-04', numero: 4, nombre: 'Operario 4', area: 'ENROLLADO', areaBase: 'ENROLLADO', areaNombre: '1. Enrollado (Tubos)', rol: 'Enrollador de Papel Carta (4/4)', esPolivalente: false, areasPolivalentes: ['ENROLLADO'] },
  { id: 'OP-05', numero: 5, nombre: 'Operario 5', area: 'PEGADO', areaBase: 'PEGADO', areaNombre: '2. Pegado (Placas/Bloques)', rol: 'Armador de Placas y Bloques (1/4)', esPolivalente: false, areasPolivalentes: ['PEGADO'] },
  { id: 'OP-06', numero: 6, nombre: 'Operario 6', area: 'PEGADO', areaBase: 'PEGADO', areaNombre: '2. Pegado (Placas/Bloques)', rol: 'Armador de Placas y Bloques (2/4)', esPolivalente: false, areasPolivalentes: ['PEGADO'] },
  { id: 'OP-07', numero: 7, nombre: 'Operario 7', area: 'PEGADO', areaBase: 'PEGADO', areaNombre: '2. Pegado (Placas/Bloques)', rol: 'Armador de Placas y Bloques (3/4)', esPolivalente: false, areasPolivalentes: ['PEGADO'] },
  { id: 'OP-08', numero: 8, nombre: 'Operario 8', area: 'PEGADO', areaBase: 'PEGADO', areaNombre: '2. Pegado (Placas/Bloques)', rol: '🔄 Operario Polivalente (2. Pegado ⇄ 4. Ensamblado)', esPolivalente: true, areasPolivalentes: ['PEGADO', 'ENSAMBLADO'], inicioAreaActualTimestamp: null, historialPolivalencia: [] },
  { id: 'OP-09', numero: 9, nombre: 'Operario 9', area: 'CORTADO', areaBase: 'CORTADO', areaNombre: '3. Cortado (Máquina)', rol: '🔄 Operario Polivalente (3. Cortado ⇄ 2. Pegado)', esPolivalente: true, areasPolivalentes: ['CORTADO', 'PEGADO'], inicioAreaActualTimestamp: null, historialPolivalencia: [] },
  { id: 'OP-10', numero: 10, nombre: 'Operario 10', area: 'ENSAMBLADO', areaBase: 'ENSAMBLADO', areaNombre: '4. Ensamblado (4 Productos)', rol: 'Ensamblador de Productos (1/4)', esPolivalente: false, areasPolivalentes: ['ENSAMBLADO'] },
  { id: 'OP-11', numero: 11, nombre: 'Operario 11', area: 'ENSAMBLADO', areaBase: 'ENSAMBLADO', areaNombre: '4. Ensamblado (4 Productos)', rol: 'Ensamblador de Productos (2/4)', esPolivalente: false, areasPolivalentes: ['ENSAMBLADO'] },
  { id: 'OP-12', numero: 12, nombre: 'Operario 12', area: 'ENSAMBLADO', areaBase: 'ENSAMBLADO', areaNombre: '4. Ensamblado (4 Productos)', rol: 'Ensamblador de Productos (3/4)', esPolivalente: false, areasPolivalentes: ['ENSAMBLADO'] },
  { id: 'OP-13', numero: 13, nombre: 'Operario 13', area: 'ENSAMBLADO', areaBase: 'ENSAMBLADO', areaNombre: '4. Ensamblado (4 Productos)', rol: 'Ensamblador de Productos (4/4)', esPolivalente: false, areasPolivalentes: ['ENSAMBLADO'] }
];

function createEmptyPiezasMap(val = 0) {
  const m = {};
  for (const sp of Object.values(PLACA_SPECS)) {
    m[sp.piezaResultante] = Array.isArray(val) ? [] : val;
  }
  return m;
}

function createEmptyPlacasMap(val = 0) {
  const m = {};
  for (const k of Object.keys(PLACA_SPECS)) {
    m[k] = val;
  }
  return m;
}

// Calcula las piezas cortadas requeridas para cualquier combinación de los 4 productos
function calcularPiezasCortadasPorCantidades(cantPorProducto = {}) {
  const totPiezas = createEmptyPiezasMap(0);

  for (const prodKey of PRODUCT_KEYS) {
    const cantProd = Math.max(0, Number(cantPorProducto[prodKey]) || 0);
    if (cantProd <= 0) continue;
    const receta = BOM_CAJAS[prodKey];
    if (!receta) continue;
    for (const [piezaKey, reqPorUnidad] of Object.entries(receta.componentes)) {
      totPiezas[piezaKey] = (totPiezas[piezaKey] || 0) + (cantProd * reqPorUnidad);
    }
  }
  return totPiezas;
}

// Calcula las placas necesarias en base a las piezas cortadas requeridas y sus rendimientos de corte
function calcularPlacasParaCantidades(cantPorProducto = {}) {
  const piezasReq = calcularPiezasCortadasPorCantidades(cantPorProducto);
  const placasReq = {};
  for (const [placaKey, sp] of Object.entries(PLACA_SPECS)) {
    const cantPiezas = piezasReq[sp.piezaResultante] || 0;
    placasReq[placaKey] = cantPiezas > 0 ? Math.ceil(cantPiezas / sp.rendimientoCorte) : 0;
  }
  return placasReq;
}

// ============================================================================
// EXPLOSIÓN DE MATERIALES (MRP / KANBAN PULL) PARA PEDIDOS DEL DOCENTE (4 PRODUCTOS)
// ============================================================================

function calcularExplosionPedidoDocente(cantidades = {}) {
  const cEst = Math.max(0, Number(cantidades.ESTANDAR ?? cantidades.cajasEstandar) || 0);
  const cPlus = Math.max(0, Number(cantidades.PLUS ?? cantidades.cajasPlus) || 0);
  const cNuevoEst = Math.max(0, Number(cantidades.NUEVO_ESTANDAR ?? cantidades.nuevoEstandar) || 0);
  const cNuevoPlus = Math.max(0, Number(cantidades.NUEVO_PLUS ?? cantidades.nuevoPlus) || 0);

  const porProducto = {
    ESTANDAR: cEst,
    PLUS: cPlus,
    NUEVO_ESTANDAR: cNuevoEst,
    NUEVO_PLUS: cNuevoPlus
  };

  const totalCajas = cEst + cPlus + cNuevoEst + cNuevoPlus;
  const piezasCortadasRequeridas = calcularPiezasCortadasPorCantidades(porProducto);
  const placasRequeridas = calcularPlacasParaCantidades(porProducto);

  let totalPlacasPegar = 0;
  let totalTubosParaPlacas = 0;
  for (const [tipoKey, cantPlacas] of Object.entries(placasRequeridas)) {
    // Las mermas de tapa estándar vienen del corte de PLACA_13 (0 tubos extra)
    if (PLACA_SPECS[tipoKey].tubosRequeridos > 0) {
      totalPlacasPegar += cantPlacas;
      totalTubosParaPlacas += cantPlacas * PLACA_SPECS[tipoKey].tubosRequeridos;
    }
  }

  const tubosTeoricosExactos = Math.ceil(
    (cEst * BOM_CAJAS.ESTANDAR.tubosEquivalentes) +
    (cPlus * BOM_CAJAS.PLUS.tubosEquivalentes) +
    (cNuevoEst * BOM_CAJAS.NUEVO_ESTANDAR.tubosEquivalentes) +
    (cNuevoPlus * BOM_CAJAS.NUEVO_PLUS.tubosEquivalentes)
  );

  const resumenProductosTexto = [
    cEst > 0 ? `${cEst} Cajita Estándar` : null,
    cPlus > 0 ? `${cPlus} Cajita Plus` : null,
    cNuevoEst > 0 ? `${cNuevoEst} Nuevo Prod. Estándar` : null,
    cNuevoPlus > 0 ? `${cNuevoPlus} Nuevo Prod. Plus` : null
  ].filter(Boolean).join(' + ') || '0 productos';

  const detallePlacasTexto = Object.entries(placasRequeridas)
    .filter(([k, c]) => c > 0 && PLACA_SPECS[k].tubosRequeridos > 0)
    .map(([k, c]) => `${c}x ${PLACA_SPECS[k].corto}`)
    .join(', ');

  const detallePiezasTexto = Object.entries(piezasCortadasRequeridas)
    .filter(([, c]) => c > 0)
    .map(([piezaKey, c]) => {
      const sp = Object.values(PLACA_SPECS).find(s => s.piezaResultante === piezaKey);
      return `${c} ${sp ? sp.nombrePiezaResultante : piezaKey}`;
    })
    .join(', ');

  return {
    porProducto,
    cajasEstandar: cEst,
    cajasPlus: cPlus,
    nuevoEstandar: cNuevoEst,
    nuevoPlus: cNuevoPlus,
    resumenProductosTexto,
    totalCajas,
    piezasCortadasRequeridas,
    placasRequeridas,
    totalPlacasPegar,
    totalTubosParaPlacas,
    tubosPorOperarioEnrollado: Math.ceil(totalTubosParaPlacas / 4),
    tubosTeoricosExactos,
    notificacionesPorArea: {
      ENROLLADO: {
        titulo: `🔔 ORDEN DE REPOSICIÓN — ÁREA 1: ENROLLADO (4 OP.)`,
        instruccionPrincipal: `Enrollar y reponer ${totalTubosParaPlacas} tubos de papel (~${Math.ceil(totalTubosParaPlacas / 4)} tubos por operario)`,
        detalle: `Para reponer las ${totalPlacasPegar} placas que consumirá Pegado por el pedido del Docente (${resumenProductosTexto}).`
      },
      PEGADO: {
        titulo: `🔔 ORDEN DE REPOSICIÓN — ÁREA 2: PEGADO (4 OP.)`,
        instruccionPrincipal: `Pegar y reponer ${totalPlacasPegar} placas/bloques: ${detallePlacasTexto || 'Ninguno'}`,
        detalle: `Enviar al Amortiguador de Cortado para reponer los ${totalCajas} productos pedidos por el Docente (${resumenProductosTexto}).`
      },
      CORTADO: {
        titulo: `🔔 ORDEN DE REPOSICIÓN — ÁREA 3: CORTADO (1 OP.)`,
        instruccionPrincipal: `Cortar kits/placas para ${resumenProductosTexto} (${totalPlacasPegar} placas)`,
        detalle: `Piezas a enviar a Ensamblado: ${detallePiezasTexto || 'Ninguna'}.`
      },
      ENSAMBLADO: {
        titulo: `🔔 ORDEN DE PRODUCCIÓN — ÁREA 4: ENSAMBLADO (4 OP.)`,
        instruccionPrincipal: `Ensamblar y terminar: ${resumenProductosTexto} (Total: ${totalCajas} unidades)`,
        detalle: `Los 4 operarios de Ensamblado terminan directamente los productos y los entregan al Docente (+1 Truput por unidad).`
      }
    }
  };
}

function createInitialState(preserveOperators = null, customBuffers = null) {
  const buffers = {
    ...DEFAULT_AMORTIGUADORES,
    ...(customBuffers || {})
  };

  let ops = JSON.parse(JSON.stringify(DEFAULT_OPERATORS));
  if (Array.isArray(preserveOperators) && preserveOperators.length === 13) {
    ops = DEFAULT_OPERATORS.map((defOp, idx) => ({
      ...defOp,
      nombre: preserveOperators[idx]?.nombre || defOp.nombre
    }));
  }

  const now = Date.now();
  const s = {
    version: '2.3.0',
    session: {
      id: 'SIM-' + new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      nombre: 'Simulación Semanal - Lab. Ingeniería de Métodos (4 Áreas / 4 Productos)',
      creadaTimestamp: now,
      loteDestinoActual: 'Almacén Producto Terminado (Stock General)',
      estado: 'LISTO_PARA_INICIAR', // Espera a que se pulse el botón "▶️ COMENZAR PRODUCCIÓN"
      inicioTimestamp: null,
      pausaAcumuladaMs: 0,
      ultimaPausaTimestamp: null,
      modoInventarioFlexible: true,
      taktConfig: {
        demandaMetaUnidades: 6,
        tiempoDisponibleMin: 15
      },
      alertasSonorasConfig: {
        habilitado: true,
        minutosAlertas: [15, 30, 45]
      }
    },
    amortiguadoresConfig: buffers,
    operarios: ops,
    wip: {
      hojasCartaDisponibles: buffers.usarAmortiguadoresAlIniciar ? buffers.enrolladoHojasCarta : 1200,
      tubosDisponibles: 0,
      tubosTotalesProducidos: 0,
      tubosAmortiguadorInicial: 0,
      tubosLotesRecientes: [],
      placasEnColaCorte: [],
      piezasCortadas: createEmptyPiezasMap(0),
      lotesPiezasCortadas: createEmptyPiezasMap([])
    },
    contadores: {
      placasPegadas: createEmptyPlacasMap(0),
      placasCortadas: createEmptyPlacasMap(0),
      piezasCortadasTotales: createEmptyPiezasMap(0),
      kitsCortadosPorProducto: {
        ESTANDAR: 0,
        PLUS: 0,
        NUEVO_ESTANDAR: 0,
        NUEVO_PLUS: 0
      },
      productosTerminados: {
        ESTANDAR: 0,
        PLUS: 0,
        NUEVO_ESTANDAR: 0,
        NUEVO_PLUS: 0
      },
      cajasEnsambladasEstandar: 0,
      cajasEnsambladasPlus: 0,
      cajasEnsambladasNuevoEstandar: 0,
      cajasEnsambladasNuevoPlus: 0,
      mermasTotales: 0
    },
    pedidosDocente: [],
    ultimaAlertaPedido: null,
    cajas: [],
    eventos: [],
    ultimoRegistroPorOperario: {}
  };

  if (buffers.usarAmortiguadoresAlIniciar) {
    cargarAmortiguadoresEnEstado(s, buffers, now);
  }

  return s;
}

function cargarAmortiguadoresEnEstado(s, buffers, now) {
  const tubosInit = Math.max(0, Number(buffers.pegadoTubos) || 0);
  if (tubosInit > 0) {
    s.wip.tubosDisponibles += tubosInit;
    s.wip.tubosAmortiguadorInicial = tubosInit;
    s.wip.tubosLotesRecientes.push({
      id: `AMORT-TUB-${tubosInit}`,
      operarioId: 'AMORTIGUADOR',
      operarioNombre: `Amortiguador Inicial Pegado (${tubosInit} tubos)`,
      cantidad: tubosInit,
      restante: tubosInit,
      timestamp: now
    });
  }

  const cantCorteInit = {
    ESTANDAR: Math.max(0, Number(buffers.cortadoCajasEstandar) || 0),
    PLUS: Math.max(0, Number(buffers.cortadoCajasPlus) || 0),
    NUEVO_ESTANDAR: Math.max(0, Number(buffers.cortadoNuevoEstandar) || 0),
    NUEVO_PLUS: Math.max(0, Number(buffers.cortadoNuevoPlus) || 0)
  };
  const totalCorteCajasInit = Object.values(cantCorteInit).reduce((a, b) => a + b, 0);

  if (totalCorteCajasInit > 0) {
    const placasPorTipo = calcularPlacasParaCantidades(cantCorteInit);
    for (const [tipoKey, cantPlacas] of Object.entries(placasPorTipo)) {
      const spec = PLACA_SPECS[tipoKey];
      for (let i = 1; i <= cantPlacas; i++) {
        const codigoPlaca = `AMORT-${tipoKey.slice(0, 8)}-${String(i).padStart(2, '0')}`;
        s.wip.placasEnColaCorte.push({
          id: codigoPlaca,
          esAmortiguador: true,
          tipoPlaca: spec.id,
          nombrePlaca: spec.nombre,
          corto: spec.corto,
          tubosUsados: spec.tubosRequeridos,
          piezaResultante: spec.piezaResultante,
          nombrePiezaResultante: spec.nombrePiezaResultante,
          rendimientoCorte: spec.rendimientoCorte,
          operarioPegadoId: 'AMORTIGUADOR',
          operarioPegadoNombre: `Amortiguador Inicial Cortado (${totalCorteCajasInit} unid.)`,
          origenEnrollado: ['Amortiguador Inicial'],
          lotesTubosUsados: ['AMORT-TUB'],
          inicioTuboTimestamp: now,
          timestampPegado: now,
          cicloPegadoSeg: null
        });
      }
    }
  }

  const cantEnsInit = {
    ESTANDAR: Math.max(0, Number(buffers.ensambladoCajasEstandar) || 0),
    PLUS: Math.max(0, Number(buffers.ensambladoCajasPlus) || 0),
    NUEVO_ESTANDAR: Math.max(0, Number(buffers.ensambladoNuevoEstandar) || 0),
    NUEVO_PLUS: Math.max(0, Number(buffers.ensambladoNuevoPlus) || 0)
  };
  const totalEnsCajasInit = Object.values(cantEnsInit).reduce((a, b) => a + b, 0);

  if (totalEnsCajasInit > 0) {
    const piezasInit = calcularPiezasCortadasPorCantidades(cantEnsInit);
    for (const [piezaKey, cant] of Object.entries(piezasInit)) {
      if (cant > 0) {
        s.wip.piezasCortadas[piezaKey] = (s.wip.piezasCortadas[piezaKey] || 0) + cant;
        if (!s.wip.lotesPiezasCortadas[piezaKey]) s.wip.lotesPiezasCortadas[piezaKey] = [];
        s.wip.lotesPiezasCortadas[piezaKey].push({
          loteCorteId: `AMORT-CRT-${piezaKey}`,
          placaId: `AMORT-ENS-${totalEnsCajasInit}U`,
          esAmortiguador: true,
          tipoPlaca: 'AMORTIGUADOR_ENSAMBLADO',
          nombrePlaca: `Amortiguador Inicial Ensamblado (${totalEnsCajasInit} unid.)`,
          piezaResultante: piezaKey,
          nombrePieza: piezaKey,
          cantidadInicial: cant,
          restante: cant,
          operarioPegadoId: 'AMORTIGUADOR',
          operarioPegadoNombre: 'Amortiguador Inicial',
          origenEnrollado: ['Amortiguador Inicial'],
          operarioCorteId: 'AMORTIGUADOR',
          operarioCorteNombre: `Amortiguador Inicial Ensamblado (${totalEnsCajasInit} unid.)`,
          inicioTuboTimestamp: now,
          timestampPegado: now,
          timestampCorte: now
        });
      }
    }
  }

  s.eventos.unshift({
    id: 'EV-INIT-' + now,
    timestamp: now,
    operarioId: 'SISTEMA',
    operarioNombre: 'Configuración de Amortiguadores (4 Áreas)',
    area: 'TODAS',
    tipoAccion: 'AMORTIGUADOR',
    subtipo: 'CARGA_INICIAL',
    etiqueta: `🛡️ Amortiguadores cargados (4 Estaciones): Pegado=${tubosInit} tubos | Cortado=${totalCorteCajasInit} unid. | Ensamblado=${totalEnsCajasInit} unid.`,
    cantidad: 1,
    cicloSeg: null,
    origen: 'Stock Inicial de Amortiguación (DBR/TOC)',
    destino: 'Estaciones 1, 2, 3 y 4'
  });
}

let state = createInitialState();
const historialUndo = [];

function guardarSnapshotUndo(descripcion, operarioId) {
  try {
    const copia = JSON.parse(JSON.stringify({
      operarios: state.operarios,
      wip: state.wip,
      contadores: state.contadores,
      cajas: state.cajas,
      eventos: state.eventos,
      pedidosDocente: state.pedidosDocente,
      ultimoRegistroPorOperario: state.ultimoRegistroPorOperario
    }));
    historialUndo.push({
      timestamp: Date.now(),
      descripcion,
      operarioId,
      snapshot: copia
    });
    if (historialUndo.length > 30) {
      historialUndo.shift();
    }
  } catch (e) {}
}

function accionDeshacerUltimo() {
  if (historialUndo.length === 0) {
    return { ok: false, error: 'No hay acciones recientes para deshacer.' };
  }
  const ultimo = historialUndo.pop();
  if (ultimo.snapshot.operarios) state.operarios = ultimo.snapshot.operarios;
  state.wip = ultimo.snapshot.wip;
  state.contadores = ultimo.snapshot.contadores;
  state.cajas = ultimo.snapshot.cajas;
  state.eventos = ultimo.snapshot.eventos;
  state.pedidosDocente = ultimo.snapshot.pedidosDocente;
  state.ultimoRegistroPorOperario = ultimo.snapshot.ultimoRegistroPorOperario;
  evaluarProgresoPedidosDocente();
  saveState();
  return {
    ok: true,
    mensaje: `↩️ Se deshizo el último registro (${ultimo.descripcion})`
  };
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === '2.3.0') {
        state = parsed;
      } else {
        const ops = parsed && parsed.operarios ? parsed.operarios : null;
        state = createInitialState(ops);
        saveState();
      }
    } else {
      saveState();
    }
  } catch (err) {
    console.error('Error cargando estado previo, iniciando estado limpio:', err.message);
  }
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('Error guardando estado:', err.message);
  }
  // Copia permanente en la base de datos Supabase (si está configurada).
  // No se guarda nada hasta haber leído primero el estado remoto, para no sobrescribirlo con uno vacío.
  if (supabaseInicializado) {
    supabaseStore.programarGuardado(state);
  }
}

let supabaseInicializado = false;

// Al arrancar: recuperar desde Supabase la última foto de la línea (sobrevive a reinicios de Render)
async function inicializarPersistenciaSupabase() {
  if (!supabaseStore.habilitado) {
    console.log('ℹ️ Supabase NO configurado: se usa solo el archivo local data/lab-state.json');
    return;
  }
  const remoto = await supabaseStore.cargarEstadoActual();
  if (remoto && remoto.version === '2.3.0') {
    state = remoto;
    if (!state.session.creadaTimestamp) state.session.creadaTimestamp = Date.now();
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (e) {}
    console.log(`✅ Estado recuperado desde Supabase (sesión ${supabaseStore.obtenerClaveSesion(state)})`);
  } else if (remoto) {
    console.log('ℹ️ Estado en Supabase con versión distinta: se inicia una sesión nueva conservando el historial anterior.');
  } else if (supabaseStore.estadoConexion.ultimoError) {
    console.log('⚠️ Supabase no respondió; se continúa con el estado local y se reintentará al guardar.');
  } else {
    console.log('ℹ️ Supabase conectado: aún no hay estado guardado, se crea uno nuevo.');
  }
  supabaseInicializado = true;
  supabaseStore.programarGuardado(state);
}

loadState();

// ============================================================================
// CÁLCULO DE AVANCE DE PEDIDOS DEL DOCENTE Y REPOSICIÓN POR ÁREA (4 ESTACIONES, 4 PRODUCTOS)
// ============================================================================

function evaluarProgresoPedidosDocente() {
  if (!state.pedidosDocente) state.pedidosDocente = [];

  const resumenReposicionActiva = {
    hayPedidosActivos: false,
    cantidadPedidosActivos: 0,
    totalPorProductoPedidos: {
      ESTANDAR: 0,
      PLUS: 0,
      NUEVO_ESTANDAR: 0,
      NUEVO_PLUS: 0
    }
  };

  for (const ped of state.pedidosDocente) {
    const exp = ped.explosion;
    const base = ped.lineaBase || {};
    const porProdPedido = exp.porProducto || {
      ESTANDAR: exp.cajasEstandar || 0,
      PLUS: exp.cajasPlus || 0,
      NUEVO_ESTANDAR: exp.nuevoEstandar || 0,
      NUEVO_PLUS: exp.nuevoPlus || 0
    };

    for (const pk of PRODUCT_KEYS) {
      resumenReposicionActiva.totalPorProductoPedidos[pk] += (porProdPedido[pk] || 0);
    }

    const realTubos = Math.max(0, state.wip.tubosTotalesProducidos - (base.tubosTotalesProducidos || 0));
    const avanceTubos = Math.min(exp.totalTubosParaPlacas, realTubos);

    let avancePlacasPegadas = 0;
    let todasPlacasPegadas = true;
    for (const [k, reqCant] of Object.entries(exp.placasRequeridas)) {
      if (reqCant <= 0 || PLACA_SPECS[k]?.tubosRequeridos === 0) continue;
      const peg = Math.max(0, (state.contadores.placasPegadas[k] || 0) - ((base.placasPegadas && base.placasPegadas[k]) || 0));
      avancePlacasPegadas += Math.min(reqCant, peg);
      if (peg < reqCant) todasPlacasPegadas = false;
    }

    let totalPiezasReqCorte = 0;
    let totalPiezasHechasCorte = 0;
    let todasPiezasCortadas = true;
    for (const [pKey, reqPza] of Object.entries(exp.piezasCortadasRequeridas)) {
      if (reqPza <= 0) continue;
      totalPiezasReqCorte += reqPza;
      const pzaHecha = Math.max(0, (state.contadores.piezasCortadasTotales[pKey] || 0) - ((base.piezasCortadasTotales && base.piezasCortadasTotales[pKey]) || 0));
      totalPiezasHechasCorte += Math.min(reqPza, pzaHecha);
      if (pzaHecha < reqPza) todasPiezasCortadas = false;
    }

    let avancePlacasCortadas = 0;
    for (const [k, reqCant] of Object.entries(exp.placasRequeridas)) {
      if (reqCant <= 0) continue;
      const cor = Math.max(0, (state.contadores.placasCortadas[k] || 0) - ((base.placasCortadas && base.placasCortadas[k]) || 0));
      avancePlacasCortadas += Math.min(reqCant, cor);
    }

    const terminadosPorProducto = {};
    const faltanPorProducto = {};
    let totalTerminadosPedido = 0;
    let todosProductosEnsamblados = true;

    for (const pk of PRODUCT_KEYS) {
      const metaProd = porProdPedido[pk] || 0;
      const actualGlobal = state.contadores.productosTerminados?.[pk] || 0;
      const baseGlobal = (base.productosTerminados && base.productosTerminados[pk]) || 0;
      const realHecho = Math.max(0, actualGlobal - baseGlobal);
      const avanceProd = Math.min(metaProd, realHecho);
      const faltaProd = Math.max(0, metaProd - realHecho);

      terminadosPorProducto[pk] = avanceProd;
      faltanPorProducto[pk] = faltaProd;
      totalTerminadosPedido += avanceProd;
      if (faltaProd > 0) todosProductosEnsamblados = false;
    }

    const completadoPorArea = {
      ENROLLADO: avanceTubos >= exp.totalTubosParaPlacas,
      PEGADO: todasPlacasPegadas,
      CORTADO: todasPiezasCortadas,
      ENSAMBLADO: todosProductosEnsamblados
    };

    ped.progreso = {
      tubosEnrollados: avanceTubos,
      faltanTubos: Math.max(0, exp.totalTubosParaPlacas - realTubos),
      placasPegadas: avancePlacasPegadas,
      placasCortadas: avancePlacasCortadas,
      piezasCortadasHechas: totalPiezasHechasCorte,
      piezasCortadasMeta: totalPiezasReqCorte,
      terminadosPorProducto,
      faltanPorProducto,
      cajasEstTerminadas: terminadosPorProducto.ESTANDAR,
      faltanCajasEstEnsamblar: faltanPorProducto.ESTANDAR,
      cajasPlusEnsambladas: terminadosPorProducto.PLUS,
      faltanCajasPlusEnsamblar: faltanPorProducto.PLUS,
      cajasTotalesEntregadas: totalTerminadosPedido,
      completadoPorArea
    };

    if (totalTerminadosPedido >= exp.totalCajas && exp.totalCajas > 0) {
      if (ped.estado !== 'COMPLETADO') {
        ped.estado = 'COMPLETADO';
        ped.timestampCompletado = Date.now();
        ped.tiempoCumplimientoSeg = +((ped.timestampCompletado - ped.timestampCreacion) / 1000).toFixed(1);
        state.session.loteDestinoActual = 'Almacén Producto Terminado (Stock General)';
      }
    } else {
      ped.estado = 'EN_PROCESO';
    }
  }

  resumenReposicionActiva.cantidadPedidosActivos = state.pedidosDocente.filter(p => p.estado !== 'COMPLETADO').length;
  resumenReposicionActiva.hayPedidosActivos = state.pedidosDocente.some(p =>
    p.estado !== 'COMPLETADO' || Object.values(p.progreso?.completadoPorArea || {}).some(v => !v)
  );

  return resumenReposicionActiva;
}

// Acción cuando el Docente lanza un nuevo Pedido en el laboratorio (con soporte para los 4 productos)
function accionCrearPedidoDocente(payload = {}) {
  const cEst = Math.max(0, Number(payload.cajasEstandar ?? payload.ESTANDAR) || 0);
  const cPlus = Math.max(0, Number(payload.cajasPlus ?? payload.PLUS) || 0);
  const cNuevoEst = Math.max(0, Number(payload.nuevoEstandar ?? payload.NUEVO_ESTANDAR) || 0);
  const cNuevoPlus = Math.max(0, Number(payload.nuevoPlus ?? payload.NUEVO_PLUS) || 0);
  const totalPed = cEst + cPlus + cNuevoEst + cNuevoPlus;

  if (totalPed === 0) {
    return { ok: false, error: 'El pedido del docente debe incluir al menos 1 unidad de alguno de los 4 productos.' };
  }

  const now = Date.now();
  const numPedido = (state.pedidosDocente ? state.pedidosDocente.length : 0) + 1;
  const codigoPedido = `PED-DOC-${String(numPedido).padStart(2, '0')}`;
  const explosion = calcularExplosionPedidoDocente({
    ESTANDAR: cEst,
    PLUS: cPlus,
    NUEVO_ESTANDAR: cNuevoEst,
    NUEVO_PLUS: cNuevoPlus
  });

  if (state.session.taktConfig) {
    state.session.taktConfig.demandaMetaUnidades = totalPed;
  }

  const nuevoPedido = {
    id: codigoPedido,
    numero: numPedido,
    nombre: payload.notaDocente
      ? `${codigoPedido}: ${payload.notaDocente}`
      : `${codigoPedido} (${explosion.resumenProductosTexto})`,
    timestampCreacion: now,
    notaVoz: payload.notaVoz ? String(payload.notaVoz).slice(0, 500) : null,
    timestampCompletado: null,
    tiempoCumplimientoSeg: null,
    estado: 'EN_PROCESO',
    explosion,
    lineaBase: {
      tubosTotalesProducidos: state.wip.tubosTotalesProducidos,
      placasPegadas: { ...state.contadores.placasPegadas },
      placasCortadas: { ...state.contadores.placasCortadas },
      piezasCortadasTotales: { ...state.contadores.piezasCortadasTotales },
      productosTerminados: { ...state.contadores.productosTerminados }
    }
  };

  if (!state.pedidosDocente) state.pedidosDocente = [];
  state.pedidosDocente.unshift(nuevoPedido);
  state.session.loteDestinoActual = `${codigoPedido} (${explosion.resumenProductosTexto})`;

  state.ultimaAlertaPedido = {
    alertaId: `ALRT-${now}`,
    pedidoId: codigoPedido,
    nombrePedido: nuevoPedido.nombre,
    timestamp: now,
    cajasEstandar: cEst,
    cajasPlus: cPlus,
    nuevoEstandar: cNuevoEst,
    nuevoPlus: cNuevoPlus,
    resumenProductosTexto: explosion.resumenProductosTexto,
    totalCajas: totalPed,
    explosion,
    notificacionesPorArea: explosion.notificacionesPorArea
  };

  const evento = {
    id: 'EV-PED-' + now,
    timestamp: now,
    operarioId: 'DOCENTE',
    operarioNombre: '👨‍🏫 Docente de la Materia',
    area: 'LAS 4 ÁREAS',
    tipoAccion: 'PEDIDO_DOCENTE',
    subtipo: codigoPedido,
    etiqueta: `📢 NUEVO PEDIDO DOCENTE [${codigoPedido}]: ${explosion.resumenProductosTexto} → Ordena reponer ${explosion.totalTubosParaPlacas} tubos y ${explosion.totalPlacasPegar} placas`,
    cantidad: totalPed,
    cicloSeg: null,
    origen: 'Solicitud del Docente en Laboratorio',
    destino: 'Notificación enviada a las 4 Áreas (13 Operarios)'
  };
  agregarEvento(evento);
  evaluarProgresoPedidosDocente();
  saveState();

  return {
    ok: true,
    mensaje: `📢 Pedido ${codigoPedido} (${explosion.resumenProductosTexto}) enviado a las 4 áreas`,
    pedido: nuevoPedido,
    evento
  };
}

// ============================================================================
// CÁLCULO DE AMORTIGUADORES, THROUGHPUT FÍSICO Y BALANCEO DE LÍNEA (TAKT TIME)
// ============================================================================

function evaluarEstadoAmortiguador(actual, metaInicial) {
  if (!metaInicial || metaInicial <= 0) {
    return { porcentaje: 100, zona: 'SIN_META', color: '#64748b', texto: 'Sin amortiguador meta' };
  }
  const pct = Math.round((actual / metaInicial) * 100);
  if (pct < 33) {
    return { porcentaje: pct, zona: 'ROJO', color: '#f43f5e', texto: '🔴 Crítico (<33% - Urgente Reponer)' };
  }
  if (pct < 67) {
    return { porcentaje: pct, zona: 'AMARILLO', color: '#f59e0b', texto: '🟡 Precaución (33%-66% - Reponer)' };
  }
  if (pct <= 130) {
    return { porcentaje: pct, zona: 'VERDE', color: '#10b981', texto: '🟢 Óptimo (Amortiguador Saludable)' };
  }
  return { porcentaje: pct, zona: 'AZUL', color: '#38bdf8', texto: '🔵 Exceso de WIP (>130% Acumulado)' };
}

function getEffectiveElapsedSeconds() {
  if (state.session.estado === 'LISTO_PARA_INICIAR' || !state.session.inicioTimestamp) return 0;
  const now = state.session.estado === 'PAUSADO' && state.session.ultimaPausaTimestamp
    ? state.session.ultimaPausaTimestamp
    : Date.now();
  const elapsedMs = Math.max(0, (now - state.session.inicioTimestamp) - (state.session.pausaAcumuladaMs || 0));
  return elapsedMs / 1000;
}

function calcularArmablesDeProducto(prodKey, piezasDisponibles) {
  const receta = BOM_CAJAS[prodKey];
  if (!receta) return 0;
  let maxArmables = Infinity;
  for (const [comp, reqCant] of Object.entries(receta.componentes)) {
    if (reqCant <= 0) continue;
    const disp = piezasDisponibles[comp] || 0;
    maxArmables = Math.min(maxArmables, Math.floor(disp / reqCant));
  }
  return maxArmables === Infinity ? 0 : maxArmables;
}

function calcularCortablesDeProductoEnColaCorte(prodKey, conteoPlacasCola) {
  const receta = BOM_CAJAS[prodKey];
  if (!receta || !receta.placasDelProducto) return 0;
  let maxCortables = Infinity;
  for (const placaId of receta.placasDelProducto) {
    const sp = PLACA_SPECS[placaId];
    if (!sp || sp.tubosRequeridos === 0) continue;
    const reqPiezasPorCaja = receta.componentes[sp.piezaResultante] || 1;
    const placasDisp = conteoPlacasCola[placaId] || 0;
    const piezasQueRindenEsasPlacas = placasDisp * sp.rendimientoCorte;
    maxCortables = Math.min(maxCortables, Math.floor(piezasQueRindenEsasPlacas / reqPiezasPorCaja));
  }
  return maxCortables === Infinity ? 0 : maxCortables;
}

function computeEngineeringMetrics() {
  const rawElapsedSec = getEffectiveElapsedSeconds();
  const elapsedSec = Math.max(1, rawElapsedSec);
  const elapsedMin = elapsedSec / 60;
  const elapsedHours = elapsedSec / 3600;

  const ptPorProducto = {
    ESTANDAR: state.contadores.productosTerminados?.ESTANDAR || 0,
    PLUS: state.contadores.productosTerminados?.PLUS || 0,
    NUEVO_ESTANDAR: state.contadores.productosTerminados?.NUEVO_ESTANDAR || 0,
    NUEVO_PLUS: state.contadores.productosTerminados?.NUEVO_PLUS || 0
  };

  const ptEstandar = ptPorProducto.ESTANDAR;
  const ptPlus = ptPorProducto.PLUS;
  const ptNuevoEstandar = ptPorProducto.NUEVO_ESTANDAR;
  const ptNuevoPlus = ptPorProducto.NUEVO_PLUS;
  const ptTotal = ptEstandar + ptPlus + ptNuevoEstandar + ptNuevoPlus;

  const tasasPorProducto = {};
  for (const pk of PRODUCT_KEYS) {
    tasasPorProducto[pk] = {
      unidades: ptPorProducto[pk],
      porMinuto: rawElapsedSec > 0 ? +(ptPorProducto[pk] / elapsedMin).toFixed(3) : 0,
      porHora: rawElapsedSec > 0 ? +(ptPorProducto[pk] / elapsedHours).toFixed(2) : 0
    };
  }

  const throughputTotalPorMin = rawElapsedSec > 0 ? +(ptTotal / elapsedMin).toFixed(3) : 0;
  const throughputTotalPorHora = rawElapsedSec > 0 ? +(ptTotal / elapsedHours).toFixed(2) : 0;
  const tiempoPorCajaSistemaSeg = (ptTotal > 0 && rawElapsedSec > 0) ? +(rawElapsedSec / ptTotal).toFixed(1) : null;

  const tubosTotales = state.wip.tubosTotalesProducidos;
  const placasTotalesPegadas = Object.values(state.contadores.placasPegadas).reduce((a, b) => a + b, 0);
  const placasTotalesCortadas = Object.values(state.contadores.placasCortadas).reduce((a, b) => a + b, 0);
  const ensamblesTotales = ptTotal;

  const p = state.wip.piezasCortadas;
  const armablesPorProducto = {
    ESTANDAR: calcularArmablesDeProducto('ESTANDAR', p),
    PLUS: calcularArmablesDeProducto('PLUS', p),
    NUEVO_ESTANDAR: calcularArmablesDeProducto('NUEVO_ESTANDAR', p),
    NUEVO_PLUS: calcularArmablesDeProducto('NUEVO_PLUS', p)
  };

  // Como cada uno de los 4 productos tiene ahora sus propias piezas separadas, el total armable es la suma directa
  const cajasTotalesEnBufferEnsamblado =
    armablesPorProducto.ESTANDAR +
    armablesPorProducto.PLUS +
    armablesPorProducto.NUEVO_ESTANDAR +
    armablesPorProducto.NUEVO_PLUS;

  const conteoPlacasCola = createEmptyPlacasMap(0);
  for (const pl of state.wip.placasEnColaCorte) {
    conteoPlacasCola[pl.tipoPlaca] = (conteoPlacasCola[pl.tipoPlaca] || 0) + 1;
  }

  const cortablesPorProducto = {
    ESTANDAR: calcularCortablesDeProductoEnColaCorte('ESTANDAR', conteoPlacasCola),
    PLUS: calcularCortablesDeProductoEnColaCorte('PLUS', conteoPlacasCola),
    NUEVO_ESTANDAR: calcularCortablesDeProductoEnColaCorte('NUEVO_ESTANDAR', conteoPlacasCola),
    NUEVO_PLUS: calcularCortablesDeProductoEnColaCorte('NUEVO_PLUS', conteoPlacasCola)
  };

  const cortadoEquivEst = cortablesPorProducto.ESTANDAR;
  const cortadoEquivPlus = cortablesPorProducto.PLUS;
  const cortadoEquivNuevos = cortablesPorProducto.NUEVO_ESTANDAR + cortablesPorProducto.NUEVO_PLUS;
  const cortadoEquivTotalCajas =
    cortablesPorProducto.ESTANDAR +
    cortablesPorProducto.PLUS +
    cortablesPorProducto.NUEVO_ESTANDAR +
    cortablesPorProducto.NUEVO_PLUS;

  const cfg = state.amortiguadoresConfig || DEFAULT_AMORTIGUADORES;
  const metaPegadoTubos = cfg.pegadoTubos || 600;
  const metaCortadoCajas =
    (cfg.cortadoCajasEstandar || 13) +
    (cfg.cortadoCajasPlus || 13) +
    (cfg.cortadoNuevoEstandar || 0) +
    (cfg.cortadoNuevoPlus || 0);
  const metaEnsambladoCajas =
    (cfg.ensambladoCajasEstandar || 3) +
    (cfg.ensambladoCajasPlus || 3) +
    (cfg.ensambladoNuevoEstandar || 0) +
    (cfg.ensambladoNuevoPlus || 0);

  const estadoAmortiguadores = {
    enrollado: {
      estacion: '1. Enrollado (MP Papel Carta)',
      operarios: 4,
      actual: state.wip.hojasCartaDisponibles ?? 1200,
      meta: cfg.enrolladoHojasCarta || 1200,
      unidad: 'hojas carta',
      detalle: `${state.wip.hojasCartaDisponibles ?? 1200} hojas disponibles`,
      ...evaluarEstadoAmortiguador(state.wip.hojasCartaDisponibles ?? 1200, cfg.enrolladoHojasCarta || 1200)
    },
    pegado: {
      estacion: '2. Amortiguador Pegado',
      operarios: 4,
      actual: state.wip.tubosDisponibles,
      meta: metaPegadoTubos,
      unidad: 'tubos',
      faltanteParaMeta: Math.max(0, metaPegadoTubos - state.wip.tubosDisponibles),
      detalle: `${state.wip.tubosDisponibles} / ${metaPegadoTubos} tubos (${tubosTotales} nuevos enrollados)`,
      ...evaluarEstadoAmortiguador(state.wip.tubosDisponibles, metaPegadoTubos)
    },
    cortado: {
      estacion: '3. Amortiguador Cortado',
      operarios: 1,
      actual: cortadoEquivTotalCajas,
      meta: metaCortadoCajas,
      unidad: 'unid. equiv.',
      cajasEst: cortadoEquivEst,
      cajasPlus: cortadoEquivPlus,
      cajasNuevos: cortadoEquivNuevos,
      cortablesPorProducto,
      totalPlacas: state.wip.placasEnColaCorte.length,
      conteoPlacasCola,
      faltanteParaMeta: Math.max(0, metaCortadoCajas - cortadoEquivTotalCajas),
      detalle: `${cortadoEquivTotalCajas} unid. equiv. (C.Est:${cortablesPorProducto.ESTANDAR}, C.Plus:${cortablesPorProducto.PLUS}, N.Est:${cortablesPorProducto.NUEVO_ESTANDAR}, N.Plus:${cortablesPorProducto.NUEVO_PLUS})`,
      ...evaluarEstadoAmortiguador(cortadoEquivTotalCajas, metaCortadoCajas)
    },
    ensamblado: {
      estacion: '4. Amortiguador Ensamblado',
      operarios: 4,
      actual: cajasTotalesEnBufferEnsamblado,
      meta: metaEnsambladoCajas,
      unidad: 'productos listos',
      cajasEst: armablesPorProducto.ESTANDAR,
      cajasPlus: armablesPorProducto.PLUS,
      armablesPorProducto,
      faltanteParaMeta: Math.max(0, metaEnsambladoCajas - cajasTotalesEnBufferEnsamblado),
      detalle: `${cajasTotalesEnBufferEnsamblado} armables (C.Est:${armablesPorProducto.ESTANDAR}, C.Plus:${armablesPorProducto.PLUS}, N.Est:${armablesPorProducto.NUEVO_ESTANDAR}, N.Plus:${armablesPorProducto.NUEVO_PLUS})`,
      ...evaluarEstadoAmortiguador(cajasTotalesEnBufferEnsamblado, metaEnsambladoCajas)
    }
  };

  let cuelloDeBotella = 'Amortiguadores Estables (Flujo Continuo en las 4 Áreas)';
  let cuelloArea = 'NINGUNO';
  if (estadoAmortiguadores.ensamblado.zona === 'ROJO') {
    cuelloDeBotella = '3. Cortado (Amortiguador de Ensamblado en Zona Roja <33%)';
    cuelloArea = 'CORTADO';
  } else if (estadoAmortiguadores.cortado.zona === 'ROJO') {
    cuelloDeBotella = '2. Pegado (Amortiguador de Cortado en Zona Roja <33%)';
    cuelloArea = 'PEGADO';
  } else if (estadoAmortiguadores.pegado.zona === 'ROJO') {
    cuelloDeBotella = '1. Enrollado (Amortiguador de 600 tubos en Zona Roja <33%)';
    cuelloArea = 'ENROLLADO';
  }

  const statsOperarios = {};
  state.operarios.forEach(op => {
    statsOperarios[op.id] = {
      id: op.id,
      numero: op.numero,
      nombre: op.nombre,
      area: op.area,
      areaNombre: op.areaNombre,
      unidadesProducidas: 0,
      eventosCount: 0,
      mermas: 0,
      sumaCiclosSeg: 0,
      ciclosContados: 0,
      tiempoCicloPromedioSeg: null,
      ultimoCicloSeg: null,
      ultimaActividadTimestamp: null,
      detallePorTipo: {}
    };
  });

  for (let i = state.eventos.length - 1; i >= 0; i--) {
    const ev = state.eventos[i];
    const st = statsOperarios[ev.operarioId];
    if (!st) continue;
    if (ev.tipoAccion === 'MERMA') {
      st.mermas += (ev.cantidad || 1);
    } else if (ev.tipoAccion === 'PRODUCCION') {
      st.unidadesProducidas += (ev.cantidad || 1);
      st.eventosCount += 1;
      if (ev.subtipo) {
        st.detallePorTipo[ev.subtipo] = (st.detallePorTipo[ev.subtipo] || 0) + (ev.cantidad || 1);
      }
      if (ev.cicloSeg && ev.cicloSeg > 0 && ev.cicloSeg < 1800) {
        st.sumaCiclosSeg += ev.cicloSeg;
        st.ciclosContados += 1;
        st.ultimoCicloSeg = ev.cicloSeg;
      }
      st.ultimaActividadTimestamp = ev.timestamp;
    }
  }

  Object.values(statsOperarios).forEach(st => {
    if (st.ciclosContados > 0) {
      st.tiempoCicloPromedioSeg = +(st.sumaCiclosSeg / st.ciclosContados).toFixed(1);
    }
  });

  // ==========================================================================
  // MEJORA #1: CÁLCULO DE BALANCEO DE LÍNEA Y TAKT TIME EN VIVO (4 ESTACIONES)
  // ==========================================================================
  const taktCfg = state.session.taktConfig || { demandaMetaUnidades: 6, tiempoDisponibleMin: 15 };
  const demandaMeta = Math.max(1, Number(taktCfg.demandaMetaUnidades) || 6);
  const tiempoDispMin = Math.max(1, Number(taktCfg.tiempoDisponibleMin) || 15);
  const tiempoDispSeg = tiempoDispMin * 60;
  const taktTimeSeg = +(tiempoDispSeg / demandaMeta).toFixed(1);

  const calcPromedioArea = (areaKey) => {
    const opsArea = Object.values(statsOperarios).filter(o => o.area === areaKey && o.tiempoCicloPromedioSeg !== null);
    if (opsArea.length === 0) return null;
    const sum = opsArea.reduce((a, b) => a + b.tiempoCicloPromedioSeg, 0);
    return +(sum / opsArea.length).toFixed(1);
  };

  const rawCicloEnrolladoPorTubo = calcPromedioArea('ENROLLADO');
  const rawCicloPegadoPorPlaca = calcPromedioArea('PEGADO');
  const rawCicloCortadoPorLote = calcPromedioArea('CORTADO');
  const rawCicloEnsambladoPorCaja = calcPromedioArea('ENSAMBLADO');

  // Promedio ponderado: ~31 tubos y ~4 placas por unidad de los 4 productos
  const cicloEstacionEnrolladoCaja = rawCicloEnrolladoPorTubo !== null
    ? +((rawCicloEnrolladoPorTubo * 31) / 4).toFixed(1)
    : (tubosTotales > 0 ? +((elapsedSec / (tubosTotales / 31))).toFixed(1) : 0);

  const cicloEstacionPegadoCaja = rawCicloPegadoPorPlaca !== null
    ? +((rawCicloPegadoPorPlaca * 4) / 4).toFixed(1)
    : (placasTotalesPegadas > 0 ? +((elapsedSec / (placasTotalesPegadas / 4))).toFixed(1) : 0);

  const cicloEstacionCortadoCaja = rawCicloCortadoPorLote !== null
    ? +(rawCicloCortadoPorLote * 1).toFixed(1)
    : (placasTotalesCortadas > 0 ? +((elapsedSec / placasTotalesCortadas)).toFixed(1) : 0);

  const cicloEstacionEnsambladoCaja = rawCicloEnsambladoPorCaja !== null
    ? +((rawCicloEnsambladoPorCaja * 1) / 4).toFixed(1)
    : (ensamblesTotales > 0 ? +((elapsedSec / ensamblesTotales)).toFixed(1) : 0);

  const estacionesBalanceo = [
    {
      id: 'ENROLLADO',
      nombre: '1. Enrollado (Tubos)',
      operarios: 4,
      cicloIndividualPromSeg: rawCicloEnrolladoPorTubo,
      unidadIndividual: 'seg/tubo',
      cicloEstacionPorCajaSeg: cicloEstacionEnrolladoCaja,
      superaTakt: cicloEstacionEnrolladoCaja > taktTimeSeg,
      porcentajeRespectoTakt: taktTimeSeg > 0 ? Math.round((cicloEstacionEnrolladoCaja / taktTimeSeg) * 100) : 0
    },
    {
      id: 'PEGADO',
      nombre: '2. Pegado (Placas)',
      operarios: 4,
      cicloIndividualPromSeg: rawCicloPegadoPorPlaca,
      unidadIndividual: 'seg/placa',
      cicloEstacionPorCajaSeg: cicloEstacionPegadoCaja,
      superaTakt: cicloEstacionPegadoCaja > taktTimeSeg,
      porcentajeRespectoTakt: taktTimeSeg > 0 ? Math.round((cicloEstacionPegadoCaja / taktTimeSeg) * 100) : 0
    },
    {
      id: 'CORTADO',
      nombre: '3. Cortado (Máquina)',
      operarios: 1,
      cicloIndividualPromSeg: rawCicloCortadoPorLote,
      unidadIndividual: 'seg/corte',
      cicloEstacionPorCajaSeg: cicloEstacionCortadoCaja,
      superaTakt: cicloEstacionCortadoCaja > taktTimeSeg,
      porcentajeRespectoTakt: taktTimeSeg > 0 ? Math.round((cicloEstacionCortadoCaja / taktTimeSeg) * 100) : 0
    },
    {
      id: 'ENSAMBLADO',
      nombre: '4. Ensamblado (4 Prod.)',
      operarios: 4,
      cicloIndividualPromSeg: rawCicloEnsambladoPorCaja,
      unidadIndividual: 'seg/unid',
      cicloEstacionPorCajaSeg: cicloEstacionEnsambladoCaja,
      superaTakt: cicloEstacionEnsambladoCaja > taktTimeSeg,
      porcentajeRespectoTakt: taktTimeSeg > 0 ? Math.round((cicloEstacionEnsambladoCaja / taktTimeSeg) * 100) : 0
    }
  ];

  const ciclosActivos = estacionesBalanceo.map(e => e.cicloEstacionPorCajaSeg).filter(v => v > 0);
  const maxCicloEstacionSeg = ciclosActivos.length > 0 ? Math.max(...ciclosActivos) : 0;
  const sumaCiclosEstacionesSeg = ciclosActivos.reduce((a, b) => a + b, 0);
  const eficienciaBalanceoPct = (maxCicloEstacionSeg > 0 && ciclosActivos.length > 0)
    ? Math.round((sumaCiclosEstacionesSeg / (ciclosActivos.length * maxCicloEstacionSeg)) * 100)
    : 0;

  const estacionMasLenta = maxCicloEstacionSeg > 0
    ? estacionesBalanceo.find(e => e.cicloEstacionPorCajaSeg === maxCicloEstacionSeg)
    : null;

  const balanceoLinea = {
    demandaMetaUnidades: demandaMeta,
    tiempoDisponibleMin: tiempoDispMin,
    taktTimeSeg,
    taktTimeMin: +(taktTimeSeg / 60).toFixed(2),
    maxCicloEstacionSeg,
    eficienciaBalanceoPct,
    estacionCuelloDeBotellaCiclo: estacionMasLenta ? `${estacionMasLenta.nombre} (${estacionMasLenta.cicloEstacionPorCajaSeg} s/unid)` : 'Esperando registros de ciclo...',
    cumpleTaktTime: maxCicloEstacionSeg === 0 || maxCicloEstacionSeg <= taktTimeSeg,
    estaciones: estacionesBalanceo
  };

  const cajasTerminadas = state.cajas.filter(c => c.estado === 'TERMINADO');
  let leadTimePromedioSeg = null;
  if (cajasTerminadas.length > 0) {
    const sumLead = cajasTerminadas.reduce((acc, c) => acc + (c.leadTimeTotalSeg || 0), 0);
    leadTimePromedioSeg = +(sumLead / cajasTerminadas.length).toFixed(1);
  }

  const reposicionPedidos = evaluarProgresoPedidosDocente();

  return {
    tiempoEfectivoSeg: Math.round(rawElapsedSec),
    tiempoEfectivoMin: +(rawElapsedSec / 60).toFixed(2),
    estadoAmortiguadores,
    reposicionPedidos,
    balanceoLinea,
    throughput: {
      unidadesTerminadasTotal: ptTotal,
      unidadesTerminadasEstandar: ptEstandar,
      unidadesTerminadasPlus: ptPlus,
      unidadesTerminadasNuevoEstandar: ptNuevoEstandar,
      unidadesTerminadasNuevoPlus: ptNuevoPlus,
      porProducto: tasasPorProducto,
      totalPorMinuto: throughputTotalPorMin,
      totalPorHora: throughputTotalPorHora,
      estandarPorMinuto: tasasPorProducto.ESTANDAR.porMinuto,
      estandarPorHora: tasasPorProducto.ESTANDAR.porHora,
      plusPorMinuto: tasasPorProducto.PLUS.porMinuto,
      plusPorHora: tasasPorProducto.PLUS.porHora,
      nuevoEstandarPorMinuto: tasasPorProducto.NUEVO_ESTANDAR.porMinuto,
      nuevoEstandarPorHora: tasasPorProducto.NUEVO_ESTANDAR.porHora,
      nuevoPlusPorMinuto: tasasPorProducto.NUEVO_PLUS.porMinuto,
      nuevoPlusPorHora: tasasPorProducto.NUEVO_PLUS.porHora,
      tiempoEntreSalidasSeg: tiempoPorCajaSistemaSeg,
      leadTimePromedioSeg
    },
    estaciones: {
      enrollado: {
        operarios: 4,
        hojasDisponibles: state.wip.hojasCartaDisponibles ?? 1200,
        tubosProducidos: tubosTotales,
        tubosEnWip: state.wip.tubosDisponibles,
        tasaTubosPorMin: +(tubosTotales / elapsedMin).toFixed(2)
      },
      pegado: {
        operarios: 4,
        placasPegadas: placasTotalesPegadas,
        placasEnColaCorte: state.wip.placasEnColaCorte.length,
        cajasEquivEnColaCorte: cortadoEquivTotalCajas,
        tasaPlacasPorMin: +(placasTotalesPegadas / elapsedMin).toFixed(2)
      },
      cortado: {
        operarios: 1,
        placasCortadas: placasTotalesCortadas,
        kitsPorProducto: state.contadores.kitsCortadosPorProducto || {},
        tasaCortesPorMin: +(placasTotalesCortadas / elapsedMin).toFixed(2)
      },
      ensamblado: {
        operarios: 4,
        cajasEnsambladasTotal: ensamblesTotales,
        porProductoTerminado: ptPorProducto,
        tasaEnsamblesPorMin: +(ensamblesTotales / elapsedMin).toFixed(2),
        armablesPorProducto,
        cajasEstandarArmablesAhora: armablesPorProducto.ESTANDAR,
        cajasPlusArmablesAhora: armablesPorProducto.PLUS,
        cajasTotalesEnBufferEnsamblado
      }
    },
    cuelloDeBotella,
    cuelloArea,
    statsOperarios
  };
}

// ============================================================================
// FUNCIONES DE PRODUCCIÓN Y TRAZABILIDAD POR ESTACIÓN (4 ESTACIONES)
// ============================================================================

function registrarCicloOperario(operarioId, now) {
  const prev = state.ultimoRegistroPorOperario[operarioId] || state.session.inicioTimestamp || now;
  const cicloSeg = Math.max(1, +((now - prev) / 1000).toFixed(1));
  state.ultimoRegistroPorOperario[operarioId] = now;
  return cicloSeg;
}

function getOperario(operarioId) {
  return state.operarios.find(o => o.id === operarioId) || {
    id: operarioId || 'OP-01',
    numero: 1,
    nombre: operarioId || 'Operario',
    area: 'GENERAL'
  };
}

function agregarEvento(ev) {
  state.eventos.unshift(ev);
  if (state.eventos.length > 600) {
    state.eventos.length = 600;
  }
}

// 1. ÁREA DE ENROLLADO (4 Operarios: Op 1-4)
function accionEnrollado({ operarioId, cantidad = 50 }) {
  const now = Date.now();
  const op = getOperario(operarioId);
  const cant = Math.max(1, Math.min(500, Number(cantidad) || 50));
  const cicloSeg = registrarCicloOperario(op.id, now);
  const cicloUnitarioSeg = +(cicloSeg / cant).toFixed(2);

  if (typeof state.wip.hojasCartaDisponibles === 'number') {
    state.wip.hojasCartaDisponibles = Math.max(0, state.wip.hojasCartaDisponibles - cant);
  }
  state.wip.tubosDisponibles += cant;
  state.wip.tubosTotalesProducidos += cant;

  const loteId = `TUB-${String(state.wip.tubosTotalesProducidos).padStart(4, '0')}`;
  state.wip.tubosLotesRecientes.push({
    id: loteId,
    operarioId: op.id,
    operarioNombre: op.nombre,
    cantidad: cant,
    restante: cant,
    timestamp: now
  });

  const evento = {
    id: 'EV-' + now + '-' + Math.random().toString(36).slice(2, 6),
    timestamp: now,
    operarioId: op.id,
    operarioNombre: op.nombre,
    area: 'ENROLLADO',
    tipoAccion: 'PRODUCCION',
    subtipo: 'TUBO_PAPEL',
    etiqueta: `${cant} Tubos enrollados (${loteId}) → Amortiguador Pegado: ${state.wip.tubosDisponibles}`,
    cantidad: cant,
    cicloSeg: cicloUnitarioSeg,
    origen: 'Papel Reciclado Tamaño Carta',
    destino: `Amortiguador 2. Pegado (${state.wip.tubosDisponibles} tubos)`
  };
  agregarEvento(evento);
  evaluarProgresoPedidosDocente();
  saveState();
  return { ok: true, mensaje: `+${cant} tubos al amortiguador de Pegado (${state.wip.tubosDisponibles} disp.)`, evento };
}

// 2. ÁREA DE PEGADO (4 Operarios: Op 5-8)
function accionPegado({ operarioId, tipoPlaca }) {
  const spec = PLACA_SPECS[tipoPlaca];
  if (!spec) {
    return { ok: false, error: 'Tipo de placa/bloque no válido: ' + tipoPlaca };
  }

  const now = Date.now();
  const op = getOperario(operarioId);

  if (!state.session.modoInventarioFlexible && state.wip.tubosDisponibles < spec.tubosRequeridos) {
    return {
      ok: false,
      error: `Amortiguador de Pegado insuficiente: requiere ${spec.tubosRequeridos} tubos y quedan ${state.wip.tubosDisponibles}.`
    };
  }

  const cicloSeg = registrarCicloOperario(op.id, now);

  let porConsumir = spec.tubosRequeridos;
  const operadoresEnrolladoSet = new Set();
  const lotesTubosUsados = [];
  let primerTimestampTubo = now;

  for (const lote of state.wip.tubosLotesRecientes) {
    if (porConsumir <= 0) break;
    if (lote.restante > 0) {
      const tomar = Math.min(lote.restante, porConsumir);
      lote.restante -= tomar;
      porConsumir -= tomar;
      operadoresEnrolladoSet.add(lote.operarioId === 'AMORTIGUADOR' ? 'Amortiguador Inicial (600 tubos)' : `${lote.operarioNombre} (${lote.operarioId})`);
      lotesTubosUsados.push(lote.id);
      if (lote.timestamp < primerTimestampTubo) {
        primerTimestampTubo = lote.timestamp;
      }
    }
  }

  if (porConsumir > 0) {
    operadoresEnrolladoSet.add('Lote Enrollado en Mesa');
  }

  state.wip.tubosDisponibles = Math.max(0, state.wip.tubosDisponibles - spec.tubosRequeridos);
  state.contadores.placasPegadas[tipoPlaca] = (state.contadores.placasPegadas[tipoPlaca] || 0) + 1;

  const totalPlacasDeEsteTipo = state.contadores.placasPegadas[tipoPlaca];
  const codigoPlaca = `${tipoPlaca.slice(0, 8)}-${String(totalPlacasDeEsteTipo).padStart(3, '0')}`;

  const nuevaPlaca = {
    id: codigoPlaca,
    esAmortiguador: false,
    tipoPlaca: spec.id,
    nombrePlaca: spec.nombre,
    corto: spec.corto,
    tubosUsados: spec.tubosRequeridos,
    piezaResultante: spec.piezaResultante,
    nombrePiezaResultante: spec.nombrePiezaResultante,
    rendimientoCorte: spec.rendimientoCorte,
    operarioPegadoId: op.id,
    operarioPegadoNombre: op.nombre,
    origenEnrollado: Array.from(operadoresEnrolladoSet),
    lotesTubosUsados,
    inicioTuboTimestamp: primerTimestampTubo,
    timestampPegado: now,
    cicloPegadoSeg: cicloSeg
  };

  state.wip.placasEnColaCorte.push(nuevaPlaca);

  const evento = {
    id: 'EV-' + now + '-' + Math.random().toString(36).slice(2, 6),
    timestamp: now,
    operarioId: op.id,
    operarioNombre: op.nombre,
    area: 'PEGADO',
    tipoAccion: 'PRODUCCION',
    subtipo: spec.id,
    etiqueta: `${spec.corto} armada [${codigoPlaca}] (-${spec.tubosRequeridos} tubos, quedan ${state.wip.tubosDisponibles})`,
    cantidad: 1,
    cicloSeg,
    origen: `${nuevaPlaca.origenEnrollado.join(', ')}`,
    destino: `Amortiguador 3. Cortado (${state.wip.placasEnColaCorte.length} placas en cola)`
  };
  agregarEvento(evento);
  evaluarProgresoPedidosDocente();
  saveState();

  return {
    ok: true,
    mensaje: `${spec.corto} (${codigoPlaca}) enviada al Amortiguador de Cortado`,
    placa: nuevaPlaca,
    evento
  };
}

// 3A. ÁREA DE CORTADO POR PLACA (1 Operario: Op 9)
function accionCortado({ operarioId, placaId, tipoPlaca }) {
  const now = Date.now();
  const op = getOperario(operarioId || 'OP-09');

  let indexEnCola = -1;
  if (placaId) {
    indexEnCola = state.wip.placasEnColaCorte.findIndex(p => p.id === placaId);
  } else if (tipoPlaca) {
    indexEnCola = state.wip.placasEnColaCorte.findIndex(p => p.tipoPlaca === tipoPlaca);
  }

  let placaCortada = null;
  if (indexEnCola >= 0) {
    placaCortada = state.wip.placasEnColaCorte.splice(indexEnCola, 1)[0];
  } else if (tipoPlaca && PLACA_SPECS[tipoPlaca] && state.session.modoInventarioFlexible) {
    const spec = PLACA_SPECS[tipoPlaca];
    state.contadores.placasPegadas[tipoPlaca] = (state.contadores.placasPegadas[tipoPlaca] || 0) + 1;
    const codigoVirtual = `${tipoPlaca.slice(0, 6)}-V${state.contadores.placasPegadas[tipoPlaca]}`;
    placaCortada = {
      id: codigoVirtual,
      tipoPlaca: spec.id,
      nombrePlaca: spec.nombre,
      corto: spec.corto,
      tubosUsados: spec.tubosRequeridos,
      piezaResultante: spec.piezaResultante,
      nombrePiezaResultante: spec.nombrePiezaResultante,
      rendimientoCorte: spec.rendimientoCorte,
      operarioPegadoId: 'ÁREA-PEGADO',
      operarioPegadoNombre: 'Área Pegado (Directo en mesa)',
      origenEnrollado: ['Área Enrollado'],
      inicioTuboTimestamp: now - 60000,
      timestampPegado: now - 30000,
      cicloPegadoSeg: null
    };
  } else {
    return {
      ok: false,
      error: 'No hay placas de ese tipo en el amortiguador de Cortado.'
    };
  }

  const cicloSeg = registrarCicloOperario(op.id, now);
  const piezaKey = placaCortada.piezaResultante;
  const cantPiezas = placaCortada.rendimientoCorte;

  state.contadores.placasCortadas[placaCortada.tipoPlaca] =
    (state.contadores.placasCortadas[placaCortada.tipoPlaca] || 0) + 1;
  state.wip.piezasCortadas[piezaKey] = (state.wip.piezasCortadas[piezaKey] || 0) + cantPiezas;
  state.contadores.piezasCortadasTotales[piezaKey] =
    (state.contadores.piezasCortadasTotales[piezaKey] || 0) + cantPiezas;

  if (!state.wip.lotesPiezasCortadas[piezaKey]) {
    state.wip.lotesPiezasCortadas[piezaKey] = [];
  }
  state.wip.lotesPiezasCortadas[piezaKey].push({
    loteCorteId: `CRT-${placaCortada.id}`,
    placaId: placaCortada.id,
    esAmortiguador: !!placaCortada.esAmortiguador,
    tipoPlaca: placaCortada.tipoPlaca,
    nombrePlaca: placaCortada.nombrePlaca,
    piezaResultante: piezaKey,
    nombrePieza: placaCortada.nombrePiezaResultante,
    cantidadInicial: cantPiezas,
    restante: cantPiezas,
    operarioPegadoId: placaCortada.operarioPegadoId,
    operarioPegadoNombre: placaCortada.operarioPegadoNombre,
    origenEnrollado: placaCortada.origenEnrollado,
    operarioCorteId: op.id,
    operarioCorteNombre: op.nombre,
    inicioTuboTimestamp: placaCortada.inicioTuboTimestamp || placaCortada.timestampPegado,
    timestampPegado: placaCortada.timestampPegado,
    timestampCorte: now
  });

  // Si se cortó una EST_PLACA_13_FIDEO (Tapa de Caja Estándar), se generan automáticamente 2 Mermas de Tapa Estándar aprovechables para el Nuevo Producto Estándar
  let notaExtraMerma = '';
  if (placaCortada.tipoPlaca === 'EST_PLACA_13_FIDEO' || placaCortada.tipoPlaca === 'PLACA_13') {
    state.wip.piezasCortadas.MERMA_TAPA_EST = (state.wip.piezasCortadas.MERMA_TAPA_EST || 0) + 2;
    state.contadores.piezasCortadasTotales.MERMA_TAPA_EST = (state.contadores.piezasCortadasTotales.MERMA_TAPA_EST || 0) + 2;
    if (!state.wip.lotesPiezasCortadas.MERMA_TAPA_EST) state.wip.lotesPiezasCortadas.MERMA_TAPA_EST = [];
    state.wip.lotesPiezasCortadas.MERMA_TAPA_EST.push({
      loteCorteId: `MERMA-${placaCortada.id}`,
      placaId: placaCortada.id,
      esAmortiguador: !!placaCortada.esAmortiguador,
      tipoPlaca: 'EST_PLACA_13_FIDEO',
      nombrePlaca: 'Merma de Tapa Estándar',
      piezaResultante: 'MERMA_TAPA_EST',
      nombrePieza: 'Mermas de Tapa Caja Estándar',
      cantidadInicial: 2,
      restante: 2,
      operarioPegadoId: placaCortada.operarioPegadoId,
      operarioPegadoNombre: placaCortada.operarioPegadoNombre,
      origenEnrollado: placaCortada.origenEnrollado,
      operarioCorteId: op.id,
      operarioCorteNombre: op.nombre,
      inicioTuboTimestamp: placaCortada.inicioTuboTimestamp || placaCortada.timestampPegado,
      timestampPegado: placaCortada.timestampPegado,
      timestampCorte: now
    });
    notaExtraMerma = ' (+2 Mermas Tapa Est. para Nuevo Producto)';
  }

  const evento = {
    id: 'EV-' + now + '-' + Math.random().toString(36).slice(2, 6),
    timestamp: now,
    operarioId: op.id,
    operarioNombre: op.nombre,
    area: 'CORTADO',
    tipoAccion: 'PRODUCCION',
    subtipo: placaCortada.tipoPlaca,
    etiqueta: `Cortó ${placaCortada.corto} [${placaCortada.id}] → +${cantPiezas} ${placaCortada.nombrePiezaResultante}${notaExtraMerma}`,
    cantidad: 1,
    cicloSeg,
    origen: `${placaCortada.operarioPegadoNombre} (${placaCortada.id})`,
    destino: `Amortiguador 4. Ensamblado (+${cantPiezas} ${placaCortada.nombrePiezaResultante})`
  };
  agregarEvento(evento);
  evaluarProgresoPedidosDocente();
  saveState();

  return {
    ok: true,
    mensaje: `Corte completado: +${cantPiezas} ${placaCortada.nombrePiezaResultante}${notaExtraMerma}`,
    placaCortada,
    evento
  };
}

// 3B. ÁREA DE CORTADO POR KIT COMPLETO DE CUALQUIERA DE LOS 4 PRODUCTOS
function accionCortadoKitCaja({ operarioId, tipoCaja = 'ESTANDAR' }) {
  const receta = BOM_CAJAS[tipoCaja];
  if (!receta) return { ok: false, error: 'Tipo de producto no válido para corte' };

  const now = Date.now();
  const op = getOperario(operarioId || 'OP-09');
  const cicloSeg = registrarCicloOperario(op.id, now);

  const tipoTapaPlaca = receta.placaTapaRef || 'PLACA_13';
  const idxTapa = state.wip.placasEnColaCorte.findIndex(p => p.tipoPlaca === tipoTapaPlaca);
  let origenTexto = 'Amortiguador Cortado';
  if (idxTapa >= 0) {
    const plTapa = state.wip.placasEnColaCorte.splice(idxTapa, 1)[0];
    origenTexto = `${plTapa.operarioPegadoNombre} [${plTapa.id}]`;
  }

  for (const [piezaKey, cant] of Object.entries(receta.componentes)) {
    state.wip.piezasCortadas[piezaKey] = (state.wip.piezasCortadas[piezaKey] || 0) + cant;
    state.contadores.piezasCortadasTotales[piezaKey] = (state.contadores.piezasCortadasTotales[piezaKey] || 0) + cant;
    if (!state.wip.lotesPiezasCortadas[piezaKey]) {
      state.wip.lotesPiezasCortadas[piezaKey] = [];
    }
    state.wip.lotesPiezasCortadas[piezaKey].push({
      loteCorteId: `CRT-KIT-${tipoCaja}-${now}`,
      placaId: `KIT-${receta.prefijo}`,
      tipoPlaca: `KIT_${tipoCaja}`,
      nombrePlaca: `Kit Completo ${receta.nombre}`,
      piezaResultante: piezaKey,
      nombrePieza: piezaKey,
      cantidadInicial: cant,
      restante: cant,
      operarioPegadoId: 'AMORT-PEGADO',
      operarioPegadoNombre: origenTexto,
      origenEnrollado: ['Amortiguador / Enrollado'],
      operarioCorteId: op.id,
      operarioCorteNombre: op.nombre,
      inicioTuboTimestamp: now,
      timestampPegado: now,
      timestampCorte: now
    });
  }

  // Si se cortó un kit de Cajita Estándar, también libera 2 mermas de la tapa estándar para el Nuevo Producto Estándar
  if (tipoCaja === 'ESTANDAR') {
    state.wip.piezasCortadas.MERMA_TAPA_EST = (state.wip.piezasCortadas.MERMA_TAPA_EST || 0) + 2;
    state.contadores.piezasCortadasTotales.MERMA_TAPA_EST = (state.contadores.piezasCortadasTotales.MERMA_TAPA_EST || 0) + 2;
  }

  if (!state.contadores.kitsCortadosPorProducto) {
    state.contadores.kitsCortadosPorProducto = { ESTANDAR: 0, PLUS: 0, NUEVO_ESTANDAR: 0, NUEVO_PLUS: 0 };
  }
  state.contadores.kitsCortadosPorProducto[tipoCaja] = (state.contadores.kitsCortadosPorProducto[tipoCaja] || 0) + 1;
  state.contadores.placasCortadas[tipoTapaPlaca] = (state.contadores.placasCortadas[tipoTapaPlaca] || 0) + 1;

  const evento = {
    id: 'EV-' + now + '-' + Math.random().toString(36).slice(2, 6),
    timestamp: now,
    operarioId: op.id,
    operarioNombre: op.nombre,
    area: 'CORTADO',
    tipoAccion: 'PRODUCCION',
    subtipo: `KIT_${tipoCaja}`,
    etiqueta: `✂️ Cortó Kit Completo de 1 ${receta.nombre} → Enviado al Amortiguador de Ensamblado`,
    cantidad: 1,
    cicloSeg,
    origen: origenTexto,
    destino: `Amortiguador 4. Ensamblado (+1 ${receta.nombre} en piezas)`
  };
  agregarEvento(evento);
  evaluarProgresoPedidosDocente();
  saveState();

  return {
    ok: true,
    mensaje: `Kit de 1 ${receta.nombre} cortado y enviado a Ensamblado`,
    evento
  };
}

// 4. ÁREA DE ENSAMBLADO (4 Operarios: Op 10-13 — Finaliza los 4 Productos)
function accionEnsamblado({ operarioId, tipoCaja, destinoPedido }) {
  const receta = BOM_CAJAS[tipoCaja];
  if (!receta) {
    return { ok: false, error: 'Tipo de producto inválido.' };
  }

  const now = Date.now();
  const op = getOperario(operarioId || 'OP-10');

  if (!state.session.modoInventarioFlexible) {
    const faltantes = [];
    for (const [comp, reqCant] of Object.entries(receta.componentes)) {
      const disp = state.wip.piezasCortadas[comp] || 0;
      if (disp < reqCant) {
        faltantes.push(`${comp}: requiere ${reqCant}, hay ${disp}`);
      }
    }
    if (faltantes.length > 0) {
      return {
        ok: false,
        error: `Amortiguador de Ensamblado insuficiente para ${receta.nombre}: ${faltantes.join(' | ')}`
      };
    }
  }

  guardarSnapshotUndo(`Ensamble ${receta.nombre}`, op.id);
  evaluarProgresoPedidosDocente();
  const pedidoPendienteDeEsteTipo = (state.pedidosDocente || []).find(p =>
    p.estado !== 'COMPLETADO' && ((p.progreso?.faltanPorProducto?.[tipoCaja] || 0) > 0)
  );

  const cicloSeg = registrarCicloOperario(op.id, now);

  const trazabilidadComponentes = [];
  const operariosEnrolladoSet = new Set();
  const operariosPegadoSet = new Set();
  const operariosCorteSet = new Set();
  const placasUsadasSet = new Set();
  let inicioProcesoTimestamp = now;
  let usoPiezasAmortiguador = false;

  for (const [comp, reqCant] of Object.entries(receta.componentes)) {
    state.wip.piezasCortadas[comp] = Math.max(0, (state.wip.piezasCortadas[comp] || 0) - reqCant);

    let porTomar = reqCant;
    const lotesCola = state.wip.lotesPiezasCortadas[comp] || [];
    const placasDeEsteComp = [];

    for (const lote of lotesCola) {
      if (porTomar <= 0) break;
      if (lote.restante > 0) {
        const tomado = Math.min(lote.restante, porTomar);
        lote.restante -= tomado;
        porTomar -= tomado;

        if (lote.esAmortiguador) usoPiezasAmortiguador = true;
        placasDeEsteComp.push(`${lote.placaId} (${lote.operarioPegadoNombre})`);
        placasUsadasSet.add(lote.placaId);
        operariosPegadoSet.add(lote.operarioPegadoNombre);
        operariosCorteSet.add(lote.operarioCorteNombre);
        (lote.origenEnrollado || []).forEach(e => operariosEnrolladoSet.add(e));

        if (lote.inicioTuboTimestamp && lote.inicioTuboTimestamp < inicioProcesoTimestamp) {
          inicioProcesoTimestamp = lote.inicioTuboTimestamp;
        }
      }
    }

    if (porTomar > 0) {
      placasDeEsteComp.push('Stock en Mesa');
      operariosEnrolladoSet.add('Equipo Enrollado (Op 1-4)');
      operariosPegadoSet.add('Equipo Pegado (Op 5-8)');
      operariosCorteSet.add('Operario 9 (Corte)');
    }

    trazabilidadComponentes.push({
      componente: comp,
      cantidad: reqCant,
      origenPlacas: placasDeEsteComp
    });
  }

  if (!state.contadores.productosTerminados) {
    state.contadores.productosTerminados = { ESTANDAR: 0, PLUS: 0, NUEVO_ESTANDAR: 0, NUEVO_PLUS: 0 };
  }
  state.contadores.productosTerminados[tipoCaja] = (state.contadores.productosTerminados[tipoCaja] || 0) + 1;

  state.contadores.cajasEnsambladasEstandar = state.contadores.productosTerminados.ESTANDAR;
  state.contadores.cajasEnsambladasPlus = state.contadores.productosTerminados.PLUS;
  state.contadores.cajasEnsambladasNuevoEstandar = state.contadores.productosTerminados.NUEVO_ESTANDAR;
  state.contadores.cajasEnsambladasNuevoPlus = state.contadores.productosTerminados.NUEVO_PLUS;

  const numSecuencia = state.contadores.productosTerminados[tipoCaja];
  const codigoCaja = `${receta.prefijo}-${String(numSecuencia).padStart(3, '0')}`;

  const leadTimeTotalSeg = Math.max(cicloSeg, +((now - inicioProcesoTimestamp) / 1000).toFixed(1));
  const destinoFinal = destinoPedido || (pedidoPendienteDeEsteTipo ? pedidoPendienteDeEsteTipo.nombre : 'Almacén Producto Terminado (Stock General)');

  const registroCaja = {
    id: codigoCaja,
    esAmortiguador: usoPiezasAmortiguador,
    pedidoDocenteId: pedidoPendienteDeEsteTipo ? pedidoPendienteDeEsteTipo.id : null,
    tipo: tipoCaja,
    nombreProducto: receta.nombre,
    estado: 'TERMINADO',
    estacionActual: 'ALMACÉN PRODUCTO TERMINADO',
    origen: {
      operariosEnrollado: Array.from(operariosEnrolladoSet),
      operariosPegado: Array.from(operariosPegadoSet),
      operariosCorte: Array.from(operariosCorteSet),
      placasUtilizadas: Array.from(placasUsadasSet),
      operarioEnsambladoId: op.id,
      operarioEnsambladoNombre: op.nombre,
      componentesBOM: trazabilidadComponentes
    },
    destino: {
      rutaProceso: '1. Enrollado (4 op) → 2. Pegado (4 op) → 3. Cortado (1 op) → 4. Ensamblado (4 op - FIN PROCESO)',
      siguienteEstacion: 'Producto Terminado (Entrega Final)',
      destinoFinalCliente: destinoFinal
    },
    tiempos: {
      inicioTuboTimestamp: inicioProcesoTimestamp,
      ensambladoTimestamp: now,
      terminadoTimestamp: now,
      cicloEnsambladoSeg: cicloSeg
    },
    leadTimeTotalSeg
  };

  state.cajas.unshift(registroCaja);

  const evento = {
    id: 'EV-' + now + '-' + Math.random().toString(36).slice(2, 6),
    timestamp: now,
    operarioId: op.id,
    operarioNombre: op.nombre,
    area: 'ENSAMBLADO',
    tipoAccion: 'PRODUCCION',
    subtipo: `PROD_${tipoCaja}`,
    etiqueta: `${receta.icono} ${receta.nombre} Terminado [${codigoCaja}] → ${destinoFinal} (+1 Truput)`,
    cantidad: 1,
    cicloSeg,
    origen: `Amortiguador Ensamblado (${registroCaja.origen.placasUtilizadas.slice(0, 3).join(', ')})`,
    destino: destinoFinal
  };
  agregarEvento(evento);
  evaluarProgresoPedidosDocente();
  saveState();

  return {
    ok: true,
    mensaje: `¡${receta.nombre} [${codigoCaja}] TERMINADO para ${destinoFinal}! (+1 al Throughput)`,
    caja: registroCaja,
    evento
  };
}

function accionMerma({ operarioId, motivo }) {
  const now = Date.now();
  const op = getOperario(operarioId);
  state.contadores.mermasTotales += 1;

  const evento = {
    id: 'EV-' + now + '-' + Math.random().toString(36).slice(2, 6),
    timestamp: now,
    operarioId: op.id,
    operarioNombre: op.nombre,
    area: op.area,
    tipoAccion: 'MERMA',
    subtipo: 'DEFECTO',
    etiqueta: `⚠️ Merma / Defecto en ${op.area}: ${motivo || 'Pieza defectuosa'}`,
    cantidad: 1,
    cicloSeg: null,
    origen: op.areaNombre,
    destino: 'Descarte / Reciclaje'
  };
  agregarEvento(evento);
  saveState();
  return { ok: true, mensaje: 'Merma registrada para control de calidad', evento };
}

// CAMBIO DE ESTACIÓN PARA OPERARIOS POLIVALENTES (OP-08: Pegado <-> Ensamblado | OP-09: Cortado <-> Pegado)
function accionCambiarAreaPolivalente({ operarioId, nuevaArea }) {
  const op = state.operarios.find(o => o.id === operarioId);
  if (!op) {
    return { ok: false, error: 'Operario no encontrado.' };
  }
  if (!op.esPolivalente) {
    return { ok: false, error: `El ${op.nombre} no está asignado como operario polivalente.` };
  }
  if (!op.areasPolivalentes || !op.areasPolivalentes.includes(nuevaArea)) {
    return { ok: false, error: `Área destino (${nuevaArea}) no permitida para la polivalencia de ${op.nombre}.` };
  }

  const now = Date.now();
  const areaAnterior = op.area;
  const areaAnteriorNombre = op.areaNombre || AREA_NOMBRES[areaAnterior] || areaAnterior;
  const nuevaAreaNombre = AREA_NOMBRES[nuevaArea] || nuevaArea;

  if (areaAnterior === nuevaArea) {
    return { ok: true, mensaje: `Ya te encuentras trabajando en ${nuevaAreaNombre}` };
  }

  guardarSnapshotUndo(`Polivalencia ${op.id} → ${nuevaArea}`, op.id);

  const inicioTramoPrevio = op.inicioAreaActualTimestamp || state.session.inicioTimestamp || now;
  const duracionTramoSeg = Math.max(1, +((now - inicioTramoPrevio) / 1000).toFixed(1));

  if (!Array.isArray(op.historialPolivalencia)) {
    op.historialPolivalencia = [];
  }
  op.historialPolivalencia.unshift({
    id: 'POL-' + now,
    desdeArea: areaAnterior,
    desdeAreaNombre: areaAnteriorNombre,
    haciaArea: nuevaArea,
    haciaAreaNombre: nuevaAreaNombre,
    inicioTramoAnteriorTimestamp: inicioTramoPrevio,
    cambioTimestamp: now,
    horaCambioTexto: new Date(now).toLocaleTimeString(),
    duracionEnAreaAnteriorSeg: duracionTramoSeg
  });

  op.area = nuevaArea;
  op.areaNombre = nuevaAreaNombre;
  op.inicioAreaActualTimestamp = now;
  state.ultimoRegistroPorOperario[op.id] = now; // Reinicia referencia de ciclo para la nueva labor

  const evento = {
    id: 'EV-POL-' + now + '-' + Math.random().toString(36).slice(2, 5),
    timestamp: now,
    operarioId: op.id,
    operarioNombre: op.nombre,
    area: nuevaArea,
    tipoAccion: 'POLIVALENCIA',
    subtipo: `${areaAnterior}_A_${nuevaArea}`,
    etiqueta: `🔄 POLIVALENCIA: ${op.nombre} (#${op.numero}) pasó de [${areaAnteriorNombre}] a apoyar en [${nuevaAreaNombre}] (Estuvo ${duracionTramoSeg}s en ${areaAnterior})`,
    cantidad: 1,
    cicloSeg: duracionTramoSeg,
    origen: areaAnteriorNombre,
    destino: `Inicia labor en ${nuevaAreaNombre}`
  };
  agregarEvento(evento);
  saveState();

  return {
    ok: true,
    mensaje: `🔄 ${op.nombre}: ahora estás en ${nuevaAreaNombre} (Tiempo registrado: ${new Date(now).toLocaleTimeString()})`,
    evento
  };
}

function ejecutarPasoSimulacionDemo() {
  if (state.session.estado === 'LISTO_PARA_INICIAR') {
    state.session.estado = 'EN_CURSO';
    state.session.inicioTimestamp = Date.now();
  }
  accionEnrollado({ operarioId: 'OP-01', cantidad: 50 });
  accionEnrollado({ operarioId: 'OP-02', cantidad: 50 });

  accionPegado({ operarioId: 'OP-05', tipoPlaca: 'EST_PLACA_18_FIDEO' });
  accionPegado({ operarioId: 'OP-06', tipoPlaca: 'PLUS_PLACA_18_PAPEL' });
  accionPegado({ operarioId: 'OP-07', tipoPlaca: 'NEST_PLACA_14_135' });
  accionPegado({ operarioId: 'OP-08', tipoPlaca: 'NPLUS_PLACA_13_TAPA' });

  accionCortadoKitCaja({ operarioId: 'OP-09', tipoCaja: 'ESTANDAR' });
  accionCortadoKitCaja({ operarioId: 'OP-09', tipoCaja: 'PLUS' });
  accionCortadoKitCaja({ operarioId: 'OP-09', tipoCaja: 'NUEVO_ESTANDAR' });
  accionCortadoKitCaja({ operarioId: 'OP-09', tipoCaja: 'NUEVO_PLUS' });

  accionEnsamblado({ operarioId: 'OP-10', tipoCaja: 'ESTANDAR' });
  accionEnsamblado({ operarioId: 'OP-11', tipoCaja: 'PLUS' });
  accionEnsamblado({ operarioId: 'OP-12', tipoCaja: 'NUEVO_ESTANDAR' });
  accionEnsamblado({ operarioId: 'OP-13', tipoCaja: 'NUEVO_PLUS' });

  return { ok: true, mensaje: 'Paso de simulación ejecutado con los 4 productos y las 4 estaciones' };
}

// ============================================================================
// SERVIDOR HTTP + SSE + TÚNEL MULTI-RED (13 CELULARES EN DIFERENTES REDES / 4G / 5G)
// ============================================================================

const sseClients = new Set();

let publicTunnelInfo = {
  url: process.env.PUBLIC_URL || null,
  status: process.env.PUBLIC_URL ? 'ACTIVO' : 'INICIANDO',
  provider: process.env.PUBLIC_URL ? 'Cloud Hosting' : 'Cloudflare Quick Tunnel',
  startedAt: null,
  error: null
};
let activeTunnelProcess = null;

function iniciarTunelPublicoMultiRed() {
  // Si ya corre en la nube (Render / Railway / Koyeb / Fly.io), no necesita túnel porque ya tiene URL pública 24/7
  const cloudUrl = process.env.RENDER_EXTERNAL_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
    || process.env.PUBLIC_URL;
  if (cloudUrl || process.env.RENDER || process.env.RAILWAY_ENVIRONMENT) {
    publicTunnelInfo = {
      url: cloudUrl || null,
      status: 'ACTIVO',
      provider: 'Servidor Cloud 24/7 (Sin PC)',
      startedAt: Date.now(),
      error: null
    };
    return;
  }

  if (activeTunnelProcess) {
    try { activeTunnelProcess.kill(); } catch (e) {}
    activeTunnelProcess = null;
  }

  const cloudflaredPath = path.join(__dirname, 'bin', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  if (fs.existsSync(cloudflaredPath)) {
    publicTunnelInfo = {
      url: null,
      status: 'CONECTANDO',
      provider: 'Cloudflare Multi-Red (4G/5G/WiFi)',
      startedAt: Date.now(),
      error: null
    };
    broadcastState();

    const proc = spawn(cloudflaredPath, ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    activeTunnelProcess = proc;

    const handleOutput = (data) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match && match[0] && publicTunnelInfo.url !== match[0]) {
        publicTunnelInfo = {
          url: match[0],
          status: 'ACTIVO',
          provider: 'Cloudflare Multi-Red (4G/5G/WiFi)',
          startedAt: Date.now(),
          error: null
        };
        console.log('======================================================================');
        console.log(`🌐 LINK MULTI-RED ACTIVO (Cualquier 4G/5G o WiFi): ${publicTunnelInfo.url}`);
        console.log('   Comparte este link por WhatsApp con los 13 operarios y el docente.');
        console.log('======================================================================');
        broadcastState();
      }
    };

    proc.stdout.on('data', handleOutput);
    proc.stderr.on('data', handleOutput);
    proc.on('exit', () => {
      if (activeTunnelProcess === proc) {
        activeTunnelProcess = null;
        if (!publicTunnelInfo.url) {
          iniciarTunelFallbackSsh();
        }
      }
    });
  } else {
    iniciarTunelFallbackSsh();
  }
}

function iniciarTunelFallbackSsh() {
  publicTunnelInfo = {
    url: null,
    status: 'CONECTANDO',
    provider: 'Localhost.run SSH Multi-Red',
    startedAt: Date.now(),
    error: null
  };
  broadcastState();

  const proc = spawn('ssh', ['-o', 'StrictHostKeyChecking=no', '-R', `80:localhost:${PORT}`, 'nokey@localhost.run'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  activeTunnelProcess = proc;

  const handleSshOut = (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-z0-9-]+\.lhr\.life/i);
    if (match && match[0] && publicTunnelInfo.url !== match[0]) {
      publicTunnelInfo = {
        url: match[0],
        status: 'ACTIVO',
        provider: 'Localhost.run Multi-Red (4G/5G/WiFi)',
        startedAt: Date.now(),
        error: null
      };
      console.log(`🌐 LINK MULTI-RED ACTIVO (SSH): ${publicTunnelInfo.url}`);
      broadcastState();
    }
  };
  proc.stdout.on('data', handleSshOut);
  proc.stderr.on('data', handleSshOut);
}

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips.length > 0 ? ips : ['localhost'];
}

function getFullPayload() {
  return {
    state,
    metrics: computeEngineeringMetrics(),
    specs: {
      PLACA_SPECS,
      BOM_CAJAS,
      PRODUCT_KEYS,
      DEFAULT_AMORTIGUADORES
    },
    serverInfo: {
      ips: getLocalIPs(),
      port: PORT,
      connectedDevices: sseClients.size,
      publicTunnel: publicTunnelInfo,
      baseDatos: {
        habilitado: supabaseStore.habilitado,
        inicializado: supabaseInicializado,
        sesionClave: supabaseStore.obtenerClaveSesion(state),
        ultimoGuardadoOk: supabaseStore.estadoConexion.ultimoGuardadoOk,
        ultimoError: supabaseStore.estadoConexion.ultimoError,
        guardadosExitosos: supabaseStore.estadoConexion.guardadosExitosos
      }
    }
  };
}

function broadcastState() {
  const payload = `data: ${JSON.stringify(getFullPayload())}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch (e) {
      sseClients.delete(res);
    }
  }
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  if (pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    sseClients.add(res);
    res.write(`data: ${JSON.stringify(getFullPayload())}\n\n`);
    broadcastState();

    req.on('close', () => {
      sseClients.delete(res);
      broadcastState();
    });
    return;
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    return sendJson(res, 200, getFullPayload());
  }

  if (pathname === '/api/historial-sesiones' && req.method === 'GET') {
    if (!supabaseStore.habilitado) {
      return sendJson(res, 200, { ok: true, habilitado: false, sesiones: [] });
    }
    try {
      const sesiones = await supabaseStore.listarSesiones();
      return sendJson(res, 200, { ok: true, habilitado: true, sesionActual: supabaseStore.obtenerClaveSesion(state), sesiones: sesiones || [] });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  if (pathname === '/api/action' && req.method === 'POST') {
    const body = await parseBody(req);
    let result = { ok: false, error: 'Acción desconocida' };

    switch (body.type) {
      case 'INICIAR_PRODUCCION': {
        const now = Date.now();
        state.session.estado = 'EN_CURSO';
        state.session.inicioTimestamp = now;
        state.session.pausaAcumuladaMs = 0;
        state.session.ultimaPausaTimestamp = null;
        state.ultimoRegistroPorOperario = {};
        state.operarios.forEach(op => {
          op.inicioAreaActualTimestamp = now;
        });
        agregarEvento({
          id: 'EV-START-' + now,
          timestamp: now,
          operarioId: 'DOCENTE / CONTROL',
          operarioNombre: '🚀 Inicio Oficial de Producción',
          area: 'LAS 4 ÁREAS',
          tipoAccion: 'INICIO_PRODUCCION',
          subtipo: 'START',
          etiqueta: '▶️ ¡PRODUCCIÓN INICIADA! Cronómetro y estudio de tiempos en marcha para los 13 operarios.',
          cantidad: 1,
          cicloSeg: null,
          origen: 'Botón Comenzar Producción',
          destino: 'Las 4 Estaciones (Enrollado, Pegado, Cortado, Ensamblado)'
        });
        saveState();
        result = { ok: true, mensaje: '🚀 ¡Producción iniciada! Cronómetro en marcha para las 4 estaciones.' };
        break;
      }
      case 'CAMBIAR_AREA_POLIVALENTE': {
        result = accionCambiarAreaPolivalente(body);
        break;
      }
      case 'CREAR_PEDIDO_DOCENTE':
        if (state.session.estado === 'LISTO_PARA_INICIAR') {
          state.session.estado = 'EN_CURSO';
          state.session.inicioTimestamp = Date.now();
        }
        result = accionCrearPedidoDocente(body);
        break;
      case 'LIMPIAR_PEDIDOS_DOCENTE':
        state.pedidosDocente = [];
        state.ultimaAlertaPedido = null;
        state.session.loteDestinoActual = 'Almacén Producto Terminado (Stock General)';
        saveState();
        result = { ok: true, mensaje: 'Pedidos del docente finalizados / archivados' };
        break;
      case 'DESHACER':
        result = accionDeshacerUltimo();
        break;
      case 'ENROLLADO':
      case 'PEGADO':
      case 'CORTADO':
      case 'CORTADO_KIT_CAJA':
      case 'ENSAMBLADO': {
        if (state.session.estado === 'LISTO_PARA_INICIAR') {
          result = {
            ok: false,
            error: '⏳ Primero debes tocar el botón verde "▶️ COMENZAR PRODUCCIÓN" para arrancar el cronómetro del laboratorio.'
          };
          break;
        }
        if (body.type === 'ENROLLADO') {
          guardarSnapshotUndo(`Enrollado +${body.cantidad || 50} tubos`, body.operarioId);
          result = accionEnrollado(body);
        } else if (body.type === 'PEGADO') {
          guardarSnapshotUndo(`Pegado ${body.tipoPlaca}`, body.operarioId);
          result = accionPegado(body);
        } else if (body.type === 'CORTADO') {
          guardarSnapshotUndo(`Cortado ${body.tipoPlaca || body.placaId}`, body.operarioId);
          result = accionCortado(body);
        } else if (body.type === 'CORTADO_KIT_CAJA') {
          guardarSnapshotUndo(`Corte Kit ${body.tipoCaja}`, body.operarioId);
          result = accionCortadoKitCaja(body);
        } else if (body.type === 'ENSAMBLADO') {
          result = accionEnsamblado(body);
        }
        break;
      }
      case 'MERMA':
        guardarSnapshotUndo(`Merma`, body.operarioId);
        result = accionMerma(body);
        break;
      case 'SIMULAR_LOTE':
        result = ejecutarPasoSimulacionDemo();
        break;
      case 'CONFIG_ALERTAS_SONORAS': {
        if (!state.session.alertasSonorasConfig) {
          state.session.alertasSonorasConfig = { habilitado: true, minutosAlertas: [15, 30, 45] };
        }
        if (typeof body.habilitado === 'boolean') {
          state.session.alertasSonorasConfig.habilitado = body.habilitado;
        }
        if (typeof body.minutosTexto === 'string') {
          const parsedMins = body.minutosTexto
            .split(/[,;\s]+/)
            .map(v => Number(v.trim()))
            .filter(n => !isNaN(n) && n > 0 && n <= 600)
            .sort((a, b) => a - b);
          if (parsedMins.length > 0) {
            state.session.alertasSonorasConfig.minutosAlertas = Array.from(new Set(parsedMins));
          }
        } else if (Array.isArray(body.minutosAlertas)) {
          const parsedMins = body.minutosAlertas
            .map(v => Number(v))
            .filter(n => !isNaN(n) && n > 0 && n <= 600)
            .sort((a, b) => a - b);
          if (parsedMins.length > 0) {
            state.session.alertasSonorasConfig.minutosAlertas = Array.from(new Set(parsedMins));
          }
        }
        saveState();
        result = {
          ok: true,
          mensaje: `🔔 Alertas sonoras configuradas para los minutos: ${state.session.alertasSonorasConfig.minutosAlertas.join(', ')}`
        };
        break;
      }
      case 'CONFIG_TAKT': {
        if (!state.session.taktConfig) {
          state.session.taktConfig = { demandaMetaUnidades: 6, tiempoDisponibleMin: 15 };
        }
        if (body.demandaMetaUnidades !== undefined) {
          state.session.taktConfig.demandaMetaUnidades = Math.max(1, Number(body.demandaMetaUnidades) || 6);
        }
        if (body.tiempoDisponibleMin !== undefined) {
          state.session.taktConfig.tiempoDisponibleMin = Math.max(1, Number(body.tiempoDisponibleMin) || 15);
        }
        saveState();
        result = { ok: true, mensaje: 'Parámetros de Takt Time actualizados' };
        break;
      }
      case 'ACTUALIZAR_OPERARIO': {
        const op = state.operarios.find(o => o.id === body.operarioId);
        if (op && body.nombre) {
          op.nombre = String(body.nombre).trim().slice(0, 40);
          saveState();
          result = { ok: true, mensaje: `Nombre actualizado a ${op.nombre}` };
        }
        break;
      }
      case 'CONFIG_AMORTIGUADORES': {
        const nuevosBuffers = {
          usarAmortiguadoresAlIniciar: body.usarAmortiguadoresAlIniciar !== undefined ? !!body.usarAmortiguadoresAlIniciar : true,
          enrolladoHojasCarta: Math.max(0, Number(body.enrolladoHojasCarta ?? state.amortiguadoresConfig.enrolladoHojasCarta)),
          pegadoTubos: Math.max(0, Number(body.pegadoTubos ?? state.amortiguadoresConfig.pegadoTubos)),
          cortadoCajasEstandar: Math.max(0, Number(body.cortadoCajasEstandar ?? state.amortiguadoresConfig.cortadoCajasEstandar)),
          cortadoCajasPlus: Math.max(0, Number(body.cortadoCajasPlus ?? state.amortiguadoresConfig.cortadoCajasPlus)),
          cortadoNuevoEstandar: Math.max(0, Number(body.cortadoNuevoEstandar ?? state.amortiguadoresConfig.cortadoNuevoEstandar ?? 3)),
          cortadoNuevoPlus: Math.max(0, Number(body.cortadoNuevoPlus ?? state.amortiguadoresConfig.cortadoNuevoPlus ?? 3)),
          ensambladoCajasEstandar: Math.max(0, Number(body.ensambladoCajasEstandar ?? state.amortiguadoresConfig.ensambladoCajasEstandar)),
          ensambladoCajasPlus: Math.max(0, Number(body.ensambladoCajasPlus ?? state.amortiguadoresConfig.ensambladoCajasPlus)),
          ensambladoNuevoEstandar: Math.max(0, Number(body.ensambladoNuevoEstandar ?? state.amortiguadoresConfig.ensambladoNuevoEstandar ?? 3)),
          ensambladoNuevoPlus: Math.max(0, Number(body.ensambladoNuevoPlus ?? state.amortiguadoresConfig.ensambladoNuevoPlus ?? 3))
        };
        if (body.reiniciarConAmortiguadores) {
          const currentOps = state.operarios;
          state = createInitialState(currentOps, nuevosBuffers);
          result = { ok: true, mensaje: '🛡️ Simulación reiniciada con los Amortiguadores configurados en las 4 estaciones' };
        } else {
          state.amortiguadoresConfig = nuevosBuffers;
          result = { ok: true, mensaje: 'Configuración de metas de amortiguadores actualizada' };
        }
        saveState();
        break;
      }
      case 'CONFIG_SESION': {
        if (typeof body.loteDestinoActual === 'string') {
          state.session.loteDestinoActual = body.loteDestinoActual.trim();
        }
        if (typeof body.modoInventarioFlexible === 'boolean') {
          state.session.modoInventarioFlexible = body.modoInventarioFlexible;
        }
        if (body.accionReloj === 'PAUSAR' && state.session.estado === 'EN_CURSO') {
          state.session.estado = 'PAUSADO';
          state.session.ultimaPausaTimestamp = Date.now();
        } else if (body.accionReloj === 'REANUDAR' && state.session.estado === 'PAUSADO') {
          state.session.estado = 'EN_CURSO';
          if (state.session.ultimaPausaTimestamp) {
            state.session.pausaAcumuladaMs += (Date.now() - state.session.ultimaPausaTimestamp);
            state.session.ultimaPausaTimestamp = null;
          }
        } else if (body.accionReloj === 'REINICIAR_RELOJ') {
          state.session.inicioTimestamp = null;
          state.session.pausaAcumuladaMs = 0;
          state.session.ultimaPausaTimestamp = null;
          state.session.estado = 'LISTO_PARA_INICIAR';
        } else if (body.accionReloj === 'INICIAR') {
          state.session.inicioTimestamp = Date.now();
          state.session.pausaAcumuladaMs = 0;
          state.session.ultimaPausaTimestamp = null;
          state.session.estado = 'EN_CURSO';
        }
        saveState();
        result = { ok: true, mensaje: 'Configuración de sesión actualizada' };
        break;
      }
      case 'REINICIAR_TUNEL': {
        iniciarTunelPublicoMultiRed();
        result = { ok: true, mensaje: '🌐 Generando nuevo link público Multi-Red (4G/5G/WiFi)...' };
        break;
      }
      case 'RESET_SIMULACION': {
        const currentOps = state.operarios;
        const usarBuffers = body.conAmortiguadores !== undefined ? !!body.conAmortiguadores : true;
        const customBuf = {
          ...(state.amortiguadoresConfig || DEFAULT_AMORTIGUADORES),
          usarAmortiguadoresAlIniciar: usarBuffers
        };
        state = createInitialState(currentOps, customBuf);
        saveState();
        result = {
          ok: true,
          mensaje: usarBuffers
            ? '🛡️ Producción reiniciada CON Amortiguadores Iniciales en las 4 Estaciones'
            : '🗑️ Producción reiniciada EN CERO (Sin amortiguadores iniciales)'
        };
        break;
      }
    }

    broadcastState();
    return sendJson(res, result.ok ? 200 : 400, { ...result, payload: getFullPayload() });
  }

  if ((pathname === '/api/export-csv' || pathname === '/api/export-excel') && req.method === 'GET') {
    // Permite descargar el Excel de una sesión ANTERIOR guardada en Supabase: /api/export-excel?sesion=SIM-...
    let stateExport = state;
    let metricsExport = null;
    const sesionPedida = urlObj.searchParams.get('sesion');
    if (sesionPedida && sesionPedida !== supabaseStore.obtenerClaveSesion(state)) {
      try {
        const st = await supabaseStore.obtenerSesion(sesionPedida);
        if (!st) {
          return sendJson(res, 404, { ok: false, error: 'Sesión no encontrada en la base de datos' });
        }
        const eventosCompletos = await supabaseStore.obtenerEventosSesion(sesionPedida);
        if (eventosCompletos.length > 0) st.eventos = eventosCompletos;
        const stateOriginal = state;
        state = st;
        try {
          metricsExport = computeEngineeringMetrics();
        } finally {
          state = stateOriginal;
        }
        stateExport = st;
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: 'Error leyendo la sesión: ' + err.message });
      }
    }
    const xlsxBuf = generarLibroXlsxBuffer({
      state: stateExport,
      metrics: metricsExport || computeEngineeringMetrics(),
      PLACA_SPECS,
      BOM_CAJAS,
      DEFAULT_AMORTIGUADORES
    });
    const fechaStr = sesionPedida || new Date().toISOString().slice(0, 10);
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Length': xlsxBuf.length,
      'Content-Disposition': `attachment; filename="Reporte_Ingenieria_Metodos_${fechaStr}.xlsx"`
    });
    return res.end(xlsxBuf);
  }

  let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

setInterval(() => {
  if (sseClients.size > 0 && state.session.estado === 'EN_CURSO') {
    broadcastState();
  }
}, 3000);

// Guardar en Supabase antes de que Render apague el servidor (redeploy / reinicio)
async function apagadoSeguro(senal) {
  console.log(`🛑 Señal ${senal} recibida: guardando estado final en la base de datos...`);
  try {
    saveState();
    if (supabaseInicializado) {
      await supabaseStore.guardarInmediato(state);
    }
  } catch (e) {}
  process.exit(0);
}
process.on('SIGTERM', () => apagadoSeguro('SIGTERM'));
process.on('SIGINT', () => apagadoSeguro('SIGINT'));

inicializarPersistenciaSupabase().finally(() => {
server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  console.log('======================================================================');
  console.log('🚀 SISTEMA DE TRAZABILIDAD (4 ESTACIONES / 4 PRODUCTOS / MULTI-RED)');
  console.log('======================================================================');
  console.log(`💻 Panel Local:           http://localhost:${PORT}`);
  ips.forEach(ip => {
    console.log(`📱 Celulares en Red WiFi: http://${ip}:${PORT}`);
  });
  console.log('🌐 Iniciando Túnel Público Multi-Red (Datos Móviles 4G/5G / Distintas Redes)...');
  console.log('======================================================================');
  iniciarTunelPublicoMultiRed();
});
});
