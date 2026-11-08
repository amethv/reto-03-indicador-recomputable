# Demostración del Nivel 1 · cinco minutos

## Preparación

Instalar dependencias y ejecutar pruebas. Abrir las dos láminas. Detener los procesos del proyecto en 8080/8545. Ejecutar `npm.cmd run demo` y abrir http://127.0.0.1:8080; el contrato debe estar sin sellar. Abrir una copia de datos/tickets.csv en VS Code o Bloc de notas. Conservar extensión CSV. No editar originales. Preparar el editor antes del cronómetro; hacer la edición durante la demostración.

| Tiempo | Acción visible | Mensaje |
|---|---|---|
| 0:00–0:50 | Cargar originales; mostrar 187/187; sellar y mostrar TX confirmada. | Anclamos el lote completo sin enviar contenido de tickets a cadena. |
| 0:50–1:40 | Verificar original; mostrar verde, 100 % y diferencia con 98,25 %. | Publicado: 168/171. Nuestro lote: 187/187. Hay dos reportes de agosto y se advierte la anomalía. |
| 1:40–2:40 | Editar a mano fecha_resolucion de TK-2026-04201, guardar la copia, cargarla y verificar. | Cambiar 2026-08-03T12:03:55-05:00 a 2026-08-03T12:04:55-05:00. Mostrar rojo, ticket y campo. El sello no cambia. |
| 2:40–3:30 | Restaurar entrada al original y verificar. Mostrar las dos tarjetas y filtrar Excluidos de B. | 100 % frente a 55,61 %; los 83 cierres automáticos explican 44,39 puntos de diferencia. |
| 3:30–4:20 | Consultar contrato y transacción; abrir calldata y fuente Solidity. | Solo compromisos, cantidad, período y metadatos. Los nombres y contenidos permanecen fuera de cadena. |
| 4:20–5:00 | Mostrar las dos láminas. | La red local demuestra el mecanismo; independencia pública requiere un ancla externa. |

## Preguntas del jurado

**¿Por qué 100 % no significa buen servicio?** Son cierres administrativos. Hay 83 sin confirmación y 66 fuera de SLA con el calendario declarado.

**¿Por qué no filtrar julio?** El criterio exige 187 del lote. Son 185 reportes de julio y 2 de agosto. Se calcula el estado final, no un corte al 31 de julio.

**¿Y los feriados?** El motor permite configurarlos y se probó su descuento. El caso no entrega calendario oficial: lista vacía como supuesto visible. Cambiarlo exige otro sello.

**¿Dónde hace falta blockchain?** Entre quien se mide y el auditor o ciudadanía que recibe el indicador. La operación interna puede usar bases de datos y logs firmados.

**¿Puede cambiarse la red local?** Quien controla el equipo controla el entorno. Se demuestra la inmutabilidad del contrato dentro de esa instancia; independencia del operador requiere anclaje externo.

**¿El hash prueba que la fecha era verdadera?** No: prueba coincidencia con lo sellado. Se necesitan controles de procedencia y veracidad anteriores.

## Contingencia

Si ya aparece sellado, detener y ejecutar `npm run demo` para otra instancia. No borrar cadenas. Si falla RPC, el indicador queda sin acreditar. Las capturas son respaldo documental, no sustituyen una demostración en vivo. Reservar tres minutos posteriores para preguntas. El guion aún debe ensayarse con cronómetro por el expositor.
