// Genera presentacion/Nivel-1-arquitectura-y-delimitacion.pptx (editable) y lamina-1.png / lamina-2.png.
// Un solo modelo de láminas alimenta el .pptx (pptxgenjs) y un HTML que Edge convierte en PNG.
// Uso: npm run slides
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
import {ROOT} from './runtime.mjs';

const require = createRequire(import.meta.url);
const PptxGenJS = require('pptxgenjs');
const OUT = path.join(ROOT, 'presentacion');
const W = 13.333, H = 7.5, PX = 96; // LAYOUT_WIDE; 96 px por pulgada → 1280 × 720
const C = {navy: '102C49', ink: '142C47', teal: '126F75', mint: '70E5D6', sea: 'E3F4F3', red: 'A21F2B', rose: 'FBECEE', amber: 'C68120', sand: 'FFF4DC', white: 'FFFFFF', mist: 'EEF3F7', slate: '52697D', line: 'C9D6E2', ice: 'B9D0E4', deep: '0B2138'};
const FONT = 'Arial';

// Elementos: rect {x,y,w,h,fill,line,radius} · text {x,y,w,h,runs|text,size,color,bold,align,valign}
const rect = (x, y, w, h, fill, extra = {}) => ({kind: 'rect', x, y, w, h, fill, ...extra});
const text = (x, y, w, h, value, style = {}) => ({kind: 'text', x, y, w, h, value, ...style});
const arrow = (x, y, w, color) => ({kind: 'arrow', x, y, w, color});

function slide1() {
  const els = [rect(0, 0, W, H, C.mist)];
  els.push(text(0.6, 0.45, 12.1, 0.8, [{t: '98,25 % publicado', color: C.red}, {t: ' contra '}, {t: '55,61 % confirmado', color: C.teal}], {size: 36, bold: true, color: C.ink}));
  els.push(text(0.6, 1.25, 12.1, 0.5, 'Arquitectura del indicador recomputable · julio de 2026 · 187 tickets', {size: 18, color: C.slate}));
  // Zonas: fuera de cadena (izquierda y derecha) y dentro de cadena (centro).
  els.push(rect(0.6, 2.0, 12.13, 3.25, C.white, {line: C.line, radius: 0.12}));
  els.push(text(0.85, 2.12, 5, 0.35, 'FUERA DE CADENA', {size: 12, bold: true, color: C.slate}));
  els.push(rect(6.82, 2.12, 2.85, 3.0, C.navy, {radius: 0.1}));
  els.push(text(7.0, 2.22, 2.5, 0.35, 'DENTRO DE CADENA', {size: 12, bold: true, color: C.mint}));
  const boxes = [
    {x: 0.85, title: 'Exportación de ATENEA', body: 'Punto de entrada. Tickets, catálogo, reporte publicado, bitácora y reaperturas en CSV', tag: '1'},
    {x: 3.85, title: 'Sellador del municipio', body: 'Valida huellas SHA-256, hash por ticket y raíz Merkle. Firma con su llave', tag: '2'},
    {x: 7.0, title: 'RegistroIndicador en Sepolia', body: 'Período, raíz, compromiso, cantidad y hash de reglas. Un sello por mes, inmutable', tag: '3', dark: true},
    {x: 10.0, title: 'Verificador en el navegador', body: 'Lee la cadena sin wallet, recalcula desde los CSV y da verde o rojo', tag: '4'}
  ];
  for (const b of boxes) {
    const w = b.dark ? 2.5 : 2.5;
    els.push(rect(b.x, 2.65, w, 2.35, b.dark ? C.deep : C.mist, {radius: 0.08}));
    els.push(rect(b.x + 0.18, 2.83, 0.42, 0.42, b.dark ? C.mint : C.teal, {radius: 0.21, ellipse: true}));
    els.push(text(b.x + 0.18, 2.83, 0.42, 0.42, b.tag, {size: 14, bold: true, color: b.dark ? C.navy : C.white, align: 'center', valign: 'middle'}));
    els.push(text(b.x + 0.18, 3.38, w - 0.36, 0.62, b.title, {size: 15, bold: true, color: b.dark ? C.white : C.ink}));
    els.push(text(b.x + 0.18, 4.0, w - 0.36, 0.95, b.body, {size: 12, color: b.dark ? C.ice : C.slate}));
  }
  els.push(arrow(3.4, 3.8, 0.4, C.teal), arrow(6.4, 3.8, 0.55, C.teal), arrow(9.55, 3.8, 0.4, C.teal));
  // Fila de evidencias.
  const stats = [
    {big: '171 ← 187', small: 'El denominador publicado excluye 7 reaperturas y 9 casos del proveedor', color: C.amber},
    {big: '5,80 h → 3,80 h', small: 'TK-2026-04228 se editó después de resolver; solo la bitácora lo revela', color: C.red},
    {big: '0 de 174', small: 'nombres de usuarios, técnicos, unidades y actores encontrados en la cadena', color: C.teal}
  ];
  stats.forEach((s, i) => {
    const x = 0.6 + i * 4.13;
    els.push(rect(x, 5.5, 3.87, 1.45, C.white, {line: C.line, radius: 0.1}));
    els.push(text(x + 0.22, 5.6, 3.5, 0.6, s.big, {size: 26, bold: true, color: s.color}));
    els.push(text(x + 0.22, 6.2, 3.5, 0.65, s.small, {size: 12, color: C.slate}));
  });
  return els;
}

function slide2() {
  const els = [rect(0, 0, W, H, C.navy)];
  els.push(text(0.6, 0.45, 12.1, 0.7, 'Delimitación: dónde sí y dónde no', {size: 36, bold: true, color: C.white}));
  els.push(rect(0.6, 1.35, 12.13, 1.35, C.deep, {radius: 0.12}));
  els.push(text(0.9, 1.45, 11.6, 1.15, [{t: 'La cadena se usa solo donde hay frontera de confianza: '}, {t: 'el indicador público', color: C.mint}, {t: ' (quien emite el dato es el medido) y '}, {t: 'el reloj con el proveedor.', color: C.mint}, {t: ' La operación interna se resuelve mejor con logs firmados.'}], {size: 19, color: C.white, valign: 'middle'}));
  // Cada ítem: [encabezado, líneas que ocupa el encabezado, texto].
  const cols = [
    {x: 0.6, w: 5.2, title: 'Lo que decidimos no poner en cadena', items: [
      ['Asignaciones y escalamientos', 1, 'Operación interna de una sola institución: no cruza una frontera de confianza. Basta un log firmado.'],
      ['Bitácora completa', 1, 'Tiene nombres de actores. Solo su SHA-256 entra al sello; el contenido se queda fuera.'],
      ['Contenido de los tickets', 1, 'Usuarios, unidades, sistemas y vulnerabilidades: ni en claro ni cifrado.']]},
    {x: 6.05, w: 3.2, title: 'Implementado · Nivel 2', items: [
      ['Reloj compartido con el proveedor', 2, 'Aquí sí hay frontera de confianza: dos organizaciones, un contrato y dinero. El municipio firma la apertura y el proveedor la respuesta, cada uno con su llave. 9 casos: PVT-04226 rechazado y 2.592 USD en penalidades, recalculables por cualquiera.']]},
    {x: 9.5, w: 3.23, title: 'Lo que la cadena no hace', items: [
      ['No prueba que los datos fueran verdaderos', 2, 'Solo que no cambiaron después del sello.'],
      ['No mejora los tiempos de respuesta', 2, 'Los hace verificables, que es otra cosa.']]}
  ];
  for (const c of cols) {
    els.push(rect(c.x, 2.95, c.w, 4.1, C.white, {radius: 0.12}));
    els.push(text(c.x + 0.25, 3.1, c.w - 0.5, 0.45, c.title, {size: 16, bold: true, color: C.teal}));
    let y = 3.7;
    for (const [head, lines, body] of c.items) {
      const hh = lines * 0.27;
      els.push(text(c.x + 0.25, y, c.w - 0.5, hh, head, {size: 14, bold: true, color: C.ink}));
      const bodyLines = Math.ceil(body.length / ((c.w - 0.5) * 11.5));
      els.push(text(c.x + 0.25, y + hh + 0.1, c.w - 0.5, bodyLines * 0.23, body, {size: 12, color: C.slate}));
      y += hh + 0.1 + bodyLines * 0.23 + 0.3;
    }
  }
  return els;
}

const SLIDES = [
  {name: 'lamina-1', title: 'Arquitectura', notes: 'Punto de entrada: la exportación de ATENEA. El municipio sella con su llave; el contrato en Sepolia guarda solo hashes, conteos, período y reglas. Cualquiera verifica en el navegador sin wallet. Titular: 98,25 % publicado contra 55,61 % confirmado por el usuario.', build: slide1},
  {name: 'lamina-2', title: 'Delimitación', notes: 'Dos fronteras de confianza: el emisor del indicador es el medido, y el reloj con el proveedor junta dos organizaciones, un contrato y dinero. El reloj ya está implementado (Nivel 2): el contrato rechaza PVT-04226 y calcula 2.592 USD de penalidades. Lo interno se resuelve con logs firmados. La cadena no prueba veracidad previa ni mejora tiempos.', build: slide2}
];

const flat = v => Array.isArray(v) ? v.map(r => r.t).join('') : v;

async function buildPptx() {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = 'Reto 03 · Niveles 1 y 2 · Arquitectura y delimitación';
  pres.author = 'Equipo Reto 03';
  pres.theme = {headFontFace: FONT, bodyFontFace: FONT};
  for (const s of SLIDES) {
    const slide = pres.addSlide();
    s.build().forEach((e, i) => {
      const name = `${s.name}-${i}`;
      if (e.kind === 'rect') {
        const shape = e.ellipse ? pres.ShapeType.ellipse : e.radius ? pres.ShapeType.roundRect : pres.ShapeType.rect;
        slide.addShape(shape, {x: e.x, y: e.y, w: e.w, h: e.h, fill: {color: e.fill}, line: e.line ? {color: e.line, width: 1} : {type: 'none'}, ...(e.radius && !e.ellipse ? {rectRadius: e.radius} : {}), objectName: name});
      } else if (e.kind === 'arrow') {
        slide.addShape(pres.ShapeType.line, {x: e.x, y: e.y, w: e.w, h: 0, line: {color: e.color, width: 2.5, endArrowType: 'triangle'}, objectName: name});
      } else {
        const runs = Array.isArray(e.value) ? e.value.map(r => ({text: r.t, options: {color: r.color ?? e.color, bold: e.bold}})) : e.value;
        slide.addText(runs, {x: e.x, y: e.y, w: e.w, h: e.h, fontFace: FONT, fontSize: e.size, color: e.color, bold: e.bold, align: e.align ?? 'left', valign: e.valign ?? 'top', margin: 0, isTextBox: true, fit: 'none', objectName: name});
      }
    });
    slide.addNotes(s.notes);
  }
  const file = path.join(OUT, 'Nivel-1-arquitectura-y-delimitacion.pptx');
  // Sin entradas de carpeta en el ZIP: algunos servicios en la nube no abren el archivo si las tiene.
  // Se copian solo los archivos a un ZIP nuevo. (zip.remove() sobre una carpeta borra también
  // su contenido: así quedaba antes un .pptx con solo [Content_Types].xml.)
  const JSZip = require('jszip');
  const source = await JSZip.loadAsync(await pres.write({outputType: 'nodebuffer'})), zip = new JSZip();
  for (const [name, entry] of Object.entries(source.files)) if (!entry.dir) zip.file(name, await entry.async('nodebuffer'), {createFolders: false});
  // pptxgenjs declara en [Content_Types].xml partes que no genera (slideMaster2.xml): se quitan.
  const types = await zip.file('[Content_Types].xml').async('string');
  zip.file('[Content_Types].xml', types.replace(/<Override PartName="\/([^"]+)"[^>]*\/>/g, (tag, part) => zip.file(part) ? tag : ''), {createFolders: false});
  const required = ['[Content_Types].xml', 'ppt/presentation.xml', ...SLIDES.map((_, i) => `ppt/slides/slide${i + 1}.xml`)];
  const missing = required.filter(name => !zip.file(name));
  if (missing.length) throw new Error(`El .pptx generado está incompleto: falta ${missing.join(', ')}`);
  await fs.writeFile(file, await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'}));
  return file;
}

function html(s) {
  const px = v => `${(v * PX).toFixed(1)}px`;
  const body = s.build().map(e => {
    const box = `left:${px(e.x)};top:${px(e.y)};width:${px(e.w)};`;
    if (e.kind === 'rect') return `<div style="position:absolute;${box}height:${px(e.h)};background:#${e.fill};${e.line ? `border:1px solid #${e.line};` : ''}border-radius:${e.ellipse ? '50%' : px(e.radius ?? 0)};box-sizing:border-box"></div>`;
    if (e.kind === 'arrow') return `<div style="position:absolute;${box}top:${px(e.y - 0.01)};height:3px;background:#${e.color}"></div><div style="position:absolute;left:${px(e.x + e.w - 0.12)};top:${px(e.y - 0.09)};width:0;height:0;border-left:${px(0.14)} solid #${e.color};border-top:${px(0.09)} solid transparent;border-bottom:${px(0.09)} solid transparent"></div>`;
    const content = Array.isArray(e.value) ? e.value.map(r => `<span style="color:#${r.color ?? e.color}">${r.t}</span>`).join('') : e.value;
    const align = e.valign === 'middle' ? 'center' : 'flex-start';
    return `<div style="position:absolute;${box}height:${px(e.h)};display:flex;align-items:${align};justify-content:${e.align === 'center' ? 'center' : 'flex-start'};font:${e.bold ? 700 : 400} ${e.size * 96 / 72}px/1.18 ${FONT};color:#${e.color};text-align:${e.align ?? 'left'}"><div>${content}</div></div>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="slide" style="position:relative;width:${W * PX}px;height:${H * PX}px;overflow:hidden">${body}</div>`;
}

async function buildPng() {
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: Math.round(W * PX), height: Math.round(H * PX)}});
    for (const s of SLIDES) {
      await page.setContent(html(s));
      await page.locator('#slide').screenshot({path: path.join(OUT, `${s.name}.png`)});
    }
  } finally { await browser.close(); }
}

await fs.mkdir(OUT, {recursive: true});
console.log('Láminas:', await buildPptx());
await buildPng();
console.log('PNG: presentacion/lamina-1.png, presentacion/lamina-2.png');
