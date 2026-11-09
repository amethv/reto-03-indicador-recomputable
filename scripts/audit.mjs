import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {Contract,toUtf8Bytes,hexlify} from 'ethers';
import Papa from 'papaparse';
import {startApp} from './start.mjs';
import {ROOT,STATE_ROOT,EVIDENCE_DIR,INSTANCE,SALT_FILES,readSalt} from './runtime.mjs';
import {readAnchor,ABI} from '../src/chain.mjs';
import {PERIOD,SOURCES,csv,verifyText,authenticateEvidence,sha} from '../src/core.mjs';
import {verifySource} from './verify-source.mjs';
import {personalValues,searchPersonalData,collectChainData} from '../src/privacy.mjs';
import {BITACORA_HEADERS} from '../src/core.mjs';
const names=['Sellado de los 187 tickets','Recálculo independiente','Detección de alteraciones','Comparación de indicadores','Privacidad en blockchain'];
const implementation=[
 'src/core.mjs: buildEvidence, leaf, merkle, evidenceHash; contracts/RegistroIndicador.sol: seal; src/chain.mjs: readAnchor; src/app.mjs: botón seal.',
 'src/core.mjs: verifyText, calculate, businessHours; src/findings.mjs: denominatorBreakdown, resolutionEdits, misnumberedReopenings, slaIndicator; src/app.mjs: renderFindings, renderTable.',
 'src/core.mjs: authenticateEvidence, proofValid, verifyText, sealedValues; src/app.mjs: doVerify, renderChanges; contracts/RegistroIndicador.sol: sello inmutable.',
 'src/core.mjs: calculate; src/app.mjs: doVerify, renderTable; src/index.html: dos tarjetas principales.',
 'contracts/RegistroIndicador.sol; src/chain.mjs: readAnchor; src/privacy.mjs: collectChainData, searchPersonalData; src/app.mjs: botón searchPersonal.'
];
const report={started:new Date().toISOString(),timezone:'America/Guayaquil',criteria:names.map((name,i)=>({criterion:i+1,name,implementation:implementation[i],status:'NO VERIFICADO',test:'No ejecutada',result:null,evidence:[],pending:[]})),supplementary:[],browserErrors:[]};
let app,browser,step=0,anchor,evidence,originals,salt;
try {
 report.sourceFiles=(await verifySource()).map(({file,actual})=>({file,sha256:actual}));
 app=await startApp();browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage();
 page.on('pageerror',e=>report.browserErrors.push(e.message));
 // Cada paso entra a su vista desde el menú lateral, como en la demo.
 const VIEWS=['panel','sellar','recalcular','verificar','comparar','privacidad','feriado'];
 const go=async name=>{await page.locator(`nav a[data-route="${name}"]`).click();await expect(page.locator(`section.view[data-route="${name}"]`)).toBeVisible();await expect(page.locator('section.view:visible')).toHaveCount(1);};
 const shot=name=>page.screenshot({path:path.join(EVIDENCE_DIR,name),fullPage:true});
 await page.goto('http://127.0.0.1:8080');await page.waitForFunction(()=>window.__ateneaReady===true);
 originals=Object.fromEntries(await Promise.all(Object.entries(SOURCES).map(async([k,f])=>[k,await fs.readFile(path.join(ROOT,'datos',f),'utf8')])));
 // Se ejecutan las cinco demostraciones en el orden del jurado.
 step=1;let item=report.criteria[0];item.test='Cargar originales, pulsar sellado en navegador si aún no existe; comprobar código, recibo, evento y getSeal mediante JSON-RPC real.';
 await expect(page.locator('section#panel')).toBeVisible();await go('sellar');await page.locator('#load').click();await expect(page.locator('#sealStatus')).toContainText('187/187');
 if(await page.locator('#seal').isEnabled()){await page.locator('#seal').click();await expect(page.locator('#sealStatus')).toContainText('SELLADO CONFIRMADO',{timeout:60000});item.newTransaction=true;}else{item.newTransaction=false;}
 anchor=await readAnchor(app.provider,app.config);evidence=JSON.parse(await fs.readFile(path.join(EVIDENCE_DIR,'sello-original.json'),'utf8'));salt=await readSalt(SALT_FILES.local);assert.ok(salt,'Falta la sal del sello local');
 assert.equal((await authenticateEvidence(evidence,anchor)).ok,true);assert.equal(anchor.count,187);assert.equal(evidence.tickets.length,187);
 const baseline=JSON.parse(await fs.readFile(path.join(ROOT,'src/originals.json'),'utf8'));assert.equal(await sha(originals.tickets),baseline.files.tickets);
 item.status='APROBADO';item.result={count:187,root:anchor.root,transaction:anchor.transactionHash,block:anchor.blockNumber,address:anchor.address,chainId:anchor.chainId};item.evidence=['evidencias/red-local.json','evidencias/sello-original.json','evidencias/01-sellado.png'];await expect(page.locator('[data-dot="sellar"]')).toHaveClass(/green/);await expect(page.locator('a.next[data-next="sellar"]')).toBeVisible();await page.screenshot({path:path.join(STATE_ROOT,item.evidence[2]),fullPage:true});
 step=2;item=report.criteria[1];item.test='Verificar original en interfaz contra cadena real; comprobar titular 98,25 % contra 55,61 %, cascada 187 → 171, TK-2026-04228 vía bitácora, 5 reaperturas y filtro de discrepancias SLA.';
 await go('recalcular');await page.locator('#recalc').click();await expect(page.locator('#verification')).toContainText('VERDE',{timeout:30000});await expect(page.locator('#s2 #verification')).toBeVisible();
 const originalResult=await verifyText(originals.tickets,evidence,anchor,originals,salt);assert.equal(originalResult.status,'VERDE');
 assert.equal(originalResult.result.numeratorA,187);assert.equal(originalResult.result.denominator,187);assert.equal(originalResult.result.percentA,100);assert.equal(originalResult.published,98.25);
 const f=originalResult.findings;assert.equal(f.denominator.derived,171);assert.equal(f.denominator.reopened.length,7);assert.equal(f.denominator.level3.length,9);assert.deepEqual(f.edits.map(e=>e.ticket),['TK-2026-04228']);assert.equal(f.reopenings.length,5);assert.equal(f.sla.corrected.numerator,120);
 await expect(page.locator('#headline')).toHaveText('Publicado 98,25 % · Solo confirmados por el usuario 55,61 %');
 await expect(page.locator('#cascade')).toContainText('187');await expect(page.locator('#cascade')).toContainText('− 7');await expect(page.locator('#cascade')).toContainText('− 9');await expect(page.locator('#cascade')).toContainText('= 171');
 await expect(page.locator('#editCard')).toContainText('TK-2026-04228');await expect(page.locator('#editCard')).toContainText('5,80 h → 3,80 h');await expect(page.locator('#reopenCard tbody tr')).toHaveCount(5);
 await expect(page.locator('#summary')).toContainText('120/187');await expect(page.locator('#tickets tr')).toHaveCount(187);
 await expect(page.locator('[data-dot="recalcular"]')).toHaveClass(/green/);await page.screenshot({path:path.join(STATE_ROOT,'evidencias/02-recalculo.png'),fullPage:true});
 await go('comparar');await page.locator('#filter').selectOption('sla');await expect(page.locator('#tickets tr')).toHaveCount(1);await expect(page.locator('#tickets')).toContainText('TK-2026-04228');await page.locator('#filter').selectOption('all');
 item.status='APROBADO';item.result={headline:'Publicado 98,25 % · Solo confirmados por el usuario 55,61 %',cascade:{total:187,reopened:7,level3:9,published:171,managedPublished:168,managedUnexplained:3},editedAfterResolution:f.edits.map(e=>({ticket:e.ticket,event:e.event,hours:`${e.hoursBefore} -> ${e.hoursAfter}`,realWithin:e.realWithin})),misnumberedReopenings:f.reopenings.map(r=>`${r.id}: ${r.original} -> ${r.generated}`),sla:{declared:'121/187',corrected:'120/187'},calendarJuly:185,calendarAugust:2,scope:'lote entregado y estado final; no corte calendario estricto',slaDiscrepancies:originalResult.result.details.filter(r=>r.discrepancies.length).map(r=>r.id),outsideSLA:originalResult.result.details.filter(r=>r.within===false).length};item.evidence=['evidencias/02-recalculo.png'];
 step=3;item=report.criteria[2];item.test='Guardar una copia del CSV con fecha_resolucion alterada de un solo ticket; subir mediante selector de archivo real y verificar en navegador; comprobar ROJO, ID exacto, campo y ausencia de indicadores acreditados.';
 const rows=csv(originals.tickets).rows,id=rows[0].ticket_id;
 rows[0].fecha_resolucion=new Date(Date.parse(rows[0].fecha_resolucion)+60000-5*3600000).toISOString().slice(0,19)+'-05:00';
 const modified=Papa.unparse(rows,{columns:evidence.headers,newline:'\n'}),copy=path.join(EVIDENCE_DIR,'tickets-modificado.csv');await fs.writeFile(copy,modified);
 await go('verificar');await page.locator('#verifyFile').setInputFiles(copy);await expect(page.locator('#percentA')).toHaveText('—');await page.locator('#verify').click();await expect(page.locator('#verification')).toContainText('ROJO',{timeout:30000});
 await expect(page.locator('#changes')).toContainText(id);await expect(page.locator('#changes')).toContainText('fecha_resolucion');await expect(page.locator('#changes > div > ul > li')).toHaveCount(1);await expect(page.locator('#changes')).toContainText('sellado');await expect(page.locator('#changes')).toContainText('El sello no cambió');await expect(page.locator('#percentB')).toHaveText('—');await expect(page.locator('#s3 #verification')).toBeVisible();await expect(page.locator('[data-dot="verificar"]')).toHaveClass(/red/);await expect(page.locator('[data-dot="recalcular"]')).toHaveClass(/red/);
 const modifiedResult=await verifyText(modified,evidence,anchor,originals,salt);assert.equal(modifiedResult.status,'ROJO');assert.deepEqual(modifiedResult.changes.map(r=>r.id),[id]);assert.equal(modifiedResult.result,undefined);
 assert.equal((await readAnchor(app.provider,app.config)).transactionHash,anchor.transactionHash);assert.deepEqual(JSON.parse(await fs.readFile(path.join(EVIDENCE_DIR,'sello-original.json'),'utf8')),evidence);
 item.status='NO VERIFICADO';item.automatedStatus='APROBADO';item.result={color:'ROJO',ticket:id,fields:modifiedResult.changes[0].fields,sealedVsEdited:true,originalSealUnchanged:true,automatedBrowserUpload:true};item.evidence=['evidencias/03-alteracion.png','evidencias/tickets-modificado.csv'];item.pending=['La edición y carga fueron automatizadas sobre un archivo real. Falta ejecutar y observar la edición manual en un editor y la carga por una persona, exigida literalmente en la demostración.'];await page.screenshot({path:path.join(STATE_ROOT,item.evidence[0]),fullPage:true});
 step=4;item=report.criteria[3];item.test='Restaurar entrada al original y verificar; comprobar dos tarjetas, mismo denominador, porcentajes calculados y filtro de los 83 excluidos de B.';
 await page.locator('#verifyFile').setInputFiles(path.join(ROOT,'datos/tickets.csv'));await page.locator('#verify').click();await expect(page.locator('#verification')).toContainText('VERDE',{timeout:30000});
 await go('comparar');await expect(page.locator('.indicators article')).toHaveCount(2);await expect(page.locator('#percentA')).toHaveText('100,00 %');await expect(page.locator('#percentB')).toHaveText('55,61 %');await expect(page.locator('#gap')).toContainText('44,39');await expect(page.locator('#fractionA')).toContainText('/ 187');await expect(page.locator('#fractionB')).toContainText('/ 187');
 await page.locator('#filter').selectOption('notB');await expect(page.locator('#tickets tr')).toHaveCount(83);await page.locator('#filter').selectOption('notA');await expect(page.locator('#tickets tr')).toHaveCount(0);await page.locator('#filter').selectOption('all');
 item.status='APROBADO';item.result={A:{numerator:187,denominator:187,percentage:100},B:{numerator:104,denominator:187,percentage:originalResult.result.percentB},gapPP:originalResult.result.gap,automatic:83};item.evidence=['evidencias/04-comparacion.png'];await expect(page.locator('[data-dot="comparar"]')).toHaveClass(/green/);await page.screenshot({path:path.join(STATE_ROOT,item.evidence[0]),fullPage:true});
 step=5;item=report.criteria[4];item.test='Consultar contrato, recibo, calldata, evento y almacenamiento reales; pulsar «Buscar datos personales en la cadena» y comprobar 0 coincidencias de todos los usuarios, técnicos, unidades y actores de la bitácora.';
 await go('privacidad');await page.locator('#inspect').click();await expect(page.locator('#onchain')).toContainText(anchor.transactionHash);
 // La interfaz muestra el ancla como fichas; cada fila guarda su valor exacto en data-value.
 const observed=await page.locator('#onchain [data-key]').evaluateAll(rows=>{const o={};for(const r of rows){const path=r.dataset.key.split('.');let t=o;for(const k of path.slice(0,-1))t=t[k]??={};t[path.at(-1)]=JSON.parse(r.dataset.value);}return o;});assert.deepEqual(observed,anchor);await expect(page.locator('#onchain')).toContainText('Evento Sealed');
 const contract=new Contract(app.config.address,ABI,app.provider),tx=await app.provider.getTransaction(anchor.transactionHash),decoded=contract.interface.parseTransaction({data:tx.data});assert.equal(decoded.name,'seal');assert.equal(decoded.args.length,4);assert.equal(tx.data.length,266);
 const artifact=JSON.parse(await fs.readFile(path.join(EVIDENCE_DIR,'contrato.json'),'utf8')),deployment=await app.provider.getTransaction(app.config.deploymentTransaction);
 assert.equal(deployment.data,artifact.bytecode+app.config.rulesHash.slice(2));
 const values=personalValues(csv(originals.tickets).rows,csv(originals.bitacora,BITACORA_HEADERS).rows);
 const search=await searchPersonalData((await collectChainData(app.provider,app.config,anchor)).blobs,values);assert.deepEqual(search.matches,[]);
 await page.locator('#searchPersonal').click();await expect(page.locator('#personal')).toContainText(`0 coincidencias de ${values.length} valores buscados`,{timeout:30000});
 assert.deepEqual(artifact.abi.filter(x=>x.type==='function').map(x=>x.name).sort(),['getSeal','owner','rulesHash','seal']);
 await fs.writeFile(path.join(EVIDENCE_DIR,'blockchain.json'),JSON.stringify({...anchor,deploymentTransaction:app.config.deploymentTransaction,deploymentBlock:app.config.deploymentBlock,abi:artifact.abi,compiler:artifact.compiler},null,2));
 item.status='APROBADO';item.result={stored:['period','root','evidenceHash','count','timestamp','owner','rulesHash'],sealCalldataBytes:132,transaction:anchor.transactionHash,contract:anchor.address,network:app.config.network,personalDataSearch:{values:search.searched,patterns:search.patterns,bytes:search.bytes,matches:0,sources:search.sources}};item.evidence=['evidencias/blockchain.json','evidencias/contrato.json','evidencias/05-privacidad.png'];await expect(page.locator('[data-dot="privacidad"]')).toHaveClass(/green/);await page.screenshot({path:path.join(STATE_ROOT,item.evidence[2]),fullPage:true});
 // Navegación: siete rutas, una sola vista visible, estado conservado al cambiar de vista, atrás y adelante.
 for(const name of VIEWS){
  await go(name);await expect(page).toHaveURL(new RegExp(`#/${name}$`));await expect(page.locator(`nav a[data-route="${name}"]`)).toHaveAttribute('aria-current','page');
  await expect(page.locator('nav a[aria-current="page"]')).toHaveCount(1);
  await expect(page.locator('#verification')).toContainText('VERDE');await expect(page.locator('#percentB')).toHaveText('55,61 %');
  await expect(page.locator('[data-dot="sellar"]')).toHaveClass(/green/);await expect(page.locator('[data-dot="privacidad"]')).toHaveClass(/green/);
  await shot(`vista-${name}-escritorio.png`);
 }
 await page.goBack();await expect(page.locator('section.view[data-route="privacidad"]')).toBeVisible();await page.goForward();await expect(page.locator('section.view[data-route="feriado"]')).toBeVisible();
 await go('panel');await expect(page.locator('#demoScript li.done')).toHaveCount(5);await expect(page.locator('#sumVerify')).toHaveText('VERDE');await expect(page.locator('#sumCount')).toHaveText('187');await expect(page.locator('#sumGap')).toContainText('44,39');
 await expect(page.locator('#rpcDot')).toHaveClass(/green/);await expect(page.locator('#netContract')).toHaveText(`${app.config.address.slice(0,6)}…${app.config.address.slice(-4)}`);
 report.supplementary.push({test:'Navegación: 7 rutas con una sola vista visible, aria-current, atrás y adelante, estado de sello y verificación conservado entre vistas, guion con 5 pasos cumplidos',status:'APROBADO'});
 // Pruebas complementarias posteriores a los cinco criterios.
 await assert.rejects(new Contract(app.config.address,ABI,await app.provider.getSigner(0)).seal(PERIOD,anchor.root,anchor.evidenceHash,187));report.supplementary.push({test:'Segundo sellado rechazado por EVM',status:'APROBADO'});
 await go('feriado');await page.locator('#simulate').click();await expect(page.locator('#holidayResult')).toContainText('SIMULACIÓN NO SELLADA');await expect(page.locator('#holidayResult')).toContainText('124/187');report.supplementary.push({test:'Simulación de feriado 2026-07-24: 4 tickets cambian de estado, sin tocar el sello',status:'APROBADO'});
 await page.locator('#network').selectOption('sepolia');
 try{await fs.access(path.join(ROOT,'evidencias/red-sepolia.json'));await expect(page.locator('#sealStatus')).toContainText('Sello existente confirmado',{timeout:60000});report.supplementary.push({test:'Sepolia: sello leído en solo lectura por RPC público',status:'APROBADO'});}
 catch(e){if(e.code!=='ENOENT')throw e;await expect(page.locator('#verification')).toContainText('Sepolia pendiente');report.supplementary.push({test:'Sepolia sin desplegar: la interfaz lo indica y no inventa un ancla',status:'APROBADO (despliegue pendiente)'});}
 await page.locator('#network').selectOption('local');await expect(page.locator('#sealStatus')).toContainText('Sello existente confirmado',{timeout:30000});
 await go('verificar');await context.route('http://127.0.0.1:8545/**',route=>route.abort());await page.locator('#verify').click();await expect(page.locator('#verification')).toContainText('ERROR DE CONEXIÓN',{timeout:30000});await expect(page.locator('#percentA')).toHaveText('—');await expect(page.locator('#verification')).not.toHaveClass(/green/);report.supplementary.push({test:'RPC bloqueado: sin verde ni indicadores acreditados',status:'APROBADO'});await context.unroute('http://127.0.0.1:8545/**');
 await go('comparar');await page.reload();await page.waitForFunction(()=>window.__ateneaReady===true);await expect(page.locator('section.view[data-route="comparar"]')).toBeVisible();await expect(page.locator('section.view:visible')).toHaveCount(1);await expect(page.locator('nav a[data-route="comparar"]')).toHaveAttribute('aria-current','page');report.supplementary.push({test:'Recarga: se conserva la vista de la ruta (#/comparar)',status:'APROBADO'});
 await expect(page.locator('#sealStatus')).toContainText('Sello existente confirmado');await expect(page.locator('#seal')).toBeDisabled();await go('verificar');await page.locator('#verify').click();await expect(page.locator('#verification')).toContainText('VERDE',{timeout:30000});report.supplementary.push({test:'Recarga: manifiesto persistido y sello original conservado',status:'APROBADO'});
 await page.setViewportSize({width:390,height:844});await expect(page.locator('#menuToggle')).toBeVisible();await expect(page.locator('#sidebar')).toBeHidden();
 for(const name of VIEWS){
  await page.locator('#menuToggle').click();await expect(page.locator('#sidebar')).toBeVisible();await expect(page.locator('#menuToggle')).toHaveAttribute('aria-expanded','true');
  await page.locator(`nav a[data-route="${name}"]`).click();await expect(page.locator('#sidebar')).toBeHidden();await expect(page.locator(`section.view[data-route="${name}"]`)).toBeVisible();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`desbordamiento horizontal en ${name}`);
  await shot(`vista-${name}-movil.png`);if(name==='panel')await shot('06-movil.png');
 }
 report.supplementary.push({test:'Vista móvil 390 px: menú en panel lateral y las 7 vistas sin desbordamiento de página',status:'APROBADO'});
 await app.close();app=await startApp();
 await page.goto('http://127.0.0.1:8080/#/verificar');await page.waitForFunction(()=>window.__ateneaReady===true);await expect(page.locator('section.view[data-route="verificar"]')).toBeVisible();await expect(page.locator('#sealStatus')).toContainText('Sello existente confirmado');await page.locator('#verify').click();await expect(page.locator('#verification')).toContainText('VERDE',{timeout:30000});assert.equal((await readAnchor(app.provider,app.config)).transactionHash,anchor.transactionHash);report.supplementary.push({test:'Reinicio del proceso EVM: mismos contrato, sello, transacción y resultado verificado',status:'APROBADO'});
 // Una evidencia manual solo se acredita para este sello y este CSV exactos.
 try {
  const manual=JSON.parse(await fs.readFile(path.join(ROOT,'evidencias/edicion-manual.json'),'utf8'));
  const manualCSV=await fs.readFile(path.join(ROOT,'evidencias/tickets-edicion-manual.csv'),'utf8');
  const manualResult=await verifyText(manualCSV,evidence,anchor,originals,salt);
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
 const md=['# Auditoría Nivel 1 — Reto 03','',`Ejecución UTC: ${report.started} → ${report.finished}. Zona de presentación: America/Guayaquil.`,'',`Resultado: **${report.level1Complete?'NIVEL 1 COMPLETO':'NIVEL 1 NO DECLARADO COMPLETO'}**.`,'','Se leyeron ambos PDF entregados (docs/referencia/) y el README de datos/. Los originales se comparan por SHA-256 con src/source-manifest.json; ejecutar npm run verify:source para repetir el contraste. Se usan los 187 tickets del lote, con advertencia de 185 reportados en julio y 2 en agosto. Se usa estado final del lote, no un corte al 31 de julio.','',...report.criteria.flatMap(r=>[`## ${r.criterion}. ${r.name}`,'',`- Archivos y funciones: ${r.implementation}`,`- Prueba ejecutada: ${r.test}`,`- Resultado real: ${r.result?JSON.stringify(r.result):'No obtenido.'}`,`- Estado: **${r.status}**.${r.automatedStatus?' Prueba automática: '+r.automatedStatus+'.':''}`,`- Evidencia disponible: ${r.evidence.length?r.evidence.join(', '):'Sin evidencia de ejecución.'}`,`- Correcciones o validaciones pendientes: ${r.pending.length?r.pending.join(' '):'Ninguna en esta prueba automatizada; repetir ante el jurado para la demostración en vivo.'}`,'']), '## Pruebas complementarias','',...report.supplementary.map(r=>`- ${r.test}: ${r.status}.`),'','## Límites y pendientes','', report.criteria[2].manualEvidence ? '- Edición manual realizada y confirmada por el usuario; CSV y transacción autenticados nuevamente. Las pruebas automáticas y la edición manual se ejecutaron en sesiones distintas. El guion completo debe ensayarse por el expositor.' : '- La edición manual sigue pendiente; una prueba automática no acredita ese paso.', '- Las pruebas unitarias se ejecutan con npm test; sus resultados se conservan por separado en evidencias/pruebas-unitarias.txt. No se confunden los anclajes de pruebas unitarias con el sello real de aceptación.', '- La EVM local (Ganache) es el respaldo sin internet; no es una red pública. Ganache conserva bloques y estado por instancia en .instances/. Es necesario npm start para consultar las evidencias por RPC; el JSON y las capturas por sí solos no reemplazan esa consulta.', '- El motor descuenta feriados configurados. Se usa lista vacía como supuesto explícito porque no se entregó calendario oficial. Ver docs/CALENDARIO.md. El panel «Simular feriado» muestra el efecto sin sellar.', '- El ancla pública en Sepolia se despliega con npm run deploy:sepolia y npm run seal:sepolia; sin evidencias/red-sepolia.json la auditoría solo comprueba que la interfaz lo declara pendiente.', '- Un sello acredita integridad posterior al anclaje, no veracidad ni cumplimiento institucional anterior.', ...(report.error?['', '## Error de ejecución','', '```',report.error,'```']:[])].join('\n');
 await fs.writeFile(path.join(ROOT,'docs/AUDITORIA.md'),md);
 await fs.mkdir(path.join(ROOT,'evidencias'),{recursive:true});
 for(const name of await fs.readdir(EVIDENCE_DIR))await fs.copyFile(path.join(EVIDENCE_DIR,name),path.join(ROOT,'evidencias',name));
 if(browser)await browser.close();if(app)await app.close();
 console.log(JSON.stringify({criteria:report.criteria.map(r=>({criterion:r.criterion,status:r.status,automated:r.automatedStatus})),completed:report.completed,level1Complete:report.level1Complete,error:report.error},null,2));
}
