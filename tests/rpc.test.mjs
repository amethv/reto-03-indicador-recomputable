// Lecturas de Sepolia con red inestable: reintentos, RPC de respaldo, mensajes claros y comprobación de red.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {LectorSepolia,MENSAJE_REINTENTO,esErrorDeRed} from '../src/rpc.mjs';

// Nodo falso: responde eth_chainId y eth_blockNumber. modo(n) decide qué hace con la petición n.
async function nodo({chainId=11155111,modo=()=> 'ok'}={}){
 let n=0;const pedidos=[];
 const server=http.createServer(async(req,res)=>{
  let body='';for await(const c of req)body+=c;const p=JSON.parse(body);pedidos.push(p.method);const m=modo(n++,p);
  if(m==='cortar'){req.socket.destroy();return;}                       // read ECONNRESET, como en la red del lugar
  if(m==='503'){res.writeHead(503);res.end('no disponible');return;}
  const resultado={eth_chainId:'0x'+chainId.toString(16),eth_blockNumber:'0x2a'}[p.method];
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify(m==='revert'?{jsonrpc:'2.0',id:p.id,error:{code:3,message:'execution reverted: Solo sellador',data:'0x'}}:{jsonrpc:'2.0',id:p.id,result:resultado}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {url:`http://127.0.0.1:${server.address().port}`,pedidos,cerrar:()=>new Promise(r=>server.close(r))};
}
const opciones=avisos=>({pausa:5,tiempo:3000,avisar:t=>avisos.push(t)});

test('rpc: ante «read ECONNRESET» y HTTP 503 reintenta, avisa «Sin conexión con Sepolia, reintentando…» y sigue',async()=>{
 const a=await nodo({modo:n=>n===1?'cortar':n===2?'503':'ok'}),avisos=[];   // 0 chainId ok; 1 corta; 2 da 503; 3 ok
 const p=new LectorSepolia([a.url],opciones(avisos));
 try{
  assert.equal(await p.getBlockNumber(),42);
  assert.deepEqual(avisos,[MENSAJE_REINTENTO,MENSAJE_REINTENTO,null],'avisa mientras reintenta y limpia al recuperar');
  assert.deepEqual(a.pedidos,['eth_chainId','eth_blockNumber','eth_blockNumber','eth_blockNumber']);
 }finally{p.destroy();await a.cerrar();}
});

test('rpc: si el principal no responde, pasa al RPC de respaldo',async()=>{
 const caido=await nodo();const urlCaida=caido.url;await caido.cerrar();     // conexión rechazada
 const b=await nodo(),avisos=[],p=new LectorSepolia([urlCaida,b.url],opciones(avisos));
 try{
  assert.equal(await p.getBlockNumber(),42);assert.equal(p.urlActual,b.url);assert.equal(avisos.at(-1),null);
  assert.ok(avisos.includes(MENSAJE_REINTENTO));
 }finally{p.destroy();await b.cerrar();}
});

test('rpc: sin ningún RPC disponible, un error claro en español (y no se queda colgado)',async()=>{
 const a=await nodo({modo:()=> 'cortar'}),b=await nodo({modo:()=> '503'}),avisos=[],p=new LectorSepolia([a.url,b.url],opciones(avisos));
 try{
  await assert.rejects(p.getBlockNumber(),e=>e.code==='SIN_CONEXION'||/Sin conexión con Sepolia: no respondió ningún RPC público/.test(e.message));
  assert.equal(a.pedidos.length,3);assert.equal(b.pedidos.length,3);assert.equal(avisos.at(-1),null);
 }finally{p.destroy();await a.cerrar();await b.cerrar();}
});

test('rpc: un revert del nodo no se reintenta, y un RPC de otra red se rechaza («Red equivocada»)',async()=>{
 const a=await nodo({modo:(n,p)=>p.method==='eth_call'?'revert':'ok'}),avisos=[],p=new LectorSepolia([a.url],opciones(avisos));
 try{
  await assert.rejects(p.call({to:'0x000000000000000000000000000000000000dEaD',data:'0x'}),/Solo sellador|revert/);
  assert.equal(a.pedidos.filter(m=>m==='eth_call').length,1,'una sola vez');assert.deepEqual(avisos,[]);
 }finally{p.destroy();await a.cerrar();}
 const otra=await nodo({chainId:1}),q=new LectorSepolia([otra.url],opciones([]));
 try{await assert.rejects(q.getBlockNumber(),/Red equivocada: el RPC .* está en la red 1 y se esperaba 11155111/);}
 finally{q.destroy();await otra.cerrar();}
 assert.equal(esErrorDeRed({code:'ECONNRESET'}),true);assert.equal(esErrorDeRed({message:'read ECONNRESET'}),true);assert.equal(esErrorDeRed({code:'CALL_EXCEPTION',message:'execution reverted'}),false);
});

test('rpc: el portal del proveedor usa una copia exacta del mismo módulo',async()=>{
 assert.equal(await fs.readFile(new URL('../portal-proveedor/rpc.js',import.meta.url),'utf8'),await fs.readFile(new URL('../src/rpc.mjs',import.meta.url),'utf8'));
});
