# Reto 03 · El indicador que nadie puede recalcular

Nivel 1 del caso San Ramón de Altamira. Un **sellador** ancla en blockchain el compromiso de los 187 tickets de julio de 2026 y un **verificador** en el navegador recalcula el indicador desde lo sellado, sin pedirle el número a nadie.

**Publicado 98,25 % · solo confirmados por el usuario 55,61 %.**

Repositorio público: pendiente de publicar.

## Requisitos

- Node.js 22 o superior (`node.exe` en el PATH) y npm.
- Un navegador moderno. La auditoría automática usa Microsoft Edge.

## Cómo correrlo

```powershell
npm.cmd ci --no-audit --no-fund
npm.cmd start
```

Abrir http://127.0.0.1:8080 (no abrir `src/index.html` con `file://`). En Windows también sirve doble clic en `INICIAR_APP.cmd`. La primera ejecución despliega el contrato en una EVM local (Ganache, chain ID 31337) sin sellar: pulsar **Cargar los originales entregados** y **Sellar julio en blockchain**. El estado vive en `.instances/nivel1-v3/`.

Para una demostración desde cero (contrato sin sellar en una instancia nueva): `npm.cmd run demo` o `INICIAR_DEMO.cmd`. Guion en [docs/DEMO.md](docs/DEMO.md).

| Comando | Qué hace |
|---|---|
| `npm.cmd test` | 47 pruebas: núcleo, hallazgos, contrato, privacidad, Sepolia ensayado en Ganache |
| `npm.cmd run verify:source` | Compara los 11 archivos de `datos/` con sus SHA-256 |
| `npm.cmd run audit` | Los cinco criterios en Edge sobre la cadena real; escribe `docs/AUDITORIA.md` y `evidencias/` |
| `npm.cmd run slides` | Regenera las láminas de `presentacion/` |
| `npm.cmd run deploy:sepolia` / `seal:sepolia` | Ancla pública (ver abajo) |

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

## Contrato desplegado

`contracts/RegistroIndicador.sol` (Solidity 0.8.30, optimizador 200, EVM Shanghai). Acepta cualquier período AAAAMM, un sello por período, inmutable, solo del sellador. La regla de 187 tickets para julio vive en el verificador.

| Red | Dirección |
|---|---|
| Sepolia (pública) | **Pendiente**: se completa en `evidencias/red-sepolia.json` al correr los scripts |
| Ganache local (respaldo) | `0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab`, chain ID 31337 (determinista; ver `evidencias/red-local.json`) |

## Ancla en Sepolia

El municipio sella con un script; el navegador solo lee por un RPC público, sin wallet ni credenciales.

1. Crear una wallet **de prueba** solo para esto (por ejemplo una cuenta nueva en MetaMask) y copiar su llave privada. No usar una wallet con fondos reales.
2. Pedir Sepolia ETH para esa dirección en un faucet (por ejemplo el de Google Cloud Web3 o el de Alchemy). Con 0,05 ETH sobra.
3. Conseguir una URL de RPC de Sepolia (Alchemy, Infura u otro) y, si se quiere verificar el código en Etherscan, una API key de etherscan.io.
4. `copy .env.example .env` y completar `SEPOLIA_RPC_URL`, `SELLADOR_PRIVATE_KEY` y, opcional, `ETHERSCAN_API_KEY`. `.env` está en `.gitignore`.
5. `npm.cmd run deploy:sepolia` → escribe `evidencias/red-sepolia.json` con dirección, transacción y enlaces a https://sepolia.etherscan.io/.
6. `npm.cmd run seal:sepolia` → sella julio, comprueba el ancla y escribe `evidencias/sello-sepolia.json`.
7. `npm.cmd start` y elegir **Pública (Sepolia)** en el selector de red.

Sin internet, la demo funciona igual en la red local.

## Delimitación

- **En cadena**, solo el indicador público: quien emite el número es el mismo que se mide con él. Van período, raíz Merkle, compromiso, cantidad, fecha y hash de reglas.
- **Fuera de cadena**: asignaciones, escalamientos, la bitácora y el contenido de los tickets. La operación interna se resuelve mejor con logs firmados. La bitácora y las reaperturas entran al sello solo por su SHA-256.
- **Lo que la cadena no hace**: no prueba que los datos fueran verdaderos antes de sellarlos ni mejora los tiempos de respuesta. La frontera futura es el reloj compartido con el proveedor de Nivel 3, que no se implementa.

Láminas: [presentacion/](presentacion/).

## Estructura

```
contracts/   contrato RegistroIndicador
src/         núcleo (core, findings, privacy, chain), interfaz y estilos
scripts/     servidor, auditoría, demo, Sepolia y láminas
tests/       pruebas con node:test
datos/       los 11 archivos del organizador, intactos
docs/        DEMO, AUDITORIA, CALENDARIO, PROCEDENCIA, HALLAZGOS y referencia/ (PDF)
evidencias/  resultados de la auditoría y configuración de redes
```

## Documentación

- [docs/DEMO.md](docs/DEMO.md): guion de 5 minutos y preguntas del jurado.
- [docs/HALLAZGOS.md](docs/HALLAZGOS.md): las inconsistencias del lote y cómo las muestra la app.
- [docs/AUDITORIA.md](docs/AUDITORIA.md): resultado de la última auditoría automática.
- [docs/CALENDARIO.md](docs/CALENDARIO.md): supuesto de feriados y simulador.
- [docs/PROCEDENCIA.md](docs/PROCEDENCIA.md): huellas de los datos y corrección de TK-2026-04201.
- [docs/referencia/](docs/referencia/): brief del reto y manual MP-DMSI-INC-001.

Datos sintéticos. Fuera del alcance: penalidades y firmas del proveedor (Nivel 2) y controles del Nivel 3.
