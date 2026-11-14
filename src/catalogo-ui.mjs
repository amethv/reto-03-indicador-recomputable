// Vista #/catalogo · Nivel 3, Catálogo y SLA anclados.
// Sepolia (real): el municipio despliega RegistroCatalogo y ancla el catálogo con su MetaMask; el servidor lo
// comprueba por RPC público. Local: respaldo sin internet, con el contrato que el servidor desplegó en Ganache.
import {ContractFactory,JsonRpcProvider,getAddress} from 'ethers';
import {PERIODO_CATALOGO,RECHAZO_RECLASIFICAR,argumentosAnclaje,argsContrato,leerAnclado,compararCatalogo,ticketsAfectados,reclasificar,intentarReclasificar,nuevoCatalogo,leerCatalogo} from './catalogo.mjs';
import {conectarSepolia,mensajeBilletera} from './wallet.mjs';

const short=a=>a?`${a.slice(0,6)}…${a.slice(-4)}`:'—';
const horas=h=>Number(h).toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2});
const PENDIENTE='atenea-catalogo-pendiente',MODO='atenea-catalogo-red';

/** ctx: {$, esc, run, setDone(bool), modo() → {sepoliaRpc}, ocupado() → bool}. Devuelve {refresh(), botones(busy)}. */
export function initCatalogo(ctx){
 const {$,esc}=ctx;
 let inteligente=false,red='sepolia',config=null,provider=null,anclado=null,txAnclaje=null,wallet=null,owner=null,original=null,nombres=new Map(),verificado=null;
 try{red=sessionStorage.getItem(MODO)==='local'?'local':'sepolia';}catch{}
 const status=(t,k='info')=>{const o=$('catStatus');o.hidden=!t;o.className=`status ${k}`;o.textContent=t??'';};
 const link=(tipo,h,texto)=>config?.explorer&&h?`<a href="${esc(config.explorer)}/${tipo}/${esc(h)}" target="_blank" rel="noopener">${esc(texto)}</a>`:'';
 const sep=()=>red==='sepolia';

 async function cargar(){
  if(!original){original=await (await fetch('/datos/catalogo_servicios.csv')).text();nombres=new Map(leerCatalogo(original).map(f=>[f.id,f.nombre]));}
  const r=await fetch(`/evidencias/${sep()?'catalogo-sepolia.json':'catalogo-local.json'}`,{cache:'no-store'});
  const nuevo=r.ok?await r.json():null;
  if(nuevo?.address!==config?.address||!provider){provider?.destroy();provider=null;anclado=null;txAnclaje=null;verificado=null;$('catResultado').replaceChildren();}
  config=nuevo;
  // Sepolia: reintentos y RPC de respaldo. Local: el /rpc de este servidor.
  if(!provider){if(sep())provider=ctx.lectorSepolia(config?.rpc);else{provider=new JsonRpcProvider(new URL('/rpc',location.href).href,undefined,{cacheTimeout:-1});provider.pollingInterval=100;}}
  if(!config){anclado={anclado:false,servicios:[]};owner=null;return;}
  const k=nuevoCatalogo(config.address,provider);
  owner=getAddress(await k.owner());anclado=await leerAnclado(k,PERIODO_CATALOGO);
  txAnclaje=config.anclajeTransaction??null;
  if(anclado.anclado&&!txAnclaje){try{const ev=await k.queryFilter(k.filters.CatalogoAnclado(PERIODO_CATALOGO),config.deploymentBlock??0,'latest');txAnclaje=ev[0]?.transactionHash??null;}catch(e){console.error(e);}}
 }

 function botones(busy=ctx.ocupado()){
  $('catModo').disabled=busy;$('catConectar').disabled=busy||!sep();
  $('catAnclar').disabled=busy||(sep()&&!wallet)||!!anclado?.anclado;
  $('catRecuperarBox').hidden=!sep()||!!anclado?.anclado;$('catRecuperar').disabled=$('catRecuperarTx').disabled=busy;
  $('catArchivo').disabled=$('catVerificar').disabled=busy||!anclado?.anclado;
  $('catReclasificar').disabled=busy||!anclado?.anclado;
 }
 function pintar(){
  const hechos=[sep()?!!wallet:null,!!anclado?.anclado,!!verificado,!!verificado?.reclasificacion];
  const sigue=hechos.findIndex(h=>h===false);
  for(const li of document.querySelectorAll('[data-cat-step]')){const i=Number(li.dataset.catStep)-1;li.classList.toggle('done',hechos[i]===true);li.classList.toggle('na',hechos[i]===null);li.classList.toggle('current',i===sigue);}
  // Paso 1: cuenta, red y si es el municipio (owner del contrato activo).
  if(!sep())$('catWallet').textContent='No aplica en la red local: ancla la cuenta del municipio de este servidor, sin MetaMask.';
  else if(!wallet)$('catWallet').textContent='Sin conectar. MetaMask debe tener la cuenta del municipio y Sepolia ETH de prueba.';
  else $('catWallet').innerHTML=`Cuenta <span class="hash" title="${esc(wallet)}">${esc(short(wallet))}</span> · red Sepolia<br>${!owner?'<span class="wallet-ok">Sin catálogo anclado: esta cuenta quedará como municipio (owner) del contrato que despliegue.</span>':owner===wallet?'<span class="wallet-ok">✓ Es la cuenta del municipio (owner del contrato).</span>':`<span class="wallet-no">No es la cuenta del municipio: el contrato lo firma ${esc(short(owner))}.</span>`}${inteligente?'<br><span class="wallet-no">Es una cuenta inteligente de MetaMask (EIP-7702): MetaMask puede enviar las transacciones a través de otro contrato. El anclaje del catálogo se comprueba igual, por sus eventos.</span>':''}`;
  // Paso 2: estado del anclaje.
  $('catInfo').innerHTML=anclado===null?'Leyendo el catálogo anclado…':anclado.anclado?`Anclado: contrato ${link('address',config.address,config.address)||esc(config.address)} · SHA-256 del CSV <span class="hash">${esc(short(anclado.csvSha256))}</span> · ${anclado.cantidad} servicios${txAnclaje?` · ${link('tx',txAnclaje,'transacción del anclaje')||esc(short(txAnclaje))}`:''}.`
   :sep()?'<strong>Sin catálogo anclado en Sepolia.</strong> Dos firmas en MetaMask: desplegar el contrato y anclar los 14 servicios.':'Sin catálogo anclado en la red local.';
  $('catAnclar').textContent=anclado?.anclado?'✓ Catálogo de julio anclado':'Anclar catálogo de julio';$('catAnclar').classList.toggle('sealed-done',!!anclado?.anclado);
  // Tabla de los servicios anclados (los nombres salen del CSV público, no de la cadena).
  $('catServicios').innerHTML=anclado?.anclado?anclado.servicios.map(s=>`<tr><td><strong>${esc(s.id)}</strong></td><td>${esc(nombres.get(s.id)??'')}</td><td>${esc(s.prioridad)}</td><td>${s.sla}</td><td class="small">${[link('tx',txAnclaje,'anclaje'),link('address',config.address,'contrato')].filter(Boolean).join(' · ')||'—'}</td></tr>`).join('')
   :'<tr><td colspan="5" class="small">Todavía no hay servicios anclados.</td></tr>';
  $('catPie').textContent=anclado?.anclado?`Anclado el ${new Date(anclado.timestamp*1000).toLocaleString('es-EC',{timeZone:'America/Guayaquil',dateStyle:'long',timeStyle:'short'})} (UTC−05:00), período ${PERIODO_CATALOGO}. En la cadena van el id, la prioridad y el SLA de cada servicio y el SHA-256 del CSV; el catálogo es público y no tiene datos personales.`:'';
  botones();
 }
 async function refresh(){try{await cargar();}catch(e){console.error(e);status(`No se pudo leer el catálogo · ${e.shortMessage??e.message}`,'pending');}pintar();}
 const accion=fn=>()=>ctx.run(async()=>{try{await fn();}catch(e){status(mensajeBilletera(e),'pending');console.error(e);}await refresh();});

 $('catModo').value=red;
 // Al cambiar de red se limpia lo mostrado antes de leer la nueva: nunca se ve el estado de la otra red.
 $('catModo').onchange=()=>{red=$('catModo').value==='local'?'local':'sepolia';try{sessionStorage.setItem(MODO,red);}catch{}provider?.destroy();provider=null;config=null;anclado=null;txAnclaje=null;owner=null;verificado=null;$('catResultado').replaceChildren();$('catInfo').textContent='Leyendo el catálogo anclado…';status(null);pintar();refresh();};

 // Paso 1: MetaMask del municipio.
 $('catConectar').onclick=accion(async()=>{const {address}=await conectarSepolia(t=>status(t));wallet=getAddress(address);status(null);
  // Cuenta inteligente de MetaMask (EIP-7702): la cuenta tiene código de delegación 0xef0100… y MetaMask puede
  // enviar las llamadas a través de otro contrato. El catálogo lo admite (se valida por eventos); se avisa igual.
  try{inteligente=String(await provider.getCode(wallet)).startsWith('0xef0100');}catch{inteligente=false;}});

 // Paso 2: anclar. En Sepolia, dos firmas (desplegar y anclar) y el servidor lo comprueba; en local, la cuenta 0 por /rpc.
 $('catAnclar').onclick=accion(async()=>{
  const args=await argumentosAnclaje(original);
  if(!sep()){
   if(!config)throw new Error('No hay un RegistroCatalogo en la red local de este servidor.');
   const signer=await provider.getSigner(0),k=nuevoCatalogo(config.address,signer);
   const r=await intentarReclasificar(k,args,await signer.getAddress());if(r.rechazado)throw new Error(`El contrato rechazaría el anclaje: ${r.motivo}`);
   status('Anclando el catálogo en la red local…');
   const rc=await (await k.anclarCatalogo(...argsContrato(args))).wait();if(rc.status!==1)throw new Error('El anclaje falló.');
   status(`Catálogo de julio anclado en la red local: 14 servicios en una transacción (bloque ${rc.blockNumber}).`,'green');return;
  }
  const {signer,address}=await conectarSepolia(t=>status(t));wallet=getAddress(address);
  // Si ya se desplegó en esta sesión y faltó el anclaje, se reutiliza ese contrato (una firma menos).
  let p=null;try{p=JSON.parse(sessionStorage.getItem(PENDIENTE)??'null');}catch{}
  if(p&&getAddress(p.owner)!==wallet)p=null;
  if(!p){
   const artifact=await (await fetch('/contracts/RegistroCatalogo.json')).json();
   status(`Firma 1 de 2 · Confirma en MetaMask el despliegue de RegistroCatalogo (cuenta ${short(wallet)}).`);
   const c=await new ContractFactory(artifact.abi,artifact.bytecode,signer).deploy();
   status('Esperando confirmación de la red… (Sepolia tarda unos segundos)');
   const rc=await c.deploymentTransaction().wait(1);
   p={address:await c.getAddress(),deploymentTransaction:rc.hash,owner:wallet};try{sessionStorage.setItem(PENDIENTE,JSON.stringify(p));}catch{}
  }
  const k=nuevoCatalogo(p.address,signer),lector=nuevoCatalogo(p.address,provider);
  // Si ese contrato ya quedó anclado (por ejemplo, falló el registro), no se vuelve a firmar: se busca su anclaje y se registra.
  let hash=null,bloque=null;
  if((await leerAnclado(lector)).anclado){
   const desde=(await provider.getTransactionReceipt(p.deploymentTransaction))?.blockNumber??0;
   const ev=await lector.queryFilter(lector.filters.CatalogoAnclado(PERIODO_CATALOGO),desde,'latest');
   if(!ev.length)throw new Error('El contrato ya está anclado, pero no se encontró la transacción del anclaje. Usa «¿Ya anclaste y la app no lo registró?».');
   hash=ev[0].transactionHash;bloque=ev[0].blockNumber;status('Este contrato ya estaba anclado: se registra sin volver a firmar…');
  }else{
   const r=await intentarReclasificar(lector,args,wallet);if(r.rechazado)throw new Error(`El contrato rechazaría el anclaje: ${r.motivo}`);
   status('Firma 2 de 2 · Confirma en MetaMask el anclaje de los 14 servicios con su prioridad y su SLA.');
   const tx=await k.anclarCatalogo(...argsContrato(args));
   status(`Esperando confirmación de la red…\nTX: ${tx.hash}`);
   const rc=await tx.wait(1);if(rc.status!==1)throw new Error('El anclaje falló en la red.');
   hash=rc.hash;bloque=rc.blockNumber;
  }
  status('Comprobando el despliegue y el anclaje en la red pública…');
  await registrar({address:p.address,deploymentTransaction:p.deploymentTransaction,anclajeTransaction:hash});
  try{sessionStorage.removeItem(PENDIENTE);}catch{}
  status(`Catálogo de julio anclado en Sepolia y comprobado por RPC público (bloque ${bloque}). Sigue el paso 3: verificar.`,'green');
 });
 const registrar=async body=>{const resp=await fetch('/api/catalogo-sepolia/registrar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!resp.ok)throw new Error(await resp.text()||`HTTP ${resp.status}`);return resp.json();};
 // Recuperar un anclaje ya hecho: solo con el hash de la transacción; el servidor encuentra el contrato en el recibo.
 $('catRecuperar').onclick=accion(async()=>{
  const h=$('catRecuperarTx').value.trim();
  if(!/^0x[0-9a-fA-F]{64}$/.test(h))throw new Error('Pega el ID de la transacción del anclaje: 0x y 64 caracteres hexadecimales.');
  status('Leyendo el recibo en Sepolia y comprobando el catálogo anclado…');
  const c=await registrar({anclajeTransaction:h});
  try{sessionStorage.removeItem(PENDIENTE);}catch{}
  status(`Catálogo recuperado: contrato ${short(c.address)}, anclaje en el bloque ${c.anclajeBlock} (${c.anclajeVia}), comprobado por RPC público. Sigue el paso 3: verificar.`,'green');
 });

 // Paso 3: verificar el catálogo original o una copia editada contra lo anclado.
 $('catArchivo').onchange=()=>{verificado=null;$('catResultado').replaceChildren();pintar();};
 $('catVerificar').onclick=accion(async()=>{
  const file=$('catArchivo').files[0],texto=file?await file.text():original,nombre=file?file.name:'catalogo_servicios.csv (original)';
  const c=await compararCatalogo(anclado,texto);
  if(c.estado==='VERDE'){
   verificado={estado:'VERDE',reclasificacion:verificado?.reclasificacion};
   $('catResultado').innerHTML=`<div class="status green">VERDE · ${esc(nombre)} coincide con el catálogo anclado: mismo SHA-256 (${esc(short(c.hash))}), mismas prioridades y plazos.</div>`;
   ctx.setDone(true);status(null);return;
  }
  const [tk,bi]=await Promise.all(['tickets.csv','bitacora_eventos.csv'].map(async f=>(await fetch(`/datos/${f}`)).text()));
  const afectados=c.editado?ticketsAfectados(anclado,c.editado,tk,bi):[];
  verificado={estado:'ROJO',reclasificacion:verificado?.reclasificacion};
  const CAMPO={prioridad:'prioridad',sla_horas_habiles:'SLA (h hábiles)',servicio:'servicio'};
  const cambios=c.cambios.length?`<ul class="compare">${c.cambios.map(x=>`<li><strong>${esc(x.id)}</strong> · ${esc(CAMPO[x.campo])}: anclado <strong>${esc(x.anclado)}</strong> → editado <strong>${esc(x.editado)}</strong></li>`).join('')}</ul>`
   :'<p>No cambia ninguna prioridad ni plazo: el archivo difiere en otros campos (nombre, nivel o área).</p>';
  const tabla=afectados.length?`<p><strong>${afectados.length}</strong> ${afectados.length===1?'ticket de julio cambiaría':'tickets de julio cambiarían'} de cumplimiento con el catálogo editado:</p>
   <div class="tablewrap"><table><thead><tr><th>Ticket</th><th>Servicio</th><th>Horas reales</th><th>SLA anclado</th><th>SLA editado</th><th>Cumplimiento</th></tr></thead><tbody>${afectados.map(a=>`<tr${a.ticket==='TK-2026-04228'?' class="flip"':''}><td><strong>${esc(a.ticket)}</strong></td><td>${esc(a.servicio)}</td><td>${horas(a.horas)} h${a.horasDeBitacora?' (bitácora)':''}</td><td>${a.slaAnclado} h</td><td>${a.slaEditado} h</td><td>${a.cumpleAnclado?'Cumple':'No cumple'} → <strong>${a.cumpleEditado?'Cumple':'No cumple'}</strong></td></tr>`).join('')}</tbody></table></div>`
   :c.cambios.length?'<p>Con este cambio ningún ticket de julio cambia de cumplimiento.</p>':'';
  $('catResultado').innerHTML=`<div class="card"><div class="status red"><strong>ROJO · ${esc(nombre)} no coincide con el catálogo anclado</strong> (SHA-256 ${esc(short(c.hash))} frente a ${esc(short(anclado.csvSha256))}).${cambios}</div>${tabla}<p class="small">El catálogo anclado no cambió. Las horas reales salen de las fechas del ticket; si la bitácora registra una edición posterior a la resolución, se usan las horas anteriores a esa edición.</p></div>`;
  ctx.setDone(true);status(null);
 });

 // Paso 4: segundo anclaje simulado (sin gas): el contrato lo rechaza.
 $('catReclasificar').onclick=accion(async()=>{
  const relajado=await argumentosAnclaje(reclasificar(original,'CS-11','ALTA',8));
  const r=await intentarReclasificar(nuevoCatalogo(config.address,provider),relajado,owner);
  verificado={...(verificado??{}),reclasificacion:r};
  if(!r.rechazado)return status('El contrato no rechazó el segundo anclaje: revisa que el catálogo esté anclado.','pending');
  status(`Rechazado por el contrato: ${r.motivo}. Se intentó pasar CS-11 de CRITICA 4 h a ALTA 8 h con la cuenta del municipio (${short(owner)}); simulado con staticCall, sin firmar ni gastar gas.`,'red');
 });

 refresh();
 return {refresh,botones};
}
export {RECHAZO_RECLASIFICAR};
