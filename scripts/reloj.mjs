// Nivel 2 · Compilación, despliegue y fondeo del contrato RelojProveedor.
// Va aparte de runtime.mjs para no tocar nada del Nivel 1.
import fs from 'node:fs/promises';
import path from 'node:path';
import {ContractFactory,keccak256,parseEther} from 'ethers';
import {ROOT,EVIDENCE_DIR} from './runtime.mjs';
import {parseProveedores,constructorArgs} from '../src/reloj.mjs';

export const RELOJ_SOURCE=path.join(ROOT,'contracts','RelojProveedor.sol');
export const RELOJ_ARTIFACT=path.join(ROOT,'contracts','RelojProveedor.json');
export const RELOJ_CONFIG='reloj-local.json';

/** Mismos ajustes que el Nivel 1: solc 0.8.30, optimizador 200, Shanghai. */
export async function compileReloj(){
 const {default:solc}=await import('solc');
 const source=await fs.readFile(RELOJ_SOURCE,'utf8');
 const input={language:'Solidity',sources:{'RelojProveedor.sol':{content:source}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}};
 const output=JSON.parse(solc.compile(JSON.stringify(input)));
 const errors=(output.errors||[]).filter(e=>e.severity==='error');if(errors.length)throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
 const artifact=output.contracts['RelojProveedor.sol'].RelojProveedor;
 return {contractName:'RelojProveedor',compiler:solc.version(),abi:artifact.abi,bytecode:'0x'+artifact.evm.bytecode.object,deployedBytecode:'0x'+artifact.evm.deployedBytecode.object,input};
}
/** Lee el contrato precompilado y comprueba que corresponda al .sol actual. */
export async function loadRelojArtifact(){
 let artifact;try{artifact=JSON.parse(await fs.readFile(RELOJ_ARTIFACT,'utf8'));}catch(e){if(e.code==='ENOENT')throw new Error('Falta contracts/RelojProveedor.json. Ejecuta npm run compile:reloj.');throw e;}
 if(artifact.input?.sources?.['RelojProveedor.sol']?.content!==await fs.readFile(RELOJ_SOURCE,'utf8'))throw new Error('contracts/RelojProveedor.json no corresponde al .sol actual. Ejecuta npm run compile:reloj.');
 return artifact;
}
/** Las cuentas de los proveedores necesitan saldo para firmar. En una cadena persistida creada con
 *  menos cuentas, la nueva no tiene saldo: se fondea desde la cuenta 0 (el municipio). */
export async function fondear(provider,indices,minimo=parseEther('1'),monto=parseEther('10')){
 const municipio=await provider.getSigner(0),fondeadas=[];
 for(const i of indices){
  const cuenta=await (await provider.getSigner(i)).getAddress();
  if(await provider.getBalance(cuenta)<minimo){await (await municipio.sendTransaction({to:cuenta,value:monto})).wait();fondeadas.push(cuenta);}
 }
 return fondeadas;
}
/** Despliega RelojProveedor con los proveedores de datos/proveedores.csv (PV-01 → cuenta 1, PV-02 → cuenta 2). */
export async function deployReloj(provider){
 const artifact=await loadRelojArtifact();
 const proveedores=parseProveedores(await fs.readFile(path.join(ROOT,'datos','proveedores.csv'),'utf8'));
 const cuentas=[];for(let i=0;i<proveedores.length;i++)cuentas.push(await (await provider.getSigner(i+1)).getAddress());
 const municipio=await provider.getSigner(0);
 const contract=await new ContractFactory(artifact.abi,artifact.bytecode,municipio).deploy(...constructorArgs(proveedores,cuentas));await contract.waitForDeployment();
 const receipt=await contract.deploymentTransaction().wait();if(receipt.status!==1)throw new Error('Falló el despliegue de RelojProveedor');
 const address=await contract.getAddress();
 return {contract:'RelojProveedor',address,chainId:Number((await provider.getNetwork()).chainId),deploymentBlock:receipt.blockNumber,deploymentTransaction:receipt.hash,codeHash:keccak256(await provider.getCode(address)),
  municipio:await municipio.getAddress(),proveedores:proveedores.map((p,i)=>({id:p.id,cuenta:cuentas[i],slaSegundos:p.slaSegundos,tarifaCentavosPorHora:p.tarifaCentavosPorHora})),
  supuesto:'SLA contractual en horas corridas, no hábiles',local:true};
}
/** «Reiniciar simulación»: despliega un RelojProveedor nuevo en la red local y lo deja como el vigente.
 *  El anterior sigue en la cadena (nada se borra); simplemente deja de usarse. Un reinicio a la vez. */
let reinicio=Promise.resolve();
export function reiniciarReloj(provider){
 const tarea=reinicio.then(async()=>{
  const proveedores=parseProveedores(await fs.readFile(path.join(ROOT,'datos','proveedores.csv'),'utf8'));
  await fondear(provider,proveedores.map((_,i)=>i+1));
  const config=await deployReloj(provider);
  await fs.mkdir(EVIDENCE_DIR,{recursive:true});await fs.writeFile(path.join(EVIDENCE_DIR,RELOJ_CONFIG),JSON.stringify(config,null,2));
  return config;
 });
 reinicio=tarea.catch(()=>{});
 return tarea;
}
/** Usa el RelojProveedor ya desplegado en esta instancia o lo despliega una vez. Nunca toca el contrato del Nivel 1. */
export async function ensureReloj(provider){
 const file=path.join(EVIDENCE_DIR,RELOJ_CONFIG);
 let config;try{config=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const proveedores=parseProveedores(await fs.readFile(path.join(ROOT,'datos','proveedores.csv'),'utf8'));
 await fondear(provider,proveedores.map((_,i)=>i+1));
 if(!config){config=await deployReloj(provider);await fs.writeFile(file,JSON.stringify(config,null,2));}
 if(await provider.getCode(config.address)==='0x')throw new Error('La cadena persistida no contiene RelojProveedor. No se reemplazará automáticamente.');
 return config;
}
