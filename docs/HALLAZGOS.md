# Hallazgos del lote de julio de 2026

El brief del reto anuncia seis inconsistencias sembradas. Ninguna es un error de digitación: todas mejoran un número que alguien tiene que reportar o evitan una penalidad. El Nivel 1 toca cuatro. Todas se calculan en `src/findings.mjs` a partir de archivos cuyo SHA-256 está comprometido en el sello, y tienen pruebas en `tests/findings.test.mjs`.

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

## Fuera del alcance del Nivel 1

Las otras dos inconsistencias sembradas corresponden a los niveles 2 y 3 del reto y no se implementan:

- **Reloj del proveedor (Nivel 2).** `PVT-04226` (ticket TK-2026-04226, proveedor PV-01) tiene respuesta a las 06:54:38, antes de la apertura a las 08:19:38: tiempo de respuesta de **−1,42 h**, marcado como cumplimiento y sin penalidad.
- **Seguridad cerrada sin Seguridad (Nivel 3).** **TK-2026-04202** (CS-12, «Correo malicioso reportado por usuario», área Seguridad según el catálogo) se cerró en Nivel 1 sin pasar por Seguridad.

## Cómo se protege la evidencia

Los SHA-256 de `bitacora_eventos.csv` y `reaperturas.csv` forman parte del manifiesto sellado, junto con los de tickets, catálogo y reporte publicado. Si cualquiera de esos archivos cambia, el verificador da INCOMPLETA y no muestra indicadores. Solo el hash entra en el compromiso: la bitácora contiene nombres de actores y nunca va a la cadena.
