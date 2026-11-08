import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {Contract,toUtf8Bytes,hexlify} from 'ethers';
import Papa from 'papaparse';
import {startApp} from './start.mjs';
import {ROOT,STATE_ROOT,EVIDENCE_DIR,INSTANCE} from './runtime.mjs';
import {readAnchor,ABI} from '../src/chain.mjs';
import {PERIOD,csv,verifyText,authenticateEvidence,sha} from '../src/core.mjs';
import {verifySource} from './verify-source.mjs';
const names=['Sellado de los 187 tickets','Recálculo independiente','Detección de alteraciones','Comparación de indicadores','Privacidad en blockchain'];
const implementation=[
 'src/core.mjs: buildEvidence, leaf, merkle, evidenceHash; contracts/RegistroJulio.sol: seal; src/chain.mjs: readAnchor; src/app.mjs: botón seal.',
 'src/core.mjs: verifyText, calculate, businessHours; src/app.mjs: doVerify, renderTable.',
 'src/core.mjs: authenticateEvidence, proofValid, verifyText; src/app.mjs: doVerify; contracts/RegistroJulio.sol: sello inmutable.',
 'src/core.mjs: calculate; src/app.mjs: doVerify, renderTable; src/index.html: dos tarjetas principales.',
 'contracts/RegistroJulio.sol; src/chain.mjs: readAnchor; src/app.mjs: showAnchor; src/index.html: Privacidad en blockchain.'
];
const report={started:new Date().toISOString(),timezone:'America/Guayaquil',criteria:names.map((name,i)=>({criterion:i+1,name,implementation:implementation[i],status:'NO VERIFICADO',test:'No ejecutada',result:null,evidence:[],pending:[]})),supplementary:[],browserErrors:[]};
let app,browser,step=0,anchor,evidence,originals;
try {
 report.sourceFiles=(await verifySource()).map(({file,actual})=>({file,sha256:actual}));
 app=await startApp();browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage();
 page.on('pageerror',e=>report.browserErrors.push(e.message));
 await page.goto('http://127.0.0.1:8080');await page.waitForFunction(()=>window.__ateneaReady===true);
 originals={tickets:await fs.readFile(path.join(ROOT,'datos/tickets.csv'),'utf8'),catalog:await fs.readFile(path.join(ROOT,'datos/catalogo_servicios.csv'),'utf8'),report:await fs.readFile(path.join(ROOT,'datos/indicador_mensual.csv'),'utf8')};
 // Se ejecutan las cinco demostraciones en el orden del jurado.
 step=1;let item=report.criteria[0];item.test='Cargar originales, pulsar sellado en navegador si aún no existe; comprobar código, recibo, evento y getSeal mediante JSON-RPC real.';
 await page.locator('#load').click();await expect(page.locator('#sealStatus')).toContainText('187/187');
 if(await page.locator('#seal').isEnabled()){await page.locator('#seal').click();await expect(page.locator('#sealStatus')).toContainText('SELLADO CONFIRMADO',{timeout:60000});item.newTransaction=true;}else{item.newTransaction=false;}
 anchor=await readAnchor(app.provider,app.config);evidence=JSON.parse(await fs.readFile(path.join(EVIDENCE_DIR,'sello-original.json'),'utf8'));
 assert.equal((await authenticateEvidence(evidence,anchor)).ok,true);assert.equal(anchor.count,187);assert.equal(evidence.tickets.length,187);
 const baseline=JSON.parse(await fs.readFile(path.join(ROOT,'src/originals.json'),'utf8'));assert.equal(await sha(originals.tickets),baseline.files.tickets);
 item.status='APROBADO';item.result={count:187,root:anchor.root,transaction:anchor.transactionHash,block:anchor.blockNumber,address:anchor.address,chainId:anchor.chainId};item.evidence=['evidencias/red-local.json','evidencias/sello-original.json','evidencias/01-sellado.png'];await page.screenshot({path:path.join(STATE_ROOT,item.evidence[2]),fullPage:true});
 step=2;item=report.criteria[1];item.test='Verificar original en interfaz contra cadena real; contrastar resultados con recálculo desde registros, sin usar porcentaje publicado como resultado.';
 await page.locator('#verify').click();await expect(page.locator('#verification')).toContainText('VERDE',{timeout:30000});
 const originalResult=await verifyText(originals.tickets,evidence,anchor,originals.catalog,originals.report);assert.equal(originalResult.status,'VERDE');
 assert.equal(originalResult.result.numeratorA,187);assert.equal(originalResult.result.denominator,187);assert.equal(originalResult.result.percentA,100);assert.equal(originalResult.published,98.25);assert.equal(originalResult.difference,1.75);
 await expect(page.locator('#percentA')).toHaveText('100,00 %');await expect(page.locator('#published')).toContainText('1,75');await expect(page.locator('#tickets tr')).toHaveCount(187);
 item.status='APROBADO';item.result={numerator:187,denominator:187,recomputed:100,published:98.25,differencePP:1.75,calendarJuly:185,calendarAugust:2,scope:'lote entregado y estado final; no corte calendario estricto',slaDiscrepancies:originalResult.result.details.filter(r=>r.discrepancies.length).map(r=>r.id),outsideSLA:originalResult.result.details.filter(r=>r.within===false).length};item.evidence=['evidencias/02-recalculo.png'];await page.screenshot({path:path.join(STATE_ROOT,item.evidence[0]),fullPage:true});
 step=3;item=report.criteria[2];item.test='Guardar una copia del CSV con fecha_resolucion alterada de un solo ticket; subir mediante selector de archivo real y verificar en navegador; comprobar ROJO, ID exacto, campo y ausencia de indicadores acreditados.';
 const rows=csv(originals.tickets).rows,id=rows[0].ticket_id;
 rows[0].fecha_resolucion=new Date(Date.parse(rows[0].fecha_resolucion)+60000-5*3600000).toISOString().slice(0,19)+'-05:00';
 const modified=Papa.unparse(rows,{columns:evidence.headers,newline:'\n'}),copy=path.join(EVIDENCE_DIR,'tickets-modificado.csv');await fs.writeFile(copy,modified);
 await page.locator('#verifyFile').setInputFiles(copy);await expect(page.locator('#percentA')).toHaveText('—');await page.locator('#verify').click();await expect(page.locator('#verification')).toContainText('ROJO',{timeout:30000});
 await expect(page.locator('#changes')).toContainText(id);await expect(page.locator('#changes')).toContainText('fecha_resolucion');await expect(page.locator('#changes li')).toHaveCount(1);await expect(page.locator('#percentB')).toHaveText('—');
 const modifiedResult=await verifyText(modified,evidence,anchor,originals.catalog,originals.report);assert.equal(modifiedResult.status,'ROJO');assert.deepEqual(modifiedResult.changes.map(r=>r.id),[id]);assert.equal(modifiedResult.result,undefined);
 assert.equal((await readAnchor(app.provider,app.config)).transactionHash,anchor.transactionHash);assert.deepEqual(JSON.parse(await fs.readFile(path.join(EVIDENCE_DIR,'sello-original.json'),'utf8')),evidence);
 item.status='NO VERIFICADO';item.automatedStatus='APROBADO';item.result={color:'ROJO',ticket:id,fields:modifiedResult.changes[0].fields,originalSealUnchanged:true,automatedBrowserUpload:true};item.evidence=['evidencias/03-alteracion.png','evidencias/tickets-modificado.csv'];item.pending=['La edición y carga fueron automatizadas sobre un archivo real. Falta ejecutar y observar la edición manual en un editor y la carga por una persona, exigida literalmente en la demostración.'];await page.screenshot({path:path.join(STATE_ROOT,item.evidence[0]),fullPage:true});
 step=4;item=report.criteria[3];item.test='Restaurar entrada al original y verificar; comprobar dos tarjetas, mismo denominador, porcentajes calculados y filtro de los 83 excluidos de B.';
 await page.locator('#verifyFile').setInputFiles(path.join(ROOT,'datos/tickets.csv'));await page.locator('#verify').click();await expect(page.locator('#verification')).toContainText('VERDE',{timeout:30000});
 await expect(page.locator('.indicators article')).toHaveCount(2);await expect(page.locator('#percentA')).toHaveText('100,00 %');await expect(page.locator('#percentB')).toHaveText('55,61 %');await expect(page.locator('#gap')).toContainText('44,39');await expect(page.locator('#fractionA')).toContainText('/ 187');await expect(page.locator('#fractionB')).toContainText('/ 187');
 await page.locator('#filter').selectOption('notB');await expect(page.locator('#tickets tr')).toHaveCount(83);await page.locator('#filter').selectOption('notA');await expect(page.locator('#tickets tr')).toHaveCount(0);await page.locator('#filter').selectOption('all');
 item.status='APROBADO';item.result={A:{numerator:187,denominator:187,percentage:100},B:{numerator:104,denominator:187,percentage:originalResult.result.percentB},gapPP:originalResult.result.gap,automatic:83};item.evidence=['evidencias/04-comparacion.png'];await page.screenshot({path:path.join(STATE_ROOT,item.evidence[0]),fullPage:true});
 step=5;item=report.criteria[4];item.test='Consultar contrato, recibo, calldata, evento y almacenamiento reales; comprobar ABI, creación y argumentos enviados, sin nombres ni contenido de tickets.';
 await page.locator('#inspect').click();await expect(page.locator('#onchain')).toContainText(anchor.transactionHash);
 const observed=JSON.parse(await page.locator('#onchain').textContent());assert.deepEqual(observed,anchor);
 const contract=new Contract(app.config.address,ABI,app.provider),tx=await app.provider.getTransaction(anchor.transactionHash),decoded=contract.interface.parseTransaction({data:tx.data});assert.equal(decoded.name,'seal');assert.equal(decoded.args.length,4);assert.equal(tx.data.length,266);
 const artifact=JSON.parse(await fs.readFile(path.join(EVIDENCE_DIR,'contrato.json'),'utf8')),deployment=await app.provider.getTransaction(app.config.deploymentTransaction);
 assert.equal(deployment.data,artifact.bytecode+app.config.rulesHash.slice(2));
 for(const r of csv(originals.tickets).rows)for(const value of [r.usuario,r.tecnico_asignado])assert.ok(!tx.data.includes(hexlify(toUtf8Bytes(value)).slice(2)));
 assert.deepEqual(artifact.abi.filter(x=>x.type==='function').map(x=>x.name).sort(),['getSeal','owner','rulesHash','seal']);
 await fs.writeFile(path.join(EVIDENCE_DIR,'blockchain.json'),JSON.stringify({...anchor,deploymentTransaction:app.config.deploymentTransaction,deploymentBlock:app.config.deploymentBlock,abi:artifact.abi,compiler:artifact.compiler},null,2));
 item.status='APROBADO';item.result={stored:['period','root','evidenceHash','count','timestamp','owner','rulesHash'],sealCalldataBytes:132,transaction:anchor.transactionHash,contract:anchor.address,network:app.config.network,noTicketNamesInTransaction:true};item.evidence=['evidencias/blockchain.json','evidencias/contrato.json','evidencias/05-privacidad.png'];await page.screenshot({path:path.join(STATE_ROOT,item.evidence[2]),fullPage:true});
 // Pruebas complementarias posteriores a los cinco criterios.
 await assert.rejects(new Contract(app.config.address,ABI,await app.provider.getSigner(0)).seal(PERIOD,anchor.root,anchor.evidenceHash,187));report.supplementary.push({test:'Segundo sellado rechazado por EVM',status:'APROBADO'});
 await context.route('http://127.0.0.1:8545/**',route=>route.abort());await page.locator('#verify').click();await expect(page.locator('#verification')).toContainText('ERROR DE CONEXIÓN',{timeout:30000});await expect(page.locator('#percentA')).toHaveText('—');await expect(page.locator('#verification')).not.toHaveClass(/green/);report.supplementary.push({test:'RPC bloqueado: sin verde ni indicadores acreditados',status:'APROBADO'});await context.unroute('http://127.0.0.1:8545/**');
 await page.reload();await page.waitForFunction(()=>window.__ateneaReady===true);await expect(page.locator('#sealStatus')).toContainText('Sello existente confirmado');await expect(page.locator('#seal')).toBeDisabled();await page.locator('#verify').click();await expect(page.locator('#verification')).toContainText('VERDE',{timeout:30000});report.supplementary.push({test:'Recarga: manifiesto persistido y sello original conservado',status:'APROBADO'});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:path.join(EVIDENCE_DIR,'06-movil.png'),fullPage:true});report.supplementary.push({test:'Vista móvil 390 px sin desbordamiento de página',status:'APROBADO'});
 await app.close();app=await startApp();
 await page.goto('http://127.0.0.1:8080');await page.waitForFunction(()=>window.__ateneaReady===true);await expect(page.locator('#sealStatus')).toContainText('Sello existente confirmado');await page.locator('#verify').click();await expect(page.locator('#verification')).toContainText('VERDE',{timeout:30000});assert.equal((await readAnchor(app.provider,app.config)).transactionHash,anchor.transactionHash);report.supplementary.push({test:'Reinicio del proceso EVM: mismos contrato, sello, transacción y resultado verificado',status:'APROBADO'});
 // Una evidencia manual solo se acredita para este sello y este CSV exactos.
 try {
  const manual=JSON.parse(await fs.readFile(path.join(ROOT,'evidencias/edicion-manual.json'),'utf8'));
  const manualCSV=await fs.readFile(path.join(ROOT,'evidencias/tickets-edicion-manual.csv'),'utf8');
  const manualResult=await verifyText(manualCSV,evidence,anchor,originals.catalog,originals.report);
  if(manual.humanConfirmed===true&&manual.transactionHash===anchor.transactionHash&&manual.sourceHash===await sha(originals.tickets)&&manual.modifiedHash===await sha(manualCSV)&&manualResult.status==='ROJO'&&manualResult.changes.length===1&&manualResult.changes[0].id==='TK-2026-04201'&&JSON.stringify(manualResult.changes[0].fields)===JSON.stringify(['fecha_resolucion'])){
   const criterion=report.criteria[2];criterion.status='APROBADO';criterion.pending=[];
   criterion.manualEvidence=manual;criterion.evidence.push('evidencias/edicion-manual.json','evidencias/tickets-edicion-manual.csv','evidencias/07-edicion-manual.png');
   criterion.test+=' Además: edición manual confirmada por el usuario, observada en sesión separada y autenticada nuevamente contra el mismo sello.';
  }
 }catch(error){if(error.code!=='ENOENT')throw error;}
 assert.deepEqual(report.browserErrors,[]);report.completed=true;report.instance=INSTANCE;
}catch(error){report.error=error.stack;if(step&&report.criteria[step-1].status!=='APROBADO'){report.criteria[step-1].status='FALLIDO';report.criteria[step-1].pending.push(error.message);}console.error(error);process.exitCode=1;}
finally {
 report.finished=new Date().toISOString();report.level1Complete=report.criteria.every(r=>r.status==='APROBADO');
 await fs.mkdir(EVIDENCE_DIR,{recursive:true});await fs.writeFile(path.join(EVIDENCE_DIR,'aceptacion.json'),JSON.stringify(report,null,2));
 const md=['# Auditoría Nivel 1 — Reto 03','',`Ejecución UTC: ${report.started} → ${report.finished}. Zona de presentación: America/Guayaquil.`,'',`Resultado: **${report.level1Complete?'NIVEL 1 COMPLETO':'NIVEL 1 NO DECLARADO COMPLETO'}**.`,'','Se leyeron ambos PDF entregados y el README del ZIP. Los originales se comparan por SHA-256 con src/source-manifest.json; ejecutar npm run verify:source para repetir el contraste. Se usan los 187 tickets del lote, con advertencia de 185 reportados en julio y 2 en agosto. Se usa estado final del lote, no un corte al 31 de julio.','',...report.criteria.flatMap(r=>[`## ${r.criterion}. ${r.name}`,'',`- Archivos y funciones: ${r.implementation}`,`- Prueba ejecutada: ${r.test}`,`- Resultado real: ${r.result?JSON.stringify(r.result):'No obtenido.'}`,`- Estado: **${r.status}**.${r.automatedStatus?' Prueba automática: '+r.automatedStatus+'.':''}`,`- Evidencia disponible: ${r.evidence.length?r.evidence.join(', '):'Sin evidencia de ejecución.'}`,`- Correcciones o validaciones pendientes: ${r.pending.length?r.pending.join(' '):'Ninguna en esta prueba automatizada; repetir ante el jurado para la demostración en vivo.'}`,'']), '## Pruebas complementarias','',...report.supplementary.map(r=>`- ${r.test}: ${r.status}.`),'','## Límites y pendientes','', report.criteria[2].manualEvidence ? '- Edición manual realizada y confirmada por el usuario; CSV y transacción autenticados nuevamente. Las pruebas automáticas y la edición manual se ejecutaron en sesiones distintas. El guion completo debe ensayarse por el expositor.' : '- La edición manual sigue pendiente; una prueba automática no acredita ese paso.', '- Las pruebas unitarias se ejecutan con npm test; sus resultados se conservan por separado en evidencias/pruebas-unitarias.txt. No se confunden los anclajes de pruebas unitarias con el sello real de aceptación.', '- La EVM local es real, pero no es una testnet pública. Ganache conserva bloques y estado por instancia en .instances/. Es necesario npm start para consultar las evidencias por RPC; el JSON y las capturas por sí solos no reemplazan esa consulta.', '- El motor descuenta feriados configurados. Se usa lista vacía como supuesto explícito porque no se entregó calendario oficial. Ver docs/CALENDARIO.md.', '- Un sello acredita integridad posterior al anclaje, no veracidad ni cumplimiento institucional anterior.', ...(report.error?['', '## Error de ejecución','', '```',report.error,'```']:[])].join('\n');
 await fs.writeFile(path.join(ROOT,'docs/AUDITORIA.md'),md);
 await fs.mkdir(path.join(ROOT,'evidencias'),{recursive:true});
 for(const name of await fs.readdir(EVIDENCE_DIR))await fs.copyFile(path.join(EVIDENCE_DIR,name),path.join(ROOT,'evidencias',name));
 if(browser)await browser.close();if(app)await app.close();
 console.log(JSON.stringify({criteria:report.criteria.map(r=>({criterion:r.criterion,status:r.status,automated:r.automatedStatus})),completed:report.completed,level1Complete:report.level1Complete,error:report.error},null,2));
}
