// Nivel 3 en Sepolia. El municipio despliega RegistroCatalogo y ancla el catálogo con MetaMask; el servidor
// NO confía en el navegador: comprueba despliegue y anclaje por RPC público antes de guardarlos (como la Fase 9).
import fs from 'node:fs/promises';
import path from 'node:path';
import {keccak256,getAddress} from 'ethers';
import {ROOT} from './runtime.mjs';
import {loadCatalogoArtifact} from './catalogo.mjs';
import {argumentosAnclaje,leerAnclado,nuevoCatalogo,PERIODO_CATALOGO} from '../src/catalogo.mjs';

export const SEPOLIA_CHAIN_ID=11155111;
export const CATALOGO_DIRS=Object.freeze({evidenceDir:path.join(ROOT,'evidencias')});
const CONFIG='catalogo-sepolia.json',HISTORY='catalogo-sepolia-historial';
const fail=message=>{const e=new Error(message);e.status=400;return e;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const ZERO='0x0000000000000000000000000000000000000000';
const textoCatalogo=()=>fs.readFile(path.join(ROOT,'datos','catalogo_servicios.csv'),'utf8');

export async function readCatalogoSepolia(dirs=CATALOGO_DIRS){try{return JSON.parse(await fs.readFile(path.join(dirs.evidenceDir,CONFIG),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}

/**
 * Despliegue: red, bytecode de RegistroCatalogo (salvo el inmutable owner), transacción de creación con ese
 * bytecode y owner = quien desplegó. Anclaje: transacción confirmada a ese contrato, firmada por el owner, y lo
 * anclado (hash del CSV y los 14 servicios con prioridad y SLA) igual a datos/catalogo_servicios.csv.
 */
export async function validarCatalogo({provider,address,deploymentTransaction,anclajeTransaction,expectedChainId=SEPOLIA_CHAIN_ID,admin=null}){
 for(const [v,n] of [[address,'Dirección de contrato'],[deploymentTransaction,'Transacción de despliegue'],[anclajeTransaction,'Transacción de anclaje']])
  if(!(n.startsWith('Dirección')?/^0x[0-9a-fA-F]{40}$/:/^0x[0-9a-fA-F]{64}$/).test(String(v)))throw fail(`${n} inválida.`);
 address=getAddress(address);
 const chainId=Number((await provider.getNetwork()).chainId);
 if(chainId!==expectedChainId)throw fail(`Red equivocada: el RPC está en la red ${chainId} y se esperaba ${expectedChainId} (Sepolia).`);
 const code=await provider.getCode(address);
 if(!code||code==='0x')throw fail('La dirección no tiene código: no hay un contrato desplegado ahí.');
 const artifact=await loadCatalogoArtifact(),expected=artifact.deployedBytecode.toLowerCase().slice(2);
 if(code.length-2!==expected.length)throw fail('El código desplegado no coincide con RegistroCatalogo.');
 const k=nuevoCatalogo(address,provider);
 let owner;try{owner=getAddress(await k.owner());}catch{throw fail('El código desplegado no coincide con RegistroCatalogo.');}
 const masked=code.toLowerCase().slice(2).split(owner.toLowerCase().slice(2).padStart(64,'0')).join('0'.repeat(64));
 if(masked!==expected)throw fail('El código desplegado no coincide con RegistroCatalogo.');
 const [tx,receipt]=await Promise.all([provider.getTransaction(deploymentTransaction),provider.getTransactionReceipt(deploymentTransaction)]);
 if(!tx||!receipt||receipt.status!==1||tx.to!==null||getAddress(receipt.contractAddress??ZERO)!==address)throw fail('La transacción no es el despliegue confirmado de ese contrato.');
 if(tx.data.toLowerCase()!==artifact.bytecode.toLowerCase())throw fail('La transacción de despliegue no usa el bytecode de RegistroCatalogo.');
 if(getAddress(tx.from)!==owner)throw fail('El owner del contrato no es la cuenta que lo desplegó.');
 if(admin&&getAddress(admin)!==owner)throw fail('Solo la cuenta del municipio configurada en el servidor puede anclar el catálogo.');
 const [atx,arc]=await Promise.all([provider.getTransaction(anclajeTransaction),provider.getTransactionReceipt(anclajeTransaction)]);
 if(!atx||!arc||arc.status!==1||getAddress(arc.to??ZERO)!==address)throw fail('La transacción de anclaje no es un anclaje confirmado de este contrato.');
 if(getAddress(atx.from)!==owner)throw fail('El anclaje no lo firmó el municipio (owner del contrato).');
 const esperado=await argumentosAnclaje(await textoCatalogo());
 if(atx.data.toLowerCase()!==k.interface.encodeFunctionData('anclarCatalogo',[esperado.periodo,esperado.csvSha256,esperado.ids,esperado.prioridades,esperado.slas]).toLowerCase())
  throw fail('El anclaje no corresponde a datos/catalogo_servicios.csv (hash, servicios, prioridades o SLA distintos).');
 const anclado=await leerAnclado(k,PERIODO_CATALOGO);
 if(!anclado.anclado||anclado.csvSha256!==esperado.csvSha256||anclado.servicios.length!==esperado.filas.length)throw fail('Lo anclado en la cadena no coincide con el catálogo original.');
 return {address,owner,codeHash:keccak256(code),deploymentBlock:receipt.blockNumber,deploymentTransaction:receipt.hash,anclajeTransaction:arc.hash,anclajeBlock:arc.blockNumber,chainId,compiler:artifact.compiler,anclado};
}

/** Mueve el catálogo activo a evidencias/catalogo-sepolia-historial/. Nada se borra. */
export async function archivarCatalogo(dirs=CATALOGO_DIRS){
 const anterior=await readCatalogoSepolia(dirs);if(!anterior)return null;
 const destino=path.join(dirs.evidenceDir,HISTORY,`${new Date().toISOString().replace(/[:.]/g,'-')}-${anterior.address}`);
 await fs.mkdir(destino,{recursive:true});
 await fs.rename(path.join(dirs.evidenceDir,CONFIG),path.join(destino,CONFIG));
 return destino;
}

/** «Anclar catálogo de julio» en Sepolia: valida y, solo entonces, lo deja como el catálogo activo. */
export async function registrarCatalogo({provider,address,deploymentTransaction,anclajeTransaction,publicRpc,explorer='https://sepolia.etherscan.io',expectedChainId=SEPOLIA_CHAIN_ID,admin=null,dirs=CATALOGO_DIRS,intentos=1,pausa=3000}){
 let v;
 // Recién minado, el RPC público puede ir un bloque atrás: solo esos casos se reintentan.
 for(let i=1;;i++){
  try{v=await validarCatalogo({provider,address,deploymentTransaction,anclajeTransaction,expectedChainId,admin});break;}
  catch(e){if(i>=intentos||!/no tiene código|no es el despliegue|no es un anclaje|no coincide con el catálogo/.test(e.message))throw e;await wait(pausa);}
 }
 const actual=await readCatalogoSepolia(dirs);
 if(actual?.address&&getAddress(actual.address)===v.address)return actual;
 const archivo=await archivarCatalogo(dirs);
 const config={contract:'RegistroCatalogo',network:'Sepolia (testnet pública de Ethereum)',chainId:v.chainId,periodo:PERIODO_CATALOGO,address:v.address,owner:v.owner,
  deploymentBlock:v.deploymentBlock,deploymentTransaction:v.deploymentTransaction,anclajeTransaction:v.anclajeTransaction,anclajeBlock:v.anclajeBlock,codeHash:v.codeHash,
  csvSha256:v.anclado.csvSha256,servicios:v.anclado.servicios,rpc:publicRpc,explorer,local:false,compiler:v.compiler,preparedFrom:'navegador (MetaMask)',
  links:{contract:`${explorer}/address/${v.address}`,deployment:`${explorer}/tx/${v.deploymentTransaction}`,anclaje:`${explorer}/tx/${v.anclajeTransaction}`},
  ...(archivo?{previous:path.relative(dirs.evidenceDir,archivo).replaceAll('\\','/')}:{})};
 await fs.mkdir(dirs.evidenceDir,{recursive:true});
 await fs.writeFile(path.join(dirs.evidenceDir,CONFIG),JSON.stringify(config,null,2)+'\n');
 return config;
}
