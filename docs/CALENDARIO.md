# Calendario declarado

El país y la entidad son ficticios. El material exige lunes a viernes de 08:00 a 17:00 y menciona feriados, pero no aporta fechas. No corresponde importar automáticamente un calendario de Ecuador ni de otro país real.

El motor descuenta fechas ISO YYYY-MM-DD de `src/calendar.mjs`. La entrega utiliza lista vacía y estado SUPUESTO EXPLÍCITO, pendiente del calendario del organizador. Esto resuelve la capacidad técnica y declara la limitación de la fuente; no demuestra ausencia real de feriados.

Para incorporar fechas oficiales:

1. Registrar fechas y fuente en `holidays` y `source`.
2. Cambiar `version` y `status` del calendario.
3. Ejecutar `npm test` y agregar ejemplos de las fechas oficiales.
4. Detener el servidor y ejecutar `npm run demo` para crear otra instancia.
5. Sellar, recalcular y conservar ambas evidencias, explicando cualquier cambio de SLA.

El calendario forma parte de POLICY y su hash se registra en el contrato. El verificador rechaza reglas distintas. El calendario afecta horas y SLA, no los conteos A y B bajo la regla adoptada.

Las fechas de feriados en pruebas son ejemplos ficticios de prueba, no un calendario oficial. Se prueba exclusión de jornada, fin de semana, fechas imposibles y duplicados.

## Simulación en la interfaz

El panel «Simular feriado» recalcula horas y SLA en el navegador para una fecha elegida (por ejemplo 2026-07-24) y muestra qué tickets cambian de estado. Es una simulación no sellada: no modifica `src/calendar.mjs`, las reglas ni el sello. Con 2026-07-24 cambian las horas de 26 tickets y 4 pasan a cumplir el SLA (120/187 → 124/187). TK-2026-04228 sigue contando como incumplido porque la bitácora registra que su fecha se editó.
