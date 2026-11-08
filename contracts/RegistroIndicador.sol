// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title Registro del indicador mensual de la mesa de ayuda
/// @notice Solo recibe compromisos: período, raíz Merkle, hash del manifiesto y cantidad.
///         Nunca recibe tickets, nombres, descripciones ni IDs individuales.
/// @dev La regla del reto (187 tickets en julio de 2026) vive en el verificador, no aquí.
contract RegistroIndicador {
    address public immutable owner;
    bytes32 public immutable rulesHash;

    struct Seal { bytes32 root; bytes32 evidenceHash; uint32 count; uint64 timestamp; }
    mapping(uint32 => Seal) private seals;

    event Sealed(uint32 indexed period, bytes32 root, bytes32 evidenceHash, uint32 count);

    constructor(bytes32 rules) { owner = msg.sender; rulesHash = rules; }

    /// @param period Período AAAAMM, por ejemplo 202607.
    function seal(uint32 period, bytes32 root, bytes32 evidenceHash, uint32 count) external {
        require(msg.sender == owner, "Solo sellador");
        uint32 month = period % 100;
        require(period >= 200001 && period <= 999912 && month >= 1 && month <= 12, "Periodo AAAAMM invalido");
        require(count > 0, "Cantidad vacia");
        require(seals[period].timestamp == 0, "Sello original inmutable");
        require(root != bytes32(0) && evidenceHash != bytes32(0), "Compromiso vacio");
        seals[period] = Seal(root, evidenceHash, count, uint64(block.timestamp));
        emit Sealed(period, root, evidenceHash, count);
    }

    function getSeal(uint32 period) external view returns (Seal memory) { return seals[period]; }
}
