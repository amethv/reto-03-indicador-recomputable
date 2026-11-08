import Papa from 'papaparse';
import {CALENDAR,holidaySet} from './calendar.mjs';
import {HOURS_TOLERANCE,computeFindings,applyEdits} from './findings.mjs';
export const PERIOD = 202607;
export const POLICY = Object.freeze({version:'nivel1-v3',period:'2026-07',universe:'187 tickets del lote entregado; incluye 2 reportados en agosto',managed:'estado CERRADO, resolución y cierre válidos, cierre CONFIRMADO POR USUARIO o AUTOMATICO 7 DIAS',confirmed:'subconjunto gestionado con confirmado_por_usuario SI y tipo CONFIRMADO POR USUARIO',denominator:'todos los IDs únicos del lote entregado',sla:'horas hábiles calculadas, no condiciona el indicador de gestión; la bitácora corrige ediciones posteriores a la resolución',hoursTolerance:HOURS_TOLERANCE,evidenceFiles:'tickets, catálogo, reporte publicado, bitácora y reaperturas: solo sus SHA-256 entran en el compromiso',timezone:'UTC-05:00',hours:'lunes a viernes 08:00-17:00',holidays:CALENDAR.holidays,calendarVersion:CALENDAR.version,holidayNote:CALENDAR.status,cutoff:'estado final del lote, no corte estricto al 31 de julio'});
export const HEADERS = ['ticket_id','fecha_reporte','usuario','unidad','servicio_id','en_catalogo','prioridad','canal','nivel_resolucion','area_nivel2','tecnico_asignado','fecha_resolucion','horas_habiles_resolucion','sla_horas','cumple_sla','estado','tipo_cierre','confirmado_por_usuario','fecha_cierre','ticket_origen'];
export function csv(text, required=HEADERS) {
  const parsed=Papa.parse(text.replace(/^\uFEFF/,''),{header:false,skipEmptyLines:true,dynamicTyping:false});
  const errors=parsed.errors.map(e=>`CSV fila ${Number(e.row)+1}: ${e.message}`);
  const [headers=[],...values]=parsed.data;
  if(new Set(headers).size!==headers.length) errors.push('Encabezados duplicados');
  if(required.length!==headers.length || required.some(h=>!headers.includes(h))) errors.push('Encabezados distintos del esquema requerido');
  const rows=values.map((v,i)=>{if(v.length!==headers.length)errors.push(`Fila ${i+2}: número de celdas incorrecto`);return Object.fromEntries(headers.map((h,j)=>[h,v[j]??'']));});
  return {headers,rows,errors};
}
export function instant(value) {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-05:00$/.test(value)) return null;
  const ms=Date.parse(value); if(!Number.isFinite(ms))return null;
  return new Date(ms-5*3600000).toISOString().slice(0,19)===value.slice(0,19)?ms:null;
}
export function businessHours(start,end,holidays=CALENDAR.holidays) {
  const a=instant(start),b=instant(end);
  if(a===null||b===null||b<a)throw new Error('Intervalo de fechas inválido');
  const excluded=holidaySet(holidays);
  let total=0;
  const offset=5*3600000, day=86400000;
  for(let d=Math.floor((a-offset)/day)*day;d<=b-offset;d+=day){
    const weekday=new Date(d).getUTCDay(); if(weekday===0||weekday===6||excluded.has(new Date(d).toISOString().slice(0,10)))continue;
    total+=Math.max(0,Math.min(b,d+offset+17*3600000)-Math.max(a,d+offset+8*3600000));
  }
  return total/3600000;
}
export const CATALOG_HEADERS=['servicio_id','nombre','nivel_previsto','prioridad','sla_horas_habiles','area_nivel2'];
export const BITACORA_HEADERS=['evento_id','timestamp','actor','rol','accion','entidad_afectada','referencia','detalle','sistema','hash_evento'];
export const REOPEN_HEADERS=['reapertura_id','ticket_original','ticket_generado','dias_habiles_desde_cierre','debio_conservar_numero','motivo','fecha'];
export const SOURCES=Object.freeze({tickets:'tickets.csv',catalog:'catalogo_servicios.csv',report:'indicador_mensual.csv',bitacora:'bitacora_eventos.csv',reopenings:'reaperturas.csv'});
export const REPORT_HEADERS=['periodo','nombre_indicador','incidentes_recibidos_publicado','incidentes_gestionados_publicado','porcentaje_publicado','meta','cumple','responsable','fecha_publicacion','documento'];
export function validate(parsed,catalog) {
  const errors=[...parsed.errors], warnings=[], seen=new Set();
  if(!parsed.rows.length)errors.push('CSV sin tickets');
  if(!catalog.length||new Set(catalog.map(r=>r.servicio_id)).size!==catalog.length)errors.push('Catálogo vacío o con servicios duplicados');
  const services=new Map(catalog.map(r=>[r.servicio_id,r]));
  const limits={CRITICA:4,ALTA:8,MEDIA:24,BAJA:72};
  const states=['CERRADO','ABIERTO','EN PROCESO','RESUELTO','PENDIENTE'];
  const ids=parsed.rows.map(r=>r.ticket_id);
  for(const [index,r] of parsed.rows.entries()) {
    const id=r.ticket_id||`FILA-${index+2}`;
    if(!/^TK-2026-\d{5}$/.test(r.ticket_id))errors.push(`${id}: ID inválido`);
    if(seen.has(r.ticket_id))errors.push(`${id}: ID duplicado`);seen.add(r.ticket_id);
    for(const h of ['ticket_id','fecha_reporte','servicio_id','prioridad','estado','en_catalogo','canal','nivel_resolucion'])if(!r[h])errors.push(`${id}: falta ${h}`);
    if(!states.includes(r.estado))errors.push(`${id}: estado desconocido`);
    if(!(r.prioridad in limits))errors.push(`${id}: prioridad desconocida`);
    for(const h of ['en_catalogo','cumple_sla','confirmado_por_usuario'])if(!['SI','NO'].includes(r[h]))errors.push(`${id}: ${h} debe ser SI o NO`);
    if(!['1','2','3'].includes(r.nivel_resolucion))errors.push(`${id}: nivel inválido`);
    const service=services.get(r.servicio_id);
    if(!service) errors.push(`${id}: servicio ausente del catálogo`);
    else {
      if(service.prioridad!==r.prioridad)warnings.push(`${id}: prioridad distinta del catálogo`);
      if(Number(service.sla_horas_habiles)!==Number(r.sla_horas))warnings.push(`${id}: SLA declarado distinto del catálogo`);
      if(Number(service.sla_horas_habiles)!==limits[service.prioridad])errors.push(`${id}: catálogo con SLA no reconocido`);
    }
    for(const h of ['fecha_reporte','fecha_resolucion','fecha_cierre'])if((h==='fecha_reporte'||r[h])&&instant(r[h])===null)errors.push(`${id}: ${h} inválida`);
    if(r.fecha_resolucion&&instant(r.fecha_resolucion)<instant(r.fecha_reporte))errors.push(`${id}: resolución anterior al reporte`);
    if(r.fecha_cierre&&instant(r.fecha_cierre)<instant(r.fecha_resolucion))errors.push(`${id}: cierre anterior a resolución`);
    if(r.estado==='CERRADO'&&(!r.fecha_resolucion||!r.fecha_cierre))errors.push(`${id}: cierre sin fechas completas`);
    if(r.estado==='CERRADO'&&!['CONFIRMADO POR USUARIO','AUTOMATICO 7 DIAS'].includes(r.tipo_cierre))errors.push(`${id}: tipo de cierre inválido`);
    if(r.tipo_cierre==='CONFIRMADO POR USUARIO'&&r.confirmado_por_usuario!=='SI')errors.push(`${id}: cierre confirmado sin confirmación`);
    if(r.tipo_cierre==='AUTOMATICO 7 DIAS'&&r.confirmado_por_usuario!=='NO')errors.push(`${id}: cierre automático con confirmación contradictoria`);
    if(r.estado!=='CERRADO'&&(r.tipo_cierre||r.fecha_cierre))errors.push(`${id}: estado y cierre inconsistentes`);
    for(const h of ['sla_horas','horas_habiles_resolucion'])if(r[h]!==''&&(!/^\d+(\.\d+)?$/.test(r[h])||Number(r[h])<0))errors.push(`${id}: ${h} inválido`);
    if(r.fecha_reporte?.slice(0,7)!=='2026-07')warnings.push(`${id}: reporte fuera de julio (${r.fecha_reporte})`);
  }
  for(const r of parsed.rows)if(r.ticket_origen&&!ids.includes(r.ticket_origen))warnings.push(`${r.ticket_id}: ticket_origen fuera del lote`);
  return {errors,warnings};
}
export function calculate(parsed,catalog) {
  const validation=validate(parsed,catalog); if(validation.errors.length)throw new Error(validation.errors.join('\n'));
  const service=new Map(catalog.map(r=>[r.servicio_id,r]));
  const details=parsed.rows.map(r=>{
    const hours=r.fecha_resolucion?businessHours(r.fecha_reporte,r.fecha_resolucion):null;
    const sla=Number(service.get(r.servicio_id).sla_horas_habiles);
    const managed=r.estado==='CERRADO'&&!!r.fecha_resolucion&&!!r.fecha_cierre&&['CONFIRMADO POR USUARIO','AUTOMATICO 7 DIAS'].includes(r.tipo_cierre);
    const confirmed=managed&&r.confirmado_por_usuario==='SI'&&r.tipo_cierre==='CONFIRMADO POR USUARIO';
    const within=hours===null?null:hours<=sla+1e-9;
    const discrepancies=[];
    if(hours!==null&&Math.abs(hours-Number(r.horas_habiles_resolucion))>HOURS_TOLERANCE+1e-9)discrepancies.push('horas declaradas');
    if(Number(r.sla_horas)!==sla)discrepancies.push('SLA declarado');
    if(within!==null&&within!==(r.cumple_sla==='SI'))discrepancies.push('cumple_sla');
    return {declaredHours:Number(r.horas_habiles_resolucion),declaredSLA:Number(r.sla_horas),declaredWithin:r.cumple_sla,id:r.ticket_id,priority:r.prioridad,reported:r.fecha_reporte,resolved:r.fecha_resolucion,closed:r.fecha_cierre,hours,sla,within,type:r.tipo_cierre,confirmation:r.confirmado_por_usuario,managed,confirmed,discrepancies,reason:managed?'Incluido A: cerrado con fechas y tipo de cierre válido':'Excluido A: no cumple regla de gestionado',reasonB:confirmed?'Incluido B: confirmación explícita':'Excluido B: sin cierre y confirmación explícita'};
  });
  const denominator=details.length, numeratorA=details.filter(r=>r.managed).length,numeratorB=details.filter(r=>r.confirmed).length;
  const percentA=numeratorA/denominator*100,percentB=numeratorB/denominator*100;
  return {denominator,numeratorA,numeratorB,percentA,percentB,gap:percentA-percentB,automatic:details.filter(r=>r.managed&&r.type==='AUTOMATICO 7 DIAS').length,calendarJuly:details.filter(r=>r.reported.startsWith('2026-07')).length,details,warnings:validation.warnings};
}
const enc=new TextEncoder();
export async function sha(data) {const bytes=typeof data==='string'?enc.encode(data):data;return '0x'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
function bytes(hex){if(!/^0x[0-9a-f]{64}$/.test(hex))throw new Error('Hash inválido');return Uint8Array.from(hex.slice(2).match(/../g),b=>parseInt(b,16));}
export async function parent(left,right){return sha(new Uint8Array([1,...bytes(left),...bytes(right)]));}
export async function leaf(parsed,row,index){return sha(new Uint8Array([0,...enc.encode(JSON.stringify(['atenea-ticket-v1',index,parsed.headers.map(h=>[h,row[h]])]))]));}
export async function merkle(leaves){
  if(!leaves.length)throw new Error('Árbol vacío');
  const levels=[leaves];while(levels.at(-1).length>1){const current=levels.at(-1),next=[];for(let i=0;i<current.length;i+=2)next.push(await parent(current[i],current[i+1]||current[i]));levels.push(next);}
  return {root:levels.at(-1)[0],proofs:leaves.map((_,i)=>{const path=[];for(let l=0;l<levels.length-1;l++){const a=levels[l];path.push({side:i%2?'left':'right',hash:a[i^1]||a[i]});i=Math.floor(i/2);}return path;})};
}
export async function proofValid(hash,proof,root){try{for(const step of proof){if(!['left','right'].includes(step.side))return false;hash=step.side==='left'?await parent(step.hash,hash):await parent(hash,step.hash);}return hash===root;}catch{return false;}}
function parseAux(t){
  const parsed={catalog:csv(t.catalog??'',CATALOG_HEADERS),report:csv(t.report??'',REPORT_HEADERS),bitacora:csv(t.bitacora??'',BITACORA_HEADERS),reopenings:csv(t.reopenings??'',REOPEN_HEADERS)};
  return {parsed,errors:Object.values(parsed).flatMap(p=>p.errors)};
}
/** sources: {tickets,catalog,report,bitacora,reopenings} como texto. */
export async function buildEvidence(sources,baseline){
  for(const key of Object.keys(SOURCES))if(typeof sources?.[key]!=='string')throw new Error(`Falta ${SOURCES[key]}`);
  const parsed=csv(sources.tickets),aux=parseAux(sources);
  if(aux.errors.length)throw new Error(aux.errors.join('\n'));
  const checked=validate(parsed,aux.parsed.catalog.rows);if(checked.errors.length)throw new Error(checked.errors.join('\n'));
  if(parsed.rows.length!==187)throw new Error('Se requieren exactamente 187 tickets originales');
  const files={};for(const key of Object.keys(SOURCES))files[key]=await sha(sources[key]);
  for(const key of Object.keys(files))if(files[key]!==baseline.files[key])throw new Error(`${SOURCES[key]}: no coincide con los originales de la carpeta fuente verificada`);
  const ids=parsed.rows.map(r=>r.ticket_id);if(JSON.stringify(ids)!==JSON.stringify(baseline.ids))throw new Error('Universo original incompleto o reordenado');
  const hashes=await Promise.all(parsed.rows.map((r,i)=>leaf(parsed,r,i))),tree=await merkle(hashes);
  const tickets=await Promise.all(parsed.rows.map(async(r,i)=>({id:r.ticket_id,index:i,hash:hashes[i],fields:Object.fromEntries(await Promise.all(parsed.headers.map(async h=>[h,await sha(JSON.stringify([h,r[h]]))]))),proof:tree.proofs[i]})));
  return {version:2,period:PERIOD,count:ids.length,policy:POLICY,headers:parsed.headers,files,root:tree.root,tickets};
}
export const evidenceHash=e=>sha(JSON.stringify(e));
export async function authenticateEvidence(e,seal) {
  try {
    if(e.version!==2||e.period!==PERIOD||e.count!==187||e.tickets.length!==e.count)throw new Error('Manifiesto incompleto');
    if(JSON.stringify(e.policy)!==JSON.stringify(POLICY))throw new Error('Reglas del manifiesto no reconocidas');
    if(JSON.stringify(Object.keys(e.files??{}))!==JSON.stringify(Object.keys(SOURCES)))throw new Error('Manifiesto sin las huellas de todos los archivos sellados');
    if(e.root!==seal.root||await evidenceHash(e)!==seal.evidenceHash||Number(seal.count)!==187)throw new Error('Evidencia no coincide con blockchain');
    if(new Set(e.tickets.map(r=>r.id)).size!==187)throw new Error('IDs duplicados en evidencia');
    if((await merkle(e.tickets.map(r=>r.hash))).root!==e.root)throw new Error('Raíz de evidencias incorrecta');
    for(const [i,r] of e.tickets.entries())if(r.index!==i||!(await proofValid(r.hash,r.proof,e.root)))throw new Error(`Prueba inválida: ${r.id}`);
    return {ok:true};
  }catch(error){return {ok:false,error:error.message};}
}
/** aux: {catalog,report,bitacora,reopenings} como texto. */
export async function verifyText(text,e,seal,aux){
  const auth=await authenticateEvidence(e,seal);if(!auth.ok)return {status:'INCOMPLETA',errors:[auth.error],changes:[]};
  const parsed=csv(text),changes=[],original=new Map(e.tickets.map(r=>[r.id,r])),seen=new Set();
  for(const [i,r] of parsed.rows.entries()){
    const id=r.ticket_id||`FILA-${i+2}`,expected=original.get(id);
    if(seen.has(id))changes.push({id,kind:'ID duplicado',fields:[]});seen.add(id);
    if(!expected){changes.push({id,kind:'Ticket insertado o ID cambiado',fields:[]});continue;}
    const hash=await leaf(parsed,r,i);
    if(hash!==expected.hash){
      const fields=[];for(const h of new Set([...e.headers,...parsed.headers]))if(await sha(JSON.stringify([h,r[h]]))!==expected.fields[h])fields.push(h);
      changes.push({id,kind:expected.index!==i?'Contenido u orden modificado':'Contenido modificado',fields,values:Object.fromEntries(fields.map(h=>[h,r[h]??'']))});
    }
  }
  for(const r of e.tickets)if(!seen.has(r.id))changes.push({id:r.id,kind:'Ticket eliminado',fields:[]});
  const rawMatch=await sha(text)===e.files.tickets;
  const root=parsed.rows.length?(await merkle(await Promise.all(parsed.rows.map((r,i)=>leaf(parsed,r,i))))).root:null;
  const {parsed:a,errors:auxErrors}=parseAux(aux??{});
  const errors=[...parsed.errors,...auxErrors,...validate(parsed,a.catalog.rows).errors];
  const mismatched=[];for(const key of ['catalog','report','bitacora','reopenings'])if(typeof aux?.[key]!=='string'||await sha(aux[key])!==e.files[key])mismatched.push(SOURCES[key]);
  const auxiliaries=!mismatched.length;
  if(!rawMatch||root!==seal.root||changes.length||parsed.rows.length!==187)return {status:'ROJO',changes,errors,root,rawMatch,individuals:e.tickets.length,auxiliaries};
  if(errors.length||!auxiliaries)return {status:'INCOMPLETA',changes,errors:[...errors,...mismatched.map(f=>`${f} no coincide con el archivo sellado`)],root};
  const result=calculate(parsed,a.catalog.rows);
  const reportRow=a.report.rows.find(r=>r.periodo==='2026-07');
  const published=Number(reportRow?.porcentaje_publicado);
  if(!Number.isFinite(published))return {status:'INCOMPLETA',changes:[],errors:['Reporte publicado inválido']};
  const findings=computeFindings({tickets:parsed.rows,catalog:a.catalog.rows,reportRow,events:a.bitacora.rows,reopenings:a.reopenings.rows,result});
  result.details=applyEdits(result.details,findings.edits);
  return {status:'VERDE',changes:[],errors:[],root,individuals:187,result,findings,published,publishedNumerator:Number(reportRow.incidentes_gestionados_publicado),publishedDenominator:Number(reportRow.incidentes_recibidos_publicado),difference:result.percentA-published};
}

/** Para el ROJO: valor sellado frente al editado, si el CSV original local coincide con el sello. */
export async function sealedValues(change,originalText,e){
  if(!change.fields?.length||!originalText)return [];
  const row=csv(originalText).rows.find(r=>r.ticket_id===change.id),expected=e.tickets.find(t=>t.id===change.id);
  if(!row||!expected)return [];
  const out=[];
  for(const field of change.fields){
    const sealed=row[field]??'';
    if(await sha(JSON.stringify([field,sealed]))!==expected.fields[field])continue; // no se puede derivar con certeza
    out.push({field,sealed,edited:change.values?.[field]??''});
  }
  return out;
}
