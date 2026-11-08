# Dataset — Gestión de incidentes, julio de 2026

Material para el **Reto 03 — El indicador que nadie puede recalcular**.

Todo es **sintético**. Personas, unidades, proveedores, tickets y la entidad
(GAD del Distrito Metropolitano de San Ramón de Altamira, República de Andania) son ficticios.
Pueden publicarlo, transformarlo y subirlo a una testnet sin ninguna restricción.

El proceso está descrito paso a paso en el manual `MP-DMSI-INC-001 V2.0 Gestion de incidentes.pdf`.
**Léanlo primero**, sobre todo la actividad 8 (confirmación con el usuario), la 8.1 (cierre
automático a los 7 días laborables), la 9 (reaperturas) y las 28 a 30 (proveedor externo).

## El caso

| | |
|---|---|
| Período | Julio de 2026 |
| Mesa de ayuda | ATENEA |
| Tickets registrados | **187** |
| Resueltos en Nivel 1 | 84 · Nivel 2 94 · Nivel 3 (proveedor externo) 9 |
| Fuera de SLA | 66 |
| Cerrados automáticamente a los 7 días | 83 (44%) |
| Reaperturas | 7 |
| Indicador publicado | **98,25%** de incidentes gestionados, sobre 171 recibidos |

Los SLA se miden en **horas hábiles**: lunes a viernes, de 08:00 a 17:00. Prioridad crítica 4 h,
alta 8 h, media 24 h, baja 72 h, según el catálogo de servicios.

## Archivos

### `catalogo_servicios.csv` — 14 filas
Los servicios que la mesa de ayuda reconoce, con el nivel previsto de atención, la prioridad, el
SLA en horas hábiles y el área de Nivel 2 que corresponde a cada uno. **Es la regla contra la cual
se juzga todo lo demás.**

### `tickets.csv` — 187 filas
Una fila por ticket: usuario, unidad, servicio del catálogo, prioridad, nivel en que se resolvió,
área de Nivel 2, técnico asignado, fecha de reporte, fecha de resolución, horas hábiles empleadas,
SLA aplicable, si cumplió, tipo de cierre (`CONFIRMADO POR USUARIO` o `AUTOMATICO 7 DIAS`), si el
usuario confirmó, y `ticket_origen` cuando el ticket nació de una reapertura.

**Recalculen las horas hábiles ustedes mismos** a partir de las dos fechas. No confíen en el campo.

### `asignaciones.csv` y `escalamientos.csv`
Quién recibió cada ticket y cuándo, y cada salto de nivel con su motivo y quién lo autorizó.
Crucen los escalamientos contra el área que el catálogo exige para cada servicio.

### `reaperturas.csv` — 7 filas
Ticket original, ticket generado, días hábiles transcurridos desde el cierre y el campo
`debio_conservar_numero`. Según la actividad 9, dentro de los 7 días laborables la reapertura
conserva el mismo número de ticket; pasados los 7 días se asigna uno nuevo.

### `proveedores.csv` y `tickets_proveedor.csv`
Los dos proveedores de Nivel 3, con su contrato, su SLA contractual y la **penalidad en dólares por
hora de retraso**. Y los 9 casos escalados, con hora de apertura, hora de respuesta del proveedor,
horas transcurridas, cumplimiento y penalidad calculada. Aquí hay dinero de por medio.

### `indicador_mensual.csv`
El reporte que la unidad publicó: incidentes recibidos, gestionados, porcentaje, meta y
cumplimiento. **Compárenlo con el conteo real de `tickets.csv`.**

### `bitacora_eventos.csv` — 887 filas
**El archivo central.** Cada evento con `timestamp`, `actor`, `rol`, `accion`, `entidad_afectada`,
`referencia` y `detalle`. Acciones presentes: `REPORTAR_INCIDENTE`, `ASIGNAR_TICKET`, `ESCALAR`,
`RESOLVER`, `CERRAR`, `EDITAR_FECHA_RESOLUCION`, `ABRIR_CASO_PROVEEDOR`, `RESPONDER_PROVEEDOR`,
`REABRIR`, `PUBLICAR_INDICADOR`.

El `hash_evento` se calcula sobre cada evento por separado y **no encadena con el anterior**.

### `incidentes_2026-07.json`
Todo junto, por si prefieren cargarlo de una vez.

## Por dónde empezar

1. Cuenten los tickets y comparen con el indicador publicado.
2. Recalculen las horas hábiles de cada ticket desde las fechas y contrástenlas con `cumple_sla`.
3. Separen los cierres confirmados de los automáticos y vean cómo cambia el indicador.
4. Crucen cada ticket con el área de Nivel 2 que el catálogo le asigna.
5. Revisen los tiempos de respuesta del proveedor: hay uno imposible.
6. Miren qué reaperturas generaron número nuevo y cuántos días habían pasado.

Hay **seis inconsistencias sembradas a propósito**. Ninguna es un error de digitación: todas
mejoran el número que alguien tiene que reportar a fin de mes, o evitan una penalidad contractual.
