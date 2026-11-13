// Vista #/proveedor · Reloj del proveedor, explicado por roles.
// Municipio → firma la apertura. Proveedor 1 → firma sus respuestas. Auditor externo → recalcula sin llaves.
// Usa siempre el RelojProveedor de la red local (por /rpc), aunque la red elegida para el sellado sea Sepolia.
import {Contract,JsonRpcProvider} from 'ethers';
import {ABI_RELOJ,idHash,parseCasos,abrirCasos,responderCasos,recalcularComoTercero,motivoRevert,usd} from './reloj.mjs';
import {csv} from './core.mjs';

// En pantalla: «Proveedor 1», «Proveedor 2». En la cadena siguen los ids hasheados; la razón social nunca va a la cadena.
const nombreProveedor=id=>`Proveedor ${Number(String(id).replace(/\D/g,''))}`;
const short=a=>a?`${a.slice(0,6)}…${a.slice(-4)}`:'—';
const horas=s=>(s/3600).toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2});
const fecha=s=>new Date(s*1000).toLocaleString('es-EC',{timeZone:'America/Guayaquil',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const ROLES={municipio:'roleMunicipio',proveedor:'roleProveedor',auditor:'roleAuditor'};
const ACCIONES={municipio:'loadCases',proveedor:'answerCases',auditor:'thirdParty'};
const ROL_DEL_PASO={1:'municipio',2:'proveedor',3:'auditor'};
const NOMBRE_ROL={municipio:'Como municipio',proveedor:'Como proveedor 1',auditor:'Como auditor externo'};

/**
 * ctx: {$, esc, run, setDone(bool)}
 * Devuelve {refresh()} para releer la cadena al entrar en la vista.
 */
export function initProveedor(ctx){
 const {$,esc}=ctx;
 let reloj=null,provider=null,casos=null,razones=new Map(),rol='municipio',estado=null,auditoria=null;
 const rechazados=new Map();   // id del caso → motivo del contrato (conocido en esta sesión o comprobado sin enviar)
 const rpc=()=>new URL('/rpc',location.href).href;
 const status=(text,kind='info')=>{$('caseStatus').className=`status ${kind}`;$('caseStatus').textContent=text;};

 async function asegurar(){
  if(!provider){provider=new JsonRpcProvider(rpc(),undefined,{cacheTimeout:-1});provider.pollingInterval=100;}
  if(!reloj){const r=await fetch('/evidencias/reloj-local.json');if(!r.ok)throw new Error('No hay un reloj del proveedor desplegado en este servidor.');reloj=await r.json();}
  if(!casos)casos=parseCasos(await (await fetch('/datos/tickets_proveedor.csv')).text());
  if(!razones.size){try{const r=await fetch('/datos/proveedores.csv');if(r.ok)razones=new Map(csv(await r.text()).rows.map(x=>[x.proveedor_id,x.razon_social]));}catch{}}
 }
 const contrato=()=>new Contract(reloj.address,ABI_RELOJ,provider);
 const cuentaDe=id=>reloj.proveedores.find(p=>p.id===id)?.cuenta;
 const signerFor=id=>provider.getSigner(cuentaDe(id));

 // Estado del flujo leído de la cadena: qué casos están abiertos, respondidos y con qué penalidad.
 async function leerEstado(){
  const k=contrato(),filas=[];
  for(const c of casos){
   const id=idHash(c.id),e=await k.casos(id);
   filas.push({c,id,abierto:e.abierto,respondido:e.respondido,apertura:Number(e.apertura),respuesta:Number(e.respuesta),penalidad:e.respondido?await k.penalidad(id):null});
  }
  // Si el proveedor ya actuó, los casos abiertos sin respuesta se comprueban sin enviar nada: así se sabe cuál rechazó el contrato.
  if(filas.some(f=>f.respondido))for(const f of filas)if(f.abierto&&!f.respondido&&!rechazados.has(f.c.id)){
   try{await k.connect(await signerFor(f.c.proveedorId)).responder.staticCall(f.id,f.c.respuesta);}catch(e){rechazados.set(f.c.id,motivoRevert(e));}
  }
  for(const f of filas)f.rechazado=!f.respondido&&f.abierto&&rechazados.has(f.c.id);
  const abiertos=filas.filter(f=>f.abierto).length,respondidos=filas.filter(f=>f.respondido).length,rech=filas.filter(f=>f.rechazado).length;
  const total=filas.reduce((s,f)=>s+(f.penalidad??0n),0n);
  const paso=abiertos<casos.length?1:respondidos+rech<casos.length?2:auditoria?.coincide&&auditoria.address===reloj.address?4:3;
  estado={filas,abiertos,respondidos,rechazados:rech,total,paso};
 }

 function pintarRol(){
  for(const [r,id] of Object.entries(ROLES)){const b=$(id);b.setAttribute('aria-selected',String(r===rol));b.classList.toggle('active',r===rol);b.classList.toggle('next-role',!!estado&&ROL_DEL_PASO[estado.paso]===r&&r!==rol);}
  for(const [r,id] of Object.entries(ACCIONES))$(id).hidden=r!==rol||!reloj;
  if(!reloj){$('signers').replaceChildren();return;}
  const p1=reloj.proveedores[0],lista=(titulo,items,cls)=>`<div class="role-list ${cls}"><p>${titulo}</p><ul>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`;
  const tarjeta={
   municipio:{nombre:'Municipio de San Ramón de Altamira',sub:'Abre los casos que escala al proveedor.',llave:`Llave: cuenta 0 · ${short(reloj.municipio)}`,titulo:reloj.municipio,
    puede:['Firmar la apertura de cada caso, una sola vez.','Fijar la fecha y hora de apertura.'],noPuede:['Responder casos.','Cambiar una apertura ya firmada.']},
   proveedor:{nombre:nombreProveedor(p1.id),razon:razones.get(p1.id),sub:'Responde los casos que el municipio le abrió.',llave:`Llave: cuenta 1 · ${short(p1.cuenta)}`,titulo:p1.cuenta,
    puede:['Firmar la respuesta de sus casos, una sola vez.'],noPuede:['Abrir casos.','Responder antes de la apertura.','Responder casos de otro proveedor.']},
   auditor:{nombre:'Auditor externo',sub:'Cualquier persona u organismo de control.',llave:'Sin llave: solo lee la cadena.',titulo:'',
    puede:['Leer los eventos del contrato.','Recalcular horas y penalidades.','Compararlas con las del contrato.'],noPuede:['Firmar nada.','Cambiar ningún dato.']}
  }[rol];
  $('signers').innerHTML=`<div class="role-who"><strong>${esc(tarjeta.nombre)}</strong>${tarjeta.razon?`<span class="razon">${esc(tarjeta.razon)}</span>`:''}<span>${esc(tarjeta.sub)}</span><span class="hash"${tarjeta.titulo?` title="${esc(tarjeta.titulo)}"`:''}>${esc(tarjeta.llave)}</span></div>
   ${lista('Puede',tarjeta.puede,'can')}${lista('No puede',tarjeta.noPuede,'cannot')}`;
 }

 function pintarGuia(){
  if(!estado){$('roleGuide').textContent='';return;}
  const textos={1:'Paso 1 de 3 · Le toca al municipio: firmar la apertura de los 9 casos.',2:'Paso 2 de 3 · Le toca al proveedor 1: firmar sus respuestas.',3:'Paso 3 de 3 · Le toca al auditor externo: recalcular sin llaves.',4:'Flujo completo · El auditor recalculó sin llaves y todo coincide con el contrato.'};
  const sigue=ROL_DEL_PASO[estado.paso];
  $('roleGuide').innerHTML=`<strong>${esc(textos[estado.paso])}</strong>${sigue&&sigue!==rol?` Cambia a «${esc(NOMBRE_ROL[sigue])}».`:''}`;
 }

 function pintarTabla(){
  if(!estado){$('cases').replaceChildren();$('caseTotal').replaceChildren();$('caseRejected').replaceChildren();return;}
  const {filas,respondidos,rechazados:rech,total}=estado,hay=respondidos+rech>0;
  $('caseTotal').innerHTML=`<article class="metric"><h3>Casos aceptados</h3><p class="metric-value">${hay?respondidos:'—'}</p></article>
   <article class="metric"><h3>Rechazados</h3><p class="metric-value${rech?' bad':''}">${hay?rech:'—'}</p></article>
   <article class="metric"><h3>Penalidades</h3><p class="metric-value case-total">${hay?esc(usd(total)):'—'}</p></article>`;
  $('caseRejected').innerHTML=filas.filter(f=>f.rechazado).map(f=>`<div class="status red"><strong>${esc(f.c.id)}</strong> · Rechazado por el contrato: respuesta anterior a la apertura. El CSV lo reportaba como cumplido con ${esc(usd(BigInt(f.c.declarado.penalidadCentavos)))}.</div>`).join('');
  const quien=nombreProveedor(filas[0]?.c.proveedorId??'PV-01').toLowerCase();
  $('cases').innerHTML=filas.map(f=>{
   const ap=f.abierto?`${esc(fecha(f.apertura))}<br><span class="sig-tag">firma municipio</span>`:'<span class="pending-cell">pendiente</span>';
   const firma=`firma ${nombreProveedor(f.c.proveedorId).toLowerCase()}`;
   const resp=f.respondido?`${esc(fecha(f.respuesta))}<br><span class="sig-tag">${esc(firma)}</span>`:f.rechazado?`${esc(fecha(f.c.respuesta))}<br><span class="rej-tag">rechazada: anterior a la apertura</span>`:'<span class="pending-cell">pendiente</span>';
   const h=f.respondido?horas(f.respuesta-f.apertura):f.rechazado?horas(f.c.respuesta-f.c.apertura):'—';
   const pen=f.respondido?`<span class="pen-pill ${f.penalidad>0n?'bad':'ok'}">${esc(usd(f.penalidad))}</span>`:f.rechazado?'<span class="pen-pill bad">rechazado</span>':'—';
   const a=auditoria&&auditoria.address===reloj.address?auditoria.porCaso.get(f.id):null;
   const aud=!a?'—':a.penalidad===null?'<span class="small">sin respuesta en la cadena</span>':`${esc(usd(a.penalidad))}<br><span class="${a.coincide?'match':'nomatch'}">${a.coincide?'✓ coincide':'NO coincide'}</span>`;
   return `<tr${f.rechazado?' class="rejected"':''} data-caso="${esc(f.id)}"><td><strong>${esc(f.c.id)}</strong></td><td>${ap}</td><td>${resp}</td><td>${h}</td><td>${pen}</td><td class="third">${aud}</td></tr>`;
  }).join('');
  $('thirdTotal').innerHTML=auditoria&&auditoria.address===reloj.address?`Recalculado por el auditor desde los eventos, sin llaves ni CSV: <strong>${esc(usd(auditoria.total))}</strong> · <span class="${auditoria.coincide?'match':'nomatch'}">${auditoria.coincide?'coincide con el contrato':'NO coincide con el contrato'}</span>`:'';
  $('otherProviders').textContent=`Todos los casos de julio son del ${quien}. El proveedor 2${razones.get('PV-02')?` (${razones.get('PV-02')})`:''} está registrado en el contrato, pero no tuvo casos este mes.`;
 }
 const pintar=()=>{pintarRol();pintarGuia();pintarTabla();};

 async function refresh(){
  try{await asegurar();await leerEstado();if(!$('caseStatus').dataset.touched)status('Elige un rol para ver qué puede hacer y firmar su paso.');}
  catch(e){estado=null;status(`El reloj del proveedor no está disponible · ${e.message}`,'pending');console.error(e);}
  pintar();
 }
 const accion=fn=>()=>ctx.run(async()=>{$('caseStatus').dataset.touched='1';try{await asegurar();await fn();}catch(e){status(`No se pudo completar el paso · ${e.message}`,'pending');console.error(e);}try{await leerEstado();}catch(e){console.error('leerEstado',e);}pintar();});

 for(const [r,id] of Object.entries(ROLES))$(id).onclick=()=>{rol=r;pintar();};

 // Municipio: firma la apertura. Si ya la firmó, lo dice con el motivo del contrato, sin enviar nada.
 $('loadCases').onclick=accion(async()=>{
  const municipio=await provider.getSigner(reloj.municipio);let n=0;
  const r=await abrirCasos(contrato(),municipio,casos,s=>{n++;status(`Firmando apertura ${n} · ${s.id} · firma del municipio (${short(s.cuenta)})`);});
  if(!r.abiertos)return status(`El municipio ya firmó la apertura de los ${casos.length} casos. El contrato no permite firmar dos veces: «${r.motivo}».`,'pending');
  status(`El municipio firmó la apertura de ${r.abiertos} casos con su llave (${short(reloj.municipio)}). Sigue el proveedor 1.`);
 });

 // Proveedor 1: firma sus respuestas. Antes de la apertura no envía nada y explica por qué.
 $('answerCases').onclick=accion(async()=>{
  let n=0;
  const res=await responderCasos(contrato(),signerFor,casos,s=>{n++;if(s.estado==='ACEPTADO')status(`Firmando respuesta ${n} · ${s.id} · firma del ${nombreProveedor(casos[0].proveedorId).toLowerCase()} (${short(s.cuenta)})`);});
  for(const r of res)if(r.estado==='RECHAZADO')rechazados.set(r.id,r.motivo);
  const sin=res.filter(r=>r.estado==='SIN_APERTURA'),acept=res.filter(r=>r.estado==='ACEPTADO'),ya=res.filter(r=>r.estado==='YA_RESPONDIDO'),rech=res.filter(r=>r.estado==='RECHAZADO');
  if(sin.length===res.length)return status(`Todavía no le toca al proveedor 1: el municipio aún no firmó la apertura. El contrato lo rechazaría: «${sin[0].motivo}».`,'pending');
  if(!acept.length&&ya.length)return status(`El proveedor 1 ya respondió sus ${ya.length} casos válidos. El contrato no permite responder dos veces.${rech.length?` ${rech.map(r=>r.id).join(', ')} sigue rechazado: anterior a la apertura.`:''}`,'pending');
  status(`${acept.length+ya.length+rech.length} casos procesados: ${acept.length+ya.length} aceptados y ${rech.length} rechazado por el contrato.${sin.length?` ${sin.length} siguen sin apertura.`:''}`);
 });

 // Auditor externo: sin llaves ni CSV. Lee los eventos con un proveedor de solo lectura y compara con penalidad().
 $('thirdParty').onclick=accion(async()=>{
  const lector=new JsonRpcProvider(rpc(),undefined,{cacheTimeout:-1});
  let t;try{t=await recalcularComoTercero(lector,reloj.address,reloj.deploymentBlock);}finally{lector.destroy();}
  if(!t.casos.length)return status('Aún no hay casos en la cadena: el auditor no tiene nada que recalcular. Primero firman el municipio y el proveedor 1.','pending');
  auditoria={address:reloj.address,porCaso:new Map(t.casos.map(c=>[c.casoId,c])),total:t.total,coincide:t.coincide};
  const recalculadas=t.casos.filter(c=>c.penalidad!==null).length;
  status(`Auditor: ${t.casos.length} casos leídos de los eventos, sin llaves; ${recalculadas} penalidades recalculadas, ${t.coincide?'todas coinciden':'hay diferencias'} con el contrato.`,t.coincide?'green':'red');
  await leerEstado();if(estado.paso===4)ctx.setDone(true);
 });

 // Reiniciar: un RelojProveedor nuevo en la red local, para repetir la explicación desde cero.
 $('resetReloj').onclick=()=>ctx.run(async()=>{
  try{
   const r=await fetch('/api/reloj/reiniciar',{method:'POST'});if(!r.ok)throw new Error(await r.text()||`HTTP ${r.status}`);
   reloj=await r.json();rechazados.clear();auditoria=null;rol='municipio';ctx.setDone(false);
   await leerEstado();status(`Simulación reiniciada: se desplegó un reloj nuevo en la red local (${short(reloj.address)}). Paso 1: el municipio firma la apertura.`);
  }catch(e){status(`No se pudo reiniciar la simulación · ${e.message}`,'pending');console.error(e);}
  pintar();
 });

 refresh();
 return {refresh};
}
