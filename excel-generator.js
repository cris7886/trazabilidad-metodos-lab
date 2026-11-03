const zlib = require('zlib');

// ============================================================================
// GENERADOR NATIVO DE ARCHIVOS EXCEL (.XLSX OPENXML) SIN ADVERTENCIAS
// Actualizado para 4 Estaciones (4-4-1-4), 4 Productos y Balanceo de Línea (Takt Time)
// ============================================================================

function escXml(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createZipBuffer(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const uncompressedBuf = Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(file.content, 'utf8');
    const compressedBuf = zlib.deflateRawSync(uncompressedBuf);
    const crc = crc32(uncompressedBuf);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0x5421, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedBuf.length, 18);
    localHeader.writeUInt32LE(uncompressedBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressedBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x5421, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedBuf.length, 20);
    centralHeader.writeUInt32LE(uncompressedBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += 30 + nameBuf.length + compressedBuf.length;
  }

  const centralDirSize = centralParts.reduce((a, b) => a + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

const STYLE_MAP = {
  Default: 0,
  TitleBanner: 1,
  SubtitleBanner: 2,
  SectionHeader: 3,
  TableHeader: 4,
  CellNormal: 5,
  CellZebra: 6,
  CellBold: 7,
  CellCenter: 8,
  CellTotal: 9,
  CellTotalCenter: 10,
  BadgeGreen: 11,
  BadgeAmber: 12,
  BadgeRed: 13,
  BadgeBlue: 14,
  BadgePink: 15
};

function colLetter(colIdx0) {
  let n = colIdx0;
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

class SheetBuilder {
  constructor(colWidthsPx) {
    this.colWidths = colWidthsPx.map(px => +(px / 7).toFixed(2));
    this.rows = [];
    this.merges = [];
    this.currentRow = 0;
  }

  addEmptyRow(height = 14) {
    this.currentRow++;
    this.rows.push(`<row r="${this.currentRow}" ht="${height}" customHeight="1"/>`);
  }

  addRow(cells, height = 22) {
    this.currentRow++;
    const r = this.currentRow;
    let colIdx = 0;
    let rowXml = `<row r="${r}" ht="${height}" customHeight="1">`;

    for (const cell of cells) {
      if (!cell) continue;
      const styleIdx = STYLE_MAP[cell.style] ?? 5;
      const span = cell.mergeAcross || 0;
      const startCol = colLetter(colIdx);
      const cellRef = `${startCol}${r}`;

      const isNum = cell.type === 'Number' && cell.value !== '' && cell.value !== null && !isNaN(Number(cell.value));
      if (isNum) {
        rowXml += `<c r="${cellRef}" s="${styleIdx}" t="n"><v>${Number(cell.value)}</v></c>`;
      } else {
        rowXml += `<c r="${cellRef}" s="${styleIdx}" t="inlineStr"><is><t>${escXml(cell.value)}</t></is></c>`;
      }

      if (span > 0) {
        const endCol = colLetter(colIdx + span);
        this.merges.push(`<mergeCell ref="${startCol}${r}:${endCol}${r}"/>`);
        for (let k = 1; k <= span; k++) {
          const mRef = `${colLetter(colIdx + k)}${r}`;
          rowXml += `<c r="${mRef}" s="${styleIdx}"/>`;
        }
        colIdx += span + 1;
      } else {
        colIdx += 1;
      }
    }

    rowXml += `</row>`;
    this.rows.push(rowXml);
  }

  toXml() {
    const colsXml = `<cols>${this.colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;
    const mergesXml = this.merges.length > 0
      ? `<mergeCells count="${this.merges.length}">${this.merges.join('')}</mergeCells>`
      : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${colsXml}
  <sheetData>${this.rows.join('')}</sheetData>
  ${mergesXml}
</worksheet>`;
  }
}

function c(value, style = 'CellNormal', type = 'String', mergeAcross = 0) {
  return { value, style, type, mergeAcross };
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="11">
    <font><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
    <font><b/><sz val="13"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFE2E8F0"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF065F46"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF92400E"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF9F1239"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF1E40AF"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF9D174D"/><name val="Calibri"/></font>
  </fonts>

  <fills count="13">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF334155"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD1FAE5"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFE4E6"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFCE7F3"/><bgColor indexed="64"/></patternFill></fill>
  </fills>

  <borders count="4">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FF475569"/></left>
      <right style="thin"><color rgb="FF475569"/></right>
      <top style="thin"><color rgb="FF475569"/></top>
      <bottom style="medium"><color rgb="FF0F172A"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FF065F46"/></left>
      <right style="thin"><color rgb="FF065F46"/></right>
      <top style="medium"><color rgb="FF065F46"/></top>
      <bottom style="double"><color rgb="FF065F46"/></bottom>
      <diagonal/>
    </border>
  </borders>

  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>

  <cellXfs count="16">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="4" fillId="5" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="6" fillId="7" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="6" fillId="7" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="6" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="7" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="8" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="9" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="10" fillId="12" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
  </cellXfs>
</styleSheet>`;
}

function generarLibroXlsxBuffer({ state, metrics, PLACA_SPECS, DEFAULT_AMORTIGUADORES }) {
  const m = metrics;
  const cfg = state.amortiguadoresConfig || DEFAULT_AMORTIGUADORES;
  const th = m.throughput;
  const buf = m.estadoAmortiguadores;
  const e = m.estaciones;
  const bal = m.balanceoLinea;
  const fechaReporte = new Date().toLocaleString('es-BO');
  const minEfectivos = Math.max(0.01, m.tiempoEfectivoMin);

  const tubosConsumidosPegado = Object.entries(state.contadores.placasPegadas).reduce((acc, [k, cant]) => {
    const sp = PLACA_SPECS[k];
    return acc + (cant * (sp ? sp.tubosRequeridos : 0));
  }, 0);

  // ==========================================================================
  // HOJA 1: 1_Cuadro_Resumen_General (4 Productos y 4 Estaciones)
  // ==========================================================================
  const s1 = new SheetBuilder([245, 145, 145, 155, 155, 195, 155]);
  s1.addRow([c('REPORTE GENERAL DE TRAZABILIDAD Y THROUGHPUT FÍSICO — 4 ESTACIONES Y 4 PRODUCTOS', 'TitleBanner', 'String', 6)], 32);
  s1.addRow([c(`Sesión: ${state.session.nombre}   |   Fecha: ${fechaReporte}   |   Tiempo Efectivo: ${m.tiempoEfectivoMin} min (${m.tiempoEfectivoSeg} seg)`, 'SubtitleBanner', 'String', 6)], 20);
  s1.addEmptyRow(10);

  s1.addRow([c('1. INDICADORES EJECUTIVOS DE THROUGHPUT POR PRODUCTO (UNIDADES FÍSICAS)', 'SectionHeader', 'String', 6)], 24);
  s1.addRow([
    c('Indicador de Desempeño', 'TableHeader'),
    c('1. Cajita Estándar', 'TableHeader'),
    c('2. Cajita Plus', 'TableHeader'),
    c('3. Nuevo Prod. Estándar', 'TableHeader'),
    c('4. Nuevo Prod. Plus', 'TableHeader'),
    c('TOTAL SISTEMA (4 PRODUCTOS)', 'TableHeader'),
    c('Lead Time / Takt Time', 'TableHeader')
  ], 26);

  s1.addRow([
    c('Unidades Terminadas (Ensamblado)', 'CellBold'),
    c(th.unidadesTerminadasEstandar, 'BadgeGreen', 'Number'),
    c(th.unidadesTerminadasPlus, 'BadgePink', 'Number'),
    c(th.unidadesTerminadasNuevoEstandar || 0, 'BadgeBlue', 'Number'),
    c(th.unidadesTerminadasNuevoPlus || 0, 'BadgeAmber', 'Number'),
    c(th.unidadesTerminadasTotal, 'CellTotalCenter', 'Number'),
    c(`Takt Time: ${bal?.taktTimeSeg || 150} s/u`, 'BadgeBlue')
  ], 22);

  s1.addRow([
    c('Throughput por Minuto (unid / min)', 'CellBold'),
    c(th.estandarPorMinuto, 'CellCenter', 'Number'),
    c(th.plusPorMinuto, 'CellCenter', 'Number'),
    c(th.nuevoEstandarPorMinuto || 0, 'CellCenter', 'Number'),
    c(th.nuevoPlusPorMinuto || 0, 'CellCenter', 'Number'),
    c(th.totalPorMinuto, 'CellTotalCenter', 'Number'),
    c(`Lead Time Prom: ${th.leadTimePromedioSeg || 'N/A'} s`, 'CellCenter')
  ], 22);

  s1.addRow([
    c('Throughput por Hora (unid / hora)', 'CellBold'),
    c(th.estandarPorHora, 'BadgeGreen', 'Number'),
    c(th.plusPorHora, 'BadgePink', 'Number'),
    c(th.nuevoEstandarPorHora || 0, 'BadgeBlue', 'Number'),
    c(th.nuevoPlusPorHora || 0, 'BadgeAmber', 'Number'),
    c(th.totalPorHora, 'CellTotalCenter', 'Number'),
    c(`Eficiencia Línea: ${bal?.eficienciaBalanceoPct || 0}%`, 'CellCenter')
  ], 24);

  s1.addEmptyRow(12);

  s1.addRow([c('2. CUADRO RESUMEN CONSOLIDADO DE TODO LO PRODUCIDO (4 ESTACIONES: ENROLLADO 4, PEGADO 4, CORTADO 1, ENSAMBLADO 4)', 'SectionHeader', 'String', 6)], 24);
  s1.addRow([
    c('Área / Producto / Sub-ensamble', 'TableHeader'),
    c('Amortiguador Inicial', 'TableHeader'),
    c('Producido Nuevo en Corrida', 'TableHeader'),
    c('Consumido / Cortado', 'TableHeader'),
    c('Stock Actual en Cola (WIP)', 'TableHeader'),
    c('Piezas / Unidades Resultantes', 'TableHeader'),
    c('Tasa Fís. (Unid / min)', 'TableHeader')
  ], 26);

  s1.addRow([
    c('1. Área Enrollado (4 Operarios: Op 1-4)', 'CellBold'),
    c(`${cfg.pegadoTubos} tubos (en Pegado)`, 'CellCenter'),
    c(e.enrollado.tubosProducidos, 'BadgeBlue', 'Number'),
    c(`${tubosConsumidosPegado} tubos usados en Pegado`, 'CellCenter'),
    c(`${state.wip.tubosDisponibles} tubos en Pegado`, 'CellCenter'),
    c(`${e.enrollado.tubosProducidos} tubos nuevos enrollados`, 'CellNormal'),
    c(e.enrollado.tasaTubosPorMin, 'CellCenter', 'Number')
  ], 22);

  let idxPlaca = 0;
  for (const sp of Object.values(PLACA_SPECS)) {
    const stRow = idxPlaca % 2 === 0 ? 'CellNormal' : 'CellZebra';
    const pegadas = state.contadores.placasPegadas[sp.id] || 0;
    const cortadas = state.contadores.placasCortadas[sp.id] || 0;
    const enColaCorte = buf.cortado.conteoPlacasCola[sp.id] || 0;
    const pzasGeneradas = state.contadores.piezasCortadasTotales[sp.piezaResultante] || 0;
    const pzasEnWipEnsamble = state.wip.piezasCortadas[sp.piezaResultante] || 0;
    const tasaPlaca = +((pegadas / minEfectivos).toFixed(2));

    s1.addRow([
      c(`2-3. ${sp.nombre} (${sp.tubosRequeridos} tubos)`, stRow),
      c('Parte de 26 cajas en Corte', 'CellCenter'),
      c(pegadas, 'CellCenter', 'Number'),
      c(cortadas, 'CellCenter', 'Number'),
      c(`${enColaCorte} placas Corte | ${pzasEnWipEnsamble} pzas Ensamble`, 'CellCenter'),
      c(`${pzasGeneradas} ${sp.nombrePiezaResultante} (x${sp.rendimientoCorte}/corte)`, stRow),
      c(tasaPlaca, 'CellCenter', 'Number')
    ], 21);
    idxPlaca++;
  }

  s1.addRow([
    c('4A. CAJITA ESTÁNDAR (Ensamblado Op 10-13)', 'CellBold'),
    c(`${cfg.ensambladoCajasEstandar} cajas Estándar (en piezas)`, 'CellCenter'),
    c(th.unidadesTerminadasEstandar, 'BadgeGreen', 'Number'),
    c('Fin en Área 4: Ensamblado', 'CellCenter'),
    c(`${buf.ensamblado.cajasEst} armables en buffer`, 'CellCenter'),
    c(`${th.unidadesTerminadasEstandar} Cajitas Estándar Terminadas`, 'BadgeGreen'),
    c(th.estandarPorMinuto, 'CellTotalCenter', 'Number')
  ], 22);

  s1.addRow([
    c('4B. CAJITA PLUS (Ensamblado Op 10-13)', 'CellBold'),
    c(`${cfg.ensambladoCajasPlus} cajas Plus (en piezas)`, 'CellCenter'),
    c(th.unidadesTerminadasPlus, 'BadgePink', 'Number'),
    c('Fin en Área 4: Ensamblado', 'CellCenter'),
    c(`${buf.ensamblado.cajasPlus} armables en buffer`, 'CellCenter'),
    c(`${th.unidadesTerminadasPlus} Cajitas Plus Terminadas`, 'BadgePink'),
    c(th.plusPorMinuto, 'CellTotalCenter', 'Number')
  ], 22);

  s1.addRow([
    c('4C. NUEVO PRODUCTO ESTÁNDAR (Ensamblado Op 10-13)', 'CellBold'),
    c(`${cfg.ensambladoNuevoEstandar || 0} unid. (en piezas)`, 'CellCenter'),
    c(th.unidadesTerminadasNuevoEstandar || 0, 'BadgeBlue', 'Number'),
    c('Fin en Área 4: Ensamblado', 'CellCenter'),
    c(`${buf.ensamblado.armablesPorProducto?.NUEVO_ESTANDAR || 0} armables`, 'CellCenter'),
    c(`${th.unidadesTerminadasNuevoEstandar || 0} Nuevos Prod. Estándar Terminados`, 'BadgeBlue'),
    c(th.nuevoEstandarPorMinuto || 0, 'CellTotalCenter', 'Number')
  ], 22);

  s1.addRow([
    c('4D. NUEVO PRODUCTO PLUS (Ensamblado Op 10-13)', 'CellBold'),
    c(`${cfg.ensambladoNuevoPlus || 0} unid. (en piezas)`, 'CellCenter'),
    c(th.unidadesTerminadasNuevoPlus || 0, 'BadgeAmber', 'Number'),
    c('Fin en Área 4: Ensamblado', 'CellCenter'),
    c(`${buf.ensamblado.armablesPorProducto?.NUEVO_PLUS || 0} armables`, 'CellCenter'),
    c(`${th.unidadesTerminadasNuevoPlus || 0} Nuevos Prod. Plus Terminados`, 'BadgeAmber'),
    c(th.nuevoPlusPorMinuto || 0, 'CellTotalCenter', 'Number')
  ], 22);

  s1.addRow([
    c('TOTAL GENERAL DEL SISTEMA (LOS 4 PRODUCTOS)', 'CellTotal'),
    c('600 tub | 26 Corte | 6 Ensamble', 'CellTotalCenter'),
    c(th.unidadesTerminadasTotal, 'CellTotalCenter', 'Number'),
    c(`${e.cortado.placasCortadas} cortes realizados`, 'CellTotalCenter'),
    c(`Mermas: ${state.contadores.mermasTotales}`, 'CellTotalCenter'),
    c(`${th.unidadesTerminadasTotal} PRODUCTOS TERMINADOS (${th.totalPorHora} u/h)`, 'CellTotalCenter'),
    c(th.totalPorMinuto, 'CellTotalCenter', 'Number')
  ], 26);

  // ==========================================================================
  // HOJA 2: 2_Balanceo_y_Amortiguadores
  // ==========================================================================
  const s2 = new SheetBuilder([215, 140, 160, 160, 165, 200, 245]);
  s2.addRow([c('BALANCEO DE LÍNEA (TAKT TIME), AMORTIGUADORES (4 ESTACIONES) Y PEDIDOS DEL DOCENTE', 'TitleBanner', 'String', 6)], 30);
  s2.addEmptyRow(10);

  s2.addRow([c(`1. BALANCEO DE LÍNEA EN VIVO VS. TAKT TIME (Meta: ${bal.demandaMetaUnidades} unid en ${bal.tiempoDisponibleMin} min -> Takt Time = ${bal.taktTimeSeg} s/unid)`, 'SectionHeader', 'String', 6)], 24);
  s2.addRow([
    c('Estación de Trabajo', 'TableHeader'),
    c('N° Operarios', 'TableHeader'),
    c('Ciclo Individual Prom.', 'TableHeader'),
    c('Ciclo Estación por Caja (s)', 'TableHeader'),
    c('Takt Time Meta (s)', 'TableHeader'),
    c('% de Carga vs Takt Time', 'TableHeader'),
    c('Diagnóstico de Balanceo', 'TableHeader')
  ], 25);

  for (const estBal of (bal.estaciones || [])) {
    const stB = estBal.superaTakt ? 'BadgeRed' : 'BadgeGreen';
    s2.addRow([
      c(estBal.nombre, 'CellBold'),
      c(`${estBal.operarios} Operario(s)`, 'CellCenter'),
      c(estBal.cicloIndividualPromSeg !== null ? `${estBal.cicloIndividualPromSeg} ${estBal.unidadIndividual}` : 'Sin datos', 'CellCenter'),
      c(estBal.cicloEstacionPorCajaSeg, 'CellCenter', 'Number'),
      c(bal.taktTimeSeg, 'CellCenter', 'Number'),
      c(`${estBal.porcentajeRespectoTakt}%`, stB),
      c(estBal.superaTakt ? '🔴 CUELLO DE BOTELLA (Supera Takt Time)' : '🟢 DENTRO DEL TAKT TIME', stB)
    ], 22);
  }

  s2.addEmptyRow(12);
  s2.addRow([c('2. ESTADO DE LOS AMORTIGUADORES EN LAS 4 ESTACIONES DE TRABAJO (TOC / DBR)', 'SectionHeader', 'String', 6)], 24);
  s2.addRow([
    c('Estación de Trabajo', 'TableHeader'),
    c('N° Operarios', 'TableHeader'),
    c('Amortiguador Inicial (Meta)', 'TableHeader'),
    c('Nivel Actual en Amortiguador', 'TableHeader'),
    c('% del Amortiguador', 'TableHeader'),
    c('Estado Semáforo TOC', 'TableHeader'),
    c('Detalle de Inventario en Cola', 'TableHeader')
  ], 25);

  const listaBuffers = [
    { nom: '1. Área de Enrollado (MP)', ops: '4 Operarios (Op 1-4)', b: buf.enrollado },
    { nom: '2. Área de Pegado (Tubos)', ops: '4 Operarios (Op 5-8)', b: buf.pegado },
    { nom: '3. Área de Cortado (Máquina)', ops: '1 Operario (Op 9)', b: buf.cortado },
    { nom: '4. Área de Ensamblado (4 Prod.)', ops: '4 Operarios (Op 10-13)', b: buf.ensamblado }
  ];

  for (const item of listaBuffers) {
    const badgeStyle = item.b.zona === 'ROJO' ? 'BadgeRed' : item.b.zona === 'AMARILLO' ? 'BadgeAmber' : item.b.zona === 'VERDE' ? 'BadgeGreen' : 'BadgeBlue';
    s2.addRow([
      c(item.nom, 'CellBold'),
      c(item.ops, 'CellCenter'),
      c(`${item.b.meta} ${item.b.unidad}`, 'CellCenter'),
      c(item.b.actual, 'CellCenter', 'Number'),
      c(`${item.b.porcentaje}%`, badgeStyle),
      c(item.b.texto, badgeStyle),
      c(item.b.detalle, 'CellNormal')
    ], 22);
  }

  s2.addEmptyRow(14);
  s2.addRow([c('3. HISTORIAL DE PEDIDOS REALIZADOS POR EL DOCENTE Y ÓRDENES DE REPOSICIÓN', 'SectionHeader', 'String', 6)], 24);
  s2.addRow([
    c('Código Pedido', 'TableHeader'),
    c('Hora de Solicitud', 'TableHeader'),
    c('Detalle de los 4 Productos Pedidos', 'TableHeader'),
    c('Total Unidades', 'TableHeader'),
    c('Reposición Exigida (Tubos / Placas)', 'TableHeader'),
    c('Unidades Entregadas al Docente', 'TableHeader'),
    c('Estado y Tiempo de Respuesta', 'TableHeader')
  ], 25);

  if (!state.pedidosDocente || state.pedidosDocente.length === 0) {
    s2.addRow([c('No se registraron pedidos específicos del docente durante esta corrida.', 'CellCenter', 'String', 6)], 22);
  } else {
    for (const ped of state.pedidosDocente) {
      const exp = ped.explosion;
      const prog = ped.progreso || {};
      const stBadge = ped.estado === 'COMPLETADO' ? 'BadgeGreen' : 'BadgeAmber';
      s2.addRow([
        c(ped.id, 'CellBold'),
        c(new Date(ped.timestampCreacion).toLocaleTimeString('es-BO'), 'CellCenter'),
        c(exp.resumenProductosTexto || `${exp.cajasEstandar} Est + ${exp.cajasPlus} Plus`, 'CellNormal'),
        c(exp.totalCajas, 'CellCenter', 'Number'),
        c(`${exp.totalTubosParaPlacas} tubos y ${exp.totalPlacasPegar} placas`, 'CellCenter'),
        c(`${prog.cajasTotalesEntregadas || 0} / ${exp.totalCajas} unid.`, 'CellCenter'),
        c(ped.estado === 'COMPLETADO' ? `COMPLETADO (${ped.tiempoCumplimientoSeg} s)` : 'EN REPOSICIÓN Y PRODUCCIÓN', stBadge)
      ], 22);
    }
  }

  // ==========================================================================
  // HOJA 3: 3_Trazabilidad_de_Productos
  // ==========================================================================
  const s3 = new SheetBuilder([105, 165, 145, 135, 185, 185, 185, 145, 165, 200, 105]);
  s3.addRow([c('MATRIZ DE TRAZABILIDAD COMPLETA POR PRODUCTO (¿DE DÓNDE VIENE Y A DÓNDE VA?)', 'TitleBanner', 'String', 10)], 30);
  s3.addRow([
    c('Código', 'TableHeader'),
    c('Tipo de Producto (1 de 4)', 'TableHeader'),
    c('Estado Actual', 'TableHeader'),
    c('Origen de Stock', 'TableHeader'),
    c('1. Operarios Enrollado (4)', 'TableHeader'),
    c('2. Operarios Pegado (4)', 'TableHeader'),
    c('Placas / Lotes Usados', 'TableHeader'),
    c('3. Operario Corte (1)', 'TableHeader'),
    c('4. Operario Ensamblado (4)', 'TableHeader'),
    c('A dónde va (Destino / Pedido)', 'TableHeader'),
    c('Lead Time (s)', 'TableHeader')
  ], 26);

  if (!state.cajas || state.cajas.length === 0) {
    s3.addRow([c('Aún no hay productos registrados.', 'CellCenter', 'String', 10)], 22);
  } else {
    state.cajas.forEach((cx, idx) => {
      const rStyle = idx % 2 === 0 ? 'CellNormal' : 'CellZebra';
      const tipoStyle = cx.tipo === 'PLUS' ? 'BadgePink' : cx.tipo === 'NUEVO_ESTANDAR' ? 'BadgeBlue' : cx.tipo === 'NUEVO_PLUS' ? 'BadgeAmber' : 'BadgeGreen';
      s3.addRow([
        c(cx.id, 'CellBold'),
        c(cx.nombreProducto, tipoStyle),
        c('PRODUCTO TERMINADO', 'BadgeGreen'),
        c(cx.esAmortiguador ? 'Amortiguador Inicial' : 'Producción Nueva', 'CellCenter'),
        c((cx.origen.operariosEnrollado || []).join(', '), rStyle),
        c((cx.origen.operariosPegado || []).join(', '), rStyle),
        c((cx.origen.placasUtilizadas || []).join(', '), rStyle),
        c((cx.origen.operariosCorte || []).join(', '), rStyle),
        c(cx.origen.operarioEnsambladoNombre || '', 'CellBold'),
        c(cx.destino.destinoFinalCliente, 'CellBold'),
        c(cx.leadTimeTotalSeg || '', 'CellCenter', cx.leadTimeTotalSeg ? 'Number' : 'String')
      ], 22);
    });
  }

  // ==========================================================================
  // HOJA 4: 4_Productividad_13_Operarios
  // ==========================================================================
  const s4 = new SheetBuilder([110, 175, 190, 200, 140, 160, 125]);
  s4.addRow([c('ESTUDIO DE TIEMPOS Y PRODUCTIVIDAD INDIVIDUAL DE LOS 13 OPERARIOS (DISTRIBUCIÓN 4-4-1-4)', 'TitleBanner', 'String', 6)], 30);
  s4.addRow([
    c('Puesto', 'TableHeader'),
    c('Nombre del Operario', 'TableHeader'),
    c('Estación de Trabajo', 'TableHeader'),
    c('Rol en la Línea', 'TableHeader'),
    c('Unidades Producidas', 'TableHeader'),
    c('Tiempo de Ciclo Promedio (s)', 'TableHeader'),
    c('Mermas / Defectos', 'TableHeader')
  ], 26);

  state.operarios.forEach((op, idx) => {
    const st = m.statsOperarios[op.id] || {};
    const rStyle = idx % 2 === 0 ? 'CellNormal' : 'CellZebra';
    s4.addRow([
      c(`#${op.numero} (${op.id})`, 'CellBold'),
      c(op.nombre, 'CellBold'),
      c(op.areaNombre, 'BadgeBlue'),
      c(op.rol, rStyle),
      c(st.unidadesProducidas || 0, 'CellCenter', 'Number'),
      c(st.tiempoCicloPromedioSeg || 'Sin ciclos', 'CellCenter', st.tiempoCicloPromedioSeg ? 'Number' : 'String'),
      c(st.mermas || 0, st.mermas > 0 ? 'BadgeRed' : 'CellCenter', 'Number')
    ], 22);
  });

  // ==========================================================================
  // HOJA 5: 5_Bitacora_Movimientos
  // ==========================================================================
  const s5 = new SheetBuilder([95, 170, 125, 315, 205, 215, 110]);
  s5.addRow([c('BITÁCORA CRONOLÓGICA DE MOVIMIENTOS ENTRE LAS 4 ESTACIONES', 'TitleBanner', 'String', 6)], 30);
  s5.addRow([
    c('Hora', 'TableHeader'),
    c('Operario', 'TableHeader'),
    c('Estación', 'TableHeader'),
    c('Detalle de Producción / Transferencia', 'TableHeader'),
    c('De dónde viene (Origen)', 'TableHeader'),
    c('A dónde va (Destino)', 'TableHeader'),
    c('Tiempo Ciclo (s)', 'TableHeader')
  ], 25);

  (state.eventos || []).forEach((ev, idx) => {
    const rStyle = idx % 2 === 0 ? 'CellNormal' : 'CellZebra';
    s5.addRow([
      c(new Date(ev.timestamp).toLocaleTimeString('es-BO'), 'CellCenter'),
      c(`${ev.operarioNombre} (${ev.operarioId})`, 'CellBold'),
      c(ev.area, 'BadgeBlue'),
      c(ev.etiqueta, rStyle),
      c(ev.origen || '-', rStyle),
      c(ev.destino || '-', rStyle),
      c(ev.cicloSeg || '', 'CellCenter', ev.cicloSeg ? 'Number' : 'String')
    ], 20);
  });

  const zipFiles = [
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet5.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="1_Cuadro_Resumen_General" sheetId="1" r:id="rId1"/>
    <sheet name="2_Balanceo_y_Amortiguadores" sheetId="2" r:id="rId2"/>
    <sheet name="3_Trazabilidad_de_Productos" sheetId="3" r:id="rId3"/>
    <sheet name="4_Productividad_13_Operarios" sheetId="4" r:id="rId4"/>
    <sheet name="5_Bitacora_Movimientos" sheetId="5" r:id="rId5"/>
  </sheets>
</workbook>`
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet5.xml"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
    },
    {
      name: 'xl/styles.xml',
      content: buildStylesXml()
    },
    { name: 'xl/worksheets/sheet1.xml', content: s1.toXml() },
    { name: 'xl/worksheets/sheet2.xml', content: s2.toXml() },
    { name: 'xl/worksheets/sheet3.xml', content: s3.toXml() },
    { name: 'xl/worksheets/sheet4.xml', content: s4.toXml() },
    { name: 'xl/worksheets/sheet5.xml', content: s5.toXml() }
  ];

  return createZipBuffer(zipFiles);
}

module.exports = { generarLibroXlsxBuffer };
