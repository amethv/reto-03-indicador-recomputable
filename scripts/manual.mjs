import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium,expect} from '@playwright/test';
import {startApp} from './start.mjs';
import {ROOT,STATE_ROOT,EVIDENCE_DIR,INSTANCE} from './runtime.mjs';
import {readAnchor} from '../src/chain.mjs';
import {SOURCES,csv,verifyText,sha} from '../src/core.mjs';
const directory=path.join(STATE_ROOT,'manual');
await fs.mkdir(directory,{recursive:true});
const target=path.join(directory,`tickets-manual-${Date.now()}.csv`);
const original=await fs.readFile(path.join(ROOT,'datos/tickets.csv'),'utf8');
// No sobrescribir una edición manual previa.
try{await fs.writeFile(target,original,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
const app=await startApp();let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:false});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto('http://127.0.0.1:8080');await page.waitForFunction(()=>window.__ateneaReady);
 await page.locator('#verify').click();await expect(page.locator('#verification')).toContainText('VERDE');
 const before=await readAnchor(app.provider,app.config);
 console.log('EDITAR EN UN EDITOR: '+target);
 console.log('Solo TK-2026-04201: fecha_resolucion 2026-08-03T12:03:55-05:00 -> 2026-08-03T12:04:55-05:00. Guardar.');
 const deadline=Date.now()+30*60*1000;let changed;
 while(Date.now()<deadline){changed=await fs.readFile(target,'utf8');if(changed!==original)break;await new Promise(r=>setTimeout(r,1000));}
 if(changed===original)throw new Error('Edición pendiente: no se guardó un cambio durante la sesión.');
 const old=csv(original),now=csv(changed);
 if(now.errors.length||now.rows.length!==187)throw new Error('La copia editada no es un CSV válido de 187 filas');
 const changes=[];
 old.rows.forEach((row,i)=>{for(const key of old.headers)if(row[key]!==now.rows[i][key])changes.push({id:row.ticket_id,field:key,before:row[key],after:now.rows[i][key]});});
 if(changes.length!==1||changes[0].id!=='TK-2026-04201'||changes[0].field!=='fecha_resolucion')throw new Error('Se requiere cambiar solo fecha_resolucion de TK-2026-04201');
 const evidence=JSON.parse(await fs.readFile(path.join(EVIDENCE_DIR,'sello-original.json'),'utf8'));
 const aux=Object.fromEntries(await Promise.all(Object.entries(SOURCES).map(async([k,f])=>[k,await fs.readFile(path.join(ROOT,'datos',f),'utf8')])));
 const result=await verifyText(changed,evidence,before,aux);
 if(result.status!=='ROJO')throw new Error('No se detectó alteración');
 await page.locator('#verifyFile').setInputFiles(target);await page.locator('#verify').click();
 await expect(page.locator('#verification')).toContainText('ROJO');
 await expect(page.locator('#changes')).toContainText('TK-2026-04201');
 await expect(page.locator('#changes')).toContainText('fecha_resolucion');
 const resultName=`edicion-observada-${Date.now()}`;
 await page.screenshot({path:path.join(ROOT,'evidencias',resultName+'.png'),fullPage:true});
 const after=await readAnchor(app.provider,app.config);
 if(before.transactionHash!==after.transactionHash)throw new Error('El sello cambió');
 const report={observedAt:new Date().toISOString(),instance:INSTANCE,humanConfirmed:false,edit:'Archivo externo a este script; solicitar confirmación del usuario de edición manual',upload:'Automática mediante selector del navegador',changes,result:result.status,transactionHash:after.transactionHash,sourceHash:await sha(original),modifiedHash:await sha(changed),sealUnchanged:true};
 await fs.writeFile(path.join(ROOT,'evidencias',resultName+'.json'),JSON.stringify(report,null,2));
 await fs.writeFile(path.join(ROOT,'evidencias',resultName+'.csv'),changed);
 await page.locator('#verifyFile').setInputFiles(path.join(ROOT,'datos/tickets.csv'));await page.locator('#verify').click();await expect(page.locator('#verification')).toContainText('VERDE');
 console.log('EDICION OBSERVADA: ROJO, ticket y campo señalados; sello conservado; original restaurado a VERDE.');
}finally{if(browser)await browser.close();await app.close();}
