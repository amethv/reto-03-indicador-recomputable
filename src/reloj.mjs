// Nivel 2 · Reloj del proveedor. Lógica compartida por el navegador, las pruebas y la auditoría.
// El municipio firma la apertura y el proveedor su respuesta; cualquiera recalcula desde los eventos.
// Supuesto declarado: el SLA contractual se mide en horas corridas, no hábiles (así vienen los datos).
import {Contract,keccak256,toUtf8Bytes} from 'ethers';
import {csv} from './core.mjs';

export const ABI_RELOJ=[
 'constructor(bytes32[] ids, address[] cuentas, uint64[] slaSegundos, uint64[] tarifas)',
 'function municipio() view returns (address)',
 'function proveedores(bytes32) view returns (address cuenta, uint64 slaSegundos, uint64 tarifaCentavosPorHora)',
 'function casos(bytes32) view returns (bytes32 proveedorId, uint64 apertura, uint64 respuesta, bool abierto, bool respondido)',
 'function abrirCaso(bytes32 casoId, bytes32 proveedorId, uint64 apertura)',
 'function responder(bytes32 casoId, uint64 respuesta)',
 'function penalidad(bytes32 casoId) view returns (uint256)',
 'event ProveedorRegistrado(bytes32 indexed proveedorId, address cuenta, uint64 slaSegundos, uint64 tarifaCentavosPorHora)',
 'event CasoAbierto(bytes32 indexed casoId, bytes32 indexed proveedorId, uint64 apertura)',
 'event CasoRespondido(bytes32 indexed casoId, uint64 respuesta)'
];

/** Identificador en cadena: keccak256 del id en texto («PVT-04226», «PV-01»). */
export const idHash=text=>keccak256(toUtf8Bytes(String(text)));
/** Segundos Unix de una fecha ISO con zona («2026-07-09T08:19:38-05:00»). */
export function toSeconds(iso){const ms=Date.parse(iso);if(!Number.isFinite(ms)||!/[zZ]|[+-]\d\d:\d\d$/.test(iso))throw new Error(`Fecha sin zona horaria: ${iso}`);return ms/1000;}
const cents=usd=>{const m=/^(\d+)(?:\.(\d{1,2}))?$/.exec(String(usd).trim());if(!m)throw new Error(`Importe inválido: ${usd}`);return Number(m[1])*100+Number((m[2]??'').padEnd(2,'0'));};

/** De proveedores.csv solo se usan id, SLA y tarifa: nombres, contrato y contacto no salen de aquí. */
export function parseProveedores(text){
 return csv(text).rows.map(r=>({id:r.proveedor_id,slaSegundos:Math.round(Number(r.sla_contractual_horas)*3600),tarifaCentavosPorHora:cents(r.penalidad_por_hora_usd)}));
}
/** Casos de tickets_proveedor.csv con lo que el CSV declaraba, para contrastar. */
export function parseCasos(text){
 return csv(text).rows.map(r=>({id:r.ticket_proveedor_id,ticket:r.ticket_id,proveedorId:r.proveedor_id,aperturaIso:r.fecha_apertura,respuestaIso:r.fecha_respuesta_proveedor,apertura:toSeconds(r.fecha_apertura),respuesta:toSeconds(r.fecha_respuesta_proveedor),
  declarado:{horas:Number(r.horas_respuesta),sla:Number(r.sla_contractual_horas),cumple:r.cumple_sla_contractual,penalidadCentavos:cents(r.penalidad_usd)}}));
}
/** Argumentos del constructor: el proveedor i firma con la cuenta i+1 (la 0 es el municipio). */
export function constructorArgs(proveedores,cuentas){
 if(cuentas.length<proveedores.length)throw new Error('Faltan cuentas para los proveedores');
 return [proveedores.map(p=>idHash(p.id)),proveedores.map((_,i)=>cuentas[i]),proveedores.map(p=>p.slaSegundos),proveedores.map(p=>p.tarifaCentavosPorHora)];
}
/** Misma fórmula que penalidad() del contrato, en centavos (BigInt). null si la respuesta es anterior. */
export function penalidadCentavos(apertura,respuesta,slaSegundos,tarifa){
 const d=BigInt(respuesta)-BigInt(apertura);if(d<0n)return null;
 const exceso=d-BigInt(slaSegundos);return exceso>0n?exceso*BigInt(tarifa)/3600n:0n;
}
/** Centavos → «2.592 USD» o «12,50 USD». Se agrupa a mano: en español Intl no agrupa los números de 4 cifras. */
export function usd(c){
 if(c===null||c===undefined)return '—';
 const v=BigInt(c),neg=v<0n,a=neg?-v:v,ent=(a/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.'),dec=a%100n;
 return `${neg?'−':''}${ent}${dec?','+dec.toString().padStart(2,'0'):''} USD`;
}
// Motivo del revert tal como lo escribe el contrato, sin el prefijo que añade cada nodo («VM Exception… revert »).
const revertReason=e=>String(e?.reason??e?.revert?.args?.[0]??e?.info?.error?.message??e?.shortMessage??e?.message??e).replace(/^.*\brevert(?:ed)?:?\s*/i,'').replace(/^"|"$/g,'');

/**
 * Carga los casos en el contrato: el municipio abre y el proveedor de cada caso responde.
 * signerFor(proveedorId) devuelve el firmante de ese proveedor. Si un caso ya estaba abierto o
 * respondido (cadena persistida), no se repite: se informa el estado actual.
 * onStep({id,paso,cuenta,tx}) permite mostrar en pantalla quién firma cada paso.
 */
export async function cargarCasos(contract,municipio,signerFor,casos,onStep=()=>{}){
 const resultados=[],cuentaMunicipio=await municipio.getAddress();
 for(const c of casos){
  const casoId=idHash(c.id),proveedorId=idHash(c.proveedorId),prov=signerFor(c.proveedorId),cuentaProveedor=await prov.getAddress();
  const r={id:c.id,casoId,proveedorId,cuentaMunicipio,cuentaProveedor,estado:null,motivo:null,txApertura:null,txRespuesta:null};
  let estado=await contract.casos(casoId);
  if(!estado.abierto){const tx=await contract.connect(municipio).abrirCaso(casoId,proveedorId,c.apertura);await tx.wait();r.txApertura=tx.hash;}
  onStep({id:c.id,paso:'apertura',cuenta:cuentaMunicipio,tx:r.txApertura});
  estado=await contract.casos(casoId);
  if(!estado.respondido){
   try{const tx=await contract.connect(prov).responder(casoId,c.respuesta);await tx.wait();r.txRespuesta=tx.hash;}
   catch(e){r.estado='RECHAZADO';r.motivo=revertReason(e);}
  }
  if(!r.estado)r.estado='ACEPTADO';
  onStep({id:c.id,paso:'respuesta',cuenta:cuentaProveedor,tx:r.txRespuesta,estado:r.estado,motivo:r.motivo});
  r.penalidadContrato=r.estado==='ACEPTADO'?await contract.penalidad(casoId):null;
  resultados.push(r);
 }
 return resultados;
}

export const motivoRevert=revertReason;

/**
 * Turno del municipio: firma la apertura de los casos que aún no están abiertos.
 * Devuelve {abiertos, yaAbiertos, motivo}: si todos estaban abiertos no envía nada y trae el
 * motivo con el que el contrato rechazaría una segunda firma («Caso ya abierto»).
 */
export async function abrirCasos(contract,municipio,casos,onStep=()=>{}){
 const cuenta=await municipio.getAddress(),pendientes=[];
 for(const c of casos)if(!(await contract.casos(idHash(c.id))).abierto)pendientes.push(c);
 if(!pendientes.length){
  const c=casos[0];let motivo=null;
  try{await contract.connect(municipio).abrirCaso.staticCall(idHash(c.id),idHash(c.proveedorId),c.apertura);}catch(e){motivo=revertReason(e);}
  return {abiertos:0,yaAbiertos:casos.length,motivo};
 }
 for(const c of pendientes){
  const tx=await contract.connect(municipio).abrirCaso(idHash(c.id),idHash(c.proveedorId),c.apertura);await tx.wait();
  onStep({id:c.id,paso:'apertura',cuenta,tx:tx.hash});
 }
 return {abiertos:pendientes.length,yaAbiertos:casos.length-pendientes.length,motivo:null};
}

/**
 * Turno del proveedor: responde los casos abiertos y aún sin respuesta.
 * Cada resultado: ACEPTADO, RECHAZADO (con el motivo del contrato), YA_RESPONDIDO o SIN_APERTURA
 * (con el motivo con que el contrato lo rechazaría: «Caso no abierto»). Nada de esto lanza error.
 */
export async function responderCasos(contract,signerFor,casos,onStep=()=>{}){
 const resultados=[];
 for(const c of casos){
  const casoId=idHash(c.id),prov=await signerFor(c.proveedorId),cuenta=await prov.getAddress(),estado=await contract.casos(casoId);
  const r={id:c.id,casoId,cuenta,estado:null,motivo:null,tx:null};
  if(estado.respondido)r.estado='YA_RESPONDIDO';
  else if(!estado.abierto){r.estado='SIN_APERTURA';try{await contract.connect(prov).responder.staticCall(casoId,c.respuesta);}catch(e){r.motivo=revertReason(e);}}
  else{
   try{const tx=await contract.connect(prov).responder(casoId,c.respuesta);await tx.wait();r.tx=tx.hash;r.estado='ACEPTADO';}
   catch(e){r.estado='RECHAZADO';r.motivo=revertReason(e);}
  }
  onStep(r);resultados.push(r);
 }
 return resultados;
}

/**
 * Recálculo de un tercero: sin llaves y sin CSV. Lee solo los eventos del contrato, recalcula
 * horas y penalidad de cada caso y las compara con penalidad() del contrato.
 */
export async function recalcularComoTercero(provider,address,fromBlock=0){
 const contract=new Contract(address,ABI_RELOJ,provider);
 const [regs,abiertos,respondidos]=await Promise.all([
  contract.queryFilter(contract.filters.ProveedorRegistrado(),fromBlock,'latest'),
  contract.queryFilter(contract.filters.CasoAbierto(),fromBlock,'latest'),
  contract.queryFilter(contract.filters.CasoRespondido(),fromBlock,'latest')]);
 const proveedores=new Map(regs.map(l=>[l.args.proveedorId,{sla:l.args.slaSegundos,tarifa:l.args.tarifaCentavosPorHora}]));
 const respuestas=new Map(respondidos.map(l=>[l.args.casoId,l.args.respuesta]));
 const casos=[];let total=0n,totalContrato=0n;
 for(const l of abiertos){
  const {casoId,proveedorId,apertura}=l.args,respuesta=respuestas.get(casoId)??null,p=proveedores.get(proveedorId);
  if(!p)throw new Error(`Caso con proveedor no registrado: ${casoId}`);
  const caso={casoId,proveedorId,apertura:Number(apertura),respuesta:respuesta===null?null:Number(respuesta),slaSegundos:Number(p.sla)};
  if(respuesta===null){casos.push({...caso,horas:null,penalidad:null,penalidadContrato:null,coincide:null});continue;}
  const penalidad=penalidadCentavos(apertura,respuesta,p.sla,p.tarifa),penalidadContrato=await contract.penalidad(casoId);
  total+=penalidad;totalContrato+=penalidadContrato;
  casos.push({...caso,horas:(Number(respuesta)-Number(apertura))/3600,penalidad,penalidadContrato,coincide:penalidad===penalidadContrato});
 }
 return {casos,total,totalContrato,coincide:total===totalContrato&&casos.every(c=>c.coincide!==false)};
}
