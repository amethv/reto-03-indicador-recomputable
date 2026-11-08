import {Contract,JsonRpcProvider} from 'ethers';
import {ABI,readAnchor} from './chain.mjs';
import {POLICY,PERIOD,SOURCES,BITACORA_HEADERS,csv,businessHours,buildEvidence,verifyText,evidenceHash,authenticateEvidence,sealedValues} from './core.mjs';
import {simulateHolidays} from './findings.mjs';
import {personalValues,searchPersonalData,collectChainData} from './privacy.mjs';

const $=id=>document.getElementById(id);
let network='local',config,provider,baseline,evidence=null,prepared=null,originalTexts=null,verified=null,sealed=false,busy=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number(v).toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2});
const pct=r=>`${fmt(r.percent)} %`;
const siNo=v=>v==='SI'?'SÍ':v;
const FILE_INPUTS={tickets:'originalTickets',catalog:'originalCatalog',report:'originalReport',bitacora:'originalBitacora',reopenings:'originalReopenings'};

async function get(url){const r=await fetch(url);if(!r.ok)throw new Error(`${url}: HTTP ${r.status}`);return r.text();}
function status(id,text,kind='pending'){$(id).className=`status ${kind}`;$(id).textContent=text;}

function clearResults(message='VERIFICACIÓN INCOMPLETA · ejecuta la verificación del archivo actual.'){
 verified=null;status('verification',message);
 $('percentA').textContent='—';$('percentB').textContent='—';
 $('fractionA').textContent='Pendiente de verificación';$('fractionB').textContent='Pendiente de verificación';
 $('gap').textContent='Diferencia pendiente de verificación.';
 $('headline').textContent='Publicado 98,25 % · Solo confirmados por el usuario: pendiente de verificación';
 $('findings').hidden=true;$('explanation').textContent='';
 $('tickets').replaceChildren();$('tableCount').textContent='';$('changes').replaceChildren();$('holidayResult').replaceChildren();$('personal').replaceChildren();
}
function controls(){for(const el of document.querySelectorAll('button,input,select'))el.disabled=busy;$('seal').disabled=busy||!prepared||sealed;$('export').disabled=busy||!evidence;}
async function run(task){if(busy)return;busy=true;controls();try{await task();}catch(error){clearResults(`${error.code==='CHAIN_CONNECTION'?'ERROR DE CONEXIÓN':'VERIFICACIÓN INCOMPLETA'} · ${error.message}`);status('sealStatus',error.message,'pending');console.error(error);}finally{busy=false;controls();}}

async function texts(){
 if(originalTexts)return originalTexts;
 const entries=await Promise.all(Object.entries(SOURCES).map(async([key,file])=>[key,await get(`/datos/${file}`)]));
 originalTexts=Object.fromEntries(entries);return originalTexts;
}
async function prepare(t){
 clearResults();prepared=null;const candidate=await buildEvidence(t,baseline);prepared=candidate;originalTexts=t;
 const july=csv(t.tickets).rows.filter(r=>r.fecha_reporte.startsWith('2026-07')).length;
 $('scopeNote').textContent=`El lote contiene ${july} reportes de julio y ${candidate.count-july} fuera de julio. Se usa su estado final, con cierres posteriores al 31 de julio. No representa un corte calendario estricto. Los originales permanecen intactos.`;
 status('sealStatus',`187/187 IDs originales presentes y únicos. Hashes individuales y pruebas preparadas. Catálogo, reporte, bitácora y reaperturas coinciden con la fuente. ${july} reportes de julio; ${candidate.count-july} fuera de julio. ${sealed?'Ya existe sello confirmado; no se reemplazará.':'Todavía no se ha enviado el sello a blockchain.'}`);
 $('commitment').textContent=`Raíz preparada: ${candidate.root}\nCompromiso de evidencia: ${await evidenceHash(candidate)}`;
}
function showExplorer(anchor){
 if(!config.explorer){$('explorer').textContent='Red local: no tiene explorador público. Cambia a Sepolia para ver el ancla pública.';return;}
 const tx=anchor?.transactionHash??config.sealTransaction;
 $('explorer').innerHTML=`Explorador público: ${tx?`<a href="${esc(config.explorer)}/tx/${esc(tx)}" target="_blank" rel="noopener">transacción del sello</a> · `:''}<a href="${esc(config.explorer)}/address/${esc(config.address)}" target="_blank" rel="noopener">contrato ${esc(config.address)}</a>`;
}
function showAnchor(anchor){
 showExplorer(anchor);
 $('privacy').textContent=`Contrato: ${anchor.address}\nRed: ${config.network}\nChain ID: ${anchor.chainId}\nTransacción: ${anchor.transactionHash}\nBloque: ${anchor.blockNumber}\nRaíz: ${anchor.root}\nCompromiso de evidencia: ${anchor.evidenceHash}\nCantidad: ${anchor.count}\nHash de reglas: ${anchor.rulesHash}`;
 $('onchain').textContent=JSON.stringify(anchor,null,2);
}

const idList=ids=>`<details><summary>Ver ${ids.length} IDs</summary><p class="mono">${ids.map(esc).join(' · ')}</p></details>`;
function renderFindings(result){
 const f=result.findings,d=f.denominator,s=f.summary;
 $('headline').textContent=`Publicado ${fmt(f.headline.published)} % · Solo confirmados por el usuario ${fmt(f.headline.confirmed)} %`;
 $('cascade').innerHTML=`
  <div class="step"><strong>${d.total}</strong><span>tickets reales en el lote sellado</span></div>
  <div class="step minus"><strong>− ${d.reopened.length}</strong><span>nacidos de una reapertura (tienen ticket_origen)</span>${idList(d.reopened)}</div>
  <div class="step minus"><strong>− ${d.level3.length}</strong><span>resueltos en Nivel 3 por el proveedor</span>${idList(d.level3)}</div>
  <div class="step total"><strong>= ${d.derived}</strong><span>recibidos publicados (${d.matches?'coincide exacto con el reporte':'no coincide con el reporte: '+d.published})</span></div>`;
 $('managedNote').textContent=`Los dos grupos no se solapan (${d.overlap.length} en común). Los ${d.publishedManaged} gestionados publicados no se pueden reconstruir desde los datos: son ${d.published} − ${d.managedGapUnexplained}, y el lote no dice qué ${d.managedGapUnexplained} tickets quedaron fuera.`;
 const rows=[
  ['Publicado por la unidad',`${s.published.numerator}/${s.published.denominator}`,pct(s.published),'Denominador recortado: excluye reaperturas y casos del proveedor.'],
  ['Todos los cierres del lote',`${s.allClosures.numerator}/${s.allClosures.denominator}`,pct(s.allClosures),`Incluye ${f.automatic.numerator} cierres automáticos a los 7 días (${fmt(f.automatic.percent)} %).`],
  ['Solo confirmados por el usuario',`${s.confirmed.numerator}/${s.confirmed.denominator}`,pct(s.confirmed),'Alguien dijo que el problema quedó resuelto.'],
  ['Dentro de SLA (corregido por bitácora)',`${s.withinSLA.numerator}/${s.withinSLA.denominator}`,pct(s.withinSLA),`Declarado en el CSV: ${f.sla.declared.numerator}/${f.sla.declared.denominator} = ${pct(f.sla.declared)}.`]];
 $('summary').innerHTML=rows.map(([a,b,c,n])=>`<tr><td><strong>${esc(a)}</strong><br><span class="small">${esc(n)}</span></td><td>${esc(b)}</td><td class="num">${esc(c)}</td></tr>`).join('');
 $('editCard').innerHTML=`<h3>Fecha editada después de resolver</h3>`+f.edits.map(e=>`
  <p class="big">${esc(e.ticket)} · ${fmt(e.hoursBefore)} h → ${fmt(e.hoursAfter)} h · cumplía ${siNo(e.slaBefore)} → ${siNo(e.slaAfter)}</p>
  <p>${esc(e.service)} ${esc(e.serviceName??'')} · ${esc(e.priority)} · SLA ${e.slaHours} h. Resuelto ${esc(e.resolvedAt)}; editado ${esc(e.editedAt)} por un rol «${esc(e.role)}» (evento ${esc(e.event)}).</p>
  <p>El CSV ya trae ${fmt(e.csvHours)} h: solo se detecta cruzando con la bitácora. Horas reales ${fmt(e.hoursBefore)} h: <strong>${e.realWithin?'cumplió':'incumplió'} el SLA</strong>.</p>`).join('');
 $('reopenCard').innerHTML=`<h3>Reaperturas con número nuevo</h3><p>Según la actividad 9 del manual, dentro de 7 días laborables la reapertura conserva el número. Estas ${f.reopenings.length} generaron uno nuevo: el original queda «resuelto» y el nuevo engorda el conteo.</p>
  <table><thead><tr><th>Reapertura</th><th>Original</th><th>Generado</th><th>Días hábiles</th></tr></thead><tbody>${f.reopenings.map(r=>`<tr><td>${esc(r.id)}</td><td>${esc(r.original)}</td><td>${esc(r.generated)}</td><td>${r.businessDays}</td></tr>`).join('')}</tbody></table>`;
 $('findings').hidden=false;
}

async function renderChanges(result){
 const items=[];
 for(const c of result.changes){
  const values=await sealedValues(c,originalTexts?.tickets,evidence);
  const compare=values.length?`<ul class="compare">${values.map(v=>`<li><code>${esc(v.field)}</code> · sellado <strong>${esc(v.sealed)}</strong> → editado <strong>${esc(v.edited)}</strong></li>`).join('')}</ul>`:'';
  items.push(`<li><strong>${esc(c.id)}</strong> · ${esc(c.kind)}${c.fields.length?' · campos: '+esc(c.fields.join(', ')):''}${compare}</li>`);
 }
 const anchorNote=`<p>El sello no cambió: misma transacción ${esc(result.anchor.transactionHash)}, misma raíz ${esc(result.anchor.root)}.</p>`;
 $('changes').innerHTML=`<div class="status red"><strong>Archivo distinto del original sellado</strong><ul>${items.join('')||'<li>Cambio de formato, encabezados o bytes del CSV, sin cambio identificable de valores.</li>'}</ul>${anchorNote}${result.errors.length?'<p>No se pudo validar todo el archivo. La localización de diferencias puede ser parcial.</p><p>'+esc(result.errors.join('\n'))+'</p>':''}</div>`;
}

async function doVerify(){
 clearResults('VERIFICACIÓN INCOMPLETA · consultando blockchain y comprobando evidencias…');
 if(!evidence)throw new Error('Falta la evidencia original; importa el manifiesto del sellado confirmado.');
 const t=await texts(),file=$('verifyFile').files[0],text=file?await file.text():t.tickets;
 const anchor=await readAnchor(provider,config);showAnchor(anchor);sealed=true;
 const result=await verifyText(text,evidence,anchor,t);
 if(result.status==='ROJO'){
  status('verification','ROJO · Alteración detectada. Este archivo no produce un indicador verificado.','red');
  await renderChanges({...result,anchor});return;
 }
 if(result.status!=='VERDE'){status('verification',`VERIFICACIÓN INCOMPLETA · ${result.errors.join('; ')}`);return;}
 verified=result;status('verification',`VERDE · Integridad verificada. 187 pruebas individuales válidas; raíz, evidencia, CSV y los cuatro archivos auxiliares coinciden con el sello confirmado. TX ${anchor.transactionHash}`,'green');
 renderFindings(result);
 const r=result.result;$('percentA').textContent=`${fmt(r.percentA)} %`;$('percentB').textContent=`${fmt(r.percentB)} %`;
 $('fractionA').textContent=`${r.numeratorA} gestionados / ${r.denominator} recibidos · incluye ${r.automatic} cierres automáticos`;
 $('fractionB').textContent=`${r.numeratorB} confirmados / ${r.denominator} recibidos`;
 $('gap').textContent=`Diferencia A − B: ${fmt(r.gap)} puntos porcentuales. ${r.automatic} cierres gestionados no tienen confirmación explícita del usuario.`;
 $('explanation').textContent=`Universo: ${r.denominator} IDs únicos del lote original (${r.calendarJuly} reportados en julio y ${r.denominator-r.calendarJuly} fuera de julio). Hay ${r.details.filter(t=>t.discrepancies.length).length} ticket(s) con discrepancias de SLA; se pueden filtrar en la sección 4.`;
 renderTable();
}

function renderTable(){
 if(!verified)return;const q=$('search').value.toLowerCase(),f=$('filter').value;
 const rows=verified.result.details.filter(r=>r.id.toLowerCase().includes(q)&&({all:true,a:r.managed,notA:!r.managed,b:r.confirmed,notB:!r.confirmed,sla:!!r.discrepancies.length}[f]));
 $('tableCount').textContent=`${rows.length} tickets visibles de ${verified.result.denominator} verificados.`;
 $('tickets').innerHTML=rows.map(r=>{
  const edit=r.logEdit?`<br><strong>Bitácora ${esc(r.logEdit.event)}:</strong> ${fmt(r.logEdit.hoursBefore)} h → ${fmt(r.logEdit.hoursAfter)} h; real: ${r.logEdit.realWithin?'cumple':'no cumple'}`:'';
  return `<tr><td>${esc(r.id)}<br>Verificado</td><td>${esc(r.priority)}</td><td>${esc(r.reported)}<br>${esc(r.resolved)}</td><td>${r.hours===null?'—':fmt(r.hours)} h / ${r.sla} h<br>Declaradas: ${fmt(r.declaredHours)} h / ${r.declaredSLA} h</td><td>${r.within===null?'Pendiente':r.within?'Cumple':'No cumple'}<br>Declarado: ${esc(r.declaredWithin)}${r.discrepancies.length?'<br>Discrepancias: '+esc(r.discrepancies.join(', ')):''}${edit}</td><td>${esc(r.type)}<br>Confirmación: ${esc(r.confirmation)}</td><td>${esc(r.reason)}<br>${esc(r.reasonB)}</td></tr>`;
 }).join('');
}

$('load').onclick=()=>run(async()=>prepare(await texts()));
$('prepareFiles').onclick=()=>run(async()=>{
 const files=Object.fromEntries(Object.entries(FILE_INPUTS).map(([key,id])=>[key,$(id).files[0]]));
 if(Object.values(files).some(f=>!f))throw new Error('Selecciona los cinco originales.');
 const t={};for(const [key,f] of Object.entries(files))t[key]=await f.text();
 await prepare(t);
});
$('seal').onclick=()=>run(async()=>{
 if(!prepared||sealed)throw new Error('No hay un lote preparado para sellar o el sello ya existe.');
 const read=new Contract(config.address,ABI,provider),current=await read.getSeal(PERIOD);if(current.timestamp!==0n){sealed=true;throw new Error('El período ya está sellado. No se reemplazará.');}
 if(!config.local||Number((await provider.getNetwork()).chainId)!==31337)throw new Error('El sellado desde esta interfaz está habilitado solo para la red local documentada. En Sepolia sella el municipio con scripts/seal-testnet.mjs.');
 const signer=await provider.getSigner(0),contract=new Contract(config.address,ABI,signer);
 status('sealStatus','Enviando transacción real; esperando recibo…');
 const tx=await contract.seal(PERIOD,prepared.root,await evidenceHash(prepared),187),receipt=await tx.wait();if(receipt.status!==1)throw new Error('Transacción fallida');
 const anchor=await readAnchor(provider,config);if(anchor.root!==prepared.root||anchor.evidenceHash!==await evidenceHash(prepared))throw new Error('Recibo no corresponde a las evidencias preparadas');
 evidence=prepared;sealed=true;showAnchor(anchor);
 const saved=await fetch('/api/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(evidence)});
 status('sealStatus',`SELLADO CONFIRMADO · 187 tickets · bloque ${receipt.blockNumber}\nTX: ${anchor.transactionHash}${saved.ok?'\nEvidencia guardada en evidencias/sello-original.json':'\nNo se pudo guardar la evidencia en disco; descárgala antes de cerrar.'}`,'green');
});
$('verify').onclick=()=>run(doVerify);
$('simulate').onclick=()=>run(async()=>{
 if(!verified)throw new Error('Primero verifica el CSV original (sección 3) para simular sobre tickets verificados.');
 const date=$('holidayDate').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Elige una fecha válida.');
 const sim=simulateHolidays(verified.result.details,[date],businessHours),base=verified.findings.sla.corrected;
 const rows=sim.changed.map(c=>`<tr${c.statusChanged?' class="flip"':''}><td>${esc(c.id)}</td><td>${fmt(c.hoursBefore)} h → ${fmt(c.hoursAfter)} h</td><td>${c.sla} h</td><td>${c.withinBefore?'Cumple':'No cumple'} → ${c.withinAfter?'Cumple':'No cumple'}</td></tr>`).join('');
 $('holidayResult').innerHTML=`<div class="status pending">SIMULACIÓN NO SELLADA · ${esc(date)} como feriado. El sello y el calendario oficial (vacío) no cambian.</div>
  <p><strong>${sim.changed.length}</strong> tickets cambian de horas y <strong>${sim.statusChanged.length}</strong> cambian de estado de SLA. Dentro de SLA: ${base.numerator}/${base.denominator} (${pct(base)}) → ${sim.within.numerator}/${sim.within.denominator} (${pct(sim.within)}).</p>
  ${sim.changed.length?`<div class="tablewrap"><table><thead><tr><th>Ticket</th><th>Horas hábiles</th><th>SLA</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p>Ese día no afecta a ningún ticket.</p>'}
  <p class="small">Para adoptar un feriado oficial hay que registrarlo con su fuente en src/calendar.mjs, cambiar la versión de las reglas y sellar una instancia nueva.</p>`;
});
$('searchPersonal').onclick=()=>run(async()=>{
 const anchor=await readAnchor(provider,config);showAnchor(anchor);
 const t=await texts(),values=personalValues(csv(t.tickets).rows,csv(t.bitacora,BITACORA_HEADERS).rows);
 const chain=await collectChainData(provider,config,anchor),result=await searchPersonalData(chain.blobs,values);
 const kind=result.matches.length?'red':'green';
 $('personal').innerHTML=`<div class="status ${kind}">${result.matches.length} coincidencias de ${result.searched} valores buscados</div>
  <p class="small">Se buscaron ${result.searched} nombres distintos (usuarios, técnicos, unidades y actores de la bitácora) en texto UTF-8, mayúsculas, minúsculas, SHA-256 y keccak256: ${result.patterns} patrones sobre ${result.bytes} bytes leídos de ${esc(result.sources.join('; '))}.</p>
  ${result.matches.length?`<ul>${result.matches.map(m=>`<li>${esc(m.kind)} · ${esc(m.form)} · ${esc(m.source)} · byte ${m.offset}</li>`).join('')}</ul>`:''}
  <h3>Lo que sí hay en la cadena</h3><table class="summary"><tbody>${chain.decoded.map(([k,v])=>`<tr><td>${esc(k)}</td><td class="mono-cell">${esc(v)}</td></tr>`).join('')}</tbody></table>`;
});
$('inspect').onclick=()=>run(async()=>showAnchor(await readAnchor(provider,config)));
$('verifyFile').onchange=()=>clearResults();
for(const id of Object.values(FILE_INPUTS))$(id).onchange=()=>{prepared=null;clearResults();controls();};
$('evidenceFile').onchange=()=>run(async()=>{
 clearResults();const file=$('evidenceFile').files[0];if(!file)return;
 const candidate=JSON.parse(await file.text()),anchor=await readAnchor(provider,config),auth=await authenticateEvidence(candidate,anchor);if(!auth.ok)throw new Error(auth.error);
 evidence=candidate;sealed=true;status('sealStatus','Evidencia importada y autenticada contra blockchain. Ejecuta la verificación del CSV.');
});
$('export').onclick=()=>{if(!evidence)return;const blob=new Blob([JSON.stringify(evidence,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='sello-original-2026-07.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('search').oninput=renderTable;$('filter').onchange=renderTable;$('policy').textContent=JSON.stringify(POLICY,null,2);

const CONFIG_FILES={local:'red-local.json',sepolia:'red-sepolia.json'};
async function useNetwork(name){
 const response=await fetch(`/evidencias/${CONFIG_FILES[name]}`);
 if(!response.ok){
  $('network').value=network;
  throw new Error(name==='sepolia'?'Sepolia pendiente: todavía no hay contrato desplegado (falta evidencias/red-sepolia.json). Ver README, sección «Ancla en Sepolia».':`Falta la configuración de la red ${name}`);
 }
 const next=await response.json();
 provider?.destroy();
 network=name;config=next;evidence=null;sealed=false;prepared=null;clearResults();controls();
 $('configLink').href=`/evidencias/${CONFIG_FILES[name]}`;
 provider=new JsonRpcProvider(config.rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=config.local?100:4000;
 $('privacy').textContent=`Contrato configurado: ${config.address}
Red: ${config.network}
RPC de lectura: ${config.rpc}
Despliegue: ${config.deploymentTransaction}
Falta consultar el sellado.`;
 showExplorer(null);
 $('networkNote').textContent=config.local?'Local: EVM de desarrollo en este equipo, sirve de respaldo sin internet. El sellado se hace desde esta página.':`Pública: ${config.network}. El navegador solo lee por un RPC público, sin wallet ni credenciales. El municipio selló con scripts/seal-testnet.mjs.`;
 status('sealStatus','Sin sellado comprobado en esta red.');
 const file=config.evidenceFile??'sello-original.json',stored=await fetch(`/evidencias/${file}`);
 if(stored.ok){
  const candidate=await stored.json(),anchor=await readAnchor(provider,config),auth=await authenticateEvidence(candidate,anchor);if(!auth.ok)throw new Error(auth.error);
  evidence=candidate;sealed=true;showAnchor(anchor);status('sealStatus',`Sello existente confirmado en ${config.network}. No se reemplazará. TX ${anchor.transactionHash}`,'green');
 }
}
$('network').onchange=()=>run(()=>useNetwork($('network').value));
await run(async()=>{baseline=JSON.parse(await get('/src/originals.json'));await useNetwork('local');});
window.__ateneaReady=true;
