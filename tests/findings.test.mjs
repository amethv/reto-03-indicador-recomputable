import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {csv,calculate,businessHours,CATALOG_HEADERS,REPORT_HEADERS,BITACORA_HEADERS,REOPEN_HEADERS} from '../src/core.mjs';
import {denominatorBreakdown,resolutionEdits,misnumberedReopenings,slaIndicator,computeFindings,applyEdits,simulateHolidays} from '../src/findings.mjs';

const read = name => fs.readFile(new URL('../datos/' + name, import.meta.url), 'utf8');
const tickets = csv(await read('tickets.csv'));
const catalog = csv(await read('catalogo_servicios.csv'), CATALOG_HEADERS).rows;
const reportRow = csv(await read('indicador_mensual.csv'), REPORT_HEADERS).rows[0];
const events = csv(await read('bitacora_eventos.csv'), BITACORA_HEADERS).rows;
const reopenings = csv(await read('reaperturas.csv'), REOPEN_HEADERS).rows;
const result = calculate(tickets, catalog);
const findings = computeFindings({tickets: tickets.rows, catalog, reportRow, events, reopenings, result});
const range = (a, b) => Array.from({length: b - a + 1}, (_, i) => `TK-2026-0${a + i}`);

test('denominador: 187 − 7 reaperturas − 9 de Nivel 3 = 171 publicados, sin solape', () => {
  const d = denominatorBreakdown(tickets.rows, reportRow);
  assert.equal(d.total, 187);
  assert.deepEqual(d.reopened, range(4381, 4387));
  assert.deepEqual(d.level3, ['TK-2026-04226','TK-2026-04244','TK-2026-04288','TK-2026-04301','TK-2026-04315','TK-2026-04320','TK-2026-04326','TK-2026-04360','TK-2026-04367']);
  assert.deepEqual(d.overlap, []);
  assert.equal(d.derived, 171); assert.equal(d.published, 171); assert.equal(d.matches, true);
  assert.equal(d.publishedManaged, 168); assert.equal(d.managedGapUnexplained, 3); assert.equal(d.publishedPercent, 98.25);
});

test('bitácora: TK-2026-04228 editado después de resolver, 5,80 h → 3,80 h, incumplió el SLA', () => {
  const edits = resolutionEdits(events, tickets.rows, catalog);
  assert.equal(edits.length, 1);
  const e = edits[0];
  assert.equal(e.event, 'EV-00001'); assert.equal(e.ticket, 'TK-2026-04228');
  assert.equal(e.editedAt, '2026-07-26T15:27:21-05:00'); assert.equal(e.role, 'Analista Nivel 1');
  assert.equal(e.hoursBefore, 5.8); assert.equal(e.hoursAfter, 3.8);
  assert.equal(e.slaBefore, 'NO'); assert.equal(e.slaAfter, 'SI');
  assert.equal(e.service, 'CS-11'); assert.equal(e.priority, 'CRITICA'); assert.equal(e.slaHours, 4);
  assert.equal(e.editedAfterResolution, true); assert.equal(e.csvShowsEditedValue, true);
  assert.equal(e.realWithin, false); assert.equal(e.changesCompliance, true);
  assert.equal('actor' in e, false, 'el actor no sale del módulo');
  assert.ok(!JSON.stringify(findings).includes('ptapia'));
});

test('reaperturas: RA-001 a RA-005 debieron conservar el número y generaron TK-2026-04381 a 04385', () => {
  const r = misnumberedReopenings(reopenings, tickets.rows);
  assert.deepEqual(r.map(x => x.id), ['RA-001','RA-002','RA-003','RA-004','RA-005']);
  assert.deepEqual(r.map(x => x.generated), range(4381, 4385));
  assert.deepEqual(r.map(x => x.original), ['TK-2026-04335','TK-2026-04304','TK-2026-04356','TK-2026-04221','TK-2026-04261']);
  assert.ok(r.every(x => x.businessDays === 3 && x.generatedInBatch));
});

test('SLA: declarado 121/187 = 64,71 %; corregido por bitácora 120/187 = 64,17 %', () => {
  const s = slaIndicator(tickets.rows, result.details, resolutionEdits(events, tickets.rows, catalog));
  assert.equal(s.declared.numerator, 121); assert.equal(s.declared.denominator, 187);
  assert.equal(s.declared.percent.toFixed(2), '64.71');
  assert.equal(s.computedFromDates.numerator, 121);
  assert.equal(s.corrected.numerator, 120); assert.equal(s.corrected.percent.toFixed(2), '64.17');
  assert.deepEqual(s.correctedTickets, ['TK-2026-04228']);
});

test('tabla resumen y titular: 98,25 % publicado frente a 55,61 % confirmado', () => {
  const s = findings.summary;
  assert.deepEqual([s.published.numerator, s.published.denominator, s.published.percent], [168, 171, 98.25]);
  assert.deepEqual([s.allClosures.numerator, s.allClosures.denominator, s.allClosures.percent], [187, 187, 100]);
  assert.deepEqual([s.confirmed.numerator, s.confirmed.denominator], [104, 187]); assert.equal(s.confirmed.percent.toFixed(2), '55.61');
  assert.deepEqual([s.withinSLA.numerator, s.withinSLA.denominator], [120, 187]);
  assert.equal(findings.headline.published, 98.25); assert.equal(findings.headline.confirmed.toFixed(2), '55.61');
  assert.equal(findings.automatic.numerator, 83); assert.equal(Math.round(findings.automatic.percent), 44);
});

test('discrepancias SLA: solo TK-2026-04228 vía bitácora; los redondeos de 0,01 h no cuentan', () => {
  const details = applyEdits(result.details, findings.edits);
  assert.deepEqual(details.filter(d => d.discrepancies.length).map(d => d.id), ['TK-2026-04228']);
  for (const id of ['TK-2026-04385', 'TK-2026-04386']) assert.deepEqual(details.find(d => d.id === id).discrepancies, []);
});

test('simulación de feriado 2026-07-24: recalcula horas sin tocar el sello', () => {
  const details = applyEdits(result.details, findings.edits);
  const none = simulateHolidays(details, [], businessHours);
  assert.equal(none.changed.length, 0); assert.equal(none.within.numerator, 120);
  const sim = simulateHolidays(details, ['2026-07-24'], businessHours);
  assert.ok(sim.changed.length > 0);
  assert.ok(sim.changed.every(c => c.hoursAfter <= c.hoursBefore + 1e-9), 'un feriado nunca suma horas');
  const t = sim.changed.find(c => c.id === 'TK-2026-04228');
  assert.ok(t, 'TK-2026-04228 se reportó y resolvió el 24 de julio');
  assert.equal(t.hoursAfter, 0); assert.equal(t.withinAfter, false, 'la edición registrada mantiene el incumplimiento');
  assert.equal(sim.within.numerator, 120 + sim.statusChanged.filter(c => c.withinAfter).length - sim.statusChanged.filter(c => !c.withinAfter).length);
});
