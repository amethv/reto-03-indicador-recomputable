// Nivel 3 · Compilación y despliegue local de RegistroCatalogo. Va aparte para no tocar los Niveles 1 y 2.
import fs from 'node:fs/promises';
import path from 'node:path';
import {ContractFactory,keccak256} from 'ethers';
import {ROOT,EVIDENCE_DIR} from './runtime.mjs';

export const CATALOGO_SOURCE=path.join(ROOT,'contracts','RegistroCatalogo.sol');
export const CATALOGO_ARTIFACT=path.join(ROOT,'contracts','RegistroCatalogo.json');
export const CATALOGO_CONFIG='catalogo-local.json';

/** Mismos ajustes que los demás contratos: solc 0.8.30, optimizador 200, Shanghai. */
export async function compileCatalogo(){
 const {default:solc}=await import('solc');
 const source=await fs.readFile(CATALOGO_SOURCE,'utf8');
 const input={language:'Solidity',sources:{'RegistroCatalogo.sol':{content:source}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}};
 const output=JSON.parse(solc.compile(JSON.stringify(input)));
 const errors=(output.errors||[]).filter(e=>e.severity==='error');if(errors.length)throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
 const artifact=output.contracts['RegistroCatalogo.sol'].RegistroCatalogo;
 return {contractName:'RegistroCatalogo',compiler:solc.version(),abi:artifact.abi,bytecode:'0x'+artifact.evm.bytecode.object,deployedBytecode:'0x'+artifact.evm.deployedBytecode.object,input};
}
/** Lee el contrato precompilado y comprueba que corresponda al .sol actual. */
export async function loadCatalogoArtifact(){
 let artifact;try{artifact=JSON.parse(await fs.readFile(CATALOGO_ARTIFACT,'utf8'));}catch(e){if(e.code==='ENOENT')throw new Error('Falta contracts/RegistroCatalogo.json. Ejecuta npm run compile:catalogo.');throw e;}
 if(artifact.input?.sources?.['RegistroCatalogo.sol']?.content!==await fs.readFile(CATALOGO_SOURCE,'utf8'))throw new Error('contracts/RegistroCatalogo.json no corresponde al .sol actual. Ejecuta npm run compile:catalogo.');
 return artifact;
}
/** Despliega RegistroCatalogo en la red local con la cuenta 0 (el municipio). Sin anclar: eso se hace desde la página. */
export async function deployCatalogo(provider){
 const artifact=await loadCatalogoArtifact(),municipio=await provider.getSigner(0);
 const contract=await new ContractFactory(artifact.abi,artifact.bytecode,municipio).deploy();await contract.waitForDeployment();
 const receipt=await contract.deploymentTransaction().wait();if(receipt.status!==1)throw new Error('Falló el despliegue de RegistroCatalogo');
 const address=await contract.getAddress();
 return {contract:'RegistroCatalogo',address,chainId:Number((await provider.getNetwork()).chainId),deploymentBlock:receipt.blockNumber,deploymentTransaction:receipt.hash,codeHash:keccak256(await provider.getCode(address)),owner:await municipio.getAddress(),local:true};
}
/** Usa el RegistroCatalogo de esta instancia o lo despliega una vez. Nunca toca los contratos de los Niveles 1 y 2. */
export async function ensureCatalogo(provider){
 const file=path.join(EVIDENCE_DIR,CATALOGO_CONFIG);
 let config;try{config=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!config){config=await deployCatalogo(provider);await fs.writeFile(file,JSON.stringify(config,null,2));}
 if(await provider.getCode(config.address)==='0x')throw new Error('La cadena persistida no contiene RegistroCatalogo. No se reemplazará automáticamente.');
 return config;
}
