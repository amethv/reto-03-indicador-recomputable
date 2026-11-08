# Corrección de procedencia

La revisión del 7 de noviembre de 2026 (America/Guayaquil) detectó una diferencia en TK-2026-04201, campo fecha_reporte: la copia local decía 2026-07-31T13:39:55-05:00 y la fuente entregada 2026-07-31T12:39:55-05:00.

SHA-256 anterior: `50c675af7fd8a0340e43ff7f4fe8a7e588614cce020f74a9465de5bd336d06c0`.

SHA-256 correcto: `6f3a1f097e438bf5518df1193a5bf2789a985a081920605ffb7ead04fa0e88f8`.

Se copió el archivo fuente sin transformarlo. Los once archivos fueron contrastados por SHA-256; sus huellas están en src/source-manifest.json. El verificador acepta una carpeta externa para repetir la comparación. No se conoce cuándo ni por qué se produjo la diferencia anterior.

La nueva instancia está en .instances/nivel1-corregido/, con reglas v2 y sello nuevo. No se atribuye el nuevo CSV al sello anterior.

La afirmación anterior de coincidencia total solo se conserva en el archivo histórico como evidencia de lo encontrado; esta nota la sustituye para la versión corregida.

La corrección restaura 8,4 horas hábiles en el primer ticket; no altera A = 187/187 ni B = 104/187. Las discrepancias restantes de SLA son TK-2026-04385 y TK-2026-04386 bajo el calendario declarado.
