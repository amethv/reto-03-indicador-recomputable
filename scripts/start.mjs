import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ganache from 'ganache';
import {ROOT,STATE_ROOT,EVIDENCE_DIR,INSTANCE,deploy,providerFor} from './runtime.mjs';
import {readAnchor} from '../src/chain.mjs';
import {authenticateEvidence} from '../src/core.mjs';
import {verifySource} from './verify-source.mjs';
export async function startApp(){
 await verifySource();
 await fs.mkdir(path.join(STATE_ROOT,'.chain'),{recursive:true});
 const chain=ganache.server({chain:{chainId:31337,networkId:31337,hardfork:'shanghai'},wallet:{deterministic:true,totalAccounts:2},database:{dbPath:path.join(STATE_ROOT,'.chain')},logging:{quiet:true}});
 await chain.listen(8545,'127.0.0.1');
 const provider=providerFor('http://127.0.0.1:8545');
 let config;
 try{config=JSON.parse(await fs.readFile(path.join(EVIDENCE_DIR,'red-local.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!config){config=await deploy(provider);await fs.writeFile(path.join(EVIDENCE_DIR,'red-local.json'),JSON.stringify(config,null,2));}
 if(await provider.getCode(config.address)==='0x')throw new Error('La cadena persistida no contiene el contrato configurado. No se reemplazará automáticamente.');
 const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.csv':'text/csv; charset=utf-8','.sol':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.pdf':'application/pdf'};
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1:8080');
   res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
   if(req.method==='POST'&&url.pathname==='/api/evidence'){
    if(!['http://127.0.0.1:8080','http://localhost:8080'].includes(req.headers.origin)){res.writeHead(403);res.end();return;}
    let body='';for await(const chunk of req){body+=chunk;if(body.length>2_000_000)throw new Error('Evidencia demasiado grande');}
    const evidence=JSON.parse(body),anchor=await readAnchor(provider,config),check=await authenticateEvidence(evidence,anchor);if(!check.ok)throw new Error(check.error);
    const file=path.join(EVIDENCE_DIR,'sello-original.json');
    try{await fs.writeFile(file,JSON.stringify(evidence,null,2),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;const old=JSON.parse(await fs.readFile(file,'utf8'));if(JSON.stringify(old)!==JSON.stringify(evidence))throw new Error('No se puede reemplazar la evidencia original');}
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({saved:true}));return;
   }
   if(req.method!=='GET'){res.writeHead(405);res.end();return;}
   const vendors={'/vendor/papaparse.mjs':null,'/vendor/papaparse.umd.js':'node_modules/papaparse/papaparse.min.js','/vendor/ethers.mjs':'node_modules/ethers/dist/ethers.min.js'};
   if(url.pathname==='/vendor/papaparse.mjs'){res.writeHead(200,{'Content-Type':mime['.mjs']});res.end("export default globalThis.Papa;");return;}
   const relative=vendors[url.pathname]||(url.pathname==='/'?'src/index.html':decodeURIComponent(url.pathname).slice(1));
   const allowed=relative==='README.md'||/^docs\/[\w.-]+\.md$/.test(relative)||/^src\/[\w.-]+$/.test(relative)||/^contracts\/[\w.-]+$/.test(relative)||/^datos\/[\w.-]+$/.test(relative)||/^evidencias\/[\w.-]+$/.test(relative)||Object.values(vendors).includes(relative);
   if(!allowed){res.writeHead(404);res.end('No disponible');return;}
   const file=relative.startsWith('evidencias/')?path.resolve(EVIDENCE_DIR,relative.slice(11)):path.resolve(ROOT,relative);if(!file.startsWith(ROOT+path.sep))throw new Error('Ruta no permitida');
   const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);
  }catch(e){res.writeHead(e.code==='ENOENT'?404:400,{'Content-Type':'text/plain; charset=utf-8'});res.end(e.code==='ENOENT'?'No disponible':e.message);}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8080,'127.0.0.1',resolve);});
 console.log(`Instancia: ${INSTANCE}`);console.log('Aplicación: http://127.0.0.1:8080');console.log(`Blockchain: ${config.rpc} | contrato ${config.address}`);
 return {config,provider,close:async()=>{provider.destroy();await new Promise(resolve=>server.close(resolve));await chain.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const app=await startApp();for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
}
