// Sepolia con MetaMask (Nivel 1). El navegador despliega y sella con MetaMask; la llave nunca
// sale de la billetera. El servidor NO confía en lo que envía el navegador: comprueba todo por
// RPC público antes de guardar la configuración, la sal o la evidencia.
import fs from 'node:fs/promises';
import path from 'node:path';
import {Contract,AbiCoder,keccak256,getAddress} from 'ethers';
import {ROOT,loadArtifact,writeSalt,readSalt} from './runtime.mjs';
import {ABI,readAnchor} from '../src/chain.mjs';
import {POLICY,sha,authenticateEvidence,validSalt,saltCommitment} from '../src/core.mjs';

export const SEPOLIA_CHAIN_ID=11155111;
export const DIRS=Object.freeze({evidenceDir:path.join(ROOT,'evidencias'),secretDir:path.join(ROOT,'.secreto')});
const CONFIG='red-sepolia.json',EVIDENCE='sello-sepolia.json',HISTORY='sepolia-historial';

/** Un archivo de sal por contrato: preparar un período nuevo nunca choca con la sal anterior. */
export const saltFileFor=(address,dirs=DIRS)=>path.join(dirs.secretDir,`sal-sepolia-${getAddress(address).toLowerCase()}.json`);
export async function readSepoliaConfig(dirs=DIRS){try{return JSON.parse(await fs.readFile(path.join(dirs.evidenceDir,CONFIG),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
const writeJson=async(file,data)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(data,null,2)+'\n');};
const links=(explorer,c)=>explorer?{contract:`${explorer}/address/${c.address}`,deployment:`${explorer}/tx/${c.deploymentTransaction}`,...(c.sealTransaction?{seal:`${explorer}/tx/${c.sealTransaction}`}:{})}:{};
const fail=message=>{const e=new Error(message);e.status=400;return e;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));

/**
 * Comprueba un despliegue de RegistroIndicador hecho desde el navegador:
 * red, código en la dirección, bytecode igual a deployedBytecode (salvo los dos inmutables),
 * rulesHash de estas reglas, owner = quien desplegó, y transacción de creación válida.
 */
export async function validarDespliegue({provider,address,deploymentTransaction,expectedChainId=SEPOLIA_CHAIN_ID,admin=null}){
 if(!/^0x[0-9a-fA-F]{40}$/.test(String(address)))throw fail('Dirección de contrato inválida.');
 if(!/^0x[0-9a-fA-F]{64}$/.test(String(deploymentTransaction)))throw fail('Transacción de despliegue inválida.');
 address=getAddress(address);
 const chainId=Number((await provider.getNetwork()).chainId);
 if(chainId!==expectedChainId)throw fail(`Red equivocada: el RPC está en la red ${chainId} y se esperaba ${expectedChainId} (Sepolia).`);
 const code=await provider.getCode(address);
 if(!code||code==='0x')throw fail('La dirección no tiene código: no hay un contrato desplegado ahí.');
 const artifact=await loadArtifact(),expected=artifact.deployedBytecode.toLowerCase().slice(2);
 if(code.length-2!==expected.length)throw fail('El código desplegado no coincide con RegistroIndicador.');
 const contract=new Contract(address,ABI,provider);
 let owner,rules;try{owner=await contract.owner();rules=await contract.rulesHash();}catch{throw fail('El código desplegado no coincide con RegistroIndicador.');}
 // Los dos inmutables (owner y rulesHash) son ceros en deployedBytecode: se enmascaran y el resto debe ser idéntico.
 const zeros='0'.repeat(64),masked=code.toLowerCase().slice(2).split(owner.toLowerCase().slice(2).padStart(64,'0')).join(zeros).split(rules.toLowerCase().slice(2)).join(zeros);
 if(masked!==expected)throw fail('El código desplegado no coincide con RegistroIndicador.');
 const rulesHash=await sha(JSON.stringify(POLICY));
 if(rules!==rulesHash)throw fail('El contrato usa otras reglas (rulesHash distinto del de estas reglas).');
 const [tx,receipt]=await Promise.all([provider.getTransaction(deploymentTransaction),provider.getTransactionReceipt(deploymentTransaction)]);
 if(!tx||!receipt||receipt.status!==1||tx.to!==null||getAddress(receipt.contractAddress??'0x0000000000000000000000000000000000000000')!==address)throw fail('La transacción no es el despliegue confirmado de ese contrato.');
 const creation=artifact.bytecode.toLowerCase()+AbiCoder.defaultAbiCoder().encode(['bytes32'],[rulesHash]).slice(2);
 if(tx.data.toLowerCase()!==creation)throw fail('La transacción de despliegue no usa el bytecode de RegistroIndicador.');
 if(getAddress(tx.from)!==getAddress(owner))throw fail('El owner del contrato no es la cuenta que lo desplegó.');
 if(admin&&getAddress(admin)!==getAddress(owner))throw fail('Solo la cuenta del municipio configurada en el servidor puede preparar un período.');
 return {address,owner:getAddress(owner),rulesHash,codeHash:keccak256(code),deploymentBlock:receipt.blockNumber,deploymentTransaction:receipt.hash,chainId,compiler:artifact.compiler};
}

/** Mueve la configuración y la evidencia del período anterior a evidencias/sepolia-historial/. Nada se borra. */
export async function archivarPeriodo(dirs=DIRS){
 const anterior=await readSepoliaConfig(dirs);if(!anterior)return null;
 const destino=path.join(dirs.evidenceDir,HISTORY,`${new Date().toISOString().replace(/[:.]/g,'-')}-${anterior.address}`);
 await fs.mkdir(destino,{recursive:true});
 for(const f of [CONFIG,EVIDENCE]){try{await fs.rename(path.join(dirs.evidenceDir,f),path.join(destino,f));}catch(e){if(e.code!=='ENOENT')throw e;}}
 return destino;
}

/** «Preparar nuevo período»: valida el despliegue y, solo entonces, lo deja como el contrato vigente de Sepolia. */
export async function registrarPeriodo({provider,address,deploymentTransaction,publicRpc,explorer='https://sepolia.etherscan.io',network='Sepolia (testnet pública de Ethereum)',expectedChainId=SEPOLIA_CHAIN_ID,admin=null,dirs=DIRS,intentos=1,pausa=3000}){
 // Recién minado, el RPC público puede ir un bloque atrás: solo esos dos casos se reintentan.
 let v;
 for(let i=1;;i++){
  try{v=await validarDespliegue({provider,address,deploymentTransaction,expectedChainId,admin});break;}
  catch(e){if(i>=intentos||!/no tiene código|no es el despliegue/.test(e.message))throw e;await wait(pausa);}
 }
 const actual=await readSepoliaConfig(dirs);
 if(actual?.address&&getAddress(actual.address)===v.address)return actual;
 const archivo=await archivarPeriodo(dirs);
 const config={network,chainId:v.chainId,address:v.address,deploymentBlock:v.deploymentBlock,deploymentTransaction:v.deploymentTransaction,codeHash:v.codeHash,rulesHash:v.rulesHash,rulesVersion:POLICY.version,
  sealer:v.owner,rpc:publicRpc,explorer,local:false,evidenceFile:EVIDENCE,compiler:v.compiler,preparedFrom:'navegador (MetaMask)',...(archivo?{previous:path.relative(dirs.evidenceDir,archivo).replaceAll('\\','/')}:{})};
 config.links=links(explorer,config);
 await writeJson(path.join(dirs.evidenceDir,CONFIG),config);
 return config;
}

/** Guarda la sal generada en el navegador, antes de firmar, en un archivo propio de ese contrato. */
export async function guardarSal({address,salt,dirs=DIRS}){
 const config=await readSepoliaConfig(dirs);
 if(!config?.address||getAddress(config.address)!==getAddress(String(address)))throw fail('La sal no corresponde al contrato vigente de Sepolia.');
 if(!validSalt(salt))throw fail('Sal inválida.');
 try{await writeSalt(saltFileFor(config.address,dirs),salt);}catch(e){throw fail(e.message);}
 return {saltCommitment:await saltCommitment(salt)};
}
export async function leerSal(dirs=DIRS){const c=await readSepoliaConfig(dirs);return c?.address?readSalt(saltFileFor(c.address,dirs)):null;}

/**
 * Registra el sello hecho con MetaMask: lee la transacción por RPC público, comprueba el ancla
 * (readAnchor sobre el bloque del sello), la evidencia y la sal; solo entonces la guarda.
 * Los RPC públicos pueden ir un bloque atrás: se reintenta unos segundos.
 */
export async function registrarSello({provider,transactionHash,evidence,dirs=DIRS,intentos=20,pausa=3000}){
 if(!/^0x[0-9a-fA-F]{64}$/.test(String(transactionHash)))throw fail('Transacción inválida.');
 const config=await readSepoliaConfig(dirs);if(!config?.address)throw fail('No hay un período preparado en Sepolia.');
 if(config.sealTransaction){if(config.sealTransaction===transactionHash)return config;throw fail('Este período ya tiene un sello registrado.');}
 let receipt=null,anchor=null,ultimo=null;
 for(let i=0;i<intentos&&!anchor;i++){
  try{
   receipt??=await provider.getTransactionReceipt(transactionHash);
   if(receipt){
    if(receipt.status!==1||getAddress(receipt.to)!==getAddress(config.address))throw fail('La transacción no es un sello confirmado de este contrato.');
    anchor=await readAnchor(provider,{...config,sealBlock:receipt.blockNumber});
   }
  }catch(e){if(e.status===400)throw e;ultimo=e;}
  if(!anchor)await wait(pausa);
 }
 if(!anchor)throw fail(`No se pudo leer el sello en la red: ${ultimo?.message??'la transacción aún no aparece'}.`);
 const auth=await authenticateEvidence(evidence,anchor);if(!auth.ok)throw fail(`La evidencia no corresponde al sello: ${auth.error}`);
 const salt=await readSalt(saltFileFor(config.address,dirs));
 if(!salt||await saltCommitment(salt)!==evidence.saltCommitment)throw fail('La sal guardada para este contrato no corresponde a la evidencia.');
 const sealed={...config,sealTransaction:anchor.transactionHash,sealBlock:anchor.blockNumber};sealed.links=links(config.explorer,sealed);
 await writeJson(path.join(dirs.evidenceDir,EVIDENCE),evidence);
 await writeJson(path.join(dirs.evidenceDir,CONFIG),sealed);
 return sealed;
}
