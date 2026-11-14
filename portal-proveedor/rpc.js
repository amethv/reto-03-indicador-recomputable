// Lecturas de Sepolia que aguantan una red inestable (servidor y navegador).
// Ante un error de red (conexión cortada, tiempo agotado, HTTP 429 o 5xx) reintenta unas veces y, si el RPC
// principal sigue fallando, pasa a un RPC público de respaldo. Los errores del propio nodo (por ejemplo, un
// revert) no se reintentan: se devuelven tal cual. Nunca envía transacciones: solo lee.
// La red es fija (Sepolia) para que una caída no deje a ethers reintentando sin fin al arrancar; a cambio, la
// primera vez que se usa cada RPC se comprueba su chainId real: un RPC de otra red se rechaza («Red equivocada»).
// portal-proveedor/rpc.js es una copia exacta (el portal es un programa aparte); una prueba lo comprueba.
import {JsonRpcProvider,FetchRequest,Network} from 'ethers';

export const SEPOLIA_CHAIN_ID=11155111;
export const RPC_SEPOLIA='https://ethereum-sepolia-rpc.publicnode.com';
export const RPC_RESPALDO=Object.freeze(['https://sepolia.gateway.tenderly.co','https://1rpc.io/sepolia']);
export const MENSAJE_REINTENTO='Sin conexión con Sepolia, reintentando…';

const espera=ms=>new Promise(r=>setTimeout(r,ms));
/** ¿Es un fallo de la red o del servicio (se puede reintentar), y no una respuesta del nodo? */
export function esErrorDeRed(e){
 if(e?.code==='RED_EQUIVOCADA')return false;
 const texto=`${e?.code??''} ${e?.cause?.code??''} ${e?.message??''} ${e?.shortMessage??''}`;
 if(/ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EPIPE|UND_ERR|socket hang up|fetch failed|Failed to fetch|NetworkError|network error|TIMEOUT|timeout|aborted|Load failed/i.test(texto))return true;
 const status=e?.info?.responseStatus??e?.response?.statusCode??e?.status;
 return /^(429|5\d\d)/.test(String(status??''))||(e?.code==='SERVER_ERROR'&&!e?.info?.payload);
}
const host=u=>{try{return new URL(u).host;}catch{return String(u);}};
/** Mensaje claro cuando ningún RPC respondió. */
export const mensajeSinConexion=urls=>`Sin conexión con Sepolia: no respondió ningún RPC público (${urls.map(host).join(', ')}). Revisa la conexión a internet y vuelve a intentarlo.`;

/**
 * JsonRpcProvider de solo lectura con reintentos y respaldo.
 * urls: principal primero y después los de respaldo. avisar(texto|null): muestra o limpia el aviso de reintento.
 */
export class LectorSepolia extends JsonRpcProvider {
 constructor(urls,{chainId=SEPOLIA_CHAIN_ID,intentos=3,pausa=700,tiempo=15000,avisar=()=>{}}={}){
  const lista=[...new Set((Array.isArray(urls)?urls:[urls]).filter(Boolean))];
  super(lista[0],Network.from(chainId),{staticNetwork:true,cacheTimeout:-1,batchMaxCount:1});
  this.urls=lista;this.actual=0;this.chainId=Number(chainId);this.intentos=intentos;this.pausa=pausa;this.tiempo=tiempo;this.avisar=avisar;this.reintentando=false;this.verificadas=new Set();
  this.pollingInterval=4000;
 }
 get urlActual(){return this.urls[this.actual];}
 async _pedir(url,payload){
  const req=new FetchRequest(url);req.method='POST';req.body=JSON.stringify(payload);req.setHeader('content-type','application/json');req.timeout=this.tiempo;
  const resp=await req.send();resp.assertOk();return resp.bodyJson;
 }
 async _send(payload){
  let ultimo=null;
  for(let ronda=0;ronda<this.urls.length;ronda++){
   const url=this.urlActual;
   for(let i=0;i<this.intentos;i++){
    try{
     if(!this.verificadas.has(url)){
      const r=await this._pedir(url,{jsonrpc:'2.0',id:0,method:'eth_chainId',params:[]}),id=r?.result?Number(BigInt(r.result)):null;
      if(id!==this.chainId){const e=new Error(`Red equivocada: el RPC ${host(url)} está en la red ${id} y se esperaba ${this.chainId} (Sepolia).`);e.code='RED_EQUIVOCADA';throw e;}
      this.verificadas.add(url);
     }
     const r=await this._pedir(url,payload);
     if(this.reintentando){this.reintentando=false;this.avisar(null);}
     return Array.isArray(r)?r:[r];
    }catch(e){
     if(!esErrorDeRed(e))throw e;
     ultimo=e;this.reintentando=true;this.avisar(MENSAJE_REINTENTO);
     if(i<this.intentos-1)await espera(this.pausa*(i+1));
    }
   }
   this.actual=(this.actual+1)%this.urls.length;   // este RPC no responde: se pasa al siguiente
  }
  this.reintentando=false;this.avisar(null);
  const err=new Error(mensajeSinConexion(this.urls));err.code='SIN_CONEXION';err.cause=ultimo;throw err;
 }
}
