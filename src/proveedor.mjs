// Vista #/proveedor (reloj del proveedor). El municipio abre cada caso y el proveedor responde, cada uno con su cuenta.
// «Recalcular como tercero» no usa llaves ni el CSV: lee los eventos y compara con penalidad() del contrato.
import {Contract,JsonRpcProvider,keccak256} from 'ethers';
import {ABI_RELOJ,parseCasos,cargarCasos,recalcularComoTercero,usd} from './reloj.mjs';
import {csv} from './core.mjs';

// En pantalla: «Proveedor 1», «Proveedor 2». En la cadena siguen los ids hasheados; la razón social nunca va a la cadena.
const nombreProveedor=id=>`Proveedor ${Number(String(id).replace(/\D/g,''))}`;

const short=a=>a?`${a.slice(0,6)}…${a.slice(-4)}`:'—';
const horas=s=>(s/3600).toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2});
const fecha=s=>new Date(s*1000).toLocaleString('es-EC',{timeZone:'America/Guayaquil',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});

/**
 * ctx: {$, esc, run, getProvider, getReloj, rpcUrl, markDone}
 * Devuelve {reset()} para limpiar la vista al cambiar de red.
 */
export function initProveedor(ctx){
 const {$,esc}=ctx;let filas=null,razones=new Map();
 const status=(text,kind='info')=>{$('caseStatus').className=`status ${kind}`;$('caseStatus').textContent=text;};
 const etiqueta=(reloj,cuenta)=>{if(cuenta?.toLowerCase()===reloj.municipio.toLowerCase())return 'Municipio';const p=reloj.proveedores.find(x=>x.cuenta.toLowerCase()===cuenta?.toLowerCase());return p?nombreProveedor(p.id):short(cuenta);};
 // Razón social solo para mostrarla debajo del nombre; se lee del archivo de proveedores del servidor.
 async function cargarRazones(){if(razones.size)return;try{const r=await fetch('/datos/proveedores.csv');if(r.ok)razones=new Map(csv(await r.text()).rows.map(x=>[x.proveedor_id,x.razon_social]));}catch{}}

 function firmantes(reloj){
  $('signers').innerHTML=`<p class="verdict-label">Quién firma cada paso</p><ul class="signer-list">
   <li><strong>Municipio</strong><span>abre los casos</span><span class="hash" title="${esc(reloj.municipio)}">cuenta 0 · ${esc(short(reloj.municipio))}</span></li>
   ${reloj.proveedores.map((p,i)=>`<li><strong>${esc(nombreProveedor(p.id))}</strong>${razones.has(p.id)?`<span class="razon">${esc(razones.get(p.id))}</span>`:''}<span>responde sus casos</span><span class="hash" title="${esc(p.cuenta)}">cuenta ${i+1} · ${esc(short(p.cuenta))}</span></li>`).join('')}</ul>`;
 }
 function reset(){
  filas=null;$('caseResults').hidden=true;$('thirdParty').hidden=true;$('cases').replaceChildren();$('caseTotal').replaceChildren();$('caseRejected').replaceChildren();
  const reloj=ctx.getReloj();
  if(reloj){firmantes(reloj);cargarRazones().then(()=>{if(ctx.getReloj()===reloj)firmantes(reloj);});status('Sin casos cargados en esta sesión.');$('loadCases').hidden=false;}
  else{$('signers').replaceChildren();status('El reloj del proveedor corre en la red local. Cambia a «Local (Ganache)» para usarlo.');$('loadCases').hidden=true;}
 }

 function pintar(reloj){
  const aceptados=filas.filter(f=>f.estado==='ACEPTADO'),rechazados=filas.filter(f=>f.estado==='RECHAZADO');
  const total=aceptados.reduce((s,f)=>s+f.penalidadContrato,0n),conPenalidad=aceptados.filter(f=>f.penalidadContrato>0n).length;
  $('caseTotal').innerHTML=`<p class="verdict-label">Penalidades calculadas por el contrato</p><p class="verdict-main case-total"><strong>${esc(usd(total))}</strong></p>
   <p class="verdict-sub"><strong>${aceptados.length}</strong> casos aceptados · <strong>${rechazados.length}</strong> rechazado · <strong>${conPenalidad}</strong> con penalidad</p><p id="thirdTotal" class="verdict-sub"></p>`;
  $('caseRejected').innerHTML=rechazados.map(f=>`<div class="status red"><strong>${esc(f.id)}</strong> · Rechazado por el contrato: respuesta anterior a la apertura. El CSV lo reportaba como cumplido con ${esc(usd(BigInt(f.csv.declarado.penalidadCentavos)))}.</div>`).join('');
  $('cases').innerHTML=filas.map(f=>{
   const razon=razones.get(f.csv.proveedorId);
   const firmas=`<td class="small" title="Abre ${esc(f.cuentaMunicipio)} · responde ${esc(f.cuentaProveedor)}">${esc(etiqueta(reloj,f.cuentaMunicipio))} → ${esc(etiqueta(reloj,f.cuentaProveedor))}${razon?`<br><span class="razon">${esc(razon)}</span>`:''}${f.estado==='RECHAZADO'?'<br>(respuesta rechazada)':''}</td>`;
   const declarada=`<td>${esc(usd(BigInt(f.csv.declarado.penalidadCentavos)))}<br><span class="small">${esc(f.csv.declarado.horas.toLocaleString('es-EC'))} h · cumple ${esc(f.csv.declarado.cumple)}</span></td>`;
   if(f.estado==='RECHAZADO')return `<tr class="rejected" data-caso="${esc(f.casoId)}"><td><strong>${esc(f.id)}</strong></td>${firmas}<td>${esc(fecha(f.apertura))}</td><td>${esc(fecha(f.csv.respuesta))}<br><span class="small">(no aceptada)</span></td><td>${esc(horas(f.csv.respuesta-f.csv.apertura))}</td><td>${esc(horas(f.sla))}</td><td colspan="2"><strong>RECHAZADO</strong><br>${esc(f.motivo)}</td>${declarada}<td class="third">—</td></tr>`;
   const d=f.respuesta-f.apertura,cumple=d<=f.sla;
   return `<tr data-caso="${esc(f.casoId)}"><td><strong>${esc(f.id)}</strong></td>${firmas}<td>${esc(fecha(f.apertura))}</td><td>${esc(fecha(f.respuesta))}</td><td>${esc(horas(d))}</td><td>${esc(horas(f.sla))}</td><td>${cumple?'Sí':'No'}</td><td class="pen"><strong>${esc(usd(f.penalidadContrato))}</strong></td>${declarada}<td class="third">—</td></tr>`;
  }).join('');
  $('caseResults').hidden=false;$('thirdParty').hidden=false;
 }

 $('loadCases').onclick=()=>ctx.run(async()=>{
  const reloj=ctx.getReloj(),provider=ctx.getProvider();
  try{
   if(!reloj)throw new Error('No hay un reloj del proveedor desplegado en esta red.');
   if(keccak256(await provider.getCode(reloj.address))!==reloj.codeHash)throw new Error('El bytecode del reloj no coincide con el desplegado.');
   const casos=parseCasos(await (await fetch('/datos/tickets_proveedor.csv')).text());await cargarRazones();
   const contract=new Contract(reloj.address,ABI_RELOJ,provider),municipio=await provider.getSigner(reloj.municipio);
   const signers=new Map(await Promise.all(reloj.proveedores.map(async p=>[p.id,await provider.getSigner(p.cuenta)])));
   let paso=0;const totalPasos=casos.length*2;
   const resultados=await cargarCasos(contract,municipio,id=>signers.get(id),casos,s=>{
    paso++;const quien=s.paso==='apertura'?`apertura firmada por el municipio (${short(s.cuenta)})`:s.estado==='RECHAZADO'?`respuesta de ${etiqueta(reloj,s.cuenta)} (${short(s.cuenta)}) rechazada: ${s.motivo}`:`respuesta firmada por ${etiqueta(reloj,s.cuenta)} (${short(s.cuenta)})`;
    status(`Paso ${paso} de ${totalPasos} · ${s.id}: ${quien}${s.tx===null&&s.estado!=='RECHAZADO'?' (ya estaba en la cadena)':''}`);
   });
   filas=[];
   for(const [i,r] of resultados.entries()){
    const c=casos[i],e=await contract.casos(r.casoId),p=reloj.proveedores.find(x=>x.id===c.proveedorId);
    filas.push({...r,csv:c,apertura:Number(e.apertura),respuesta:e.respondido?Number(e.respuesta):null,sla:p.slaSegundos});
   }
   pintar(reloj);
   const rechazados=filas.filter(f=>f.estado==='RECHAZADO').length;
   status(`${filas.length} casos procesados: ${filas.length-rechazados} aceptados y ${rechazados} rechazado por el contrato.`);
   ctx.markDone();
  }catch(e){status(`No se pudieron cargar los casos · ${e.message}`,'pending');console.error(e);}
 });

 $('thirdParty').onclick=()=>ctx.run(async()=>{
  const reloj=ctx.getReloj();
  try{
   // Proveedor nuevo, sin firmantes: solo lecturas de la cadena.
   const lector=new JsonRpcProvider(ctx.rpcUrl(),undefined,{cacheTimeout:-1});
   let t;try{t=await recalcularComoTercero(lector,reloj.address,reloj.deploymentBlock);}finally{lector.destroy();}
   for(const c of t.casos){
    const cell=document.querySelector(`#cases tr[data-caso="${c.casoId}"] td.third`);if(!cell)continue;
    cell.innerHTML=c.penalidad===null?'<span class="small">Sin respuesta en la cadena</span>':`${esc(usd(c.penalidad))}<br><span class="${c.coincide?'match':'nomatch'}">${c.coincide?'coincide':'NO coincide'}</span>`;
   }
   $('thirdTotal').innerHTML=`Recalculado por un tercero desde los eventos, sin llaves ni CSV: <strong>${esc(usd(t.total))}</strong> · <span class="${t.coincide?'match':'nomatch'}">${t.coincide?'coincide con el contrato':'NO coincide con el contrato'}</span>`;
   status(`Tercero: ${t.casos.length} casos leídos de los eventos; ${t.casos.filter(c=>c.coincide).length} penalidades recalculadas, ${t.coincide?'todas coinciden':'hay diferencias'} con penalidad() del contrato.`,t.coincide?'green':'red');
  }catch(e){status(`No se pudo recalcular como tercero · ${e.message}`,'pending');console.error(e);}
 });

 return {reset};
}
