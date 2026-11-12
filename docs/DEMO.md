# Demostración · Nivel 1 en cinco minutos y Nivel 2 en uno

Hilo conductor: julio de 2026. Los cinco criterios del Nivel 1, en su orden, y después el reloj del proveedor (Nivel 2).

## Preparación (antes del cronómetro)

1. `npm.cmd ci --no-audit --no-fund` y `npm.cmd test` (todo en verde).
2. Cerrar cualquier proceso en los puertos 8080 y 8545. Ejecutar `npm.cmd run demo` (o doble clic en `INICIAR_DEMO.cmd`): crea una instancia nueva con el contrato **sin sellar** y el reloj del proveedor **sin casos**. Abrir http://127.0.0.1:8080. En Render: reiniciar el servicio antes de presentar, porque el sello y los casos duran hasta el siguiente reinicio.
3. Abrir en el Bloc de notas una **copia** de `datos/tickets.csv` (por ejemplo en el Escritorio). No editar el original y no usar un editor con autoguardado: guardaría el cambio a medio escribir. Dejar el cursor en TK-2026-04201, primera fila.
4. Abrir en otra pestaña el contrato de Sepolia (enlace en `evidencias/red-sepolia.json` o en el README) y las dos láminas de `presentacion/`.
5. Sin internet: usar solo la red «Local (Ganache)». Todo funciona igual salvo el paso de Sepolia.

## Guion

La demo sigue el menú lateral de arriba hacia abajo: **Panel → 1 Sellar → 2 Recalcular → 3 Verificar → 4 Comparar → 5 Privacidad → 6 Reloj del proveedor**. Cada vista tiene su ruta (`#/panel`, `#/sellar`, …, `#/proveedor`), así que recargar no pierde el lugar. El punto a la derecha de cada ítem cambia de gris a verde (o a rojo) cuando ese paso se cumple. El Panel marca el guion con un check.

| Tiempo | Vista (criterio) | Acción visible | Mensaje |
|---|---|---|---|
| 0:00–0:15 | Panel | Mostrar el titular, las cuatro tarjetas en pendiente y el guion sin checks. | Esto es lo que vamos a demostrar en cinco minutos. |
| 0:15–0:50 | Sellar (1) | «Cargar los originales entregados» → 187/187. «Sellar julio en blockchain» → TX confirmada. El punto de Sellar se pone verde. «Siguiente: Recalcular →». | Anclamos los 187 tickets con sus tiempos y su SLA. En cadena solo van hashes, conteos y período. |
| 0:50–2:00 | Recalcular (2) | «Recalcular desde lo sellado» → VERDE. Mostrar la cascada, la tabla de cuatro indicadores, la tarjeta de TK-2026-04228 y la de reaperturas. | **Publicado 98,25 %; solo confirmados por el usuario 55,61 %.** El 171 publicado sale de 187 − 7 reaperturas − 9 casos del proveedor. TK-2026-04228 se resolvió en 5,80 h y alguien lo editó a 3,80 h dos días después: solo la bitácora lo revela. Cinco reaperturas debieron conservar su número. Cada exclusión o edición mejora el número publicado. |
| 2:00–3:00 | Verificar (3) | En la copia del CSV cambiar `fecha_resolucion` de TK-2026-04201 de `2026-08-03T12:03:55-05:00` a `2026-08-03T12:04:55-05:00`. Guardar, elegirla en «CSV que se va a verificar» y pulsar «Verificar nuevamente contra blockchain». Los puntos de Verificar, Recalcular y Comparar se ponen rojos. | ROJO con el ticket y el campo, el valor sellado frente al editado, y el sello no cambió. Un minuto de diferencia basta. |
| 3:00–3:45 | Comparar (4) | Ir a Comparar y pulsar «Recalcular para comparar»: descarta la copia y verifica el original (VERDE). En «Mostrar», elegir «Los que no cuentan en B». | 100 % contando todos los cierres; 55,61 % contando solo los confirmados. Los 83 cierres automáticos (44 %) explican 44,39 puntos: el hallazgo. |
| 3:45–4:40 | Privacidad (5) | «Consultar contrato y transacción» → lo que sí hay en la cadena. «Buscar datos personales en la cadena» → 0 / 0 / 0. Si Sepolia está desplegado, cambiar antes la red a «Pública (Sepolia)». | Cualquiera lo verifica sin wallet. **0 coincidencias de 174 valores buscados**: usuarios, técnicos, unidades y actores, en texto y como hash. Lo único en cadena es período, raíz, compromiso, cantidad, fecha y hash de reglas. |
| 4:40–5:40 | Reloj del proveedor (Nivel 2) | Ir a «6 · Reloj del proveedor» y pulsar «Cargar los 9 casos»: se ve qué cuenta firma cada paso. Señalar la fila roja de PVT-04226 y el total de **2.592 USD**. Pulsar «Recalcular como tercero» → «coincide». | Aquí hay dos organizaciones, un contrato y dinero. El municipio firma la apertura y el proveedor su respuesta, cada uno con su llave. El CSV daba PVT-04226 como cumplido con −1,42 h; el contrato lo rechaza. Cualquiera recalcula las penalidades desde los eventos, sin llaves. |
| 5:40–6:00 | Panel y cierre | Volver al Panel: los seis pasos con check y la brecha de 44,39 pp. Lámina 2. | La cadena solo donde hay una frontera de confianza: el indicador público y el reloj con el proveedor. Lo interno, con logs firmados. |

Si Sepolia aún no está desplegado, el selector lo dice («Sepolia pendiente»): en ese caso hacer el paso de Privacidad en la red local y mostrar `scripts/seal-testnet.mjs`. Al cambiar de red se reinicia el estado de la sesión (puntos y guion), porque cada red tiene su propio sello.

«Simular feriado», bajo «Herramientas», queda fuera del cronómetro: sirve para la pregunta sobre feriados.

En pantallas de menos de 900 px el menú se abre con el botón «Menú» de la barra superior.

## Preguntas del jurado

**¿Por qué 100 % no significa buen servicio?** Son cierres administrativos. 83 no tienen confirmación del usuario y 67 tickets incumplieron el SLA una vez corregida la bitácora (120/187 dentro).

**¿De dónde sale el 98,25 %?** 168/171. El 171 se reconstruye exacto: 187 − 7 reaperturas − 9 casos del proveedor. El 168 no se puede reconstruir desde los datos; no inventamos qué tres tickets faltan.

**¿Por qué no basta con logs firmados?** Para la operación interna sí bastan, y así lo proponemos. Pero un log firmado por la unidad lo firma la misma unidad que se mide con el número: la ciudadanía no tiene cómo saber si se reescribió y se volvió a firmar. Un ancla pública fija el compromiso en un momento y fuera del control de quien lo emite.

**¿Qué pasa en agosto?** El contrato acepta cualquier período AAAAMM y un sello por mes, inmutable. Se exporta agosto desde ATENEA, se sella con `seal(202608, …)` y el verificador aplica la regla de ese mes. La cantidad no está fija en el contrato: la regla de 187 tickets es solo de julio y vive en el verificador.

**¿Por qué no filtrar julio?** El criterio exige los 187 del lote. Son 185 reportes de julio y 2 de agosto. Se usa el estado final del lote.

**¿Y los feriados?** El motor los descuenta y está probado. El caso no entrega calendario oficial: lista vacía como supuesto declarado. El panel «Simular feriado» muestra el efecto de una fecha (el 24 de julio cambia 4 tickets de estado) sin tocar el sello.

**¿El hash prueba que la fecha era verdadera?** No: prueba que no cambió después del sello. TK-2026-04228 ya venía editado antes; lo detectamos porque la bitácora también está comprometida en el sello.

**¿Quién tiene la llave?** El municipio, en `.env` del equipo que sella. El navegador nunca la recibe: solo lee por un RPC público.

**¿Por qué el reloj del proveedor sí va en cadena?** Porque cruza una frontera de confianza: son dos organizaciones con intereses opuestos, un contrato y penalidades en dólares. Si el municipio llevara el reloj, el proveedor podría decir que lo manipuló; si lo llevara el proveedor, al revés. Con el contrato, cada uno firma solo su parte y nadie puede cambiar la del otro.

**¿Y si el proveedor firma una hora falsa?** El contrato no sabe qué hora es la real: registra lo que cada parte firma y rechaza lo imposible, como una respuesta anterior a la apertura. Lo que gana el municipio es que la hora queda firmada por el proveedor y no se puede negar ni cambiar después.

**¿Por qué horas corridas y no hábiles?** Así vienen los datos del proveedor (11,30 h entre las 22:32 y las 09:50). Es un supuesto declarado; un contrato real lo diría en sus cláusulas.

**¿Las dos llaves están en el mismo servidor?** En la demo sí: son cuentas de Ganache en el mismo equipo. En la realidad cada organización guarda la suya y firma desde su propio equipo; el contrato ya exige que cada paso lo firme la cuenta correcta (el municipio no puede responder, el proveedor no puede abrir, PV-02 no puede responder un caso de PV-01).

## Contingencia

- Si la instancia ya aparece sellada: detener y volver a ejecutar `npm.cmd run demo` (crea otra instancia; no borra cadenas). En Render, reiniciar el servicio.
- Si los 9 casos ya estaban cargados: «Cargar los 9 casos» no los repite; muestra cada paso «(ya estaba en la cadena)» y el contrato vuelve a rechazar PVT-04226.
- Si falla el RPC: la interfaz no muestra indicadores acreditados (ERROR DE CONEXIÓN). Cambiar a la red local.
- Las capturas de `evidencias/` son respaldo documental, no sustituyen la demostración en vivo.
- Si se verifica desde otro navegador o equipo: importar en la vista Verificar el manifiesto (`sello-original.json`) y la sal secreta (`.instances/nivel1-v4/secreto/sal-202607.json`). Sin la sal el resultado es INCOMPLETA, a propósito.

## Evidencia de la edición manual

La auditoría automática aprueba el criterio 3, pero la edición humana se acredita aparte. Tras sellar la instancia normal, detenerla y ejecutar `npm.cmd run manual`: abre Edge y espera a que una persona edite la copia que indica. El resultado queda en `evidencias/edicion-observada-*.json`; se registra como `evidencias/edicion-manual.json` con `humanConfirmed: true` solo cuando la persona confirma que hizo la edición.
