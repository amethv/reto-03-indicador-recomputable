// Vista #/proveedor en modo «Sepolia (real)»: solo el rol del municipio.
// El municipio prepara el reloj y firma la apertura con su MetaMask; el proveedor responde desde
// OTRO programa (portal-proveedor/) con SU MetaMask. Esta vista solo lee Sepolia por RPC público
// y se actualiza sola cuando el proveedor responde.
import {Contract,ContractFactory,JsonRpcProvider,getAddress,isAddress} from 'ethers';
import {ABI_RELOJ,idHash,parseCasos,parseProveedores,usd,motivoRevert} from './reloj.mjs';
import {conectarSepolia,mensajeBilletera} from './wallet.mjs';

const short=a=>a?`${a.slice(0,6)}…${a.slice(-4)}`:'—';
const horas=s=>(s/3600).toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2});
const fecha=s=>new Date(s*1000).toLocaleString('es-EC',{timeZone:'America/Guayaquil',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
export const PROVEEDOR_1_POR_DEFECTO='0x417502991342eAf1B71015b66D128B75D7a0fA67';
const CADA_MS=5000;

/**
 * ctx: {$, esc, run, setDone(bool), modo() → {portalProveedor}, visible() → bool, ocupado() → bool}
 * Devuelve {refresh(), activar(bool), botones(busy)}: activar(true) revisa Sepolia cada pocos segundos.
 */
export function initRelojSepolia(ctx){
 const {$,esc}=ctx;
 let config=null,provider=null,casos=null,estado=null,activo=false,leyendo=false,timer=null;
 const rechazados=new Map();
 const status=(text,kind='info')=>{$('sepStatus').hidden=false;$('sepStatus').className=`status ${kind}`;$('sepStatus').textContent=text;};
 const etherscan=(tipo,h,texto)=>config?.explorer&&h?`<a href="${esc(config.explorer)}/${tipo}/${esc(h)}" target="_blank" rel="noopener">${esc(texto)}</a>`:'';
 const contrato=(runner=provider)=>new Contract(config.address,ABI_RELOJ,runner);

 async function cargarConfig(){
  const r=await fetch('/evidencias/reloj-sepolia.json',{cache:'no-store'});
  const nuevo=r.ok?await r.json():null;
  if(nuevo?.address!==config?.address){provider?.destroy();provider=null;rechazados.clear();estado=null;}
  config=nuevo;
  if(config&&!provider){provider=new JsonRpcProvider(config.rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=4000;}
  if(!casos)casos=parseCasos(await (await fetch('/datos/tickets_proveedor.csv')).text());
 }

 // Estado leído de Sepolia: apertura y respuesta de cada caso, penalidad del contrato y transacciones (eventos).
 async function leer(){
  if(!config){estado=null;return;}
  const k=contrato(),cuentaP1=config.proveedores[0].cuenta,filas=[];
  for(const c of casos){
   const id=idHash(c.id),e=await k.casos(id);
   filas.push({c,id,abierto:e.abierto,respondido:e.respondido,apertura:Number(e.apertura),respuesta:Number(e.respuesta),penalidad:e.respondido?await k.penalidad(id):null});
  }
  // Cuando el proveedor ya respondió, los casos abiertos sin respuesta se simulan desde su cuenta (eth_call, sin gas):
  // así se sabe cuál rechazaría el contrato y por qué.
  if(filas.some(f=>f.respondido))for(const f of filas)if(f.abierto&&!f.respondido&&!rechazados.has(f.c.id)){
   try{await k.responder.staticCall(f.id,f.c.respuesta,{from:cuentaP1});}catch(e){rechazados.set(f.c.id,motivoRevert(e));}
  }
  const tx=new Map();
  try{
   const desde=config.deploymentBlock??0;
   for(const l of await k.queryFilter(k.filters.CasoAbierto(),desde,'latest'))tx.set(`a:${l.args.casoId}`,l.transactionHash);
   for(const l of await k.queryFilter(k.filters.CasoRespondido(),desde,'latest'))tx.set(`r:${l.args.casoId}`,l.transactionHash);
  }catch(e){console.error('eventos del reloj',e);}
  for(const f of filas){f.rechazado=f.abierto&&!f.respondido&&rechazados.has(f.c.id);f.txApertura=tx.get(`a:${f.id}`);f.txRespuesta=tx.get(`r:${f.id}`);}
  const abiertos=filas.filter(f=>f.abierto).length,respondidos=filas.filter(f=>f.respondido).length,rech=filas.filter(f=>f.rechazado).length;
  estado={filas,abiertos,respondidos,rechazados:rech,total:filas.reduce((s,f)=>s+(f.penalidad??0n),0n)};
  if(respondidos>0&&respondidos+rech===casos.length)ctx.setDone(true);
 }
 // Habilitación de los botones; app.mjs la vuelve a aplicar después de cada acción (controls()).
 function botones(busy=ctx.ocupado()){
  $('prepararReloj').disabled=$('sepProveedor').disabled=busy;
  $('sepAbrir').disabled=busy||!config||!!estado&&estado.abiertos===casos?.length;$('sepEnviar').disabled=busy||!config;
 }

 function pintar(){
  // Pasos: 1 preparar, 2 abrir, 3 enviar y esperar, 4 respuestas recibidas.
  const completo=!!estado&&estado.respondidos>0&&estado.respondidos+estado.rechazados===casos.length;
  const paso=!config?1:!estado||estado.abiertos<casos.length?2:completo?4:3;
  for(const li of document.querySelectorAll('[data-sep-step]')){const n=Number(li.dataset.sepStep);li.classList.toggle('done',n<paso||completo);li.classList.toggle('current',n===paso&&!completo);}
  botones();
  $('sepRelojInfo').innerHTML=config?`Reloj activo: ${etherscan('address',config.address,config.address)} · municipio ${esc(short(config.municipio))} · proveedor 1 ${esc(short(config.proveedores[0].cuenta))}.`:'<strong>Sin reloj en Sepolia.</strong> Prepáralo con la cuenta del municipio en MetaMask.';
  const textos={1:'Paso 1 · Prepara el reloj en Sepolia con la cuenta del municipio.',2:'Paso 2 · Firma la apertura de los 9 casos (una sola firma).',3:'Paso 3 · Envía el enlace al proveedor y espera: la vista revisa Sepolia cada 5 segundos.',4:'Flujo completo · El proveedor respondió desde su propio programa y su propia billetera.'};
  $('sepGuide').innerHTML=`<strong>${esc(textos[paso])}</strong>`;
  if(!estado){$('sepCases').replaceChildren();$('sepTotal').replaceChildren();$('sepRejected').replaceChildren();return;}
  const {filas,respondidos,rechazados:rech,total}=estado,hay=respondidos+rech>0;
  $('sepTotal').innerHTML=`<article class="metric"><h3>Casos aceptados</h3><p class="metric-value">${hay?respondidos:'—'}</p></article>
   <article class="metric"><h3>Rechazados</h3><p class="metric-value${rech?' bad':''}">${hay?rech:'—'}</p></article>
   <article class="metric"><h3>Penalidades (contrato)</h3><p class="metric-value case-total">${hay?esc(usd(total)):'—'}</p></article>`;
  $('sepRejected').innerHTML=filas.filter(f=>f.rechazado).map(f=>`<div class="status red"><strong>${esc(f.c.id)}</strong> · Rechazado por el contrato: respuesta anterior a la apertura. El CSV lo reportaba como cumplido con ${esc(usd(BigInt(f.c.declarado.penalidadCentavos)))}.</div>`).join('');
  $('sepCases').innerHTML=filas.map(f=>{
   const ap=f.abierto?`${esc(fecha(f.apertura))}<br><span class="sig-tag">firma municipio</span>`:'<span class="pending-cell">pendiente</span>';
   const resp=f.respondido?`${esc(fecha(f.respuesta))}<br><span class="sig-tag">firma proveedor 1</span>`:f.rechazado?`${esc(fecha(f.c.respuesta))}<br><span class="rej-tag">rechazada: anterior a la apertura</span>`:f.abierto?'<span class="pending-cell">esperando al proveedor</span>':'<span class="pending-cell">pendiente</span>';
   const h=f.respondido?horas(f.respuesta-f.apertura):f.rechazado?horas(f.c.respuesta-f.c.apertura):'—';
   const pen=f.respondido?`<span class="pen-pill ${f.penalidad>0n?'bad':'ok'}">${esc(usd(f.penalidad))}</span>`:f.rechazado?'<span class="pen-pill bad">rechazado</span>':'—';
   const links=[etherscan('tx',f.txApertura,'apertura'),etherscan('tx',f.txRespuesta,'respuesta')].filter(Boolean).join(' · ')||'—';
   return `<tr${f.rechazado?' class="rejected"':''} data-caso="${esc(f.id)}"><td><strong>${esc(f.c.id)}</strong></td><td>${ap}</td><td>${resp}</td><td>${h}</td><td>${pen}</td><td class="small">${links}</td></tr>`;
  }).join('');
 }

 // Lectura periódica: no bloquea la interfaz ni se superpone con otra lectura.
 async function refresh(){
  if(leyendo)return;leyendo=true;
  try{await cargarConfig();await leer();}catch(e){console.error(e);status(`No se pudo leer Sepolia · ${e.shortMessage??e.message}`,'pending');}
  finally{leyendo=false;}
  pintar();
 }
 function activar(si){
  activo=si;clearInterval(timer);timer=null;
  if(si){refresh();timer=setInterval(()=>{if(activo&&ctx.visible()&&!document.hidden)refresh();},CADA_MS);}
 }
 const accion=fn=>()=>ctx.run(async()=>{try{await fn();}catch(e){status(mensajeBilletera(e),'pending');console.error(e);}await refresh();});

 $('sepProveedor').value=PROVEEDOR_1_POR_DEFECTO;

 // Paso 1: el municipio despliega RelojProveedor con su MetaMask; el servidor lo comprueba en Sepolia.
 $('prepararReloj').onclick=accion(async()=>{
  const prov=$('sepProveedor').value.trim();
  if(!isAddress(prov))throw new Error('La cuenta del proveedor 1 no es una dirección válida (0x y 40 caracteres).');
  const {signer,address}=await conectarSepolia(t=>status(t));
  if(getAddress(prov)===getAddress(address))throw new Error('La cuenta del proveedor 1 no puede ser la del municipio: cada organización firma con su propia billetera.');
  const artifact=await (await fetch('/contracts/RelojProveedor.json')).json();
  const p=parseProveedores(await (await fetch('/datos/proveedores.csv')).text()).find(x=>x.id==='PV-01');
  status(`Confirma en MetaMask el despliegue del reloj (municipio ${short(address)}, proveedor 1 ${short(prov)}).`);
  const k=await new ContractFactory(artifact.abi,artifact.bytecode,signer).deploy([idHash(p.id)],[getAddress(prov)],[p.slaSegundos],[p.tarifaCentavosPorHora]);
  status('Esperando confirmación de la red… (Sepolia tarda unos segundos)');
  const receipt=await k.deploymentTransaction().wait(1);
  status('Comprobando el reloj en la red pública…');
  const r=await fetch('/api/reloj-sepolia/preparar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:await k.getAddress(),deploymentTransaction:receipt.hash,proveedor:prov})});
  if(!r.ok)throw new Error(await r.text()||`HTTP ${r.status}`);
  const c=await r.json();
  status(`Reloj preparado en Sepolia: ${short(c.address)}, comprobado por RPC público. Sigue el paso 2: firmar la apertura.`,'green');
 });

 // Paso 2: una sola firma del municipio para los casos aún no abiertos (abrirCasos).
 $('sepAbrir').onclick=accion(async()=>{
  if(!config)throw new Error('Primero prepara el reloj en Sepolia (paso 1).');
  const {signer,address}=await conectarSepolia(t=>status(t));
  if(getAddress(address)!==getAddress(config.municipio))throw new Error(`Solo el municipio abre casos: el reloj lo firma ${short(config.municipio)} y MetaMask está conectada con ${short(address)}. Cambia de cuenta en MetaMask.`);
  const k=contrato(),pendientes=[];
  for(const c of casos)if(!(await k.casos(idHash(c.id))).abierto)pendientes.push(c);
  if(!pendientes.length)return status(`El municipio ya firmó la apertura de los ${casos.length} casos. El contrato no permite abrirlos dos veces.`,'pending');
  const args=[pendientes.map(c=>idHash(c.id)),pendientes.map(c=>idHash(c.proveedorId)),pendientes.map(c=>c.apertura)];
  // Se prueba antes de firmar (sin gas): si el contrato lo rechazaría, se dice por qué y no se envía nada.
  try{await contrato().abrirCasos.staticCall(...args,{from:address});}catch(e){throw new Error(`El contrato rechazaría la apertura: ${motivoRevert(e)}`);}
  status(`Confirma en MetaMask la apertura de ${pendientes.length} casos: una sola firma del municipio.`);
  const tx=await contrato(signer).abrirCasos(...args);
  status(`Esperando confirmación de la red…\nTX: ${tx.hash}`);
  const rc=await tx.wait(1);if(rc.status!==1)throw new Error('La apertura falló en la red.');
  status(`El municipio firmó la apertura de ${pendientes.length} casos en una sola transacción (bloque ${rc.blockNumber}). Sigue el paso 3: enviar el enlace al proveedor.`,'green');
 });

 // Paso 3: enlace al portal del proveedor (otro programa), con la dirección del contrato incluida.
 $('sepEnviar').onclick=()=>{
  if(!config)return;
  const url=new URL(ctx.modo().portalProveedor||'http://127.0.0.1:8081/');url.searchParams.set('contrato',config.address);
  $('sepLink').hidden=false;$('sepLink').textContent=url.href;
  navigator.clipboard?.writeText(url.href).then(()=>status('Enlace al portal del proveedor copiado. Envíaselo (por ejemplo por chat): lo abre en su navegador, con su MetaMask.','green'),()=>status('Copia el enlace de abajo y envíaselo al proveedor.'));
 };

 return {refresh,activar,botones};
}
