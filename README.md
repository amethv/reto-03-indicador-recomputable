# Reto 03 · El indicador que nadie puede recalcular

Nivel 1 del caso San Ramón de Altamira. Un **sellador** ancla en blockchain el compromiso de los 187 tickets de julio de 2026 y un **verificador** en el navegador recalcula el indicador desde lo sellado, sin pedirle el número a nadie.

**Publicado 98,25 % · solo confirmados por el usuario 55,61 %.**

Nivel 2: un **reloj del proveedor** en un contrato aparte. El municipio firma la apertura de cada caso y el proveedor su respuesta, cada uno con su propia llave, y cualquiera recalcula el tiempo y la penalidad. De los 9 casos, 8 se aceptan y **PVT-04226 se rechaza** (respuesta anterior a la apertura); las penalidades suman **2.592 USD**.

Repositorio público: pendiente de publicar.

## Requisitos

- Node.js 22 o superior (`node.exe` en el PATH) y npm.
- Un navegador moderno. La auditoría automática usa Microsoft Edge.

## Cómo correrlo

```powershell
npm.cmd ci --no-audit --no-fund
npm.cmd start
```

**Instalación liviana para la demo**: `npm.cmd ci --omit=dev --no-audit --no-fund` y luego `npm.cmd start`. Instala solo Ganache, ethers y Papaparse (198 MB contra 228 MB) y sirve para correr, sellar y verificar. Deja fuera Playwright, pptxgenjs y solc, que solo hacen falta para `test`, `audit`, `manual`, `slides` y `compile`. El contrato ya viene compilado en `contracts/RegistroIndicador.json`.

Abrir http://127.0.0.1:8080 (no abrir `src/index.html` con `file://`). En Windows también sirve doble clic en `INICIAR_APP.cmd`. La primera ejecución despliega el contrato en una EVM local (Ganache, chain ID 31337) sin sellar: en el menú lateral, ir a **Sellar** y pulsar **Cargar los originales entregados** y **Sellar julio en blockchain**. Cada proceso tiene su vista y su ruta (`#/panel`, `#/sellar`, `#/recalcular`, `#/verificar`, `#/comparar`, `#/privacidad`, `#/proveedor`, `#/feriado`). El estado vive en `.instances/nivel2-v1/`, que empieza sin sellar. La instancia anterior, `.instances/nivel1-v4/`, conserva su sello del Nivel 1 y no se toca; para abrirla: `$env:ATENEA_INSTANCE='nivel1-v4'; npm.cmd start` (al hacerlo también se le despliega el reloj del proveedor). Al arrancar también se despliega el contrato del Nivel 2 (`RelojProveedor`), después del contrato del Nivel 1 y sin tocarlo; su dirección queda en `evidencias/reloj-local.json`.

Para una demostración desde cero (contrato sin sellar en una instancia nueva): `npm.cmd run demo` o `INICIAR_DEMO.cmd`. Guion en [docs/DEMO.md](docs/DEMO.md).

| Comando | Qué hace |
|---|---|
| `npm.cmd test` | 65 pruebas: núcleo, sal, hallazgos, contrato, privacidad, Sepolia ensayado en Ganache y reloj del proveedor (Nivel 2, con lotes y el flujo municipio → proveedor) |
| `npm.cmd run proveedor` | Portal del proveedor, programa aparte, en http://127.0.0.1:8081 |
| `npm.cmd run test:evidencia` | Las mismas pruebas, guardadas en `evidencias/pruebas-unitarias.txt` sin rutas personales |
| `npm.cmd run compile` | Recompila el contrato y regenera `contracts/RegistroIndicador.json` (abi, bytecode, compilador e input estándar) |
| `npm.cmd run compile:reloj` | Lo mismo para el contrato del Nivel 2: `contracts/RelojProveedor.json` |
| `npm.cmd run verify:source` | Compara los 11 archivos de `datos/` con sus SHA-256 |
| `npm.cmd run audit` | Los cinco criterios del Nivel 1 y la sección del Nivel 2 en Edge sobre la cadena real; escribe `docs/AUDITORIA.md` y `evidencias/` |
| `npm.cmd run slides` | Regenera las láminas de `presentacion/` |
| `npm.cmd run deploy:sepolia` / `seal:sepolia` | Ancla pública por script, alternativa a MetaMask (ver abajo) |

## Números clave

| Indicador | Cuenta | Resultado |
|---|---|---:|
| Publicado por la unidad | 168/171 | 98,25 % |
| Todos los cierres del lote (A) | 187/187 | 100,00 % |
| Solo confirmados por el usuario (B) | 104/187 | 55,61 % |
| Dentro de SLA, corregido por la bitácora | 120/187 | 64,17 % |

- **171 = 187 − 7 − 9**: el denominador publicado excluye los tickets nacidos de una reapertura y los resueltos por el proveedor (Nivel 3). El 168 no se puede reconstruir desde los datos.
- **TK-2026-04228**: resuelto en 5,80 h (SLA 4 h) y editado a 3,80 h dos días después. Solo la bitácora lo revela.
- **83 cierres automáticos (44 %)** y **5 reaperturas** que debieron conservar el número.

Detalle y evidencia: [docs/HALLAZGOS.md](docs/HALLAZGOS.md).

## Nivel 2 · Reloj del proveedor

Aquí sí hay frontera de confianza: **dos organizaciones, un contrato y dinero**. Si el reloj lo llevara solo el municipio, el proveedor podría decir que lo manipuló; si lo llevara el proveedor, al revés. En `contracts/RelojProveedor.sol` cada parte firma solo lo suyo:

- `abrirCaso(casoId, proveedorId, apertura)`: solo el municipio (cuenta 0), una vez por caso.
- `responder(casoId, respuesta)`: solo la cuenta del proveedor de ese caso, una vez, y nunca antes de la apertura (`"Respuesta anterior a la apertura"`).
- `abrirCasos(...)` y `responderCasos(...)`: lo mismo por lote, con una sola firma. Mantienen todas las reglas; si un caso no cumple, se revierte el lote entero.
- `penalidad(casoId)`: centavos = máx(0, (respuesta − apertura) − SLA) × tarifa / 3600.

Los proveedores salen de `datos/proveedores.csv`: PV-01 firma con la cuenta 1 (SLA 6 h, 180 USD/h) y PV-02 con la cuenta 2 (SLA 4 h, 240 USD/h). Los ids van como keccak256; razón social, servicio, contrato y contacto no entran en la cadena.

| Caso | Horas | Penalidad del contrato | El CSV declaraba |
|---|---:|---:|---:|
| PVT-04226 | −1,42 | **Rechazado** | cumple, 0 USD |
| PVT-04244 y PVT-04326 | 11,30 | 954 USD cada uno | 954 USD |
| PVT-04288 y PVT-04367 | 7,90 | 342 USD cada uno | 342 USD |
| Otros 4 casos | 2,50 a 3,80 | 0 USD | 0 USD |
| **Total** | | **2.592 USD** | |

La vista **6 · Reloj del proveedor** (`#/proveedor`) tiene dos modos:

- **Sepolia (real)**, por defecto: **dos programas y dos billeteras distintas**. Esta vista solo muestra el rol del municipio; el proveedor responde desde otro programa, el **portal del proveedor**.
- **Modo local (simulación)**, el respaldo sin internet: los tres roles (municipio, proveedor 1 y auditor externo) con cuentas de Ganache del mismo servidor.

**Flujo real en Sepolia**

| Quién | Programa | Billetera | Qué hace |
|---|---|---|---|
| Municipio | Esta app, `npm.cmd start` (puerto 8080) | Su MetaMask, por ejemplo en Chrome | 1 «Preparar reloj en Sepolia»: despliega `RelojProveedor` y registra al proveedor 1 con la dirección del campo (por defecto `0x417502991342eAf1B71015b66D128B75D7a0fA67`). 2 «Firmar apertura de 9 casos»: una sola firma (`abrirCasos`). 3 «Enviar al proveedor»: copia el enlace al portal con `?contrato=0x…`. |
| Proveedor 1 | Portal del proveedor, `npm.cmd run proveedor` (puerto 8081), carpeta `portal-proveedor/` | **Otra** MetaMask, con su propia frase secreta, por ejemplo en Edge | «Conectar MetaMask» (dice si la cuenta es la del proveedor 1), aviso en naranja «Nuevos casos del municipio: 9 pendientes de tu respuesta», simulación de cada caso sin gas (PVT-04226 en rojo) y «Firmar respuestas»: un solo lote con los casos válidos (`responderCasos`). |

- El servidor del municipio valida el despliegue del reloj por RPC público, como en el Nivel 1: bytecode de `RelojProveedor` (salvo el inmutable `municipio`), argumentos del constructor (solo PV-01, con su SLA y tarifa), red y cuenta que desplegó. Solo entonces escribe `evidencias/reloj-sepolia.json`. El reloj anterior pasa a `evidencias/reloj-sepolia-historial/`. Cada arranque del servidor también lo archiva: la vista empieza en «Preparar reloj en Sepolia».
- La vista del municipio revisa Sepolia cada 5 segundos y se actualiza sola: estado de cada caso, horas, penalidad leída de `penalidad()`, PVT-04226 rechazado, total **2.592 USD** y enlaces a Etherscan de cada apertura y respuesta.
- El portal **no comparte estado** con el servidor del municipio: es un sitio estático (HTML, CSS y JS) que lee Sepolia por RPC público y firma con la MetaMask del proveedor. Las horas de respuesta salen del registro del propio proveedor (`portal-proveedor/casos-pv01.json`, una prueba comprueba que coinciden con `datos/tickets_proveedor.csv`).
- Si se conecta en el portal la cuenta del municipio u otra cualquiera, el portal explica que esa llave no puede responder, y no envía nada.

**Supuesto:** el SLA contractual se mide en horas corridas, no hábiles, porque así vienen los datos.

**Limitación del modo local:** las llaves del municipio y de los proveedores son cuentas de Ganache del mismo servidor. En el modo Sepolia, cada organización firma con su propia billetera y desde su propio programa.

## Contrato desplegado

`contracts/RegistroIndicador.sol` (Solidity 0.8.30, optimizador 200, EVM Shanghai). Acepta cualquier período AAAAMM, un sello por período, inmutable, solo del sellador. La regla de 187 tickets para julio vive en el verificador. Va precompilado en `contracts/RegistroIndicador.json`; una prueba recompila y comprueba que el bytecode no cambió.

| Red | Dirección |
|---|---|
| Sepolia (pública) | Cambia en cada período: se prepara con MetaMask antes de cada presentación y queda en `evidencias/red-sepolia.json` (los anteriores, en `evidencias/sepolia-historial/`) |
| Ganache local (respaldo) | `0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab`, chain ID 31337 (determinista; ver `evidencias/red-local.json`) |
| RelojProveedor, Nivel 2 en Sepolia | Se prepara con MetaMask desde la vista Reloj del proveedor y queda en `evidencias/reloj-sepolia.json` (los anteriores, en `evidencias/reloj-sepolia-historial/`) |
| RelojProveedor, Nivel 2 local (simulación) | En una instancia nueva, `0x5b1869D9A4C187F2EAa108f3062412ecf0526b24`. En una cadena creada antes del Nivel 2 la dirección cambia (primero se fondea la cuenta de PV-02); cada instancia la guarda en `evidencias/reloj-local.json` |

`contracts/RelojProveedor.sol` usa los mismos ajustes (Solidity 0.8.30, optimizador 200, Shanghai) y también va precompilado, con su prueba de bytecode.

## Publicado en Render

`render.yaml` describe el servicio: instala sin dependencias de desarrollo y arranca `node scripts/start.mjs` con `HOST=0.0.0.0` y el `PORT` de Render. Ganache corre dentro del mismo proceso y la página lo consulta por `/rpc`, que solo deja pasar lecturas y transacciones a los dos contratos configurados (el del Nivel 1 y el reloj del proveedor). En el plan gratis el disco no es persistente: tras un reinicio o una suspensión el contrato queda sin sellar y el reloj sin casos; se vuelven a cargar desde las vistas Sellar y Reloj del proveedor. En esta modalidad la sal se entrega a quien abra la página: sirve para la demo con datos sintéticos, no para datos reales.

El mismo `render.yaml` crea **dos servicios separados**, cada uno con su propia dirección web:

| Servicio | Tipo | Qué publica |
|---|---|---|
| `reto-03-indicador-recomputable` | Web (Node) | La app del municipio, igual que antes. |
| `portal-proveedor` | Sitio estático | Solo la carpeta `portal-proveedor/`. No tiene servidor ni API: el navegador del proveedor lee Sepolia por RPC público y firma con su MetaMask. |

La variable **`PORTAL_PROVEEDOR_URL`** del servicio del municipio ya viene en `render.yaml`: Render le pasa la dirección del sitio estático `portal-proveedor` y el servidor le agrega `https://`. Así «Enviar al proveedor» arma el enlace al portal publicado. Se puede reemplazar en Render → *Environment* con una dirección completa (por ejemplo, un dominio propio). Sin esa variable, como en el equipo con `npm.cmd start`, el enlace apunta a `http://127.0.0.1:8081/` (el portal con `npm.cmd run proveedor`).

En Render, el disco no es persistente y cada arranque empieza sin período: se prepara y se sella en vivo.

## Ancla en Sepolia con MetaMask

El municipio despliega y sella **desde la página, firmando con MetaMask**: la llave privada nunca sale de la billetera y no hace falta `.env`. El servidor no confía en el navegador: antes de guardar nada lo comprueba por un RPC público de solo lectura (por defecto `https://ethereum-sepolia-rpc.publicnode.com`; se cambia con `SEPOLIA_PUBLIC_RPC_URL`).

**Una sola vez:** instalar MetaMask, crear una cuenta **de prueba** para el municipio y pedir Sepolia ETH en un faucet (con 0,05 ETH sobra). Para la presentación la app corre en la computadora del municipio con `npm.cmd start`.

**Cada arranque empieza sin período.** Cada vez que arranca el servidor (`npm.cmd start`, en el equipo o en Render), el período activo de Sepolia (configuración y evidencia) pasa a `evidencias/sepolia-historial/` y el reloj del proveedor a `evidencias/reloj-sepolia-historial/`. No se borra nada: las sales siguen en `.secreto/`, una por contrato. Al abrir, Sellar dice «Sin período activo · prepara un nuevo período para sellar julio» y julio nunca aparece sellado: se sella en vivo. Mientras el servidor sigue encendido, recargar la página no pierde el período preparado en la sesión. Si el servidor se reinicia, hay que preparar y sellar un período nuevo.

La app abre en Sepolia. Si no hay internet, abre la red local. El selector de red está al final de **Administración**, como respaldo para emergencias. La dirección del contrato y su enlace a Etherscan se ven en Sellar (paso 2) y en el Panel.

**Sellar en vivo**, en la vista **Sellar** → **Administración**: siempre arriba del todo y abierta, con cuatro pasos que se habilitan en orden y se marcan con ✓:

1. **Conectar MetaMask**: muestra la cuenta, la red y si es la cuenta del municipio (owner del contrato).
2. **Preparar nuevo período en Sepolia**. MetaMask pide cambiar a Sepolia si hace falta y firmar el despliegue de `RegistroIndicador` (bytecode de `contracts/RegistroIndicador.json`, con el `rulesHash` de estas reglas). El servidor comprueba en la red pública que el código desplegado es `RegistroIndicador`, que el `rulesHash` es el correcto y que el owner es quien lo desplegó. Solo entonces escribe `evidencias/red-sepolia.json`. El período anterior pasa a `evidencias/sepolia-historial/`; no se borra.
3. **Cargar los originales entregados**.
4. **Sellar julio en blockchain**. Antes de firmar se comprueba que la cuenta de MetaMask sea el `owner()`; si no, se explica que solo el municipio puede sellar.

Lo que pasa por dentro:

- La sal secreta se genera en el navegador y se guarda en el servidor **antes** de firmar, en `.secreto/sal-sepolia-<dirección del contrato>.json` (un archivo por contrato, para que un período nuevo no choque con el anterior). Nunca va a la cadena ni a `evidencias/`. Tras el sello, el botón **Descargar sal secreta (respaldo)** guarda una copia.
- El servidor lee la transacción por RPC público, comprueba ancla, evidencia y sal, y guarda `evidencias/sello-sepolia.json` y el bloque del sello (`sealBlock`) en la configuración. La vista muestra «✓ Julio ya está sellado» y enlaces a sepolia.etherscan.io de la transacción y del contrato; la línea de red del Panel también enlaza el contrato.
- Recalcular, Verificar (incluida la edición manual del CSV que da ROJO), Comparar y Privacidad leen Sepolia por RPC público, sin MetaMask. Privacidad revisa la calldata y los eventos reales.

Opcional: con `SEPOLIA_MUNICIPIO=0x…` en el entorno del servidor, solo esa cuenta puede preparar períodos.

**Alternativa por script** (con llave en `.env`, sin MetaMask): `copy .env.example .env`, completar `SEPOLIA_RPC_URL` y `SELLADOR_PRIVATE_KEY`, y luego `npm.cmd run deploy:sepolia` (con `--nuevo` archiva el período anterior y despliega otro) y `npm.cmd run seal:sepolia`. Usa el mismo archivo de sal por contrato.

**Render y Sepolia:** en Render el disco no es persistente. Si se sella Sepolia desde Render, la sal (`.secreto/`) y la configuración se pierden al reiniciar el servicio: el sello sigue en Sepolia, pero ya nadie podría comprobar los tickets sin la sal. Por eso, para Sepolia, usar la app en la propia computadora y descargar siempre el respaldo de la sal.

**Verificar en otro equipo:** clonar el repositorio (trae `evidencias/red-sepolia.json` y `evidencias/sello-sepolia.json`) y copiar desde el equipo que selló la carpeta **`.secreto/`** completa, con el archivo `sal-sepolia-<dirección del contrato>.json`, a la raíz del proyecto. Luego `npm.cmd ci` y `npm.cmd start`: el servidor entrega la sal a su propia página y Verificar da VERDE leyendo Sepolia por RPC público, sin MetaMask. Sin esa carpeta, la verificación queda INCOMPLETA a propósito. La carpeta se copia a mano (USB, carpeta compartida): no se sube a git ni a ningún servicio público.

Sin internet, todo funciona igual en la red local. El reloj del proveedor usa siempre la red local.

## Delimitación

- **En cadena**, solo el indicador público: quien emite el número es el mismo que se mide con él. Van período, raíz Merkle, compromiso, cantidad, fecha y hash de reglas.
- **Fuera de cadena**: asignaciones, escalamientos, la bitácora y el contenido de los tickets. La operación interna se resuelve mejor con logs firmados. La bitácora y las reaperturas entran al sello solo por su SHA-256.
- **Sal secreta del manifiesto**: `evidencias/sello-original.json` es público y guarda un hash por ticket y por campo. Sin sal, bastaría una lista de nombres para saber quién reportó cada ticket. Por eso cada sello usa una sal aleatoria de 32 bytes: entra en cada hash junto con el ID del ticket, y el manifiesto solo lleva su compromiso (`saltCommitment`). La sal nunca va en `evidencias/` ni en la cadena. En la red local vive en `.instances/<instancia>/secreto/sal-202607.json`; en Sepolia, en `.secreto/sal-sepolia-<dirección del contrato>.json`, un archivo por contrato. Las dos rutas están en `.gitignore`. Quien verifica necesita la sal: el servidor local se la entrega a su propia página.
- **Reloj del proveedor (Nivel 2), implementado**: la segunda frontera de confianza. Dos organizaciones, un contrato y penalidades en dólares; cada parte firma con su llave.
- **Lo que la cadena no hace**: no prueba que los datos fueran verdaderos antes de sellarlos ni mejora los tiempos de respuesta. En el reloj, registra lo que cada parte firma y rechaza lo imposible, pero no sabe si la hora firmada es la real.

Láminas: [presentacion/](presentacion/).

## Estructura

```
contracts/   RegistroIndicador (Nivel 1) y RelojProveedor (Nivel 2), .sol y precompilado .json
src/         núcleo (core, findings, privacy, chain, reloj), interfaz (app, proveedor) y estilos
scripts/     servidor, auditoría, demo, presentación, Sepolia (sello y reloj) y láminas
portal-proveedor/  programa SEPARADO del proveedor (sitio estático y su servidor en el puerto 8081)
tests/       pruebas con node:test
datos/       los 11 archivos del organizador, intactos
docs/        DEMO, AUDITORIA, CALENDARIO, PROCEDENCIA, HALLAZGOS y referencia/ (PDF)
evidencias/  resultados de la auditoría y configuración de redes
```

## Documentación

- [docs/DEMO.md](docs/DEMO.md): guion de 5 minutos más 1 del Nivel 2, y preguntas del jurado.
- [docs/HALLAZGOS.md](docs/HALLAZGOS.md): las inconsistencias del lote y cómo las muestra la app.
- [docs/AUDITORIA.md](docs/AUDITORIA.md): resultado de la última auditoría automática.
- [docs/CALENDARIO.md](docs/CALENDARIO.md): supuesto de feriados y simulador.
- [docs/PROCEDENCIA.md](docs/PROCEDENCIA.md): huellas de los datos y corrección de TK-2026-04201.
- [docs/referencia/](docs/referencia/): brief del reto y manual MP-DMSI-INC-001.

Datos sintéticos. Fuera del alcance: controles del Nivel 3.
