# Demostración del Nivel 1 · cinco minutos

Hilo conductor: julio de 2026. Los cinco criterios del brief, en su orden.

## Preparación (antes del cronómetro)

1. `npm.cmd ci --no-audit --no-fund` y `npm.cmd test` (todo en verde).
2. Cerrar cualquier proceso en los puertos 8080 y 8545. Ejecutar `npm.cmd run demo` (o doble clic en `INICIAR_DEMO.cmd`): crea una instancia nueva con el contrato **sin sellar**. Abrir http://127.0.0.1:8080.
3. Abrir en VS Code o el Bloc de notas una **copia** de `datos/tickets.csv` (por ejemplo en el Escritorio). No editar el original. Dejar el cursor en TK-2026-04201, primera fila.
4. Abrir en otra pestaña el contrato de Sepolia (enlace en `evidencias/red-sepolia.json` o en el README) y las dos láminas de `presentacion/`.
5. Sin internet: usar solo la red «Local (Ganache)». Todo funciona igual salvo el paso de Sepolia.

## Guion

| Tiempo | Criterio | Acción visible | Mensaje |
|---|---|---|---|
| 0:00–0:45 | 1 · Sellar | «Cargar los originales entregados» → 187/187. «Sellar julio en blockchain» → TX confirmada. | Anclamos los 187 tickets con sus tiempos y su SLA. En cadena solo van hashes, conteos y período. |
| 0:45–2:00 | 2 · Recalcular | «Verificar nuevamente contra blockchain» → VERDE. Mostrar el titular, la cascada, la tarjeta de TK-2026-04228 y la de reaperturas. | **Publicado 98,25 %; solo confirmados por el usuario 55,61 %.** El 171 publicado sale de 187 − 7 reaperturas − 9 casos del proveedor. TK-2026-04228 se resolvió en 5,80 h y alguien lo editó a 3,80 h dos días después: solo la bitácora lo revela. Cinco reaperturas debieron conservar su número. Cada exclusión o edición mejora el número publicado. |
| 2:00–3:00 | 3 · Alterar | En la copia del CSV cambiar `fecha_resolucion` de TK-2026-04201 de `2026-08-03T12:03:55-05:00` a `2026-08-03T12:04:55-05:00`. Guardar, cargarla en la sección 3 y verificar. | ROJO con el ticket y el campo, el valor sellado frente al editado, y el sello no cambió. Un minuto de diferencia basta. |
| 3:00–3:45 | 4 · A contra B | Volver a verificar sin archivo (original) y bajar a la sección 4. Filtrar «Excluidos de B». | 100 % contando todos los cierres; 55,61 % contando solo los confirmados. Los 83 cierres automáticos (44 %) explican 44,39 puntos. |
| 3:45–4:40 | 5 · Privacidad | Cambiar el selector a «Pública (Sepolia)» → abrir el enlace al explorador. Pulsar «Buscar datos personales en la cadena». | Cualquiera lo verifica sin wallet. **0 coincidencias de 174 valores buscados**: usuarios, técnicos, unidades y actores, en texto y como hash. Lo único en cadena es período, raíz, compromiso, cantidad, fecha y hash de reglas. |
| 4:40–5:00 | Cierre | Lámina 2. | La cadena solo donde el emisor es el medido: el indicador público. Lo interno, con logs firmados. |

Si Sepolia aún no está desplegado, el selector lo dice («Sepolia pendiente»): en ese caso hacer el paso 5 en la red local y mostrar `scripts/seal-testnet.mjs`.

## Preguntas del jurado

**¿Por qué 100 % no significa buen servicio?** Son cierres administrativos. 83 no tienen confirmación del usuario y 67 tickets incumplieron el SLA una vez corregida la bitácora (120/187 dentro).

**¿De dónde sale el 98,25 %?** 168/171. El 171 se reconstruye exacto: 187 − 7 reaperturas − 9 casos del proveedor. El 168 no se puede reconstruir desde los datos; no inventamos qué tres tickets faltan.

**¿Por qué no basta con logs firmados?** Para la operación interna sí bastan, y así lo proponemos. Pero un log firmado por la unidad lo firma la misma unidad que se mide con el número: la ciudadanía no tiene cómo saber si se reescribió y se volvió a firmar. Un ancla pública fija el compromiso en un momento y fuera del control de quien lo emite.

**¿Qué pasa en agosto?** El contrato acepta cualquier período AAAAMM y un sello por mes, inmutable. Se exporta agosto desde ATENEA, se sella con `seal(202608, …)` y el verificador aplica la regla de ese mes. La cantidad no está fija en el contrato: la regla de 187 tickets es solo de julio y vive en el verificador.

**¿Por qué no filtrar julio?** El criterio exige los 187 del lote. Son 185 reportes de julio y 2 de agosto. Se usa el estado final del lote.

**¿Y los feriados?** El motor los descuenta y está probado. El caso no entrega calendario oficial: lista vacía como supuesto declarado. El panel «Simular feriado» muestra el efecto de una fecha (el 24 de julio cambia 4 tickets de estado) sin tocar el sello.

**¿El hash prueba que la fecha era verdadera?** No: prueba que no cambió después del sello. TK-2026-04228 ya venía editado antes; lo detectamos porque la bitácora también está comprometida en el sello.

**¿Quién tiene la llave?** El municipio, en `.env` del equipo que sella. El navegador nunca la recibe: solo lee por un RPC público.

## Contingencia

- Si la instancia ya aparece sellada: detener y volver a ejecutar `npm.cmd run demo` (crea otra instancia; no borra cadenas).
- Si falla el RPC: la interfaz no muestra indicadores acreditados (ERROR DE CONEXIÓN). Cambiar a la red local.
- Las capturas de `evidencias/` son respaldo documental, no sustituyen la demostración en vivo.

## Evidencia de la edición manual

La auditoría automática aprueba el criterio 3, pero la edición humana se acredita aparte. Tras sellar la instancia normal, detenerla y ejecutar `npm.cmd run manual`: abre Edge y espera a que una persona edite la copia que indica. El resultado queda en `evidencias/edicion-observada-*.json`; se registra como `evidencias/edicion-manual.json` con `humanConfirmed: true` solo cuando la persona confirma que hizo la edición.
