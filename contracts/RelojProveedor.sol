// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title Reloj del proveedor (Nivel 2)
/// @notice El municipio firma la apertura de cada caso y el proveedor firma su respuesta,
///         cada uno con su propia cuenta. Cualquiera puede recalcular el tiempo y la penalidad
///         leyendo los eventos, sin llaves.
/// @dev Supuesto declarado: el SLA contractual se mide en horas corridas (reloj de pared),
///      no en horas hábiles, porque así vienen los datos de tickets_proveedor.csv.
///      En la cadena solo hay identificadores hasheados (keccak256 del id), cuentas, segundos
///      y tarifas: ningún nombre, contacto, razón social ni descripción.
contract RelojProveedor {
    address public immutable municipio;

    struct Proveedor { address cuenta; uint64 slaSegundos; uint64 tarifaCentavosPorHora; }
    struct Caso { bytes32 proveedorId; uint64 apertura; uint64 respuesta; bool abierto; bool respondido; }

    mapping(bytes32 => Proveedor) public proveedores;
    mapping(bytes32 => Caso) public casos;

    event ProveedorRegistrado(bytes32 indexed proveedorId, address cuenta, uint64 slaSegundos, uint64 tarifaCentavosPorHora);
    event CasoAbierto(bytes32 indexed casoId, bytes32 indexed proveedorId, uint64 apertura);
    event CasoRespondido(bytes32 indexed casoId, uint64 respuesta);

    /// @param ids keccak256 del id del proveedor (por ejemplo "PV-01").
    /// @param cuentas Cuenta con la que firma cada proveedor.
    /// @param slaSegundos SLA contractual en segundos corridos.
    /// @param tarifas Penalidad en centavos de USD por hora de retraso.
    constructor(bytes32[] memory ids, address[] memory cuentas, uint64[] memory slaSegundos, uint64[] memory tarifas) {
        require(ids.length > 0 && ids.length == cuentas.length && ids.length == slaSegundos.length && ids.length == tarifas.length, "Proveedores invalidos");
        municipio = msg.sender;
        for (uint256 i = 0; i < ids.length; i++) {
            require(ids[i] != bytes32(0) && cuentas[i] != address(0) && cuentas[i] != msg.sender, "Proveedor invalido");
            require(proveedores[ids[i]].cuenta == address(0), "Proveedor duplicado");
            proveedores[ids[i]] = Proveedor(cuentas[i], slaSegundos[i], tarifas[i]);
            emit ProveedorRegistrado(ids[i], cuentas[i], slaSegundos[i], tarifas[i]);
        }
    }

    /// @notice Solo el municipio, una vez por caso.
    function abrirCaso(bytes32 casoId, bytes32 proveedorId, uint64 apertura) external {
        _abrir(casoId, proveedorId, apertura);
    }

    /// @notice Lote: el municipio abre varios casos con una sola firma. Mismas reglas que abrirCaso;
    ///         si un caso no cumple, se revierte el lote entero.
    function abrirCasos(bytes32[] calldata casoIds, bytes32[] calldata proveedorIds, uint64[] calldata aperturas) external {
        require(casoIds.length > 0 && casoIds.length == proveedorIds.length && casoIds.length == aperturas.length, "Lote invalido");
        for (uint256 i = 0; i < casoIds.length; i++) _abrir(casoIds[i], proveedorIds[i], aperturas[i]);
    }

    /// @notice Solo la cuenta del proveedor de ese caso, una vez.
    function responder(bytes32 casoId, uint64 respuesta) external {
        _responder(casoId, respuesta);
    }

    /// @notice Lote: el proveedor responde varios casos con una sola firma. Mismas reglas que responder;
    ///         si un caso no cumple, se revierte el lote entero.
    function responderCasos(bytes32[] calldata casoIds, uint64[] calldata respuestas) external {
        require(casoIds.length > 0 && casoIds.length == respuestas.length, "Lote invalido");
        for (uint256 i = 0; i < casoIds.length; i++) _responder(casoIds[i], respuestas[i]);
    }

    function _abrir(bytes32 casoId, bytes32 proveedorId, uint64 apertura) private {
        require(msg.sender == municipio, "Solo el municipio abre casos");
        require(casoId != bytes32(0), "Caso invalido");
        require(proveedores[proveedorId].cuenta != address(0), "Proveedor desconocido");
        require(!casos[casoId].abierto, "Caso ya abierto");
        casos[casoId] = Caso(proveedorId, apertura, 0, true, false);
        emit CasoAbierto(casoId, proveedorId, apertura);
    }

    function _responder(bytes32 casoId, uint64 respuesta) private {
        Caso storage caso = casos[casoId];
        require(caso.abierto, "Caso no abierto");
        require(msg.sender == proveedores[caso.proveedorId].cuenta, "Solo el proveedor del caso responde");
        require(!caso.respondido, "Caso ya respondido");
        require(respuesta >= caso.apertura, "Respuesta anterior a la apertura");
        caso.respuesta = respuesta;
        caso.respondido = true;
        emit CasoRespondido(casoId, respuesta);
    }

    /// @notice Centavos = max(0, (respuesta - apertura) - sla) * tarifa / 3600.
    function penalidad(bytes32 casoId) external view returns (uint256) {
        Caso storage caso = casos[casoId];
        require(caso.respondido, "Caso sin respuesta");
        Proveedor storage p = proveedores[caso.proveedorId];
        uint256 duracion = caso.respuesta - caso.apertura;
        if (duracion <= p.slaSegundos) return 0;
        return (duracion - p.slaSegundos) * p.tarifaCentavosPorHora / 3600;
    }
}
