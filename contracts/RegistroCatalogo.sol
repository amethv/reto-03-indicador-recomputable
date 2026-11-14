// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title Registro del catálogo de servicios (Nivel 3 · Catálogo y SLA anclados)
/// @notice El municipio ancla, al inicio del período, el catálogo de servicios con la prioridad y el
///         SLA de cada uno, más el SHA-256 del CSV completo. Es inmutable: no hay ninguna función
///         para modificarlo, y un segundo anclaje del mismo período se rechaza. Así nadie puede
///         reclasificar un servicio a una prioridad más laxa después de haber incumplido.
/// @dev El catálogo es público y no tiene datos personales: los ids van en texto (bytes32).
///      Prioridad: 1 CRITICA, 2 ALTA, 3 MEDIA, 4 BAJA. SLA en horas hábiles.
contract RegistroCatalogo {
    address public immutable owner;

    struct Servicio { uint8 prioridad; uint16 slaHoras; bool existe; }
    struct Catalogo { bytes32 csvSha256; uint64 timestamp; uint16 cantidad; }

    mapping(uint32 => Catalogo) private catalogos;
    mapping(uint32 => bytes32[]) private ids;
    mapping(uint32 => mapping(bytes32 => Servicio)) private servicios;

    event CatalogoAnclado(uint32 indexed periodo, bytes32 csvSha256, uint16 cantidad);
    event ServicioAnclado(uint32 indexed periodo, bytes32 indexed servicioId, uint8 prioridad, uint16 slaHoras);

    constructor() {
        owner = msg.sender;
    }

    /// @notice Solo el municipio, una sola vez por período (AAAAMM).
    function anclarCatalogo(uint32 periodo, bytes32 csvSha256, bytes32[] calldata servicioIds, uint8[] calldata prioridades, uint16[] calldata slaHoras) external {
        require(msg.sender == owner, "Solo el municipio ancla el catalogo");
        require(catalogos[periodo].timestamp == 0, unicode"Catálogo ya anclado: no se puede reclasificar");
        require(periodo >= 200001 && periodo <= 999912 && periodo % 100 >= 1 && periodo % 100 <= 12, "Periodo invalido");
        require(csvSha256 != bytes32(0), "Hash del CSV invalido");
        require(servicioIds.length > 0 && servicioIds.length <= 500 && servicioIds.length == prioridades.length && servicioIds.length == slaHoras.length, "Lote invalido");
        for (uint256 i = 0; i < servicioIds.length; i++) {
            bytes32 id = servicioIds[i];
            require(id != bytes32(0), "Servicio invalido");
            require(prioridades[i] >= 1 && prioridades[i] <= 4, "Prioridad invalida");
            require(slaHoras[i] > 0, "SLA invalido");
            require(!servicios[periodo][id].existe, "Servicio duplicado");
            servicios[periodo][id] = Servicio(prioridades[i], slaHoras[i], true);
            ids[periodo].push(id);
            emit ServicioAnclado(periodo, id, prioridades[i], slaHoras[i]);
        }
        catalogos[periodo] = Catalogo(csvSha256, uint64(block.timestamp), uint16(servicioIds.length));
        emit CatalogoAnclado(periodo, csvSha256, uint16(servicioIds.length));
    }

    /// @notice Hash del CSV, fecha del anclaje (0 si no está anclado) y cantidad de servicios.
    function catalogo(uint32 periodo) external view returns (bytes32 csvSha256, uint64 timestamp, uint16 cantidad) {
        Catalogo storage c = catalogos[periodo];
        return (c.csvSha256, c.timestamp, c.cantidad);
    }

    /// @notice Prioridad y SLA anclados de un servicio.
    function servicio(uint32 periodo, bytes32 servicioId) external view returns (uint8 prioridad, uint16 slaHoras, bool existe) {
        Servicio storage s = servicios[periodo][servicioId];
        return (s.prioridad, s.slaHoras, s.existe);
    }

    /// @notice Todos los servicios anclados del período, en el orden del CSV.
    function serviciosDe(uint32 periodo) external view returns (bytes32[] memory servicioIds, uint8[] memory prioridades, uint16[] memory slaHoras) {
        bytes32[] storage lista = ids[periodo];
        servicioIds = new bytes32[](lista.length);
        prioridades = new uint8[](lista.length);
        slaHoras = new uint16[](lista.length);
        for (uint256 i = 0; i < lista.length; i++) {
            Servicio storage s = servicios[periodo][lista[i]];
            servicioIds[i] = lista[i];
            prioridades[i] = s.prioridad;
            slaHoras[i] = s.slaHoras;
        }
    }
}
