// Portal del proveedor · interfaz. Programa separado del municipio: sitio estático que lee Sepolia por
// RPC público y firma con la MetaMask del proveedor. No guarda nada en ningún servidor.
import {BrowserProvider,JsonRpcProvider,getAddress} from 'ethers';
import {SEPOLIA_ID,SEPOLIA_HEX,RPC_PUBLICO,EXPLORADOR,esDireccion,usd,leerReloj,rolDeCuenta,estadoCasos,firmarRespuestas,transacciones,nuevoContrato,motivo} from './logica.js';

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=a=>a?`${a.slice(0,6)}…${a.slice(-4)}`:'—';
const horas=s=>(s/3600).toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2});
const fecha=s=>new Date(s*1000).toLocaleString('es-EC',{timeZone:'America/Guayaquil',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const link=(tipo,h,texto)=>`<a href="${EXPLORADOR}/${tipo}/${esc(h)}" target="_blank" rel="noopener">${esc(texto)}</a>`;
const TITULO=document.title,CLAVE='portal-proveedor:contrato',CADA_MS=5000;
const RECHAZO='Rechazado por el contrato: respuesta anterior a la apertura';
const textoRechazo=m=>m==='Respuesta anterior a la apertura'?RECHAZO:`Rechazado por el contrato: ${m}`;

// RPC de lectura: el público de Sepolia. ?rpc= solo se acepta al abrir el portal en este mismo equipo (pruebas).
const params=new URLSearchParams(location.search),local=['127.0.0.1','localhost'].includes(location.hostname);
const lector=new JsonRpcProvider(local&&params.get('rpc')||RPC_PUBLICO,undefined,{cacheTimeout:-1});
let casos=[],contrato=null,reloj=null,cuenta=null,signer=null,estado=null,txs=new Map(),desde=null,ultimaTx=null,leyendo=false,ocupado=false;

function aviso(texto,listo=false){const a=$('aviso');a.hidden=!texto;a.textContent=texto??'';a.classList.toggle('listo',listo);}
function estadoMsg(texto,clase=''){const o=$('estado');o.hidden=!texto;o.className=`estado ${clase}`;o.textContent=texto??'';}

// ---------- 1 · MetaMask del proveedor ----------
async function conectar(){
 const eth=globalThis.ethereum;
 if(!eth)throw new Error('No se encontró MetaMask en este navegador. Instala la extensión, importa la cuenta del proveedor y recarga la página.');
 await eth.request({method:'eth_requestAccounts'});
 if(await eth.request({method:'eth_chainId'})!==SEPOLIA_HEX){
  try{await eth.request({method:'wallet_switchEthereumChain',params:[{chainId:SEPOLIA_HEX}]});}
  catch(e){
   if(e?.code===4902)await eth.request({method:'wallet_addEthereumChain',params:[{chainId:SEPOLIA_HEX,chainName:'Sepolia',nativeCurrency:{name:'Sepolia ETH',symbol:'ETH',decimals:18},rpcUrls:[RPC_PUBLICO],blockExplorerUrls:[EXPLORADOR]}]});
   else throw new Error(e?.code===4001?'Cambio de red cancelado: MetaMask debe estar en Sepolia para firmar.':`No se pudo cambiar MetaMask a Sepolia: ${e?.message??e}`);
  }
 }
 const bp=new BrowserProvider(eth,'any');
 if(Number((await bp.getNetwork()).chainId)!==SEPOLIA_ID)throw new Error('MetaMask no quedó en Sepolia. Cámbiala a Sepolia y vuelve a intentarlo.');
 signer=await bp.getSigner();cuenta=getAddress(await signer.getAddress());
}
function pintarCuenta(){
 if(!cuenta){$('cuenta').textContent='Sin conectar.';return;}
 const base=`Cuenta <span class="hash" title="${esc(cuenta)}">${esc(short(cuenta))}</span> · red Sepolia`;
 if(!reloj){$('cuenta').innerHTML=`${base}<br>Indica el contrato para comprobar si es la cuenta del proveedor 1.`;return;}
 const rol=rolDeCuenta(cuenta,reloj);
 $('cuenta').innerHTML=base+(rol==='proveedor'?'<br><span class="ok">✓ Es la cuenta del proveedor 1 registrada en el contrato: puede firmar las respuestas.</span>'
  :rol==='municipio'?`<span class="no">Es la cuenta del municipio. Esa llave no puede responder: el contrato solo acepta respuestas firmadas por el proveedor 1 (${esc(short(reloj.cuenta))}). Cambia a la cuenta del proveedor en MetaMask.</span>`
  :`<span class="no">Esta cuenta no es la del proveedor 1 registrada en el contrato (${esc(short(reloj.cuenta))}). Esa llave no puede responder. Cambia de cuenta en MetaMask.</span>`);
}

// ---------- 2 · Contrato del reloj ----------
async function usarContrato(direccion){
 direccion=String(direccion??'').trim();
 if(!esDireccion(direccion)){$('relojInfo').textContent='Pega una dirección de contrato válida (0x y 40 caracteres).';return;}
 contrato=nuevoContrato(direccion,lector);reloj=null;estado=null;txs=new Map();desde=null;ultimaTx=null;
 $('contrato').value=getAddress(direccion);try{localStorage.setItem(CLAVE,getAddress(direccion));}catch{}
 $('relojInfo').textContent='Leyendo el contrato en Sepolia…';
 try{reloj=await leerReloj(contrato);}catch(e){contrato=null;$('relojInfo').textContent=e.message;pintar();return;}
 $('relojInfo').innerHTML=`Reloj ${link('address',contrato.target,short(contrato.target))} · municipio ${esc(short(reloj.municipio))} · proveedor 1 registrado: <span class="hash">${esc(short(reloj.cuenta))}</span> · SLA ${reloj.sla/3600} h.`;
 pintarCuenta();await revisar();
}

// ---------- 3 · Casos: lectura periódica ----------
async function revisar(){
 if(!contrato||!reloj||leyendo)return;leyendo=true;
 try{
  estado=await estadoCasos(contrato,casos,reloj.cuenta);
  try{desde??=Math.max(0,await lector.getBlockNumber()-45000);txs=await transacciones(contrato,desde);}catch(e){console.warn('eventos',e);}
 }catch(e){console.error(e);estadoMsg(`No se pudo leer Sepolia · ${e.shortMessage??e.message}`,'mal');}
 finally{leyendo=false;}
 pintar();
}
function pintar(){
 pintarCuenta();
 if(!estado){aviso(null);document.title=TITULO;$('firmar').disabled=true;$('resumen').hidden=true;$('rechazos').replaceChildren();if(!contrato)$('casos').innerHTML='<tr><td colspan="6" class="vacio">Indica el contrato para ver tus casos.</td></tr>';return;}
 const {filas,abiertos,validos,rechazados,respondidos,total}=estado;
 // Notificación: cuando el municipio abre casos, un aviso visible (y en el título de la pestaña).
 // Pendientes = abiertos sin respuesta (los válidos y el que el contrato rechazaría).
 if(validos>0){const pendientes=validos+rechazados;aviso(`Nuevos casos del municipio: ${pendientes} pendientes de tu respuesta`);document.title=`(${pendientes}) ${TITULO}`;}
 else if(respondidos>0){aviso(`✓ Respondiste ${respondidos} casos${rechazados?` · ${rechazados} rechazado por el contrato`:''}`,true);document.title=TITULO;}
 else{aviso(null);document.title=TITULO;}
 $('rechazos').innerHTML=filas.filter(f=>f.estado==='RECHAZADO').map(f=>`<p class="rechazo">${esc(f.id)} · ${esc(textoRechazo(f.motivo))}. No se enviará: probado sin gastar gas.</p>`).join('');
 $('casos').innerHTML=!abiertos?'<tr><td colspan="6" class="vacio">El municipio todavía no abrió casos. Esta página revisa Sepolia cada 5 segundos y te avisará.</td></tr>'
  :filas.map(f=>{
   const ap=f.abierto?`${esc(fecha(f.apertura))}${txs.get(`a:${f.casoId}`)?`<br>${link('tx',txs.get(`a:${f.casoId}`),'ver en Etherscan')}`:''}`:'—';
   const resp=f.estado==='RESPONDIDO'?f.respuestaFirmada:f.respuesta;
   const h=f.abierto?horas(resp-f.apertura):'—';
   const est={SIN_APERTURA:'<span class="etiqueta">Sin abrir</span>',VALIDO:'<span class="etiqueta valido">Lista para firmar</span>',
    RECHAZADO:`<span class="etiqueta rojo">${esc(textoRechazo(f.motivo))}</span>`,
    RESPONDIDO:`<span class="etiqueta firmado">Firmada</span>${txs.get(`r:${f.casoId}`)?`<br>${link('tx',txs.get(`r:${f.casoId}`),'ver en Etherscan')}`:''}`}[f.estado];
   return `<tr${f.estado==='RECHAZADO'?' class="rechazado"':''}><td><strong>${esc(f.id)}</strong></td><td>${ap}</td><td>${esc(fecha(resp))}</td><td>${h}</td><td>${est}</td><td>${f.penalidad===null?'—':esc(usd(f.penalidad))}</td></tr>`;
  }).join('');
 $('firmar').disabled=ocupado||validos===0;
 $('firmar').textContent=validos?`Firmar respuestas (${validos} en un solo lote)`:'Firmar respuestas';
 $('resumen').hidden=!respondidos;
 $('resumen').innerHTML=`<article class="metrica"><h3>Casos aceptados</h3><p>${respondidos}</p></article><article class="metrica"><h3>Rechazados</h3><p class="${rechazados?'malo':''}">${rechazados}</p></article><article class="metrica"><h3>Penalidades (contrato)</h3><p>${esc(usd(total))}</p></article>`;
 $('enlaces').innerHTML=contrato?`${link('address',contrato.target,'Contrato en Etherscan')}${ultimaTx?` · ${link('tx',ultimaTx,'Transacción de tus respuestas')}`:''}`:'';
}

// ---------- Firmar: un solo lote con los casos que el contrato aceptará ----------
async function firmar(){
 if(!estado?.validos)return;
 if(!cuenta){estadoMsg('Conectando MetaMask…');await conectar();pintarCuenta();}
 const rol=rolDeCuenta(cuenta,reloj);
 if(rol!=='proveedor'){estadoMsg(rol==='municipio'?`Esa llave es la del municipio y no puede responder: el contrato solo acepta respuestas del proveedor 1 (${short(reloj.cuenta)}). Cambia de cuenta en MetaMask.`:`Esta cuenta no es la del proveedor 1 registrada en el contrato (${short(reloj.cuenta)}): esa llave no puede responder. Cambia de cuenta en MetaMask.`,'mal');return;}
 // Se vuelve a simular justo antes de firmar: solo van los casos que el contrato aceptará.
 estado=await estadoCasos(contrato,casos,reloj.cuenta);
 const fuera=estado.filas.filter(f=>f.estado==='RECHAZADO').map(f=>f.id);
 estadoMsg(`Confirma en MetaMask: ${estado.validos} respuestas en una sola transacción.${fuera.length?` ${fuera.join(', ')} no se envía: el contrato lo rechazaría.`:''}`);
 const r=await firmarRespuestas(nuevoContrato(contrato.target,signer),estado);
 ultimaTx=r.tx;
 estadoMsg(`Respuestas firmadas con tu llave: ${r.enviados.length} casos en una sola transacción (bloque ${r.bloque}).\nTX: ${r.tx}`,'bien');
}
const errorBilletera=e=>e?.code==='ACTION_REJECTED'||e?.code===4001||e?.info?.error?.code===4001?'Firma cancelada en MetaMask: no se envió nada.'
 :/insufficient funds/i.test(e?.message??'')?'La cuenta no tiene Sepolia ETH suficiente para pagar la transacción. Pide ETH de prueba en un faucet.':motivo(e);
const accion=fn=>async()=>{if(ocupado)return;ocupado=true;for(const b of document.querySelectorAll('button'))b.disabled=true;
 try{await fn();}catch(e){console.error(e);estadoMsg(errorBilletera(e),'mal');}
 finally{ocupado=false;for(const b of document.querySelectorAll('button'))b.disabled=false;await revisar();}};

$('conectar').onclick=accion(async()=>{$('cuenta').textContent='Conectando con MetaMask…';try{await conectar();}catch(e){cuenta=null;$('cuenta').textContent=errorBilletera(e);throw e;}});
$('usarContrato').onclick=accion(()=>usarContrato($('contrato').value));
$('firmar').onclick=accion(firmar);
globalThis.ethereum?.on?.('accountsChanged',c=>{cuenta=c?.[0]?getAddress(c[0]):null;signer=null;if(cuenta)conectar().catch(()=>{}).finally(pintarCuenta);else pintarCuenta();});

casos=(await (await fetch('casos-pv01.json')).json()).casos;
let inicial=params.get('contrato');if(!esDireccion(inicial)){try{inicial=localStorage.getItem(CLAVE);}catch{inicial=null;}}
if(esDireccion(inicial))await usarContrato(inicial);else pintar();
setInterval(()=>{if(!document.hidden&&!ocupado)revisar();},CADA_MS);
window.__portalListo=true;
