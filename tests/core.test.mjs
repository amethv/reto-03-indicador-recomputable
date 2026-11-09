import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import Papa from 'papaparse';
import {csv,validate,calculate,businessHours,CATALOG_HEADERS,buildEvidence,evidenceHash,verifyText,authenticateEvidence,proofValid,sha,sealedValues,newSalt,validSalt,saltCommitment,fieldHash,EVIDENCE_VERSION,BITACORA_HEADERS} from '../src/core.mjs';
import {personalValues} from '../src/privacy.mjs';
const ticketText=await fs.readFile(new URL('../datos/tickets.csv',import.meta.url),'utf8');
const catalogText=await fs.readFile(new URL('../datos/catalogo_servicios.csv',import.meta.url),'utf8');
const reportText=await fs.readFile(new URL('../datos/indicador_mensual.csv',import.meta.url),'utf8');
const bitacoraText=await fs.readFile(new URL('../datos/bitacora_eventos.csv',import.meta.url),'utf8');
const reopeningsText=await fs.readFile(new URL('../datos/reaperturas.csv',import.meta.url),'utf8');
const aux={catalog:catalogText,report:reportText,bitacora:bitacoraText,reopenings:reopeningsText};
const sources={tickets:ticketText,...aux};
const baseline=JSON.parse(await fs.readFile(new URL('../src/originals.json',import.meta.url),'utf8'));
const parsed=csv(ticketText),catalog=csv(catalogText,CATALOG_HEADERS).rows;
const SALT=newSalt();
const evidence=await buildEvidence(sources,baseline,SALT);
// Este objeto se usa SOLO en pruebas unitarias. La aceptación E2E consulta una EVM real.
const unitAnchor={root:evidence.root,evidenceHash:await evidenceHash(evidence),count:187};
const verify=text=>verifyText(text,evidence,unitAnchor,aux,SALT);
function mutate(fn){const rows=structuredClone(parsed.rows);fn(rows);return Papa.unparse(rows,{columns:parsed.headers,newline:'\n'});}
test('original: 187 IDs exactos, todas las columnas y 187 pruebas válidas',async()=>{
 assert.equal(parsed.rows.length,187);assert.equal(new Set(parsed.rows.map(r=>r.ticket_id)).size,187);
 assert.deepEqual(validate(parsed,catalog).errors,[]);assert.equal(evidence.tickets.length,187);
 for(const t of evidence.tickets)assert.equal(await proofValid(t.hash,t.proof,evidence.root),true);
 assert.equal((await verify(ticketText)).status,'VERDE');
});
test('numerador, denominador y diferencia se derivan de cierres del original',()=>{
 const r=calculate(parsed,catalog);assert.equal(r.denominator,187);assert.equal(r.numeratorA,187);assert.equal(r.numeratorB,104);assert.equal(r.automatic,83);assert.equal(r.calendarJuly,185);
 assert.equal(r.details.filter(r=>r.within===false).length,66);assert.deepEqual(r.details.filter(r=>r.discrepancies.length).map(r=>r.id),[],'el redondeo a dos decimales no es discrepancia');
 assert.equal(r.percentA,100);assert.ok(Math.abs(r.percentB-55.61497326203209)<1e-10);assert.ok(Math.abs(r.gap-44.38502673796791)<1e-10);assert.equal(r.percentA-98.25,1.75);
 assert.equal(r.details.filter(r=>!r.managed).length,0);assert.equal(r.details.filter(r=>!r.confirmed).length,83);
});
test('fecha_resolucion alterada: ROJO, ID y campo exactos, sin resultado acreditado',async()=>{
 const id=parsed.rows[0].ticket_id;
 const changed=mutate(rows=>rows[0].fecha_resolucion=rows[0].fecha_resolucion.replace('12:03:55','13:03:55'));
 assert.notEqual(await sha(changed),await sha(ticketText));
 const v=await verify(changed);assert.equal(v.status,'ROJO');assert.equal(v.result,undefined);assert.deepEqual(v.changes.map(r=>r.id),[id]);assert.deepEqual(v.changes[0].fields,['fecha_resolucion']);
});
for(const field of ['usuario','tecnico_asignado','cumple_sla','horas_habiles_resolucion','sla_horas','prioridad','tipo_cierre','confirmado_por_usuario','fecha_cierre','unidad','ticket_origen'])test(`modificación en ${field} cubierta por el hash`,async()=>{
 const v=await verify(mutate(rows=>rows[0][field]+=' CAMBIO'));assert.equal(v.status,'ROJO');assert.ok(v.changes.some(r=>r.id===parsed.rows[0].ticket_id&&r.fields.includes(field)));
});
test('ticket eliminado identificado',async()=>{const v=await verify(mutate(rows=>rows.pop()));assert.equal(v.status,'ROJO');assert.ok(v.changes.some(r=>r.id===parsed.rows.at(-1).ticket_id&&r.kind==='Ticket eliminado'));});
test('ticket insertado identificado',async()=>{const v=await verify(mutate(rows=>rows.push({...rows[0],ticket_id:'TK-2026-09999'})));assert.equal(v.status,'ROJO');assert.ok(v.changes.some(r=>r.id==='TK-2026-09999'));});
test('ID duplicado y orden de filas protegidos',async()=>{const a=await verify(mutate(rows=>rows.push({...rows[0]})));assert.equal(a.status,'ROJO');assert.ok(a.errors.some(e=>e.includes('duplicado')));const b=await verify(mutate(rows=>[rows[0],rows[1]]=[rows[1],rows[0]]));assert.equal(b.status,'ROJO');});
test('celda extra, comillas incompletas y fecha imposible se rechazan',async()=>{
 const rows=Papa.parse(ticketText,{header:false}).data;rows[1].push('CELDA EXTRA');assert.equal((await verify(Papa.unparse(rows))).status,'ROJO');
 assert.ok(csv('ticket_id,fecha_reporte\n"comilla sin cerrar').errors.length);
 const invalid=csv(mutate(rows=>rows[0].fecha_resolucion='2026-02-30T12:00:00-05:00'));assert.ok(validate(invalid,catalog).errors.some(e=>e.includes('fecha_resolucion inválida')));
});
test('estado, cierre y confirmación inconsistentes se rechazan',()=>{
 const a=csv(mutate(rows=>rows[0].estado='ABIERTO'));assert.ok(validate(a,catalog).errors.some(e=>e.includes('inconsistentes')));
 const b=csv(mutate(rows=>rows.find(r=>r.tipo_cierre==='CONFIRMADO POR USUARIO').confirmado_por_usuario='NO'));assert.ok(validate(b,catalog).errors.some(e=>e.includes('sin confirmación')));
});
test('no se sella una copia modificada ni un lote incompleto de 186',async()=>{
 await assert.rejects(buildEvidence({...sources,tickets:mutate(rows=>rows[0].usuario+='CAMBIO')},baseline,SALT),/originales/);
 await assert.rejects(buildEvidence({...sources,tickets:mutate(rows=>rows.pop())},baseline,SALT),/187/);
 await assert.rejects(buildEvidence({...sources,bitacora:bitacoraText.replace('5.80 -> 3.80','5.80 -> 5.80')},baseline,SALT),/bitacora_eventos/);
 await assert.rejects(buildEvidence({tickets:ticketText,catalog:catalogText,report:reportText},baseline,SALT),/Falta/);
});
test('manifiesto, prueba individual y raíz adulterados no autentican',async()=>{
 for(const mutate of [e=>e.tickets[0].proof[0].hash='0x'+'00'.repeat(32),e=>e.tickets[0].fields.usuario='0x'+'00'.repeat(32),e=>e.root='0x'+'00'.repeat(32)]){
  const e=structuredClone(evidence);mutate(e);assert.equal((await authenticateEvidence(e,unitAnchor)).ok,false);
 }
 assert.equal((await verifyText(ticketText,evidence,{...unitAnchor,root:'0x'+'00'.repeat(32)},aux,SALT)).status,'INCOMPLETA');
});
test('catálogo, reporte, bitácora y reaperturas modificados dan INCOMPLETA',async()=>{
 assert.equal((await verifyText(ticketText,evidence,unitAnchor,{...aux,catalog:catalogText.replace(',24,',',25,')},SALT)).status,'INCOMPLETA');
 assert.equal((await verifyText(ticketText,evidence,unitAnchor,{...aux,report:reportText.replace('98.25','99.99')},SALT)).status,'INCOMPLETA');
 const b=await verifyText(ticketText,evidence,unitAnchor,{...aux,bitacora:bitacoraText.replace('5.80 -> 3.80','3.80 -> 3.80')},SALT);
 assert.equal(b.status,'INCOMPLETA');assert.ok(b.errors.some(e=>e.includes('bitacora_eventos.csv')));
 const r=await verifyText(ticketText,evidence,unitAnchor,{...aux,reopenings:reopeningsText.replace('RA-001,TK-2026-04335,TK-2026-04381,3,SI','RA-001,TK-2026-04335,TK-2026-04381,3,NO')},SALT);
 assert.equal(r.status,'INCOMPLETA');assert.ok(r.errors.some(e=>e.includes('reaperturas.csv')));
 assert.equal((await verifyText(ticketText,evidence,unitAnchor,{catalog:catalogText,report:reportText},SALT)).status,'INCOMPLETA');
});
test('verificación verde: TK-2026-04228 es la única discrepancia SLA (vía bitácora)',async()=>{
 const v=await verify(ticketText);assert.equal(v.status,'VERDE');
 assert.deepEqual(v.result.details.filter(r=>r.discrepancies.length).map(r=>r.id),['TK-2026-04228']);
 assert.equal(v.findings.summary.withinSLA.numerator,120);
});
test('rojo: valor sellado frente al editado desde el CSV original local',async()=>{
 const changed=mutate(rows=>rows[0].fecha_resolucion='2026-08-03T12:04:55-05:00');
 const v=await verify(changed);assert.equal(v.status,'ROJO');
 assert.deepEqual(await sealedValues(v.changes[0],ticketText,evidence,SALT),[{field:'fecha_resolucion',sealed:'2026-08-03T12:03:55-05:00',edited:'2026-08-03T12:04:55-05:00'}]);
 assert.deepEqual(await sealedValues(v.changes[0],changed,evidence,SALT),[],'si el CSV local no coincide con el sello no se inventa el valor');
});
test('horas hábiles: jornada, fines de semana, borde SLA y fechas inválidas',()=>{
 assert.equal(businessHours('2026-07-03T16:00:00-05:00','2026-07-06T09:00:00-05:00'),2);
 assert.equal(businessHours('2026-07-04T08:00:00-05:00','2026-07-05T17:00:00-05:00'),0);
 assert.equal(businessHours('2026-07-01T06:00:00-05:00','2026-07-01T20:00:00-05:00'),9);
 assert.equal(businessHours('2026-07-01T08:00:00-05:00','2026-07-01T12:00:00-05:00'),4);
 assert.throws(()=>businessHours('2026-02-30T08:00:00-05:00','2026-03-01T08:00:00-05:00'));
 assert.throws(()=>businessHours('2026-07-02T08:00:00-05:00','2026-07-01T08:00:00-05:00'));
});
test('manifest no contiene valores de usuarios ni técnicos',()=>{
 const payload=JSON.stringify(evidence);for(const r of parsed.rows){assert.ok(!payload.includes(r.usuario));assert.ok(!payload.includes(r.tecnico_asignado));}
});test('sal: sin sal, con sal distinta o mal formada la verificación es INCOMPLETA',async()=>{
 assert.equal(evidence.version,EVIDENCE_VERSION);assert.equal(evidence.saltCommitment,await saltCommitment(SALT));
 assert.ok(!JSON.stringify(evidence).includes(SALT.slice(2)),'el manifiesto no lleva la sal');
 assert.ok(validSalt(SALT));assert.ok(!validSalt('0x1234'));assert.notEqual(newSalt(),SALT);
 for(const s of [undefined,null,'',newSalt(),'0x'+'00'.repeat(32),'0x'+'zz'.repeat(32)]){
  const v=await verifyText(ticketText,evidence,unitAnchor,aux,s);assert.equal(v.status,'INCOMPLETA');assert.match(v.errors[0],/sal/i);assert.equal(v.result,undefined);
 }
 await assert.rejects(buildEvidence(sources,baseline),/sal/i);
 const e=structuredClone(evidence);delete e.saltCommitment;assert.equal((await authenticateEvidence(e,unitAnchor)).ok,false);
});
test('privacidad del manifiesto: adivinar nombres no coincide con ningún hash; con la sal correcta sí',async()=>{
 const {createHash}=await import('node:crypto');
 const h=s=>'0x'+createHash('sha256').update(s).digest('hex');
 const events=csv(bitacoraText,BITACORA_HEADERS).rows,values=personalValues(parsed.rows,events).map(v=>v.value);
 assert.ok(values.length>=170);assert.ok(values.includes('Elena Dávila'));
 const published=new Set(evidence.tickets.flatMap(t=>[t.hash,...Object.values(t.fields)]));
 const zero='0x'+'00'.repeat(32);let tried=0;
 for(const value of values){
  // Esquema anterior (sin sal) en todas las columnas.
  for(const field of parsed.headers){tried++;assert.ok(!published.has(h(JSON.stringify([field,value]))),`esquema viejo: ${field}=${value}`);}
  // Esquema nuevo con una sal en ceros, en las columnas con datos personales de cada ticket.
  for(const t of evidence.tickets)for(const field of ['usuario','tecnico_asignado','unidad']){tried++;assert.ok(!published.has(h(JSON.stringify(['atenea-campo-v3',zero,t.id,field,value]))),`sal en ceros: ${t.id} ${field}=${value}`);}
 }
 assert.ok(tried>90000);
 // Control positivo: con la sal correcta el hash de «Elena Dávila» en TK-2026-04201 sí coincide.
 const ticket=evidence.tickets.find(t=>t.id==='TK-2026-04201');
 assert.equal(await fieldHash(SALT,'TK-2026-04201','usuario','Elena Dávila'),ticket.fields.usuario);
 assert.notEqual(await fieldHash(SALT,'TK-2026-04202','usuario','Elena Dávila'),ticket.fields.usuario,'el ID también entra en el hash');
});
