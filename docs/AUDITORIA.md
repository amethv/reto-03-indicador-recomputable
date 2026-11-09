# Auditoría Nivel 1 — Reto 03

Ejecución UTC: 2026-11-09T01:56:18.249Z → 2026-11-09T01:56:39.816Z. Zona de presentación: America/Guayaquil.

Resultado: **NIVEL 1 NO DECLARADO COMPLETO**.

Se leyeron ambos PDF entregados (docs/referencia/) y el README de datos/. Los originales se comparan por SHA-256 con src/source-manifest.json; ejecutar npm run verify:source para repetir el contraste. Se usan los 187 tickets del lote, con advertencia de 185 reportados en julio y 2 en agosto. Se usa estado final del lote, no un corte al 31 de julio.

## 1. Sellado de los 187 tickets

- Archivos y funciones: src/core.mjs: buildEvidence, leaf, merkle, evidenceHash; contracts/RegistroIndicador.sol: seal; src/chain.mjs: readAnchor; src/app.mjs: botón seal.
- Prueba ejecutada: Cargar originales, pulsar sellado en navegador si aún no existe; comprobar código, recibo, evento y getSeal mediante JSON-RPC real.
- Resultado real: {"count":187,"root":"0x52834ca5269739f485e7476f03aac3ce4aeeb61e5f29ea51115e2a01c1d166ad","transaction":"0xd968766605ff8373f0e77db79e44c47837e66b9672d3c2ba767e7fa52b5d5eb1","block":2,"address":"0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab","chainId":31337}
- Estado: **APROBADO**.
- Evidencia disponible: evidencias/red-local.json, evidencias/sello-original.json, evidencias/01-sellado.png
- Correcciones o validaciones pendientes: Ninguna en esta prueba automatizada; repetir ante el jurado para la demostración en vivo.

## 2. Recálculo independiente

- Archivos y funciones: src/core.mjs: verifyText, calculate, businessHours; src/findings.mjs: denominatorBreakdown, resolutionEdits, misnumberedReopenings, slaIndicator; src/app.mjs: renderFindings, renderTable.
- Prueba ejecutada: Verificar original en interfaz contra cadena real; comprobar titular 98,25 % contra 55,61 %, cascada 187 → 171, TK-2026-04228 vía bitácora, 5 reaperturas y filtro de discrepancias SLA.
- Resultado real: {"headline":"Publicado 98,25 % · Solo confirmados por el usuario 55,61 %","cascade":{"total":187,"reopened":7,"level3":9,"published":171,"managedPublished":168,"managedUnexplained":3},"editedAfterResolution":[{"ticket":"TK-2026-04228","event":"EV-00001","hours":"5.8 -> 3.8","realWithin":false}],"misnumberedReopenings":["RA-001: TK-2026-04335 -> TK-2026-04381","RA-002: TK-2026-04304 -> TK-2026-04382","RA-003: TK-2026-04356 -> TK-2026-04383","RA-004: TK-2026-04221 -> TK-2026-04384","RA-005: TK-2026-04261 -> TK-2026-04385"],"sla":{"declared":"121/187","corrected":"120/187"},"calendarJuly":185,"calendarAugust":2,"scope":"lote entregado y estado final; no corte calendario estricto","slaDiscrepancies":["TK-2026-04228"],"outsideSLA":66}
- Estado: **APROBADO**.
- Evidencia disponible: evidencias/02-recalculo.png
- Correcciones o validaciones pendientes: Ninguna en esta prueba automatizada; repetir ante el jurado para la demostración en vivo.

## 3. Detección de alteraciones

- Archivos y funciones: src/core.mjs: authenticateEvidence, proofValid, verifyText, sealedValues; src/app.mjs: doVerify, renderChanges; contracts/RegistroIndicador.sol: sello inmutable.
- Prueba ejecutada: Guardar una copia del CSV con fecha_resolucion alterada de un solo ticket; subir mediante selector de archivo real y verificar en navegador; comprobar ROJO, ID exacto, campo y ausencia de indicadores acreditados.
- Resultado real: {"color":"ROJO","ticket":"TK-2026-04201","fields":["fecha_resolucion"],"sealedVsEdited":true,"originalSealUnchanged":true,"automatedBrowserUpload":true}
- Estado: **NO VERIFICADO**. Prueba automática: APROBADO.
- Evidencia disponible: evidencias/03-alteracion.png, evidencias/tickets-modificado.csv
- Correcciones o validaciones pendientes: La edición y carga fueron automatizadas sobre un archivo real. Falta ejecutar y observar la edición manual en un editor y la carga por una persona, exigida literalmente en la demostración.

## 4. Comparación de indicadores

- Archivos y funciones: src/core.mjs: calculate; src/app.mjs: doVerify, renderTable; src/index.html: dos tarjetas principales.
- Prueba ejecutada: Restaurar entrada al original y verificar; comprobar dos tarjetas, mismo denominador, porcentajes calculados y filtro de los 83 excluidos de B.
- Resultado real: {"A":{"numerator":187,"denominator":187,"percentage":100},"B":{"numerator":104,"denominator":187,"percentage":55.61497326203209},"gapPP":44.38502673796791,"automatic":83}
- Estado: **APROBADO**.
- Evidencia disponible: evidencias/04-comparacion.png
- Correcciones o validaciones pendientes: Ninguna en esta prueba automatizada; repetir ante el jurado para la demostración en vivo.

## 5. Privacidad en blockchain

- Archivos y funciones: contracts/RegistroIndicador.sol; src/chain.mjs: readAnchor; src/privacy.mjs: collectChainData, searchPersonalData; src/app.mjs: botón searchPersonal.
- Prueba ejecutada: Consultar contrato, recibo, calldata, evento y almacenamiento reales; pulsar «Buscar datos personales en la cadena» y comprobar 0 coincidencias de todos los usuarios, técnicos, unidades y actores de la bitácora.
- Resultado real: {"stored":["period","root","evidenceHash","count","timestamp","owner","rulesHash"],"sealCalldataBytes":132,"transaction":"0xd968766605ff8373f0e77db79e44c47837e66b9672d3c2ba767e7fa52b5d5eb1","contract":"0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab","network":"EVM local Ganache (red de desarrollo real)","personalDataSearch":{"values":174,"patterns":1530,"bytes":3328,"matches":0,"sources":["calldata de la transacción de sellado","calldata del despliegue (bytecode + hash de reglas)","bytecode desplegado","evento 1: temas y datos","almacenamiento del sello (3 ranuras)"]}}
- Estado: **APROBADO**.
- Evidencia disponible: evidencias/blockchain.json, evidencias/contrato.json, evidencias/05-privacidad.png
- Correcciones o validaciones pendientes: Ninguna en esta prueba automatizada; repetir ante el jurado para la demostración en vivo.

## Pruebas complementarias

- Navegación: 7 rutas con una sola vista visible, aria-current, atrás y adelante, estado de sello y verificación conservado entre vistas, guion con 5 pasos cumplidos: APROBADO.
- Segundo sellado rechazado por EVM: APROBADO.
- Simulación de feriado 2026-07-24: 4 tickets cambian de estado, sin tocar el sello: APROBADO.
- Sepolia sin desplegar: la interfaz lo indica y no inventa un ancla: APROBADO (despliegue pendiente).
- RPC bloqueado: sin verde ni indicadores acreditados: APROBADO.
- Recarga: se conserva la vista de la ruta (#/comparar): APROBADO.
- Recarga: manifiesto persistido y sello original conservado: APROBADO.
- Vista móvil 390 px: menú en panel lateral y las 7 vistas sin desbordamiento de página: APROBADO.
- Reinicio del proceso EVM: mismos contrato, sello, transacción y resultado verificado: APROBADO.

## Límites y pendientes

- La edición manual sigue pendiente; una prueba automática no acredita ese paso.
- Las pruebas unitarias se ejecutan con npm test; sus resultados se conservan por separado en evidencias/pruebas-unitarias.txt. No se confunden los anclajes de pruebas unitarias con el sello real de aceptación.
- La EVM local (Ganache) es el respaldo sin internet; no es una red pública. Ganache conserva bloques y estado por instancia en .instances/. Es necesario npm start para consultar las evidencias por RPC; el JSON y las capturas por sí solos no reemplazan esa consulta.
- El motor descuenta feriados configurados. Se usa lista vacía como supuesto explícito porque no se entregó calendario oficial. Ver docs/CALENDARIO.md. El panel «Simular feriado» muestra el efecto sin sellar.
- El ancla pública en Sepolia se despliega con npm run deploy:sepolia y npm run seal:sepolia; sin evidencias/red-sepolia.json la auditoría solo comprueba que la interfaz lo declara pendiente.
- Un sello acredita integridad posterior al anclaje, no veracidad ni cumplimiento institucional anterior.