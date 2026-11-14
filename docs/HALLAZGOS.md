# Hallazgos del lote de julio de 2026

El brief del reto anuncia seis inconsistencias sembradas. Ninguna es un error de digitación: todas mejoran un número que alguien tiene que reportar o evitan una penalidad. El Nivel 1 toca cuatro y el Nivel 2 la quinta. Las cuatro primeras se calculan en `src/findings.mjs` a partir de archivos cuyo SHA-256 está comprometido en el sello, y tienen pruebas en `tests/findings.test.mjs`. La quinta la rechaza el contrato `RelojProveedor` y tiene pruebas en `tests/proveedor.test.mjs`.

**Titular: publicado 98,25 % · solo confirmados por el usuario 55,61 %.**

| Indicador | Cuenta | Resultado |
|---|---|---:|
| Publicado por la unidad | 168/171 | 98,25 % |
| Todos los cierres del lote | 187/187 | 100,00 % |
| Solo confirmados por el usuario | 104/187 | 55,61 % |
| Dentro de SLA, corregido por la bitácora | 120/187 | 64,17 % |

Cada una de estas exclusiones o ediciones mejora el número publicado.

## 1. El denominador lo elige quien se mide

**Evidencia.** `tickets.csv` tiene 187 IDs únicos (185 reportados en julio y 2 en agosto). `indicador_mensual.csv` publica 171 recibidos. La diferencia se explica exacta con dos grupos que no se solapan:

| Paso | Cantidad | IDs |
|---|---:|---|
| Tickets reales en el lote | 187 | |
| Nacidos de una reapertura (`ticket_origen` lleno) | −7 | TK-2026-04381 a TK-2026-04387 |
| Resueltos en Nivel 3 por el proveedor | −9 | TK-2026-04226, 04244, 04288, 04301, 04315, 04320, 04326, 04360, 04367 |
| **Recibidos publicados** | **171** | |

Los 168 gestionados publicados no se pueden reconstruir desde los datos: son 171 − 3 y el lote no indica qué tres tickets quedaron fuera. La aplicación lo dice así y no los adivina.

**En la app.** Sección 2: cascada 187 → 171 con los IDs desplegables de cada grupo.

## 2. Una fecha se movió después de resolver

**Evidencia.** El evento `EV-00001` de `bitacora_eventos.csv` (2026-07-26 15:27, rol Analista Nivel 1) registra `EDITAR_FECHA_RESOLUCION` sobre **TK-2026-04228**: «horas_resolucion 5.80 -> 3.80; cumple_sla NO -> SI». El ticket es CS-11 (intento de acceso no autorizado), prioridad CRÍTICA, SLA 4 h, resuelto el 24 de julio. El CSV ya trae la fecha editada: con sus fechas salen 3,80 h y «cumple». Solo se detecta cruzando con la bitácora. Las horas reales fueron 5,80 h: **incumplió el SLA**.

SLA declarado en el CSV: 121/187 = 64,71 %. Corregido por la bitácora: **120/187 = 64,17 %**.

**En la app.** Sección 2: tarjeta «Fecha editada después de resolver» y fila del SLA en la tabla resumen. Sección 4: el filtro «Con discrepancias SLA» muestra TK-2026-04228. El nombre del actor no se muestra; basta con su rol.

**Falsas discrepancias eliminadas.** TK-2026-04385 y TK-2026-04386 diferían 0,01 h entre las horas calculadas y las declaradas. Es redondeo a dos decimales, no un hallazgo. La tolerancia es ±0,02 h y forma parte de las reglas selladas (`hoursTolerance` en `POLICY`).

## 3. «Gestionado» no significa resuelto

**Evidencia.** De los 187 cierres, 104 los confirmó el usuario y 83 (44 %) se cerraron solos a los 7 días laborables (actividad 8.1 del manual). Todos cuentan como gestionados.

**En la app.** Sección 4: indicador A (todos los cierres, 187/187 = 100 %) junto al B (solo confirmados, 104/187 = 55,61 %). Diferencia: 44,39 puntos. El filtro «Excluidos de B» lista los 83.

## 4. Un problema que vuelve se cuenta como nuevo

**Evidencia.** En `reaperturas.csv`, RA-001 a RA-005 ocurrieron a los 3 días hábiles y tienen `debio_conservar_numero = SI`, pero generaron tickets nuevos. Según la actividad 9 del manual debieron conservar el número original. RA-006 y RA-007 (11 días) están bien numeradas.

| Reapertura | Original | Generado | Días hábiles |
|---|---|---|---:|
| RA-001 | TK-2026-04335 | TK-2026-04381 | 3 |
| RA-002 | TK-2026-04304 | TK-2026-04382 | 3 |
| RA-003 | TK-2026-04356 | TK-2026-04383 | 3 |
| RA-004 | TK-2026-04221 | TK-2026-04384 | 3 |
| RA-005 | TK-2026-04261 | TK-2026-04385 | 3 |

El original queda «resuelto» y el problema no resuelto vuelve a sumar.

**En la app.** Sección 2: tarjeta «Reaperturas con número nuevo».

## 5. El proveedor respondió antes de que se abriera el caso (Nivel 2)

**Evidencia.** En `tickets_proveedor.csv`, **PVT-04226** (ticket TK-2026-04226, proveedor PV-01) se abrió el 9 de julio a las 08:19:38 y tiene respuesta a las 06:54:38 del mismo día: **−1,42 h**. El CSV lo marca como cumplido y sin penalidad. Un tiempo negativo hace que el caso más rápido del mes sea imposible, y además lo saca de cualquier penalidad.

**En el contrato.** `RelojProveedor` exige que el municipio firme la apertura y que el proveedor firme su respuesta con su propia cuenta. La respuesta de PVT-04226 se **rechaza**: `require(respuesta >= apertura, "Respuesta anterior a la apertura")`. Los otros 8 casos se aceptan y el contrato calcula la penalidad: `max(0, duración − SLA) × tarifa / 3600`, con SLA de 6 h y 180 USD por hora para PV-01.

| Caso | Horas | Penalidad del contrato | Penalidad declarada en el CSV |
|---|---:|---:|---:|
| PVT-04226 | −1,42 | **Rechazado** | 0 USD (cumple) |
| PVT-04244 | 11,30 | 954 USD | 954 USD |
| PVT-04288 | 7,90 | 342 USD | 342 USD |
| PVT-04326 | 11,30 | 954 USD | 954 USD |
| PVT-04367 | 7,90 | 342 USD | 342 USD |
| Otros 4 casos | 2,50 a 3,80 | 0 USD | 0 USD |
| **Total** | | **2.592 USD** | 2.592 USD |

En los 8 casos aceptados el contrato coincide con lo que declaraba el CSV. La diferencia está en el caso que el CSV no debió aceptar. Cualquiera puede recalcular las horas y las penalidades solo con los eventos del contrato, sin llaves.

**Supuesto declarado.** El SLA contractual se mide en horas corridas, no hábiles, porque así vienen los datos (11,30 h de 22:32 a 09:50).

**En la app.** Vista «Reloj del proveedor» (`#/proveedor`): «Cargar los 9 casos», la fila de PVT-04226 en rojo, el total de 2.592 USD y «Recalcular como tercero».

## 6. Reclasificar un servicio borra un incumplimiento (Nivel 3)

**Evidencia.** **TK-2026-04228** es del servicio **CS-11** («Intento de acceso no autorizado»), CRITICA con SLA de **4 h** hábiles en el catálogo. Según la bitácora se resolvió en **5,80 h**: incumplió (hallazgo 2). Hay otros dos tickets de CS-11 en la misma situación: TK-2026-04351 (5,80 h) y TK-2026-04355 (7,20 h). Si después del mes alguien edita el catálogo y pasa CS-11 a ALTA con **8 h**, los tres pasan de «No cumple» a «Cumple» sin tocar ningún ticket.

**En el contrato.** `RegistroCatalogo` ancla al inicio del período los 14 servicios de `catalogo_servicios.csv` con su prioridad y su SLA, más el SHA-256 del CSV completo. Solo el municipio (owner) ancla, una vez por período, y no hay ninguna función para modificar: un segundo anclaje de julio revierte con «Catálogo ya anclado: no se puede reclasificar». El catálogo es público y no tiene datos personales, así que los ids van en texto.

| Servicio | Anclado | Copia editada | Tickets que cambiarían de cumplimiento |
|---|---|---|---|
| CS-11 | CRITICA, 4 h | ALTA, 8 h | TK-2026-04228 (5,80 h, bitácora), TK-2026-04351 (5,80 h), TK-2026-04355 (7,20 h): de «No cumple» a «Cumple» |

**En la app.** Vista «Catálogo y SLA» (`#/catalogo`): «Anclar catálogo de julio», «Verificar catálogo» (VERDE con el original; ROJO con la copia, con el servicio, lo anclado, lo editado y la lista de tickets), «Intentar reclasificar» (rechazo del contrato simulado sin gas) y la tabla de los 14 servicios con enlaces a Etherscan.

## Fuera del alcance

Del Nivel 3 se implementa la opción «Catálogo y SLA anclados» (hallazgo 6). La otra inconsistencia sembrada para el Nivel 3 no se implementa:

- **Seguridad cerrada sin Seguridad.** **TK-2026-04202** (CS-12, «Correo malicioso reportado por usuario», área Seguridad según el catálogo) se cerró en Nivel 1 sin pasar por Seguridad.

## Cómo se protege la evidencia

Los SHA-256 de `bitacora_eventos.csv` y `reaperturas.csv` forman parte del manifiesto sellado, junto con los de tickets, catálogo y reporte publicado. Si cualquiera de esos archivos cambia, el verificador da INCOMPLETA y no muestra indicadores. Solo el hash entra en el compromiso: la bitácora contiene nombres de actores y nunca va a la cadena.

En el Nivel 2 la cadena guarda solo identificadores hasheados (keccak256 de `PVT-…` y `PV-…`), cuentas, segundos y tarifas. La razón social, el servicio, el número de contrato y el contacto de `proveedores.csv` no aparecen ni en la calldata ni en los eventos; la prueba 7 y la auditoría lo comprueban.
