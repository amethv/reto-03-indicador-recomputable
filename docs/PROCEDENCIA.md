<img src="../src/cygnus-icono.png" alt="Cygnus" width="48">

# Cygnus · Procedencia de los datos

## Estado vigente

Los once archivos de `datos/` coinciden byte a byte con la carpeta fuente entregada por el organizador. Sus SHA-256 están en `src/source-manifest.json`; `src/originals.json` guarda los hashes de los archivos que entran en el sello y el orden de los 187 IDs.

```powershell
npm.cmd run verify:source
npm.cmd run verify:source -- "RUTA_A_OTRA_COPIA/datos"
```

El segundo comando compara una copia externa con las huellas del proyecto. La aplicación también comprueba los once archivos al arrancar. Una huella local es una referencia de procedencia, no un certificado del organizador.

El lote tiene 185 reportes de julio y 2 de agosto (TK-2026-04386 y TK-2026-04387). Se usa el estado final del lote, no un corte al 31 de julio. El calendario vacío es un supuesto declarado; ver [CALENDARIO.md](CALENDARIO.md).

## Corrección de TK-2026-04201

La revisión del 7 de noviembre de 2026 (America/Guayaquil) detectó una diferencia en TK-2026-04201, campo `fecha_reporte`: la copia local decía `2026-07-31T13:39:55-05:00` y la fuente entregada `2026-07-31T12:39:55-05:00`.

| | SHA-256 de `datos/tickets.csv` |
|---|---|
| Copia anterior (incorrecta) | `50c675af7fd8a0340e43ff7f4fe8a7e588614cce020f74a9465de5bd336d06c0` |
| Fuente correcta (vigente) | `6f3a1f097e438bf5518df1193a5bf2789a985a081920605ffb7ead04fa0e88f8` |

Se copió el archivo fuente sin transformarlo. No se sabe cuándo ni por qué apareció la diferencia anterior. La corrección restaura 8,4 horas hábiles en ese ticket y no cambia A = 187/187 ni B = 104/187.

La copia anterior, su cadena local y su sello ya no se conservan: no se atribuye el CSV corregido a ningún sello anterior. Los sellos vigentes usan las reglas `nivel1-v3` en una instancia nueva.
