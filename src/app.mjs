import {Contract,ContractFactory,JsonRpcProvider} from 'ethers';
import {ABI,readAnchor} from './chain.mjs';
import {POLICY,PERIOD,SOURCES,BITACORA_HEADERS,csv,businessHours,buildEvidence,verifyText,evidenceHash,authenticateEvidence,sealedValues,newSalt,validSalt,saltCommitment,sha} from './core.mjs';
import {conectarSepolia,mensajeBilletera} from './wallet.mjs';
import {simulateHolidays} from './findings.mjs';
import {personalValues,searchPersonalData,collectChainData} from './privacy.mjs';
import {initProveedor} from './proveedor.mjs';
import {initCatalogo} from './catalogo-ui.mjs';
import {LectorSepolia,RPC_RESPALDO} from './rpc.mjs';

const $=id=>document.getElementById(id);
let network='local',config,provider,baseline,evidence=null,prepared=null,preparedSalt=null,salt=null,originalTexts=null,verified=null,sealed=false,busy=false;
// Para el menú y el panel: último ancla leída, estado de la última verifyText (VERDE/ROJO),
// coincidencias de la última búsqueda de datos personales y pasos del guion cumplidos en esta sesión.
let lastAnchor=null,lastStatus=null,privacyMatches=null;const done=new Set();
// Sellado en vivo: cuenta conectada en MetaMask (o null), su owner comprobado y el modo de arranque del servidor.
// Sin período activo en Sepolia, config es null: la vista lo dice y no se lee ningún sello.
let wallet=null,walletOwner=null,walletMsg=null,modo={sepoliaRpc:'https://ethereum-sepolia-rpc.publicnode.com'};
const SIN_PERIODO='Sin período activo · prepara un nuevo período para sellar julio';
const PREF_RED='atenea-red';
const recordarRed=n=>{try{sessionStorage.setItem(PREF_RED,n);}catch{}};
function periodo(){if(!config)throw new Error(`${SIN_PERIODO} (vista Sellar, paso 2).`);}
// Lecturas de Sepolia con reintentos y RPC de respaldo; mientras reintenta, un aviso arriba de la vista.
const avisoRed=t=>{const a=$('redAviso');a.hidden=!t;a.textContent=t??'';};
const urlsSepolia=rpc=>{const principal=rpc??modo.sepoliaRpc;return [principal,...(principal===modo.sepoliaRpc?(modo.sepoliaRespaldo??RPC_RESPALDO):[])];};
function lectorSepolia(rpc,chainId){return new LectorSepolia(urlsSepolia(rpc),{avisar:avisoRed,...(chainId?{chainId}:{})});}
// Nivel 2: configuración del RelojProveedor de esta red (solo existe en la red local).
// La vista usa siempre el RelojProveedor de la red local, sin importar la red elegida para el sellado.
let proveedorUI=null,catalogoUI=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number(v).toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2});
const pct=r=>`${fmt(r.percent)} %`;
const siNo=v=>v==='SI'?'SÍ':v;
const FILE_INPUTS={tickets:'originalTickets',catalog:'originalCatalog',report:'originalReport',bitacora:'originalBitacora',reopenings:'originalReopenings'};

async function get(url){const r=await fetch(url);if(!r.ok)throw new Error(`${url}: HTTP ${r.status}`);return r.text();}
function status(id,text,kind='pending'){$(id).className=`status ${kind}`;$(id).textContent=text;}

function clearResults(message='VERIFICACIÓN INCOMPLETA · ejecuta la verificación del archivo actual.'){
 verified=null;lastStatus=null;status('verification',message);
 $('percentA').textContent='—';$('percentB').textContent='—';
 $('fractionA').textContent='Pendiente de verificación';$('fractionB').textContent='Pendiente de verificación';
 $('gap').textContent='Diferencia pendiente de verificación.';
 $('headline').innerHTML='<span class="hl-side"><span class="hl-label">Publicado</span> <strong class="hl-num">98,25 %</strong></span><span class="hl-vs"> · </span><span class="hl-side hl-b"><span class="hl-label">Solo confirmados por el usuario:</span> <strong class="hl-num hl-pending">pendiente de verificación</strong></span>';
 $('findings').hidden=true;$('explanation').textContent='';
 $('tickets').replaceChildren();$('tableCount').textContent='';$('changes').replaceChildren();$('holidayResult').replaceChildren();$('personal').replaceChildren();
}
// Los controles de la interfaz (menú, copiar) quedan fuera del bloqueo mientras corre una acción.
function controls(){
 for(const el of document.querySelectorAll('button:not([data-ui]),input,select'))el.disabled=busy;
 // Cada paso del sellado se habilita cuando el anterior está completo. En la red local no hay MetaMask ni período.
 const sep=network==='sepolia';
 $('connectWallet').disabled=busy||!sep;$('prepareSepolia').disabled=busy||!sep||!wallet;
 $('load').disabled=$('prepareFiles').disabled=busy||(sep&&!config);
 $('seal').disabled=busy||!prepared||sealed||(sep&&!config);$('export').disabled=busy||!evidence;sealUi();flowUi();
 proveedorUI?.botones(busy);catalogoUI?.botones(busy);
}
// Estado visible del botón de sellado. No cambia cuándo se habilita: solo su texto y la línea de ayuda.
function sealUi(){
 const b=$('seal');b.classList.toggle('sealed-done',sealed);b.textContent=sealed?'✓ Julio ya está sellado':'Sellar julio en blockchain';
 $('sealHint').textContent=sealed?'El sello de julio es único e inmutable: el contrato no permite reemplazarlo ni volver a sellar el período.':network==='sepolia'&&!config?SIN_PERIODO:prepared?'':'Primero carga los originales.';
}
// Pasos ① a ④ de «Administración»: hecho (✓), el que sigue, o «no aplica» en la red local.
function flowUi(){
 const sep=network==='sepolia',hechos=[sep?!!wallet:null,sep?!!config:null,!!prepared||sealed,sealed];
 const sigue=hechos.findIndex(h=>h===false);
 for(const li of document.querySelectorAll('[data-flow-step]')){
  const i=Number(li.dataset.flowStep)-1;
  li.classList.toggle('done',hechos[i]===true);li.classList.toggle('na',hechos[i]===null);li.classList.toggle('current',i===sigue);
 }
 const link=a=>config?.explorer?`<a href="${esc(config.explorer)}/address/${esc(a)}" target="_blank" rel="noopener">${esc(a)}</a>`:esc(a);
 $('periodInfo').innerHTML=!sep?'No aplica en la red local: el contrato es el de este servidor.'
  :config?`Período activo: contrato ${link(config.address)} · ${sealed?'julio sellado':'julio sin sellar'}.`
  :`<strong>${esc(SIN_PERIODO)}.</strong> Despliega un contrato nuevo con la cuenta del municipio.`;
 if(!sep){$('walletInfo').textContent='No aplica en la red local: se sella sin MetaMask.';return;}
 if(!wallet){$('walletInfo').textContent=walletMsg??'Sin conectar. MetaMask debe tener la cuenta del municipio y Sepolia ETH de prueba.';return;}
 const rol=!config?'<span class="wallet-ok">Sin período activo: esta cuenta quedará como municipio (owner) del contrato que prepare.</span>'
  :walletOwner===null?'Comprobando si es la cuenta del municipio…'
  :walletOwner.toLowerCase()===wallet.toLowerCase()?'<span class="wallet-ok">✓ Es la cuenta del municipio (owner del contrato): puede sellar.</span>'
  :`<span class="wallet-no">No es la cuenta del municipio: el contrato lo firma ${esc(short(walletOwner))}. Con esta cuenta no se puede sellar.</span>`;
 $('walletInfo').innerHTML=`Cuenta <span class="hash" title="${esc(wallet)}">${esc(short(wallet))}</span> · red Sepolia<br>${rol}`;
}
// Owner del contrato activo, leído por el RPC público (sin MetaMask).
async function comprobarOwner(){
 walletOwner=null;flowUi();
 if(!config||network!=='sepolia')return;
 try{walletOwner=await new Contract(config.address,ABI,provider).owner();}catch(e){console.error(e);}
 flowUi();
}
// Nombre de la red para mostrar: sin la anotación técnica que guarda la configuración local.
const redVisible=n=>String(n??'').replace(/\s*\(red de desarrollo real\)/i,'');
async function run(task){if(busy)return;busy=true;controls();try{await task();}catch(error){clearResults(`${error.code==='CHAIN_CONNECTION'?'ERROR DE CONEXIÓN':'VERIFICACIÓN INCOMPLETA'} · ${error.message}`);status('sealStatus',error.message,'pending');console.error(error);}finally{busy=false;controls();renderNav();refreshNetwork();}}

async function texts(){
 if(originalTexts)return originalTexts;
 const entries=await Promise.all(Object.entries(SOURCES).map(async([key,file])=>[key,await get(`/datos/${file}`)]));
 originalTexts=Object.fromEntries(entries);return originalTexts;
}
async function prepare(t){
 // Cada preparación genera una sal nueva; solo se conserva si ese lote se sella.
 clearResults();prepared=null;preparedSalt=null;const s=newSalt(),candidate=await buildEvidence(t,baseline,s);prepared=candidate;preparedSalt=s;originalTexts=t;
 const july=csv(t.tickets).rows.filter(r=>r.fecha_reporte.startsWith('2026-07')).length;
 $('scopeNote').textContent=`El lote contiene ${july} reportes de julio y ${candidate.count-july} fuera de julio. Se usa su estado final, con cierres posteriores al 31 de julio. No representa un corte calendario estricto. Los originales permanecen intactos.`;
 status('sealStatus',`187/187 IDs originales presentes y únicos. Hashes individuales y pruebas preparadas. Catálogo, reporte, bitácora y reaperturas coinciden con la fuente. ${july} reportes de julio; ${candidate.count-july} fuera de julio. ${sealed?'Ya existe sello confirmado; no se reemplazará.':'Todavía no se ha enviado el sello a blockchain.'}`);
 $('commitment').innerHTML=facts([['Raíz preparada',candidate.root],['Compromiso de evidencia',await evidenceHash(candidate)]]);
}
// Datos «etiqueta → valor». Los hashes van en monoespaciada con su botón de copiar.
// Con key, la fila guarda además el valor exacto (data-value) para quien quiera leerlo sin formato.
const COPY_ICON='<svg class="icon"><use href="#i-copy"/></svg>';
const isHash=v=>typeof v==='string'&&/^0x[0-9a-fA-F]{16,}$/.test(v);
function facts(rows){
 return `<dl class="facts">${rows.map(([label,value,opt={}])=>{
  const text=String(opt.show??value??'—'),hash=isHash(text);
  const data=opt.key?` data-key="${esc(opt.key)}" data-value="${esc(JSON.stringify(value))}"`:'';
  const copy=hash?`<button class="copy" type="button" data-ui data-copy-value="${esc(text)}" aria-label="Copiar ${esc(label.toLowerCase())}">${COPY_ICON}</button>`:'';
  return `<div${data}><dt>${esc(label)}</dt><dd${hash?' class="hash"':''}><span>${esc(text)}</span>${copy}</dd></div>`;
 }).join('')}</dl>`;
}
const when=ts=>`${new Date(ts*1000).toLocaleString('es-EC',{timeZone:'America/Guayaquil',dateStyle:'long',timeStyle:'medium'})} (UTC-05:00)`;
function showExplorer(anchor){
 if(!config.explorer){$('explorer').textContent='';return;}
 const tx=anchor?.transactionHash??config.sealTransaction;
 $('explorer').innerHTML=`Explorador público: ${tx?`<a href="${esc(config.explorer)}/tx/${esc(tx)}" target="_blank" rel="noopener">transacción del sello</a> · `:''}<a href="${esc(config.explorer)}/address/${esc(config.address)}" target="_blank" rel="noopener">contrato ${esc(config.address)}</a>`;
}
// Enlaces del sello en el explorador público (solo redes con explorador, como Sepolia) y respaldo de la sal.
function showSealLinks(anchor){
 const tx=anchor?.transactionHash;
 $('sealLinks').innerHTML=config?.explorer&&tx?`<a href="${esc(config.explorer)}/tx/${esc(tx)}" target="_blank" rel="noopener">Transacción del sello en Etherscan</a> · <a href="${esc(config.explorer)}/address/${esc(config.address)}" target="_blank" rel="noopener">Contrato en Etherscan</a>`:'';
 $('downloadSalt').hidden=!(network==='sepolia'&&salt&&tx);
}
function showAnchor(anchor){
 lastAnchor=anchor;showExplorer(anchor);showSealLinks(anchor);
 // Solo la transacción: lo que el sello guarda se lista una vez, en «Lo que sí hay en la cadena» y en el detalle técnico.
 $('privacy').innerHTML=facts([['Contrato',anchor.address],['Red',redVisible(config.network)],['Chain ID',anchor.chainId],['Transacción del sello',anchor.transactionHash],['Bloque',anchor.blockNumber]]);
 const k=(label,key,value,show)=>[label,value,{key,show}];
 $('onchain').innerHTML=`<h3>Almacenamiento del contrato (getSeal)</h3>${facts([
  k('Raíz Merkle','root',anchor.root),k('Compromiso de evidencia','evidenceHash',anchor.evidenceHash),k('Cantidad de tickets','count',anchor.count),
  k('Fecha del sello','timestamp',anchor.timestamp,when(anchor.timestamp)),k('Hash de reglas','rulesHash',anchor.rulesHash)])}
  <h3>Evento Sealed</h3>${facts([k('Período','event.period',anchor.event.period),k('Raíz Merkle','event.root',anchor.event.root),k('Compromiso de evidencia','event.evidenceHash',anchor.event.evidenceHash),k('Cantidad de tickets','event.count',anchor.event.count)])}
  <h3>Transacción y contrato</h3>${facts([
  k('Transacción','transactionHash',anchor.transactionHash),k('Bloque','blockNumber',anchor.blockNumber),k('Calldata de la transacción del sello','calldata',anchor.calldata),
  k('Contrato','address',anchor.address),k('Chain ID','chainId',anchor.chainId),k('Hash del bytecode','codeHash',anchor.codeHash)])}`;
}

const idList=ids=>`<details><summary>Ver ${ids.length} IDs</summary><p class="mono">${ids.map(esc).join(' · ')}</p></details>`;
function renderFindings(result){
 const f=result.findings,d=f.denominator,s=f.summary;
 $('headline').innerHTML=`<span class="hl-side"><span class="hl-label">Publicado</span> <strong class="hl-num">${esc(fmt(f.headline.published))} %</strong></span><span class="hl-vs"> · </span><span class="hl-side hl-b"><span class="hl-label">Solo confirmados por el usuario</span> <strong class="hl-num">${esc(fmt(f.headline.confirmed))} %</strong></span>`;
 // Veredicto del criterio 2: todas las cifras salen del recálculo verificado, ninguna está escrita a mano.
 $('recalcVerdict').innerHTML=`<p class="verdict-main">Recalculado desde lo sellado: <strong>${pct(s.confirmed)===pct(s.published)?'da':'no da'} ${esc(pct(s.published))}</strong></p>
  <p class="verdict-sub">Solo confirmados por el usuario: <strong>${esc(pct(s.confirmed))}</strong> (${s.confirmed.numerator}/${s.confirmed.denominator}) · Todos los cierres del lote: <strong>${esc(pct(s.allClosures))}</strong> (${s.allClosures.numerator}/${s.allClosures.denominator})</p>
  <p class="small">De dónde sale la diferencia: el denominador publicado se recorta de ${d.total} a ${d.derived} tickets y ${f.automatic.numerator} cierres son automáticos, sin confirmación del usuario. Detalle abajo.</p>`;
 $('cascade').innerHTML=`
  <div class="step"><strong>${d.total}</strong><span>tickets reales en el lote sellado</span></div>
  <div class="step minus"><strong>− ${d.reopened.length}</strong><span>nacidos de una reapertura (tienen ticket_origen)</span>${idList(d.reopened)}</div>
  <div class="step minus"><strong>− ${d.level3.length}</strong><span>escalados al proveedor externo (tercer nivel de soporte)</span>${idList(d.level3)}</div>
  <div class="step total"><strong>= ${d.derived}</strong><span>recibidos publicados (${d.matches?'coincide exacto con el reporte':'no coincide con el reporte: '+d.published})</span></div>`;
 $('managedNote').textContent=`Los dos grupos no se solapan (${d.overlap.length} en común). Los ${d.publishedManaged} gestionados publicados no se pueden reconstruir desde los datos: son ${d.published} − ${d.managedGapUnexplained}, y el lote no dice qué ${d.managedGapUnexplained} tickets quedaron fuera.`;
 const rows=[
  ['Publicado por la unidad',`${s.published.numerator}/${s.published.denominator}`,pct(s.published),'Denominador recortado: excluye reaperturas y casos del proveedor.'],
  ['Todos los cierres del lote',`${s.allClosures.numerator}/${s.allClosures.denominator}`,pct(s.allClosures),`Incluye ${f.automatic.numerator} cierres automáticos a los 7 días (${fmt(f.automatic.percent)} %).`],
  ['Solo confirmados por el usuario',`${s.confirmed.numerator}/${s.confirmed.denominator}`,pct(s.confirmed),'Alguien dijo que el problema quedó resuelto.'],
  ['Dentro de SLA (corregido por bitácora)',`${s.withinSLA.numerator}/${s.withinSLA.denominator}`,pct(s.withinSLA),`Declarado en el CSV: ${f.sla.declared.numerator}/${f.sla.declared.denominator} = ${pct(f.sla.declared)}.`]];
 $('summary').innerHTML=rows.map(([a,b,c,n])=>`<tr><td><strong>${esc(a)}</strong><br><span class="small">${esc(n)}</span></td><td>${esc(b)}</td><td class="num">${esc(c)}</td></tr>`).join('');
 $('editCard').innerHTML=`<h3>Fecha editada después de resolver</h3>`+f.edits.map(e=>`
  <p class="big">Ticket ${esc(e.ticket)}: tuvo una edición en su tiempo de respuesta ante incidente</p>
  <p>Tiempo registrado: <strong>${fmt(e.hoursBefore)} h → ${fmt(e.hoursAfter)} h</strong>.${e.slaBefore!==e.slaAfter?` Con ese cambio pasó de ${siNo(e.slaBefore)==='SÍ'?'cumplir':'incumplir'} a ${siNo(e.slaAfter)==='SÍ'?'cumplir':'incumplir'} el SLA de ${e.slaHours} h.`:''}</p>
  <p>${esc(e.service)} ${esc(e.serviceName??'')} · ${esc(e.priority)} · SLA ${e.slaHours} h. Resuelto ${esc(e.resolvedAt)}; editado ${esc(e.editedAt)} por un rol «${esc(e.role)}» (evento ${esc(e.event)}).</p>
  <p>El CSV ya trae ${fmt(e.csvHours)} h: solo se detecta cruzando con la bitácora. Horas reales ${fmt(e.hoursBefore)} h: <strong>${e.realWithin?'cumplió':'incumplió'} el SLA</strong>.</p>`).join('');
 $('reopenCard').innerHTML=`<h3>Reaperturas con número nuevo</h3><p>Según la actividad 9 del manual, dentro de 7 días laborables la reapertura conserva el número. Estas ${f.reopenings.length} generaron uno nuevo: el original queda «resuelto» y el nuevo engorda el conteo.</p>
  <table><thead><tr><th>Reapertura</th><th>Original</th><th>Generado</th><th>Días hábiles</th></tr></thead><tbody>${f.reopenings.map(r=>`<tr><td>${esc(r.id)}</td><td>${esc(r.original)}</td><td>${esc(r.generated)}</td><td>${r.businessDays}</td></tr>`).join('')}</tbody></table>`;
 $('findings').hidden=false;
}

async function renderChanges(result){
 const items=[];
 for(const c of result.changes){
  const values=await sealedValues(c,originalTexts?.tickets,evidence,salt);
  const compare=values.length?`<ul class="compare">${values.map(v=>`<li><code>${esc(v.field)}</code> · sellado <strong>${esc(v.sealed)}</strong> → editado <strong>${esc(v.edited)}</strong></li>`).join('')}</ul>`:'';
  items.push(`<li><strong>${esc(c.id)}</strong> · ${esc(c.kind)}${c.fields.length?' · campos: '+esc(c.fields.join(', ')):''}${compare}</li>`);
 }
 const anchorNote=`<p>El sello no cambió: misma transacción ${esc(result.anchor.transactionHash)}, misma raíz ${esc(result.anchor.root)}.</p>`;
 $('changes').innerHTML=`<div class="status red"><strong>Archivo distinto del original sellado</strong><ul>${items.join('')||'<li>Cambio de formato, encabezados o bytes del CSV, sin cambio identificable de valores.</li>'}</ul>${anchorNote}${result.errors.length?'<p>No se pudo validar todo el archivo. La localización de diferencias puede ser parcial.</p><p>'+esc(result.errors.join('\n'))+'</p>':''}</div>`;
}

async function doVerify(){
 clearResults('VERIFICACIÓN INCOMPLETA · consultando blockchain y comprobando evidencias…');
 periodo();
 if(!evidence)throw new Error('Falta la evidencia original del sellado confirmado en evidencias/.');
 if(!salt)throw new Error('Falta la sal secreta del sello: en otro equipo, copia la carpeta .secreto/ del equipo que selló y reinicia la app.');
 const t=await texts(),file=$('verifyFile').files[0],text=file?await file.text():t.tickets;
 const anchor=await readAnchor(provider,config);showAnchor(anchor);sealed=true;
 const result=await verifyText(text,evidence,anchor,t,salt);
 if(result.status==='ROJO'){
  status('verification','ROJO · Alteración detectada. Este archivo no produce un indicador verificado.','red');
  lastStatus='ROJO';done.add(3);
  await renderChanges({...result,anchor});return;
 }
 if(result.status!=='VERDE'){status('verification',`VERIFICACIÓN INCOMPLETA · ${result.errors.join('; ')}`);return;}
 verified=result;lastStatus='VERDE';done.add(2);if(route==='comparar')done.add(4);status('verification',`VERDE · Integridad verificada. 187 pruebas individuales válidas; raíz, evidencia, CSV y los cuatro archivos auxiliares coinciden con el sello confirmado. TX ${anchor.transactionHash}`,'green');
 renderFindings(result);
 const r=result.result;$('percentA').textContent=`${fmt(r.percentA)} %`;$('percentB').textContent=`${fmt(r.percentB)} %`;
 $('fractionA').innerHTML=`<strong>${r.numeratorA} gestionados / ${r.denominator} recibidos</strong> · incluye ${r.automatic} cierres automáticos`;
 $('fractionB').innerHTML=`<strong>${r.numeratorB} confirmados / ${r.denominator} recibidos</strong>`;
 $('gap').innerHTML=`Diferencia A − B: <strong>${esc(fmt(r.gap))} puntos porcentuales</strong>. <strong>${r.automatic}</strong> cierres gestionados no tienen confirmación explícita del usuario.`;
 $('explanation').textContent=`Universo: ${r.denominator} IDs únicos del lote original (${r.calendarJuly} reportados en julio y ${r.denominator-r.calendarJuly} fuera de julio). Hay ${r.details.filter(t=>t.discrepancies.length).length} ticket(s) con discrepancias de SLA; se pueden filtrar en la vista Comparar.`;
 renderTable();
 // Lista desplegable de IDs para «Buscar ticket» en Comparar.
 $('ticketIds').innerHTML=r.details.map(t=>`<option value="${esc(t.id)}"></option>`).join('');
}

function renderTable(){
 if(!verified)return;const q=$('search').value.toLowerCase(),f=$('filter').value;
 const rows=verified.result.details.filter(r=>r.id.toLowerCase().includes(q)&&({all:true,a:r.managed,notA:!r.managed,b:r.confirmed,notB:!r.confirmed,sla:!!r.discrepancies.length}[f]));
 $('tableCount').textContent=`${rows.length} tickets visibles de ${verified.result.denominator} verificados.`;
 $('tickets').innerHTML=rows.map(r=>{
  const edit=r.logEdit?`<br><strong>Bitácora ${esc(r.logEdit.event)}:</strong> ${fmt(r.logEdit.hoursBefore)} h → ${fmt(r.logEdit.hoursAfter)} h; real: ${r.logEdit.realWithin?'cumple':'no cumple'}`:'';
  // Plazo (SLA): lo calculado desde las fechas frente a lo que declaró la mesa de ayuda. Si no coinciden, la fila se marca.
  const noCoincide=r.discrepancies.length>0,declarado=r.declaredWithin==='SI'?'Sí':r.declaredWithin==='NO'?'No':esc(r.declaredWithin);
  const CAMPOS={'horas declaradas':'horas','SLA declarado':'SLA','cumple_sla':'cumplimiento'},propias=r.discrepancies.filter(x=>CAMPOS[x]),otras=r.discrepancies.filter(x=>!CAMPOS[x]);
  const etiquetas=[propias.length?`Calculado y declarado no coinciden: ${propias.map(x=>CAMPOS[x]).join(', ')}`:'',...otras.map(x=>`Diferencia con la bitácora: ${x.replace(/\s*\(bitácora\)$/,'')}`)].filter(Boolean);
  return `<tr${noCoincide?' class="sla-mismatch"':''}><td>${esc(r.id)}<br>Verificado</td><td>${esc(r.priority)}</td><td>${esc(r.reported)}<br>${esc(r.resolved)}</td><td>${r.hours===null?'—':fmt(r.hours)} h / ${r.sla} h<br>Declaradas: ${fmt(r.declaredHours)} h / ${r.declaredSLA} h</td><td>Calculado: <strong>${r.within===null?'pendiente':r.within?'Cumple':'No cumple'}</strong><br>Declarado: ${declarado}${etiquetas.map(e=>`<br><span class="mismatch-tag">${esc(e)}</span>`).join('')}${edit}</td><td>${esc(r.type)}<br>Confirmación: ${esc(r.confirmation)}</td><td class="inb" title="${esc(r.reasonB)}">${r.confirmed?'<svg class="icon" role="img" aria-label="Sí cuenta en B"><use href="#i-check"/></svg>':'<span role="img" aria-label="No cuenta en B">—</span>'}</td></tr>`;
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
 periodo();
 if(!prepared||sealed)throw new Error('No hay un lote preparado para sellar o el sello ya existe.');
 const read=new Contract(config.address,ABI,provider),current=await read.getSeal(PERIOD);if(current.timestamp!==0n){sealed=true;throw new Error('El período ya está sellado. No se reemplazará.');}
 if(network==='sepolia')return sealSepolia();
 if(!config.local||Number((await provider.getNetwork()).chainId)!==31337)throw new Error('Esta red no admite sellar desde la página.');
 const signer=await provider.getSigner(0),contract=new Contract(config.address,ABI,signer);
 status('sealStatus','Enviando transacción real; esperando recibo…');
 const tx=await contract.seal(PERIOD,prepared.root,await evidenceHash(prepared),187),receipt=await tx.wait();if(receipt.status!==1)throw new Error('Transacción fallida');
 const anchor=await readAnchor(provider,config);if(anchor.root!==prepared.root||anchor.evidenceHash!==await evidenceHash(prepared))throw new Error('Recibo no corresponde a las evidencias preparadas');
 evidence=prepared;salt=preparedSalt;sealed=true;showAnchor(anchor);showSalt();
 const saved=await fetch('/api/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({evidence,salt})});
 status('sealStatus',`SELLADO CONFIRMADO · 187 tickets · bloque ${receipt.blockNumber}\nTX: ${anchor.transactionHash}${saved.ok?'\nLa evidencia y la sal secreta quedaron guardadas en el servidor, por separado.':'\nNo se pudo guardar la evidencia ni la sal en el servidor; descarga el respaldo del sellado antes de cerrar.'}`,'green');
});
// ---------- Sepolia con MetaMask: el municipio firma en su billetera; la llave nunca sale de ella ----------
const postJson=async(url,data)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw new Error(await r.text()||`HTTP ${r.status}`);return r.json();};
async function sealSepolia(){
 try{
  const {signer,address}=await conectarSepolia(t=>status('sealStatus',t));
  if(wallet?.toLowerCase()!==address.toLowerCase()){wallet=address;comprobarOwner();}
  // Solo el owner del contrato (la cuenta que preparó el período) puede sellar.
  const owner=await new Contract(config.address,ABI,provider).owner();
  if(owner.toLowerCase()!==address.toLowerCase())throw new Error(`Solo el municipio puede sellar: el contrato lo firma la cuenta ${short(owner)} y MetaMask está conectada con ${short(address)}. Cambia de cuenta en MetaMask.`);
  // La sal se genera en el navegador y se guarda en el servidor ANTES de firmar, en un archivo propio de este contrato.
  let s=null;const r=await fetch('/api/sal?red=sepolia');if(r.ok){const j=await r.json();if(validSalt(j.salt))s=j.salt;}
  if(!s){s=preparedSalt;await postJson('/api/sepolia/sal',{address:config.address,salt:s});}
  const candidate=s===preparedSalt?prepared:await buildEvidence(originalTexts,baseline,s);
  status('sealStatus','Confirma la transacción en MetaMask…');
  const tx=await new Contract(config.address,ABI,signer).seal(PERIOD,candidate.root,await evidenceHash(candidate),187);
  status('sealStatus',`Esperando confirmación de la red… (Sepolia tarda unos segundos)\nTX: ${tx.hash}`);
  const receipt=await tx.wait(1);if(receipt.status!==1)throw new Error('La transacción de sellado falló en la red.');
  status('sealStatus','Comprobando el sello en la red pública…');
  config=await postJson('/api/sepolia/sello',{transactionHash:receipt.hash,evidence:candidate});
  const anchor=await readAnchor(provider,config);
  prepared=evidence=candidate;preparedSalt=salt=s;sealed=true;showAnchor(anchor);showSalt();
  status('sealStatus',`SELLADO CONFIRMADO · 187 tickets · bloque ${anchor.blockNumber}\nTX: ${anchor.transactionHash}\nLa evidencia quedó en el servidor y la sal secreta en un archivo aparte, solo para este contrato. Descarga su respaldo.`,'green');
 }catch(e){throw new Error(mensajeBilletera(e));}
}
$('downloadSalt').onclick=()=>{
 if(!salt||!config?.address)return;
 const data={period:PERIOD,contrato:config.address,red:config.network,salt,aviso:'Secreto: no publicar. Sin esta sal no se pueden comprobar los tickets del sello.'};
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');
 a.href=url;a.download=`sal-sepolia-${config.address}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
// «Preparar nuevo período»: despliega RegistroIndicador con MetaMask; el servidor lo comprueba en Sepolia antes de usarlo.
$('prepareSepolia').onclick=()=>run(async()=>{
 const st=(t,k='info')=>{const o=$('adminStatus');o.hidden=false;o.className=`status ${k}`;o.textContent=t;};
 try{
  const {signer,address}=await conectarSepolia(t=>st(t));wallet=address;
  const artifact=JSON.parse(await get('/contracts/RegistroIndicador.json'));
  st(`Confirma en MetaMask el despliegue del contrato (cuenta ${short(address)}).`);
  const contract=await new ContractFactory(artifact.abi,artifact.bytecode,signer).deploy(await sha(JSON.stringify(POLICY)));
  st('Esperando confirmación de la red… (Sepolia tarda unos segundos)');
  const receipt=await contract.deploymentTransaction().wait(1);
  st('Comprobando el contrato en la red pública…');
  const nuevo=await postJson('/api/sepolia/periodo',{address:await contract.getAddress(),deploymentTransaction:receipt.hash});
  $('network').value='sepolia';recordarRed('sepolia');await useNetwork('sepolia');comprobarOwner();
  st(`Período preparado: contrato ${short(nuevo.address)} sin sellar, comprobado en Sepolia. Sigue el paso 3: carga los originales.`,'green');
 }catch(e){st(`No se preparó el período · ${mensajeBilletera(e)}`,'pending');console.error(e);}
});
// Paso 1: conectar MetaMask. Muestra la cuenta, la red y si es el owner del contrato activo.
$('connectWallet').onclick=()=>run(async()=>{
 const st=t=>{$('walletInfo').textContent=t;};
 try{walletMsg=null;const {address}=await conectarSepolia(st);wallet=address;await comprobarOwner();}
 catch(e){wallet=null;walletMsg=`No se conectó · ${mensajeBilletera(e)}`;console.error(e);}
});
// Si se cambia de cuenta en MetaMask, el paso 1 se actualiza solo (sin pedir nada).
globalThis.ethereum?.on?.('accountsChanged',cuentas=>{wallet=cuentas?.[0]??null;comprobarOwner();controls();});
$('verify').onclick=()=>run(doVerify);
// ---------- Calendario de feriados: uno o varios feriados simulados, sin tocar el registro sellado ----------
const DIAS=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const diaDe=d=>new Date(`${d}T12:00:00-05:00`).getUTCDay();
const fechaCorta=d=>`${d.slice(8,10)}/${d.slice(5,7)}/${d.slice(0,4)}`;
let feriados=[];
function avisoFeriado(texto){$('holidayResult').innerHTML=`<div class="status pending">${esc(texto)}</div>`;}
// Valida una fecha del campo: formato y rango permitido. Devuelve el mensaje de error o null.
function fechaInvalida(d){const {min,max}=$('holidayDate');if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||Number.isNaN(Date.parse(d)))return 'Elige una fecha válida.';if(d<min||d>max)return `La fecha debe estar entre el ${fechaCorta(min)} y el ${fechaCorta(max)}.`;return null;}
function pintarFeriados(){
 $('holidayList').innerHTML=feriados.length?feriados.map(d=>{const w=diaDe(d),finde=w===0||w===6;return `<li${finde?' class="weekend"':''}><span><strong>${fechaCorta(d)}</strong> · ${DIAS[w]}${finde?' · fin de semana: no cambia plazos':''}</span><button type="button" class="chip-remove" data-ui data-remove="${d}" aria-label="Quitar el feriado del ${fechaCorta(d)}">×</button></li>`;}).join('')
  :'<li class="empty">Aún no agregas feriados: se calculará con la fecha del campo.</li>';
}
$('addHoliday').onclick=()=>{
 const d=$('holidayDate').value,error=fechaInvalida(d);
 if(error)return avisoFeriado(error);
 if(feriados.includes(d))return avisoFeriado(`El ${fechaCorta(d)} ya está en la lista.`);
 feriados=[...feriados,d].sort();pintarFeriados();$('holidayResult').replaceChildren();
};
$('holidayList').onclick=e=>{const b=e.target.closest('[data-remove]');if(!b)return;feriados=feriados.filter(x=>x!==b.dataset.remove);pintarFeriados();$('holidayResult').replaceChildren();};
pintarFeriados();
$('simulate').onclick=()=>run(async()=>{
 const campo=$('holidayDate').value,fechas=feriados.length?feriados:[campo];
 if(!feriados.length){const error=fechaInvalida(campo);if(error)return avisoFeriado(error);}
 // Sin tickets verificados no hay sobre qué simular: se recalcula primero, desde lo sellado.
 if(!verified){
  $('holidayResult').innerHTML='<div class="status info">Recalculando el indicador desde lo sellado…</div>';
  try{$('verifyFile').value='';await doVerify();}catch(error){status('verification',`VERIFICACIÓN INCOMPLETA · ${error.message}`);}
  if(!verified){
   $('holidayResult').innerHTML=`<div class="status pending">Primero recalcula el indicador: los plazos se simulan sobre los tickets verificados.</div><a class="next" href="${sealed?'#/recalcular':'#/sellar'}">${sealed?'Ir a Recalcular':'Ir a Sellar'} <svg class="icon"><use href="#i-arrow"/></svg></a>`;return;
  }
 }
 try{
  const detalles=verified.result.details,sim=simulateHolidays(detalles,fechas,businessHours),base=verified.findings.sla.corrected;
  const notas=fechas.map(d=>{const w=diaDe(d);if(w===0||w===6)return `<li><strong>${fechaCorta(d)}</strong> es ${DIAS[w]}: ya no era día hábil, así que no cambia ningún plazo.</li>`;
   const n=simulateHolidays(detalles,[d],businessHours).changed.length;
   return `<li><strong>${fechaCorta(d)}</strong> (${DIAS[w]}): ${n?`cambia las horas de <strong>${n}</strong> ${n===1?'ticket':'tickets'}.`:'no afecta a ningún ticket: ninguno estaba en curso ese día.'}</li>`;}).join('');
  const rows=sim.changed.map(c=>`<tr${c.statusChanged?' class="flip"':''}><td>${esc(c.id)}</td><td>${fmt(c.hoursBefore)} h → ${fmt(c.hoursAfter)} h</td><td>${c.sla} h</td><td>${c.withinBefore?'Cumple':'No cumple'} → ${c.withinAfter?'Cumple':'No cumple'}</td></tr>`).join('');
  $('holidayResult').innerHTML=`<div class="status pending">SIMULACIÓN NO SELLADA · ${fechas.length===1?'Feriado':'Feriados'}: ${fechas.map(fechaCorta).join(', ')}. El registro sellado no cambia.</div>
   <ul class="holiday-notes">${notas}</ul>
   ${sim.changed.length?`<p><strong>${sim.changed.length}</strong> tickets cambian de horas y <strong>${sim.statusChanged.length}</strong> cambian de estado de SLA. Dentro de SLA: ${base.numerator}/${base.denominator} (${pct(base)}) → <strong>${sim.within.numerator}/${sim.within.denominator} (${pct(sim.within)})</strong>.</p>
   <div class="tablewrap"><table><thead><tr><th>Ticket</th><th>Horas hábiles</th><th>SLA</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div>`
   :`<p><strong>Con ${fechas.length===1?'este feriado':'estos feriados'} no cambia el plazo de ningún ticket.</strong> Dentro de SLA sigue en ${base.numerator}/${base.denominator} (${pct(base)}).</p>`}
   <p class="small">Para adoptar un feriado oficial se incorpora a las reglas del cálculo y se sella un período nuevo.</p>`;
 }catch(error){avisoFeriado(`No se pudo calcular · ${error.message}`);}
});
$('searchPersonal').onclick=()=>run(async()=>{
 periodo();
 const anchor=await readAnchor(provider,config);showAnchor(anchor);
 const t=await texts(),values=personalValues(csv(t.tickets).rows,csv(t.bitacora,BITACORA_HEADERS).rows);
 const chain=await collectChainData(provider,config,anchor),result=await searchPersonalData(chain.blobs,values);
 const kind=result.matches.length?'red':'green';
 privacyMatches=result.matches.length;if(!privacyMatches)done.add(5);
 // Veredicto del criterio 5 con las palabras del jurado. El contenido de ticket se juzga por lo que la cadena guarda (chain.decoded).
 const found=k=>result.matches.filter(m=>m.kind===k).length,searched=k=>values.filter(v=>v.kind===k).length;
 const verdict=`<div class="verdict"><p class="verdict-label">En la cadena</p><ul class="verdict-list"><li><strong>${found('usuario')}</strong> nombres de usuario</li><li><strong>${found('tecnico_asignado')}</strong> nombres de técnico</li><li><strong>0</strong> contenido de ticket</li></ul>
  <p class="verdict-sub">Se buscaron <strong>${searched('usuario')}</strong> usuarios y <strong>${searched('tecnico_asignado')}</strong> técnicos.</p></div>`;
 $('personal').innerHTML=`${verdict}<div class="status ${kind}">${result.matches.length} coincidencias de ${result.searched} valores buscados</div>
  <p class="small">Nombres de usuarios, técnicos, unidades y actores de la bitácora, buscados como texto y como hash en todo lo que el sello dejó en la cadena (${result.bytes} bytes).</p>
  ${result.matches.length?`<ul>${result.matches.map(m=>`<li>${esc(m.kind)} · ${esc(m.form)} · ${esc(m.source)} · byte ${m.offset}</li>`).join('')}</ul>`:''}`;
});
// «Consultar contrato y transacción»: lee la cadena y muestra la transacción y lo que guarda, con la hora de la consulta.
$('inspect').onclick=()=>run(async()=>{
 periodo();
 const anchor=await readAnchor(provider,config);showAnchor(anchor);
 const chain=await collectChainData(provider,config,anchor);
 $('chainData').innerHTML=`<h3>Lo que sí hay en la cadena</h3>${facts(chain.decoded)}<p class="small">Leído de la blockchain a las ${esc(new Date().toLocaleTimeString('es-EC',{timeZone:'America/Guayaquil'}))} · transacción en el bloque ${esc(anchor.blockNumber)}.</p>`;
});
$('verifyFile').onchange=()=>clearResults();
for(const id of Object.values(FILE_INPUTS))$(id).onchange=()=>{prepared=null;clearResults();controls();};
$('export').onclick=()=>{if(!evidence)return;const blob=new Blob([JSON.stringify(evidence,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='sello-original-2026-07.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('search').oninput=renderTable;$('filter').onchange=renderTable;renderPolicy();

// Reglas del cálculo (POLICY) en fichas legibles, agrupadas por tema. Su hash es el que guarda el contrato.
function renderPolicy(){
 // Solo presentación: los valores de POLICY no cambian (su hash es el sellado); se muestran en lenguaje de operación.
 const VISTA={version:v=>String(v).replace(/^nivel\d+-/,''),calendarVersion:v=>String(v).replace(/-supuesto/,''),holidayNote:()=>'Sin feriados adicionales: no se recibió un calendario oficial.'};
 const fmtValue=(key,value)=>key==='hoursTolerance'?`±${String(value).replace('.',',')} h`:key==='holidays'?(value.length?value.join(', '):'Ninguno'):VISTA[key]?VISTA[key](value):String(value);
 const groups=[
  ['Qué se cuenta',[['period','Período'],['universe','Universo'],['denominator','Denominador'],['managed','Gestionado (A)'],['confirmed','Confirmado por el usuario (B)'],['cutoff','Corte']]],
  ['Horas y SLA',[['timezone','Zona horaria'],['hours','Horario hábil'],['sla','SLA'],['hoursTolerance','Tolerancia de horas'],['holidays','Feriados'],['calendarVersion','Calendario'],['holidayNote','Nota sobre feriados']]],
  ['Sellado',[['version','Versión de las reglas'],['evidenceFiles','Archivos en el compromiso']]]
 ];
 const known=new Set(groups.flatMap(([,items])=>items.map(([k])=>k)));
 const extra=Object.keys(POLICY).filter(k=>!known.has(k)).map(k=>[k,k]);
 if(extra.length)groups.push(['Otras',extra]);
 $('policy').innerHTML=groups.map(([title,items])=>`<section class="rules-group"><h3>${esc(title)}</h3><dl>${items.map(([k,label])=>`<div><dt>${esc(label)}</dt><dd>${esc(fmtValue(k,POLICY[k]))}</dd></div>`).join('')}</dl></section>`).join('');
}

const CONFIG_FILES={local:'red-local.json',sepolia:'red-sepolia.json'};
async function useNetwork(name){
 const response=await fetch(`/evidencias/${CONFIG_FILES[name]}`);
 // Sepolia sin red-sepolia.json no es un error: es «sin período activo» (así empieza cada arranque del servidor).
 if(!response.ok&&name!=='sepolia'){$('network').value=network;throw new Error(`Falta la configuración de la red ${name}`);}
 const next=response.ok?await response.json():null;
 provider?.destroy();
 // El paso 6 (reloj del proveedor) vive en la red local siempre: cambiar la red del sellado no lo borra.
 // El paso 7 (catálogo) tiene su propia red en su vista: tampoco se borra.
 const reloj6=done.has(6),catalogo7=done.has(7);
 network=name;config=next;evidence=null;salt=null;sealed=false;prepared=null;preparedSalt=null;lastAnchor=null;privacyMatches=null;done.clear();if(reloj6)done.add(6);if(catalogo7)done.add(7);clearResults();controls();showSalt();
 $('network').value=name;
 $('configLink').href=`/evidencias/${CONFIG_FILES[name]}`;
 // La red local se consulta por /rpc del mismo servidor (funciona igual en el equipo y en un servicio publicado).
 const rpcUrl=!config?modo.sepoliaRpc:config.local?new URL('/rpc',location.href).href:config.rpc;
 if(config?.local){provider=new JsonRpcProvider(rpcUrl,undefined,{cacheTimeout:-1});provider.pollingInterval=100;}
 else provider=lectorSepolia(rpcUrl,config?.chainId);
 refreshNetwork();if(wallet)comprobarOwner();
 if(!config){
  $('privacy').innerHTML=facts([['Red','Sepolia (testnet pública de Ethereum)'],['Período','Sin período activo']]);
  $('onchain').innerHTML='<p class="small">Sin consulta.</p>';$('chainData').replaceChildren();showSealLinks(null);$('explorer').textContent='';
  $('networkNote').textContent='Pública: Sepolia. Todavía no hay un período activo: se prepara en la vista Sellar.';
  clearResults(`VERIFICACIÓN INCOMPLETA · ${SIN_PERIODO}.`);status('sealStatus',SIN_PERIODO);controls();return;
 }
 $('privacy').innerHTML=facts([['Contrato configurado',config.address],['Red',redVisible(config.network)],['RPC de lectura',rpcUrl],['Transacción de despliegue',config.deploymentTransaction],['Sello','Falta consultar el sellado.']]);
 $('onchain').innerHTML='<p class="small">Sin consulta.</p>';$('chainData').replaceChildren();showSealLinks(null);
 showExplorer(null);
 $('networkNote').textContent=config.local?'Local: red propia de este servidor, funciona sin internet. El sellado se hace desde esta página.':`Pública: ${redVisible(config.network)}. El navegador solo lee por un RPC público, sin wallet ni credenciales. El municipio selló con su propia llave.`;
 status('sealStatus','Sin sellado comprobado en esta red.');
 const file=config.evidenceFile??'sello-original.json',stored=await fetch(`/evidencias/${file}`);
 if(stored.ok){
  const candidate=await stored.json(),anchor=await readAnchor(provider,config),auth=await authenticateEvidence(candidate,anchor);if(!auth.ok)throw new Error(auth.error);
  evidence=candidate;sealed=true;showAnchor(anchor);status('sealStatus',`Sello existente confirmado en ${redVisible(config.network)}. No se reemplazará. TX ${anchor.transactionHash}`,'green');
  // La sal la entrega solo el servidor local, desde .secreto/ (o la carpeta secreta de la instancia).
  const r=await fetch(`/api/sal?red=${name}`);
  if(r.ok){const {salt:s}=await r.json();if(validSalt(s)&&await saltCommitment(s)===evidence.saltCommitment)salt=s;}
  showSalt();
 }
}
function showSalt(){
 $('downloadSalt').hidden=!(network==='sepolia'&&salt&&lastAnchor);
 $('saltStatus').textContent=salt?'Sal secreta: cargada y coincide con el compromiso del manifiesto.':evidence?'Sal secreta: falta. Sin ella no se pueden comprobar los tickets; en otro equipo, copia la carpeta .secreto/ del equipo que selló.':'Sal secreta: pendiente.';
}
// ---------- Navegación por vistas, estado del menú y tarjeta de red ----------
// Cada vista es un <section> que se muestra u oculta: el estado en memoria se conserva.
const ROUTES={panel:'panel',sellar:'s1',recalcular:'s2',verificar:'s3',comparar:'s4',privacidad:'s5',proveedor:'s6',catalogo:'s7',feriado:'holiday'};
const TITLES={panel:'Panel',sellar:'Sellar',recalcular:'Recalcular',verificar:'Verificar',comparar:'Comparar',privacidad:'Privacidad',proveedor:'Reloj del proveedor',catalogo:'Catálogo y SLA',feriado:'Calendario de feriados'};
let route=null;
const short=h=>h?`${h.slice(0,6)}…${h.slice(-4)}`:'—';
function routeFromHash(){const m=/^#\/([a-z]+)$/.exec(location.hash);return m&&ROUTES[m[1]]?m[1]:null;}
function showRoute({focus=false}={}){
 const name=routeFromHash();
 if(!name){history.replaceState(null,'','#/panel');return showRoute({focus});}
 for(const [r,id] of Object.entries(ROUTES))$(id).hidden=r!==name;
 if(name==='proveedor'&&route!==name&&!busy)proveedorUI?.refresh();
 if(name==='catalogo'&&route!==name&&!busy)catalogoUI?.refresh();
 for(const a of document.querySelectorAll('nav a[data-route]'))if(a.dataset.route===name)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
 // El mensaje de verificación es uno solo: se muestra en Recalcular y en Verificar.
 const slot=$(ROUTES[name]).querySelector('[data-slot="verification"]');if(slot)slot.append($('verification'));
 if(name==='comparar'&&lastStatus==='VERDE')done.add(4);
 const changed=route!==name;route=name;document.title=`${TITLES[name]} · ATENEA · Indicador recomputable`;
 closeMenu();
 if(changed&&focus){window.scrollTo(0,0);$(ROUTES[name]).querySelector('h1').focus({preventScroll:true});}
 renderNav();
}
function setDot(el,kind,label){el.className=`dot ${kind}`;el.setAttribute('aria-label',label);}
function renderNav(){
 const sealOk=sealed&&!!lastAnchor;
 const result=lastStatus==='VERDE'?['green','VERDE']:lastStatus==='ROJO'?['red','ROJO']:['gray','pendiente'];
 const dots={
  sellar:sealOk?['green','sello confirmado']:['gray','sin sello'],
  recalcular:result,comparar:result,
  verificar:lastStatus==='ROJO'?['red','alteración detectada']:['gray','sin alteración detectada'],
  privacidad:privacyMatches===null?['gray','pendiente']:privacyMatches===0?['green','0 coincidencias']:['red',`${privacyMatches} coincidencias`],
  proveedor:done.has(6)?['green','casos cargados']:['gray','pendiente'],
  catalogo:done.has(7)?['green','catálogo verificado']:['gray','pendiente']
 };
 for(const [name,[kind,label]] of Object.entries(dots))setDot(document.querySelector(`[data-dot="${name}"]`),kind,`Estado: ${label}`);
 // Panel
 $('sumSeal').textContent=sealOk?'Sellado':sealed?'Sellado (sin leer)':'Sin sello';
 $('sumSealTx').textContent=sealOk?short(lastAnchor.transactionHash):'—';$('sumSealTx').dataset.full=sealOk?lastAnchor.transactionHash:'';$('sumSealTx').title=sealOk?lastAnchor.transactionHash:'';
 $('sumVerify').className=`pill ${result[0]}`;$('sumVerify').textContent=lastStatus??'Pendiente';
 $('sumVerifyNote').textContent=lastStatus==='VERDE'?'Integridad verificada contra el sello.':lastStatus==='ROJO'?'El archivo verificado no coincide con lo sellado.':'Pulsa «Recalcular desde lo sellado» en el paso 2.';
 $('sumCount').textContent=sealOk?String(lastAnchor.count):'—';
 $('sumGap').textContent=verified?`${fmt(verified.result.gap)} pp`:'—';
 const steps=[sealOk,done.has(2),done.has(3),done.has(4),done.has(5),done.has(6),done.has(7)];
 for(const li of $('demoScript').children){const ok=steps[Number(li.dataset.step)-1];li.classList.toggle('done',ok);li.querySelector('.check').setAttribute('aria-label',ok?'Cumplido':'Pendiente');}
 // Botones «Siguiente» solo cuando el paso de la vista ya se hizo.
 const next={sellar:sealOk,recalcular:lastStatus==='VERDE',verificar:done.has(3),comparar:!!verified};
 for(const a of document.querySelectorAll('[data-next]'))a.hidden=!next[a.dataset.next];
 $('compareStart').hidden=!!verified;
}
async function refreshNetwork(){
 if(!provider)return;
 const p=provider,dot=$('rpcDot');
 $('netName').textContent=!config?'Pública · Sepolia · sin período activo':config.local?'Local · Ganache':'Pública · Sepolia';
 // En redes con explorador público (Sepolia), la dirección enlaza al contrato en Etherscan.
 if(!config){$('netContract').textContent='—';$('netContract').title='';}
 else{$('netContract').innerHTML=config.explorer?`<a href="${esc(config.explorer)}/address/${esc(config.address)}" target="_blank" rel="noopener">${esc(short(config.address))}</a>`:esc(short(config.address));$('netContract').title=config.address;}
 try{const block=await p.getBlockNumber();if(p!==provider)return;$('netBlock').textContent=block.toLocaleString('es-EC');setDot(dot,'green','RPC: responde');}
 catch{if(p!==provider)return;$('netBlock').textContent='—';setDot(dot,'red','RPC: no responde');}
}
setInterval(()=>{if(!document.hidden)refreshNetwork();},10000);

function closeMenu(){document.body.classList.remove('menu-open');$('menuToggle').setAttribute('aria-expanded','false');}
$('menuToggle').onclick=()=>{
 const open=!document.body.classList.contains('menu-open');
 document.body.classList.toggle('menu-open',open);$('menuToggle').setAttribute('aria-expanded',String(open));
 if(open)document.querySelector('nav a[aria-current]')?.focus();
};
$('menuClose').onclick=()=>{closeMenu();$('menuToggle').focus();};
$('backdrop').onclick=closeMenu;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('menu-open')){closeMenu();$('menuToggle').focus();}});
for(const a of document.querySelectorAll('nav a'))a.addEventListener('click',closeMenu);

document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-copy],[data-copy-value]');if(!button)return;
 const target=button.dataset.copy?$(button.dataset.copy):null,text=button.dataset.copyValue??(target?.dataset.full||target?.textContent||'');
 if(!text||text==='—')return;
 const label=button.dataset.label??=button.getAttribute('aria-label');
 try{await navigator.clipboard.writeText(text);button.classList.add('copied');button.setAttribute('aria-label','Copiado');}
 catch{button.setAttribute('aria-label','No se pudo copiar');}
 setTimeout(()=>{button.classList.remove('copied');button.setAttribute('aria-label',label);},1500);
});

$('recalc').onclick=()=>run(async()=>{$('verifyFile').value='';await doVerify();});
// Mismo recálculo desde Comparar: evita volver a la vista Recalcular después del ROJO.
$('recalcCompare').onclick=$('recalc').onclick;
addEventListener('hashchange',()=>showRoute({focus:true}));
showRoute();

// Selector de red: respaldo para emergencias, dentro de «Administración». La elección se recuerda en esta pestaña.
$('network').onchange=()=>{recordarRed($('network').value);run(()=>useNetwork($('network').value));};
// ¿Responde un RPC? Una llamada eth_blockNumber con tiempo límite, sin ethers.
async function rpcResponde(url,ms=8000){
 const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),ms);
 try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_blockNumber',params:[]}),signal:ctl.signal});return r.ok&&!!(await r.json()).result;}
 catch{return false;}finally{clearTimeout(t);}
}
// Red al abrir: Sepolia. Cada arranque del servidor empieza sin período activo («Sin período activo · prepara…»);
// el período preparado en la sesión se conserva al recargar. La red local solo si no hay internet o si se eligió.
async function redInicial(){
 let pref=null;try{pref=sessionStorage.getItem(PREF_RED);}catch{}
 try{const r=await fetch('/api/modo');if(r.ok)modo={...modo,...await r.json()};}catch{}
 if(pref==='local')return 'local';
 const cfg=await fetch('/evidencias/red-sepolia.json');
 const rpc=cfg.ok?(await cfg.json()).rpc:modo.sepoliaRpc;
 // Principal y respaldo, dos intentos cada uno: una red inestable no manda la app a la red local por un solo fallo.
 for(let i=0;i<2;i++)for(const u of urlsSepolia(rpc)){if(await rpcResponde(u))return 'sepolia';avisoRed('Sin conexión con Sepolia, reintentando…');}
 avisoRed(null);
 $('netHint').textContent='Sin conexión con Sepolia: se abrió la red local. Cuando vuelva internet, elige «Pública (Sepolia)».';
 return 'local';
}
// Nivel 2: la vista vive en proveedor.mjs; aquí solo se le pasa el estado compartido.
proveedorUI=initProveedor({$,esc,run,setDone:v=>{if(v)done.add(6);else done.delete(6);renderNav();},modo:()=>modo,ocupado:()=>busy,lectorSepolia});
// Nivel 3: la vista vive en catalogo-ui.mjs.
catalogoUI=initCatalogo({$,esc,run,setDone:v=>{if(v)done.add(7);else done.delete(7);renderNav();},modo:()=>modo,ocupado:()=>busy,lectorSepolia});
await run(async()=>{baseline=JSON.parse(await get('/src/originals.json'));await useNetwork(await redInicial());});
window.__ateneaReady=true;
