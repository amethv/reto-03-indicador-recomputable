// Portal del proveedor · lógica sin interfaz. La usan la página (portal.js) y las pruebas en Node.
// No comparte nada con el servidor del municipio: solo lee el contrato en Sepolia y firma con la
// MetaMask del proveedor. En el navegador, «ethers» se resuelve con el importmap de index.html.
import {Contract,keccak256,toUtf8Bytes,getAddress} from 'ethers';

export const SEPOLIA_ID=11155111,SEPOLIA_HEX='0xaa36a7';
export const RPC_PUBLICO='https://ethereum-sepolia-rpc.publicnode.com';
export const EXPLORADOR='https://sepolia.etherscan.io';
export const PROVEEDOR='PV-01';
const CERO='0x0000000000000000000000000000000000000000';

// Solo lo que el portal necesita del contrato RelojProveedor.
export const ABI=[
 'function municipio() view returns (address)',
 'function proveedores(bytes32) view returns (address cuenta, uint64 slaSegundos, uint64 tarifaCentavosPorHora)',
 'function casos(bytes32) view returns (bytes32 proveedorId, uint64 apertura, uint64 respuesta, bool abierto, bool respondido)',
 'function responder(bytes32 casoId, uint64 respuesta)',
 'function responderCasos(bytes32[] casoIds, uint64[] respuestas)',
 'function penalidad(bytes32 casoId) view returns (uint256)',
 'event CasoAbierto(bytes32 indexed casoId, bytes32 indexed proveedorId, uint64 apertura)',
 'event CasoRespondido(bytes32 indexed casoId, uint64 respuesta)'
];

/** Identificador en cadena: keccak256 del id en texto («PVT-04226», «PV-01»). */
export const idHash=t=>keccak256(toUtf8Bytes(String(t)));
export const esDireccion=a=>/^0x[0-9a-fA-F]{40}$/.test(String(a??'').trim());
/** Centavos → «2.592 USD» o «12,50 USD». */
export function usd(c){
 if(c===null||c===undefined)return '—';
 const v=BigInt(c),a=v<0n?-v:v,ent=(a/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.'),dec=a%100n;
 return `${v<0n?'−':''}${ent}${dec?','+dec.toString().padStart(2,'0'):''} USD`;
}
/** Motivo del revert tal como lo escribe el contrato, sin el prefijo de cada nodo. */
export const motivo=e=>String(e?.reason??e?.revert?.args?.[0]??e?.info?.error?.message??e?.shortMessage??e?.message??e).replace(/^.*\brevert(?:ed)?:?\s*/i,'').replace(/^"|"$/g,'');

/**
 * ¿Es un reloj del proveedor? Lee municipio() y la cuenta registrada del proveedor 1.
 * Devuelve {municipio, cuenta, sla, tarifa} o lanza un error claro.
 */
export async function leerReloj(contract){
 let municipio,p;
 try{[municipio,p]=await Promise.all([contract.municipio(),contract.proveedores(idHash(PROVEEDOR))]);}
 catch{throw new Error('Esa dirección no es un reloj del proveedor en esta red. Revisa el enlace que te envió el municipio.');}
 if(getAddress(p.cuenta)===CERO)throw new Error('Este reloj no tiene registrado al proveedor 1.');
 return {municipio:getAddress(municipio),cuenta:getAddress(p.cuenta),sla:Number(p.slaSegundos),tarifa:p.tarifaCentavosPorHora};
}

/** Qué puede hacer la cuenta conectada: responder (es el proveedor 1), municipio u otra cuenta. */
export function rolDeCuenta(cuenta,reloj){
 if(!cuenta)return 'sin-cuenta';
 const c=getAddress(cuenta);
 return c===reloj.cuenta?'proveedor':c===reloj.municipio?'municipio':'otra';
}

/**
 * Estado de cada caso del proveedor. Los pendientes se simulan con staticCall desde la cuenta
 * registrada del proveedor 1 (eth_call: sin firmar ni gastar gas), para saber antes de enviar cuáles
 * aceptará el contrato. Estados: SIN_APERTURA, VALIDO, RECHAZADO (con motivo), RESPONDIDO (con penalidad).
 */
export async function estadoCasos(contract,casos,cuentaProveedor){
 const filas=[];
 for(const c of casos){
  const id=idHash(c.id),e=await contract.casos(id);
  const f={id:c.id,casoId:id,respuesta:c.respuesta,apertura:Number(e.apertura),abierto:e.abierto,respondido:e.respondido,estado:null,motivo:null,penalidad:null,respuestaFirmada:Number(e.respuesta)};
  if(!e.abierto)f.estado='SIN_APERTURA';
  else if(e.respondido){f.estado='RESPONDIDO';f.penalidad=await contract.penalidad(id);}
  else{
   try{await contract.responder.staticCall(id,c.respuesta,{from:cuentaProveedor});f.estado='VALIDO';}
   catch(err){f.estado='RECHAZADO';f.motivo=motivo(err);}
  }
  filas.push(f);
 }
 const cuenta=k=>filas.filter(f=>f.estado===k).length;
 return {filas,abiertos:filas.filter(f=>f.abierto).length,validos:cuenta('VALIDO'),rechazados:cuenta('RECHAZADO'),respondidos:cuenta('RESPONDIDO'),
  total:filas.reduce((s,f)=>s+(f.penalidad??0n),0n)};
}

/** Firma en UN solo lote las respuestas válidas (responderCasos). contract debe venir con el firmante. */
export async function firmarRespuestas(contract,estado,confirmaciones=1){
 const validos=estado.filas.filter(f=>f.estado==='VALIDO');
 if(!validos.length)throw new Error('No hay respuestas válidas pendientes de firmar.');
 const args=[validos.map(f=>f.casoId),validos.map(f=>f.respuesta)];
 // El lote completo se prueba antes de firmar: si el contrato lo rechazaría, se dice por qué y no se envía nada.
 try{await contract.responderCasos.staticCall(...args);}catch(e){throw new Error(`El contrato rechazaría el lote: ${motivo(e)}`);}
 const tx=await contract.responderCasos(...args);
 const receipt=await tx.wait(confirmaciones);
 if(receipt.status!==1)throw new Error('La transacción de respuestas falló en la red.');
 return {tx:tx.hash,bloque:receipt.blockNumber,enviados:validos.map(f=>f.id)};
}

/** Transacciones de apertura y respuesta de cada caso, desde los eventos (para los enlaces a Etherscan). */
export async function transacciones(contract,desde){
 const mapa=new Map();
 for(const l of await contract.queryFilter(contract.filters.CasoAbierto(),desde,'latest'))mapa.set(`a:${l.args.casoId}`,l.transactionHash);
 for(const l of await contract.queryFilter(contract.filters.CasoRespondido(),desde,'latest'))mapa.set(`r:${l.args.casoId}`,l.transactionHash);
 return mapa;
}

export const nuevoContrato=(address,runner)=>new Contract(getAddress(address),ABI,runner);
