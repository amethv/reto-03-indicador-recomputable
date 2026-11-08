import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {verifySource} from '../scripts/verify-source.mjs';
import {csv,businessHours} from '../src/core.mjs';
test('los once archivos coinciden con las huellas de la carpeta fuente',async()=>{
 assert.equal((await verifySource()).length,11);
});
test('regresión de procedencia: hora original del primer ticket',async()=>{
 const rows=csv(await fs.readFile(new URL('../datos/tickets.csv',import.meta.url),'utf8')).rows;
 assert.equal(rows[0].ticket_id,'TK-2026-04201');
 assert.equal(rows[0].fecha_reporte,'2026-07-31T12:39:55-05:00');
 assert.equal(businessHours(rows[0].fecha_reporte,rows[0].fecha_resolucion),8.4);
});
test('un feriado excluye solo su jornada y no se descuenta dos veces un fin de semana',()=>{
 const a='2026-07-03T16:00:00-05:00', b='2026-07-07T09:00:00-05:00';
 assert.equal(businessHours(a,b),11);
 assert.equal(businessHours(a,b,['2026-07-06']),2);
 assert.equal(businessHours(a,b,['2026-07-04','2026-07-06']),2);
 assert.equal(businessHours('2026-07-06T10:00:00-05:00','2026-07-06T12:00:00-05:00',['2026-07-06']),0);
});
test('el calendario rechaza fechas imposibles, ambiguas y duplicadas',()=>{
 for(const dates of [['2026-02-30'],['06/07/2026'],['2026-07-06','2026-07-06']])
  assert.throws(()=>businessHours('2026-07-01T08:00:00-05:00','2026-07-02T08:00:00-05:00',dates),/Feriado/);
});
