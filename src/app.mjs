import {Contract,JsonRpcProvider} from 'ethers';
import {ABI,readAnchor} from './chain.mjs';
import {POLICY,PERIOD,csv,buildEvidence,verifyText,evidenceHash,authenticateEvidence} from './core.mjs';
const $=id=>document.getElementById(id);
let config,provider,baseline,evidence=null,prepared=null,originalTexts=null,verified=null,sealed=false,busy=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number(v).toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2});
async function get(url){const r=await fetch(url);if(!r.ok)throw new Error(`${url}: HTTP ${r.status}`);return r.text();}
function status(id,text,kind='pending'){$(id).className=`status ${kind}`;$(id).textContent=text;}
function clearResults(message='VERIFICACIÓN INCOMPLETA · ejecuta la verificación del archivo actual.'){
 verified=null;status('verification',message);$('percentA').textContent='—';$('percentB').textContent='—';$('fractionA').textContent='Pendiente de verificación';$('fractionB').textContent='Pendiente de verificación';$('gap').textContent='Diferencia pendiente de verificación.';$('published').textContent='Referencia del brief: 98,25 % publicado. Resultado propio pendiente.';$('explanation').textContent='';$('tickets').replaceChildren();$('tableCount').textContent='';$('changes').replaceChildren();
}
function controls(){for(const el of document.querySelectorAll('button,input,select'))el.disabled=busy;$('seal').disabled=busy||!prepared||sealed;$('export').disabled=busy||!evidence;}
async function run(task){if(busy)return;busy=true;controls();try{await task();}catch(error){clearResults(`${error.code==='CHAIN_CONNECTION'?'ERROR DE CONEXIÓN':'VERIFICACIÓN INCOMPLETA'} · ${error.message}`);status('sealStatus',error.message,'pending');console.error(error);}finally{busy=false;controls();}}
async function texts(){if(originalTexts)return originalTexts;originalTexts={tickets:await get('/datos/tickets.csv'),catalog:await get('/datos/catalogo_servicios.csv'),report:await get('/datos/indicador_mensual.csv')};return originalTexts;}
async function prepare(t){
 clearResults();prepared=null;const candidate=await buildEvidence(t.tickets,t.catalog,t.report,baseline);prepared=candidate;originalTexts=t;
 const july=csv(t.tickets).rows.filter(r=>r.fecha_reporte.startsWith('2026-07')).length;
 $('scopeNote').textContent=`El lote contiene ${july} reportes de julio y ${candidate.count-july} fuera de julio. Se usa su estado final, con cierres posteriores al 31 de julio. No representa un corte calendario estricto. Los originales permanecen intactos.`;
 status('sealStatus',`187/187 IDs originales presentes y únicos. Hashes individuales y pruebas preparadas. ${july} reportes de julio; ${candidate.count-july} fuera de julio. ${sealed?'Ya existe sello confirmado; no se reemplazará.':'Todavía no se ha enviado el sello a blockchain.'}`);
 $('commitment').textContent=`Raíz preparada: ${candidate.root}\nCompromiso de evidencia: ${await evidenceHash(candidate)}`;
}
function showAnchor(anchor){
 $('privacy').textContent=`Contrato: ${anchor.address}\nRed: ${config.network}\nChain ID: ${anchor.chainId}\nTransacción: ${anchor.transactionHash}\nBloque: ${anchor.blockNumber}\nRaíz: ${anchor.root}\nCompromiso de evidencia: ${anchor.evidenceHash}\nCantidad: ${anchor.count}\nHash de reglas: ${anchor.rulesHash}`;
 $('onchain').textContent=JSON.stringify(anchor,null,2);
}
async function doVerify(){
 clearResults('VERIFICACIÓN INCOMPLETA · consultando blockchain y comprobando evidencias…');
 if(!evidence)throw new Error('Falta la evidencia original; importa el manifiesto del sellado confirmado.');
 const t=await texts(),file=$('verifyFile').files[0],text=file?await file.text():t.tickets;
 const anchor=await readAnchor(provider,config);showAnchor(anchor);sealed=true;
 const result=await verifyText(text,evidence,anchor,t.catalog,t.report);
 if(result.status==='ROJO'){
  status('verification','ROJO · Alteración detectada. Este archivo no produce un indicador verificado.','red');
  const items=result.changes.map(c=>`<li><strong>${esc(c.id)}</strong> · ${esc(c.kind)}${c.fields.length?' · campos: '+esc(c.fields.join(', ')):''}</li>`).join('');
  $('changes').innerHTML=`<div class="status red"><strong>Archivo distinto del original sellado</strong><ul>${items||'<li>Cambio de formato, encabezados o bytes del CSV, sin cambio identificable de valores.</li>'}</ul>${result.errors.length?'<p>No se pudo validar todo el archivo. La localización de diferencias puede ser parcial.</p><p>'+esc(result.errors.join('\n'))+'</p>':''}</div>`;return;
 }
 if(result.status!=='VERDE'){status('verification',`VERIFICACIÓN INCOMPLETA · ${result.errors.join('; ')}`);return;}
 verified=result;status('verification',`VERDE · Integridad verificada. 187 pruebas individuales válidas; raíz, evidencia, CSV y auxiliares coinciden con el sello confirmado. TX ${anchor.transactionHash}`,'green');
 $('published').textContent=`Publicado: ${fmt(result.published)} %. Recalculado: ${fmt(result.result.percentA)} %. Diferencia: ${fmt(result.difference)} puntos porcentuales.`;
 const r=result.result;$('percentA').textContent=`${fmt(r.percentA)} %`;$('percentB').textContent=`${fmt(r.percentB)} %`;
 $('fractionA').textContent=`${r.numeratorA} gestionados / ${r.denominator} recibidos · incluye ${r.automatic} cierres automáticos`;
 $('fractionB').textContent=`${r.numeratorB} confirmados / ${r.denominator} recibidos`;
 $('gap').textContent=`Diferencia A − B: ${fmt(r.gap)} puntos porcentuales. ${r.automatic} cierres gestionados no tienen confirmación explícita del usuario.`;
 $('explanation').textContent=`El denominador procede de ${r.denominator} IDs únicos del lote original (${r.calendarJuly} reportados en julio y ${r.denominator-r.calendarJuly} fuera de julio). A cuenta ${r.numeratorA} cierres válidos; B cuenta ${r.numeratorB} de esos cierres con confirmación explícita. El reporte publicado usa ${result.publishedNumerator} gestionados / ${result.publishedDenominator} recibidos y declara ${fmt(result.published)} %. La diferencia de universos no se corrige alterando los datos. Hay ${r.details.filter(t=>t.discrepancies.length).length} tickets con discrepancias de SLA, que se pueden filtrar.`;
 renderTable();
}
function renderTable(){
 if(!verified)return;const q=$('search').value.toLowerCase(),f=$('filter').value;
 const rows=verified.result.details.filter(r=>r.id.toLowerCase().includes(q)&&({all:true,a:r.managed,notA:!r.managed,b:r.confirmed,notB:!r.confirmed,sla:!!r.discrepancies.length}[f]));
 $('tableCount').textContent=`${rows.length} tickets visibles de ${verified.result.denominator} verificados.`;
 $('tickets').innerHTML=rows.map(r=>`<tr><td>${esc(r.id)}<br>Verificado</td><td>${esc(r.priority)}</td><td>${esc(r.reported)}<br>${esc(r.resolved)}</td><td>${r.hours===null?'—':fmt(r.hours)} h / ${r.sla} h<br>Declaradas: ${fmt(r.declaredHours)} h / ${r.declaredSLA} h</td><td>${r.within===null?'Pendiente':r.within?'Cumple':'No cumple'}<br>Declarado: ${esc(r.declaredWithin)}${r.discrepancies.length?'<br>Discrepancias: '+esc(r.discrepancies.join(', ')):''}</td><td>${esc(r.type)}<br>Confirmación: ${esc(r.confirmation)}</td><td>${esc(r.reason)}<br>${esc(r.reasonB)}</td></tr>`).join('');
}
$('load').onclick=()=>run(async()=>prepare(await texts()));
$('prepareFiles').onclick=()=>run(async()=>{
 const files=['originalTickets','originalCatalog','originalReport'].map(id=>$(id).files[0]);if(files.some(f=>!f))throw new Error('Selecciona los tres originales.');
 await prepare({tickets:await files[0].text(),catalog:await files[1].text(),report:await files[2].text()});
});
$('seal').onclick=()=>run(async()=>{
 if(!prepared||sealed)throw new Error('No hay un lote preparado para sellar o el sello ya existe.');
 const read=new Contract(config.address,ABI,provider),current=await read.getSeal(PERIOD);if(current.timestamp!==0n){sealed=true;throw new Error('El período ya está sellado. No se reemplazará.');}
 if(!config.local||Number((await provider.getNetwork()).chainId)!==31337)throw new Error('El sellado desde esta interfaz está habilitado solo para la red local documentada.');
 const signer=await provider.getSigner(0),contract=new Contract(config.address,ABI,signer);
 status('sealStatus','Enviando transacción real; esperando recibo…');
 const tx=await contract.seal(PERIOD,prepared.root,await evidenceHash(prepared),187),receipt=await tx.wait();if(receipt.status!==1)throw new Error('Transacción fallida');
 const anchor=await readAnchor(provider,config);if(anchor.root!==prepared.root||anchor.evidenceHash!==await evidenceHash(prepared))throw new Error('Recibo no corresponde a las evidencias preparadas');
 evidence=prepared;sealed=true;showAnchor(anchor);
 const saved=await fetch('/api/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(evidence)});
 status('sealStatus',`SELLADO CONFIRMADO · 187 tickets · bloque ${receipt.blockNumber}\nTX: ${anchor.transactionHash}${saved.ok?'\nEvidencia guardada en evidencias/sello-original.json':'\nNo se pudo guardar la evidencia en disco; descárgala antes de cerrar.'}`,'green');
});
$('verify').onclick=()=>run(doVerify);
$('inspect').onclick=()=>run(async()=>showAnchor(await readAnchor(provider,config)));
$('verifyFile').onchange=()=>clearResults();
for(const id of ['originalTickets','originalCatalog','originalReport'])$(id).onchange=()=>{prepared=null;clearResults();controls();};
$('evidenceFile').onchange=()=>run(async()=>{
 clearResults();const file=$('evidenceFile').files[0];if(!file)return;
 const candidate=JSON.parse(await file.text()),anchor=await readAnchor(provider,config),auth=await authenticateEvidence(candidate,anchor);if(!auth.ok)throw new Error(auth.error);
 evidence=candidate;sealed=true;status('sealStatus','Evidencia importada y autenticada contra blockchain. Ejecuta la verificación del CSV.');
});
$('export').onclick=()=>{if(!evidence)return;const blob=new Blob([JSON.stringify(evidence,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='sello-original-2026-07.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('search').oninput=renderTable;$('filter').onchange=renderTable;$('policy').textContent=JSON.stringify(POLICY,null,2);
await run(async()=>{
 config=JSON.parse(await get('/evidencias/red-local.json'));baseline=JSON.parse(await get('/src/originals.json'));
 provider=new JsonRpcProvider(config.rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=100;
 $('privacy').textContent=`Contrato configurado: ${config.address}\nRed: ${config.network}\nRPC: ${config.rpc}\nDespliegue: ${config.deploymentTransaction}\nFalta consultar el sellado.`;
 const response=await fetch('/evidencias/sello-original.json');if(response.ok){const candidate=await response.json(),anchor=await readAnchor(provider,config),auth=await authenticateEvidence(candidate,anchor);if(!auth.ok)throw new Error(auth.error);evidence=candidate;sealed=true;showAnchor(anchor);status('sealStatus',`Sello existente confirmado. No se reemplazará. TX ${anchor.transactionHash}`,'green');}
});
window.__ateneaReady=true;