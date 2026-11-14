// Nivel 2 en Sepolia. El municipio despliega RelojProveedor con MetaMask desde su app; el servidor
// NO confía en el navegador: comprueba el despliegue por RPC público antes de guardarlo, como en la Fase 9.
// Solo se registra el proveedor 1 (PV-01), con la cuenta de su propia billetera.
import fs from 'node:fs/promises';
import path from 'node:path';
import {AbiCoder,keccak256,getAddress,Contract} from 'ethers';
import {ROOT} from './runtime.mjs';
import {loadRelojArtifact} from './reloj.mjs';
import {ABI_RELOJ,idHash,parseProveedores} from '../src/reloj.mjs';

export const SEPOLIA_CHAIN_ID=11155111;
export const RELOJ_DIRS=Object.freeze({evidenceDir:path.join(ROOT,'evidencias')});
const CONFIG='reloj-sepolia.json',HISTORY='reloj-sepolia-historial';
const fail=message=>{const e=new Error(message);e.status=400;return e;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const ZERO='0x0000000000000000000000000000000000000000';

/** Proveedor 1 según datos/proveedores.csv: id, SLA en segundos y tarifa en centavos por hora. */
export async function proveedor1(){
 const p=parseProveedores(await fs.readFile(path.join(ROOT,'datos','proveedores.csv'),'utf8')).find(x=>x.id==='PV-01');
 if(!p)throw new Error('Falta PV-01 en datos/proveedores.csv');
 return p;
}
/** Argumentos del constructor para Sepolia: solo PV-01, con la cuenta indicada. */
export const argsSepolia=(p,cuenta)=>[[idHash(p.id)],[getAddress(cuenta)],[p.slaSegundos],[p.tarifaCentavosPorHora]];

export async function readRelojSepolia(dirs=RELOJ_DIRS){try{return JSON.parse(await fs.readFile(path.join(dirs.evidenceDir,CONFIG),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}

/**
 * Comprueba un despliegue de RelojProveedor hecho desde el navegador: red, bytecode igual a
 * deployedBytecode (salvo el inmutable municipio), transacción de creación con el bytecode y los
 * argumentos esperados (solo PV-01, con su SLA y tarifa) y municipio = quien desplegó.
 */
export async function validarReloj({provider,address,deploymentTransaction,proveedor,expectedChainId=SEPOLIA_CHAIN_ID,admin=null}){
 if(!/^0x[0-9a-fA-F]{40}$/.test(String(address)))throw fail('Dirección de contrato inválida.');
 if(!/^0x[0-9a-fA-F]{64}$/.test(String(deploymentTransaction)))throw fail('Transacción de despliegue inválida.');
 if(!/^0x[0-9a-fA-F]{40}$/.test(String(proveedor)))throw fail('Dirección del proveedor 1 inválida.');
 address=getAddress(address);proveedor=getAddress(proveedor);
 const chainId=Number((await provider.getNetwork()).chainId);
 if(chainId!==expectedChainId)throw fail(`Red equivocada: el RPC está en la red ${chainId} y se esperaba ${expectedChainId} (Sepolia).`);
 const code=await provider.getCode(address);
 if(!code||code==='0x')throw fail('La dirección no tiene código: no hay un contrato desplegado ahí.');
 const artifact=await loadRelojArtifact(),expected=artifact.deployedBytecode.toLowerCase().slice(2);
 if(code.length-2!==expected.length)throw fail('El código desplegado no coincide con RelojProveedor.');
 let municipio;try{municipio=getAddress(await new Contract(address,ABI_RELOJ,provider).municipio());}catch{throw fail('El código desplegado no coincide con RelojProveedor.');}
 // El único inmutable (municipio) es ceros en deployedBytecode: se enmascara y el resto debe ser idéntico.
 const masked=code.toLowerCase().slice(2).split(municipio.toLowerCase().slice(2).padStart(64,'0')).join('0'.repeat(64));
 if(masked!==expected)throw fail('El código desplegado no coincide con RelojProveedor.');
 const [tx,receipt]=await Promise.all([provider.getTransaction(deploymentTransaction),provider.getTransactionReceipt(deploymentTransaction)]);
 if(!tx||!receipt||receipt.status!==1||tx.to!==null||getAddress(receipt.contractAddress??ZERO)!==address)throw fail('La transacción no es el despliegue confirmado de ese contrato.');
 const p=await proveedor1(),types=['bytes32[]','address[]','uint64[]','uint64[]'];
 const creation=artifact.bytecode.toLowerCase()+AbiCoder.defaultAbiCoder().encode(types,argsSepolia(p,proveedor)).slice(2);
 if(tx.data.toLowerCase()!==creation)throw fail('El despliegue no usa el bytecode de RelojProveedor con el proveedor 1, su SLA y su tarifa.');
 if(getAddress(tx.from)!==municipio)throw fail('El municipio del contrato no es la cuenta que lo desplegó.');
 if(municipio===proveedor)throw fail('La cuenta del proveedor 1 no puede ser la del municipio.');
 if(admin&&getAddress(admin)!==municipio)throw fail('Solo la cuenta del municipio configurada en el servidor puede preparar el reloj.');
 return {address,municipio,proveedor:{id:p.id,cuenta:proveedor,slaSegundos:p.slaSegundos,tarifaCentavosPorHora:p.tarifaCentavosPorHora},codeHash:keccak256(code),deploymentBlock:receipt.blockNumber,deploymentTransaction:receipt.hash,chainId,compiler:artifact.compiler};
}

/** Mueve el reloj activo a evidencias/reloj-sepolia-historial/. Nada se borra. */
export async function archivarReloj(dirs=RELOJ_DIRS){
 const anterior=await readRelojSepolia(dirs);if(!anterior)return null;
 const destino=path.join(dirs.evidenceDir,HISTORY,`${new Date().toISOString().replace(/[:.]/g,'-')}-${anterior.address}`);
 await fs.mkdir(destino,{recursive:true});
 await fs.rename(path.join(dirs.evidenceDir,CONFIG),path.join(destino,CONFIG));
 return destino;
}

/** «Preparar reloj en Sepolia»: valida y, solo entonces, lo deja como el reloj activo. */
export async function registrarReloj({provider,address,deploymentTransaction,proveedor,publicRpc,explorer='https://sepolia.etherscan.io',expectedChainId=SEPOLIA_CHAIN_ID,admin=null,dirs=RELOJ_DIRS,intentos=1,pausa=3000}){
 let v;
 // Recién minado, el RPC público puede ir un bloque atrás: solo esos dos casos se reintentan.
 for(let i=1;;i++){
  try{v=await validarReloj({provider,address,deploymentTransaction,proveedor,expectedChainId,admin});break;}
  catch(e){if(i>=intentos||!/no tiene código|no es el despliegue/.test(e.message))throw e;await wait(pausa);}
 }
 const actual=await readRelojSepolia(dirs);
 if(actual?.address&&getAddress(actual.address)===v.address)return actual;
 const archivo=await archivarReloj(dirs);
 const config={contract:'RelojProveedor',network:'Sepolia (testnet pública de Ethereum)',chainId:v.chainId,address:v.address,deploymentBlock:v.deploymentBlock,deploymentTransaction:v.deploymentTransaction,codeHash:v.codeHash,
  municipio:v.municipio,proveedores:[v.proveedor],rpc:publicRpc,explorer,local:false,compiler:v.compiler,preparedFrom:'navegador (MetaMask)',supuesto:'SLA contractual en horas corridas, no hábiles',
  links:{contract:`${explorer}/address/${v.address}`,deployment:`${explorer}/tx/${v.deploymentTransaction}`},...(archivo?{previous:path.relative(dirs.evidenceDir,archivo).replaceAll('\\','/')}:{})};
 await fs.mkdir(dirs.evidenceDir,{recursive:true});
 await fs.writeFile(path.join(dirs.evidenceDir,CONFIG),JSON.stringify(config,null,2)+'\n');
 return config;
}
