import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import zlib from 'node:zlib';
import ganache from 'ganache';
import {ROOT,STATE_ROOT,EVIDENCE_DIR,INSTANCE,SALT_FILES,deploy,providerFor,writeSalt,readSalt} from './runtime.mjs';
import {readAnchor} from '../src/chain.mjs';
import {authenticateEvidence,validSalt,saltCommitment} from '../src/core.mjs';
import {verifySource} from './verify-source.mjs';
import {ensureReloj,reiniciarReloj} from './reloj.mjs';
import {JsonRpcProvider} from 'ethers';
import {registrarPeriodo,guardarSal,leerSal,registrarSello} from './sepolia-web.mjs';
// Sepolia con MetaMask: el servidor verifica por un RPC público de solo lectura (nunca con llaves).
const SEPOLIA_PUBLIC_RPC=process.env.SEPOLIA_PUBLIC_RPC_URL||'https://ethereum-sepolia-rpc.publicnode.com';
let sepoliaReader=null;const sepolia=()=>(sepoliaReader??=new JsonRpcProvider(SEPOLIA_PUBLIC_RPC,undefined,{cacheTimeout:-1}));
const readJsonBody=async(req,limit)=>{let body='';for await(const chunk of req){body+=chunk;if(body.length>limit)throw new Error('Petición demasiado grande');}return JSON.parse(body||'{}');};
// En el equipo: 127.0.0.1:8080. En un servicio como Render: HOST=0.0.0.0 y el PORT que asigne la plataforma.
const PORT=Number(process.env.PORT)||8080,HOST=process.env.HOST||'127.0.0.1';
// Hosts que pueden usar la API (defensa ante DNS rebinding). Render publica su dominio en RENDER_EXTERNAL_HOSTNAME.
const HOSTS=new Set([`127.0.0.1:${PORT}`,`localhost:${PORT}`,...(process.env.RENDER_EXTERNAL_HOSTNAME?[process.env.RENDER_EXTERNAL_HOSTNAME]:[]),...(process.env.PUBLIC_HOSTS||'').split(',').map(h=>h.trim()).filter(Boolean)]);
const sameSite=req=>{if(!HOSTS.has(req.headers.host))return false;const origin=req.headers.origin;if(origin&&new URL(origin).host!==req.headers.host)return false;const site=req.headers['sec-fetch-site'];return !site||site==='same-origin';};
// La página habla con Ganache por /rpc (mismo dominio). Solo pasan lecturas y el envío de transacciones
// al contrato configurado: nada de evm_*, debug_* ni despliegues, para que nadie reescriba la cadena.
const READ_METHODS=new Set(['eth_chainId','net_version','eth_blockNumber','eth_getCode','eth_call','eth_getLogs','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getStorageAt','eth_getBlockByNumber','eth_getBlockByHash','eth_getBalance','eth_getTransactionCount','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory','eth_accounts']);
// Archivos estáticos: vendor y fuentes no cambian entre despliegues (versión fija en package-lock),
// así que el navegador puede guardarlos un año. Todo lo demás sigue con no-store.
const LONG_CACHE='public, max-age=31536000, immutable';
const COMPRESSIBLE=new Set(['.js','.mjs','.css','.html','.json','.csv']);
const gzip=promisify(zlib.gzip);
const acceptsGzip=req=>(req.headers['accept-encoding']||'').split(',').some(part=>{const [name,...params]=part.split(';');return name.trim().toLowerCase()==='gzip'&&!params.some(p=>/^\s*q=0(\.0+)?\s*$/.test(p));});
// contracts: el del Nivel 1 y RelojProveedor (Nivel 2). Ninguna otra dirección recibe transacciones.
function rpcAllowed(call,contracts){
 if(!call||typeof call.method!=='string')return false;
 if(READ_METHODS.has(call.method))return true;
 return call.method==='eth_sendTransaction'&&typeof call.params?.[0]?.to==='string'&&contracts.some(c=>call.params[0].to.toLowerCase()===c.toLowerCase());
}
// presentacion: lo arranca npm run presentacion, después de archivar el período activo. Sin período,
// la página espera uno nuevo en Sepolia en vez de abrir la red local (que puede estar ya sellada).
export async function startApp({presentacion=false}={}){
 await verifySource();
 await fs.mkdir(path.join(STATE_ROOT,'.chain'),{recursive:true});
 // Cuentas: 0 municipio y sellador del Nivel 1; 1 PV-01; 2 PV-02 (Nivel 2). En una cadena persistida
 // creada con 2 cuentas, la tercera no tiene saldo: ensureReloj la fondea desde la cuenta 0.
 const chain=ganache.server({chain:{chainId:31337,networkId:31337,hardfork:'shanghai'},wallet:{deterministic:true,totalAccounts:3},database:{dbPath:path.join(STATE_ROOT,'.chain')},logging:{quiet:true}});
 await chain.listen(8545,'127.0.0.1');
 const provider=providerFor('http://127.0.0.1:8545');
 let config;
 try{config=JSON.parse(await fs.readFile(path.join(EVIDENCE_DIR,'red-local.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!config){config=await deploy(provider);await fs.writeFile(path.join(EVIDENCE_DIR,'red-local.json'),JSON.stringify(config,null,2));}
 if(await provider.getCode(config.address)==='0x')throw new Error('La cadena persistida no contiene el contrato configurado. No se reemplazará automáticamente.');
 // Nivel 2: después del contrato del Nivel 1, para no alterar su dirección en una instancia nueva.
 // «Reiniciar simulación» cambia el reloj vigente: la lista del proxy se actualiza con él.
 let reloj=await ensureReloj(provider),contracts=[config.address,reloj.address];
 const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.csv':'text/csv; charset=utf-8','.sol':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.pdf':'application/pdf','.png':'image/png','.woff2':'font/woff2'};
 // Vendor se lee y se comprime una sola vez; se guarda en memoria mientras corre el servidor.
 const vendorCache=new Map();
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,`http://127.0.0.1:${PORT}`);
   res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
   if(req.method==='POST'&&url.pathname==='/rpc'){
    if(!sameSite(req)){res.writeHead(403);res.end();return;}
    let body='';for await(const chunk of req){body+=chunk;if(body.length>200_000)throw new Error('Petición RPC demasiado grande');}
    const payload=JSON.parse(body),calls=Array.isArray(payload)?payload:[payload];
    if(!calls.length||calls.length>50)throw new Error('Lote RPC inválido');
    const refused=c=>({jsonrpc:'2.0',id:c?.id??null,error:{code:-32601,message:`Método no permitido en esta demo: ${c?.method}`}});
    const allowedCalls=calls.filter(c=>rpcAllowed(c,contracts));
    let answers=[];
    if(allowedCalls.length){
     const upstream=await fetch('http://127.0.0.1:8545',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(allowedCalls)});
     answers=await upstream.json();if(!Array.isArray(answers))answers=[answers];
    }
    const byId=new Map(answers.map(a=>[JSON.stringify(a.id),a]));
    const results=calls.map(c=>rpcAllowed(c,contracts)?byId.get(JSON.stringify(c.id))??refused(c):refused(c));
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(Array.isArray(payload)?results:results[0]));return;
   }
   if(req.method==='POST'&&url.pathname==='/api/evidence'){
    if(!req.headers.origin||!sameSite(req)){res.writeHead(403);res.end();return;}
    let body='';for await(const chunk of req){body+=chunk;if(body.length>2_000_000)throw new Error('Evidencia demasiado grande');}
    const {evidence,salt}=JSON.parse(body),anchor=await readAnchor(provider,config),check=await authenticateEvidence(evidence,anchor);if(!check.ok)throw new Error(check.error);
    if(!validSalt(salt)||await saltCommitment(salt)!==evidence.saltCommitment)throw new Error('La sal no corresponde al compromiso del manifiesto');
    await writeSalt(SALT_FILES.local,salt);
    const file=path.join(EVIDENCE_DIR,'sello-original.json');
    try{await fs.writeFile(file,JSON.stringify(evidence,null,2),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;const old=JSON.parse(await fs.readFile(file,'utf8'));if(JSON.stringify(old)!==JSON.stringify(evidence))throw new Error('No se puede reemplazar la evidencia original');}
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({saved:true}));return;
   }
   // Sepolia con MetaMask: preparar período, guardar la sal antes de firmar y registrar el sello.
   // Cada paso se comprueba contra la red pública; lo que diga el navegador no basta.
   if(req.method==='POST'&&url.pathname.startsWith('/api/sepolia/')){
    if(!req.headers.origin||!sameSite(req)){res.writeHead(403);res.end();return;}
    const body=await readJsonBody(req,3_000_000);let result;
    if(url.pathname==='/api/sepolia/periodo')result=await registrarPeriodo({provider:sepolia(),address:body.address,deploymentTransaction:body.deploymentTransaction,publicRpc:SEPOLIA_PUBLIC_RPC,admin:process.env.SEPOLIA_MUNICIPIO||null,intentos:10});
    else if(url.pathname==='/api/sepolia/sal')result=await guardarSal({address:body.address,salt:body.salt});
    else if(url.pathname==='/api/sepolia/sello')result=await registrarSello({provider:sepolia(),transactionHash:body.transactionHash,evidence:body.evidence});
    else{res.writeHead(404);res.end('No disponible');return;}
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));return;
   }
   if(req.method==='POST'&&url.pathname==='/api/reloj/reiniciar'){
    // Solo desde esta misma página. Despliega un RelojProveedor nuevo en la red local; el del Nivel 1 no se toca.
    if(!req.headers.origin||!sameSite(req)){res.writeHead(403);res.end();return;}
    reloj=await reiniciarReloj(provider);contracts=[config.address,reloj.address];
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(reloj));return;
   }
   if(req.method!=='GET'){res.writeHead(405);res.end();return;}
   // Modo de arranque y RPC público de lectura: la página decide con esto qué red abrir.
   if(url.pathname==='/api/modo'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({presentacion,sepoliaRpc:SEPOLIA_PUBLIC_RPC}));return;}
   if(url.pathname==='/api/sal'){
    // Solo para esta misma página: sin CORS y rechazando peticiones desde otros sitios.
    if(!sameSite(req)){res.writeHead(403);res.end();return;}
    const red=url.searchParams.get('red'),file=SALT_FILES[red];if(!file){res.writeHead(400);res.end('Red desconocida');return;}
    // Sepolia: un archivo de sal por contrato (el vigente); si no existe, el archivo del flujo por script.
    const salt=red==='sepolia'?(await leerSal())??await readSalt(file):await readSalt(file);if(!salt){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Sin sal guardada para esta red');return;}
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({salt}));return;
   }
   const vendors={'/vendor/papaparse.mjs':null,'/vendor/papaparse.umd.js':'node_modules/papaparse/papaparse.min.js','/vendor/ethers.mjs':'node_modules/ethers/dist/ethers.min.js'};
   if(url.pathname==='/vendor/papaparse.mjs'){res.writeHead(200,{'Content-Type':mime['.mjs'],'Cache-Control':LONG_CACHE});res.end("export default globalThis.Papa;");return;}
   const relative=vendors[url.pathname]||(url.pathname==='/'?'src/index.html':decodeURIComponent(url.pathname).slice(1));
   const allowed=relative==='README.md'||/^docs\/[\w.-]+\.md$/.test(relative)||/^src\/[\w.-]+$/.test(relative)||/^contracts\/[\w.-]+$/.test(relative)||/^datos\/[\w.-]+$/.test(relative)||/^evidencias\/[\w.-]+$/.test(relative)||Object.values(vendors).includes(relative);
   if(!allowed){res.writeHead(404);res.end('No disponible');return;}
   // La red local vive en la instancia; la configuración pública de Sepolia, en evidencias/ del repositorio.
   const file=relative.startsWith('evidencias/')&&!relative.includes('sepolia')?path.resolve(EVIDENCE_DIR,relative.slice(11)):path.resolve(ROOT,relative);if(!file.startsWith(ROOT+path.sep))throw new Error('Ruta no permitida');
   const ext=path.extname(file),isVendor=url.pathname.startsWith('/vendor/');
   let cached=isVendor?vendorCache.get(relative):null;
   if(isVendor&&!cached){cached={raw:await fs.readFile(file),gz:null};vendorCache.set(relative,cached);}
   const data=cached?cached.raw:await fs.readFile(file);
   const headers={'Content-Type':mime[ext]||'application/octet-stream'};
   // La caché larga se fija solo aquí, con el archivo ya leído: un 404 nunca queda guardado.
   if(isVendor||ext==='.woff2')headers['Cache-Control']=LONG_CACHE;
   let body=data;
   if(COMPRESSIBLE.has(ext)){
    headers.Vary='Accept-Encoding';
    if(acceptsGzip(req)){body=cached?(cached.gz??=await gzip(data)):await gzip(data);headers['Content-Encoding']='gzip';}
   }
   headers['Content-Length']=body.length;res.writeHead(200,headers);res.end(body);
  }catch(e){res.writeHead(e.code==='ENOENT'?404:400,{'Content-Type':'text/plain; charset=utf-8'});res.end(e.code==='ENOENT'?'No disponible':e.message);}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(PORT,HOST,resolve);});
 console.log(`Instancia: ${INSTANCE}`);console.log(`Aplicación: http://${HOST==='0.0.0.0'?'127.0.0.1':HOST}:${PORT}`);console.log(`Blockchain: ${config.rpc} | contrato ${config.address}`);console.log(`Nivel 2: RelojProveedor ${reloj.address}`);
 return {config,get reloj(){return reloj;},provider,close:async()=>{provider.destroy();sepoliaReader?.destroy();sepoliaReader=null;await new Promise(resolve=>server.close(resolve));await chain.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const app=await startApp();for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
}
