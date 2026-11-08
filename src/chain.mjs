import {Contract, keccak256, toUtf8Bytes} from 'ethers';
import {POLICY,PERIOD,sha} from './core.mjs';
// Regla del reto: julio de 2026 son 187 tickets. El contrato acepta cualquier cantidad > 0.
export const EXPECTED_COUNT=187;
export const ABI=['function owner() view returns(address)','function rulesHash() view returns(bytes32)','function seal(uint32,bytes32,bytes32,uint32)','function getSeal(uint32) view returns(tuple(bytes32 root,bytes32 evidenceHash,uint32 count,uint64 timestamp))','event Sealed(uint32 indexed period,bytes32 root,bytes32 evidenceHash,uint32 count)'];
function incomplete(message){const error=new Error(message);error.code='ANCHOR_INCOMPLETE';return error;}
export async function readAnchor(provider,config) {
 try {
  const network=await provider.getNetwork();if(network.chainId!==BigInt(config.chainId))throw incomplete('Red distinta de la configurada');
  const code=await provider.getCode(config.address);if(code==='0x')throw incomplete('Contrato no desplegado');
  if(keccak256(code)!==config.codeHash)throw incomplete('Bytecode distinto del contrato auditado');
  const contract=new Contract(config.address,ABI,provider);
  if(await contract.rulesHash()!==await sha(JSON.stringify(POLICY)))throw incomplete('Reglas distintas del contrato');
  const s=await contract.getSeal(PERIOD);if(s.timestamp===0n)throw incomplete('No existe sello confirmado: verificación incompleta');
  if(Number(s.count)!==EXPECTED_COUNT)throw incomplete(`El sello declara ${s.count} tickets; el verificador exige ${EXPECTED_COUNT} para julio de 2026`);
  // En redes públicas se consulta solo el bloque del sello: los RPC limitan el rango de logs.
  const logs=await contract.queryFilter(contract.filters.Sealed(PERIOD),config.sealBlock??config.deploymentBlock,config.sealBlock??'latest');
  if(logs.length!==1)throw incomplete('No se encontró un único evento de sellado');
  const log=logs[0],tx=await provider.getTransaction(log.transactionHash),receipt=await provider.getTransactionReceipt(log.transactionHash);
  if(!tx||!receipt||receipt.status!==1||tx.to?.toLowerCase()!==config.address.toLowerCase())throw incomplete('Recibo de sellado no confirmado');
  const data=contract.interface.parseTransaction({data:tx.data});
  if(data?.name!=='seal'||Number(data.args[0])!==PERIOD||data.args[1]!==s.root||data.args[2]!==s.evidenceHash||Number(data.args[3])!==EXPECTED_COUNT)throw incomplete('Calldata no corresponde al compromiso');
  if(log.args.root!==s.root||log.args.evidenceHash!==s.evidenceHash||Number(log.args.count)!==EXPECTED_COUNT)throw incomplete('Evento y almacenamiento no coinciden');
  return {root:s.root,evidenceHash:s.evidenceHash,count:Number(s.count),timestamp:Number(s.timestamp),transactionHash:tx.hash,blockNumber:receipt.blockNumber,calldata:tx.data,address:config.address,chainId:Number(network.chainId),codeHash:config.codeHash,rulesHash:await contract.rulesHash(),event:{period:PERIOD,root:s.root,evidenceHash:s.evidenceHash,count:Number(s.count)}};
 }catch(error){if(error.code==='ANCHOR_INCOMPLETE')throw error;const connection=new Error(error.message);connection.code='CHAIN_CONNECTION';throw connection;}
}