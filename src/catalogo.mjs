// Nivel 3 · Catálogo y SLA anclados. Lógica compartida por el navegador, el servidor, las pruebas y la auditoría.
// El catálogo (14 servicios con prioridad y SLA en horas hábiles) se ancla al inicio del período; después
// cualquier copia se compara con lo anclado y se ve qué tickets cambiarían de cumplimiento si se reclasifica.
import {Contract,encodeBytes32String,decodeBytes32String} from 'ethers';
import {csv,CATALOG_HEADERS,HEADERS,BITACORA_HEADERS,businessHours,sha} from './core.mjs';
import {resolutionEdits} from './findings.mjs';

export const PERIODO_CATALOGO=202607;
export const PRIORIDADES=['CRITICA','ALTA','MEDIA','BAJA'];          // código en cadena: posición + 1
export const codigoPrioridad=p=>{const i=PRIORIDADES.indexOf(p);if(i<0)throw new Error(`Prioridad desconocida: ${p}`);return i+1;};
export const nombrePrioridad=c=>PRIORIDADES[Number(c)-1]??`desconocida (${c})`;
export const RECHAZO_RECLASIFICAR='Catálogo ya anclado: no se puede reclasificar';

export const ABI_CATALOGO=[
 'constructor()',
 'function owner() view returns (address)',
 'function anclarCatalogo(uint32 periodo, bytes32 csvSha256, bytes32[] servicioIds, uint8[] prioridades, uint16[] slaHoras)',
 'function catalogo(uint32 periodo) view returns (bytes32 csvSha256, uint64 timestamp, uint16 cantidad)',
 'function servicio(uint32 periodo, bytes32 servicioId) view returns (uint8 prioridad, uint16 slaHoras, bool existe)',
 'function serviciosDe(uint32 periodo) view returns (bytes32[] servicioIds, uint8[] prioridades, uint16[] slaHoras)',
 'event CatalogoAnclado(uint32 indexed periodo, bytes32 csvSha256, uint16 cantidad)',
 'event ServicioAnclado(uint32 indexed periodo, bytes32 indexed servicioId, uint8 prioridad, uint16 slaHoras)'
];

/** Lee el CSV del catálogo: id, nombre, prioridad y SLA de cada servicio. Lanza un error claro si no es un catálogo válido. */
export function leerCatalogo(text){
 const p=csv(text,CATALOG_HEADERS);
 if(p.errors.length)throw new Error(`El archivo no es un catálogo de servicios válido: ${p.errors.slice(0,3).join('; ')}`);
 const filas=p.rows.map(r=>({id:r.servicio_id,nombre:r.nombre,prioridad:r.prioridad,sla:Number(r.sla_horas_habiles)}));
 for(const f of filas){if(!/^CS-\d{2}$/.test(f.id))throw new Error(`Servicio con id inválido: ${f.id}`);if(!Number.isInteger(f.sla)||f.sla<=0)throw new Error(`${f.id}: SLA inválido (${f.sla})`);}
 return filas;
}

/** Argumentos de anclarCatalogo para un CSV: hash SHA-256 del archivo completo y, por servicio, id, prioridad y SLA. */
export async function argumentosAnclaje(text,periodo=PERIODO_CATALOGO){
 const filas=leerCatalogo(text);
 for(const f of filas)codigoPrioridad(f.prioridad);
 return {periodo,csvSha256:await sha(text),ids:filas.map(f=>encodeBytes32String(f.id)),prioridades:filas.map(f=>codigoPrioridad(f.prioridad)),slas:filas.map(f=>f.sla),filas};
}
export const argsContrato=a=>[a.periodo,a.csvSha256,a.ids,a.prioridades,a.slas];

/** Lo anclado en la cadena para el período: hash del CSV, fecha y los servicios. anclado=false si aún no hay catálogo. */
export async function leerAnclado(contract,periodo=PERIODO_CATALOGO){
 const c=await contract.catalogo(periodo);
 if(c.timestamp===0n)return {anclado:false,servicios:[]};
 const s=await contract.serviciosDe(periodo);
 return {anclado:true,csvSha256:c.csvSha256,timestamp:Number(c.timestamp),cantidad:Number(c.cantidad),
  servicios:s.servicioIds.map((id,i)=>({id:decodeBytes32String(id),prioridad:nombrePrioridad(s.prioridades[i]),sla:Number(s.slaHoras[i])}))};
}

/**
 * Compara un CSV con lo anclado. VERDE si el SHA-256 coincide. ROJO si no: con cada servicio cuya prioridad
 * o SLA cambió (anclado frente a editado), servicios agregados o quitados, o «otros campos» si solo cambió el resto.
 */
export async function compararCatalogo(anclado,text){
 const hash=await sha(text);
 if(hash===anclado.csvSha256)return {estado:'VERDE',hash,cambios:[],otrosCampos:false};
 const filas=leerCatalogo(text),editado=new Map(filas.map(f=>[f.id,f])),base=new Map(anclado.servicios.map(s=>[s.id,s])),cambios=[];
 for(const s of anclado.servicios){
  const e=editado.get(s.id);
  if(!e){cambios.push({id:s.id,campo:'servicio',anclado:'presente',editado:'quitado'});continue;}
  if(e.prioridad!==s.prioridad)cambios.push({id:s.id,campo:'prioridad',anclado:s.prioridad,editado:e.prioridad});
  if(e.sla!==s.sla)cambios.push({id:s.id,campo:'sla_horas_habiles',anclado:s.sla,editado:e.sla});
 }
 for(const f of filas)if(!base.has(f.id))cambios.push({id:f.id,campo:'servicio',anclado:'ausente',editado:'agregado'});
 return {estado:'ROJO',hash,cambios,otrosCampos:!cambios.length,editado:filas};
}

/**
 * Tickets cuyo cumplimiento cambiaría con el catálogo editado. Las horas son las reales: hábiles entre
 * reporte y resolución, salvo que la bitácora registre una edición posterior (como TK-2026-04228: 5,80 h
 * reales y no las 3,80 h del CSV). Se compara el SLA anclado con el del catálogo editado.
 */
export function ticketsAfectados(anclado,editado,ticketsText,bitacoraText){
 const tickets=csv(ticketsText,HEADERS).rows,eventos=csv(bitacoraText,BITACORA_HEADERS).rows;
 const catBase=anclado.servicios.map(s=>({servicio_id:s.id,sla_horas_habiles:String(s.sla),prioridad:s.prioridad}));
 const reales=new Map(resolutionEdits(eventos,tickets,catBase).filter(e=>e.hoursBefore!==null).map(e=>[e.ticket,e.hoursBefore]));
 const slaBase=new Map(anclado.servicios.map(s=>[s.id,s.sla])),slaNuevo=new Map(editado.map(f=>[f.id,f.sla]));
 const lista=[];
 for(const t of tickets){
  const antes=slaBase.get(t.servicio_id),despues=slaNuevo.get(t.servicio_id);
  if(antes===undefined||despues===undefined||antes===despues||!t.fecha_resolucion)continue;
  const horas=reales.get(t.ticket_id)??businessHours(t.fecha_reporte,t.fecha_resolucion);
  const cumpleAntes=horas<=antes+1e-9,cumpleDespues=horas<=despues+1e-9;
  if(cumpleAntes!==cumpleDespues)lista.push({ticket:t.ticket_id,servicio:t.servicio_id,horas,slaAnclado:antes,slaEditado:despues,cumpleAnclado:cumpleAntes,cumpleEditado:cumpleDespues,horasDeBitacora:reales.has(t.ticket_id)});
 }
 return lista;
}

/** Copia «relajada» para el intento de reclasificar: el servicio pasa a la prioridad y el SLA indicados. */
export function reclasificar(text,servicioId='CS-11',prioridad='ALTA',sla=8){
 return text.split(/\r?\n/).map(l=>l.startsWith(`${servicioId},`)?l.replace(/,(CRITICA|ALTA|MEDIA|BAJA),(\d+),/,`,${prioridad},${sla},`):l).join(text.includes('\r\n')?'\r\n':'\n');
}

/** Intento de reclasificar: segundo anclaje del mismo período simulado con staticCall (eth_call, sin gas). */
export async function intentarReclasificar(contract,args,from){
 try{await contract.anclarCatalogo.staticCall(...argsContrato(args),{from});return {rechazado:false,motivo:null};}
 catch(e){return {rechazado:true,motivo:String(e?.reason??e?.revert?.args?.[0]??e?.shortMessage??e?.message??e).replace(/^.*\brevert(?:ed)?:?\s*/i,'').replace(/^"|"$/g,'')};}
}

export const nuevoCatalogo=(address,runner)=>new Contract(address,ABI_CATALOGO,runner);
