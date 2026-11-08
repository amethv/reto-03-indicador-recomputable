# Auditoría Nivel 1 — Reto 03

Ejecución UTC: 2026-11-08T02:20:15.579Z → 2026-11-08T02:20:26.665Z. Zona de presentación: America/Guayaquil.

Resultado: **NIVEL 1 COMPLETO**.

Se leyeron ambos PDF entregados y el README del ZIP. Los originales se comparan por SHA-256 con src/source-manifest.json; ejecutar npm run verify:source para repetir el contraste. Se usan los 187 tickets del lote, con advertencia de 185 reportados en julio y 2 en agosto. Se usa estado final del lote, no un corte al 31 de julio.

## 1. Sellado de los 187 tickets

- Archivos y funciones: src/core.mjs: buildEvidence, leaf, merkle, evidenceHash; contracts/RegistroJulio.sol: seal; src/chain.mjs: readAnchor; src/app.mjs: botón seal.
- Prueba ejecutada: Cargar originales, pulsar sellado en navegador si aún no existe; comprobar código, recibo, evento y getSeal mediante JSON-RPC real.
- Resultado real: {"count":187,"root":"0xf58ac18028cdd1c9c4ec8afc7b85a3cf0ab065143b49cefef0956378a3ccdf34","transaction":"0x675e9204ae089d28a885911071a2455b0e5870d4b4ae221cb0ce8a085bb5aee8","block":2,"address":"0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab","chainId":31337}
- Estado: **APROBADO**.
- Evidencia disponible: evidencias/red-local.json, evidencias/sello-original.json, evidencias/01-sellado.png
- Correcciones o validaciones pendientes: Ninguna en esta prueba automatizada; repetir ante el jurado para la demostración en vivo.

## 2. Recálculo independiente

- Archivos y funciones: src/core.mjs: verifyText, calculate, businessHours; src/app.mjs: doVerify, renderTable.
- Prueba ejecutada: Verificar original en interfaz contra cadena real; contrastar resultados con recálculo desde registros, sin usar porcentaje publicado como resultado.
- Resultado real: {"numerator":187,"denominator":187,"recomputed":100,"published":98.25,"differencePP":1.75,"calendarJuly":185,"calendarAugust":2,"scope":"lote entregado y estado final; no corte calendario estricto","slaDiscrepancies":["TK-2026-04385","TK-2026-04386"],"outsideSLA":66}
- Estado: **APROBADO**.
- Evidencia disponible: evidencias/02-recalculo.png
- Correcciones o validaciones pendientes: Ninguna en esta prueba automatizada; repetir ante el jurado para la demostración en vivo.

## 3. Detección de alteraciones

- Archivos y funciones: src/core.mjs: authenticateEvidence, proofValid, verifyText; src/app.mjs: doVerify; contracts/RegistroJulio.sol: sello inmutable.
- Prueba ejecutada: Guardar una copia del CSV con fecha_resolucion alterada de un solo ticket; subir mediante selector de archivo real y verificar en navegador; comprobar ROJO, ID exacto, campo y ausencia de indicadores acreditados. Además: edición manual confirmada por el usuario, observada en sesión separada y autenticada nuevamente contra el mismo sello.
- Resultado real: {"color":"ROJO","ticket":"TK-2026-04201","fields":["fecha_resolucion"],"originalSealUnchanged":true,"automatedBrowserUpload":true}
- Estado: **APROBADO**. Prueba automática: APROBADO.
- Evidencia disponible: evidencias/03-alteracion.png, evidencias/tickets-modificado.csv, evidencias/edicion-manual.json, evidencias/tickets-edicion-manual.csv, evidencias/07-edicion-manual.png
- Correcciones o validaciones pendientes: Ninguna en esta prueba automatizada; repetir ante el jurado para la demostración en vivo.

## 4. Comparación de indicadores

- Archivos y funciones: src/core.mjs: calculate; src/app.mjs: doVerify, renderTable; index.html: dos tarjetas principales.
- Prueba ejecutada: Restaurar entrada al original y verificar; comprobar dos tarjetas, mismo denominador, porcentajes calculados y filtro de los 83 excluidos de B.
- Resultado real: {"A":{"numerator":187,"denominator":187,"percentage":100},"B":{"numerator":104,"denominator":187,"percentage":55.61497326203209},"gapPP":44.38502673796791,"automatic":83}
- Estado: **APROBADO**.
- Evidencia disponible: evidencias/04-comparacion.png
- Correcciones o validaciones pendientes: Ninguna en esta prueba automatizada; repetir ante el jurado para la demostración en vivo.

## 5. Privacidad en blockchain

- Archivos y funciones: contracts/RegistroJulio.sol; src/chain.mjs: readAnchor; src/app.mjs: showAnchor; index.html: Privacidad en blockchain.
- Prueba ejecutada: Consultar contrato, recibo, calldata, evento y almacenamiento reales; comprobar ABI, creación y argumentos enviados, sin nombres ni contenido de tickets.
- Resultado real: {"stored":["period","root","evidenceHash","count","timestamp","owner","rulesHash"],"sealCalldataBytes":132,"transaction":"0x675e9204ae089d28a885911071a2455b0e5870d4b4ae221cb0ce8a085bb5aee8","contract":"0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab","network":"EVM local Ganache (red de desarrollo real)","noTicketNamesInTransaction":true}
- Estado: **APROBADO**.
- Evidencia disponible: evidencias/blockchain.json, evidencias/contrato.json, evidencias/05-privacidad.png
- Correcciones o validaciones pendientes: Ninguna en esta prueba automatizada; repetir ante el jurado para la demostración en vivo.

## Pruebas complementarias

- Segundo sellado rechazado por EVM: APROBADO.
- RPC bloqueado: sin verde ni indicadores acreditados: APROBADO.
- Recarga: manifiesto persistido y sello original conservado: APROBADO.
- Vista móvil 390 px sin desbordamiento de página: APROBADO.
- Reinicio del proceso EVM: mismos contrato, sello, transacción y resultado verificado: APROBADO.

## Límites y pendientes

- Edición manual realizada y confirmada por el usuario; CSV y transacción autenticados nuevamente. Las pruebas automáticas y la edición manual se ejecutaron en sesiones distintas. El guion completo debe ensayarse por el expositor.
- Las pruebas unitarias se ejecutan con npm test; sus resultados se conservan por separado en evidencias/pruebas-unitarias.txt. No se confunden los anclajes de pruebas unitarias con el sello real de aceptación.
- La EVM local es real, pero no es una testnet pública. Ganache conserva bloques y estado por instancia en .instances/. Es necesario npm start para consultar las evidencias por RPC; el JSON y las capturas por sí solos no reemplazan esa consulta.
- El motor descuenta feriados configurados. Se usa lista vacía como supuesto explícito porque no se entregó calendario oficial. Ver CALENDARIO.md.
- Un sello acredita integridad posterior al anclaje, no veracidad ni cumplimiento institucional anterior.