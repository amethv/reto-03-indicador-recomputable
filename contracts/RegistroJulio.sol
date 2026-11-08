// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
/// @notice Nivel 1: no recibe tickets, nombres, descripciones ni IDs individuales.
contract RegistroJulio {
    address public immutable owner;
    bytes32 public immutable rulesHash;
    struct Seal { bytes32 root; bytes32 evidenceHash; uint32 count; uint64 timestamp; }
    mapping(uint32 => Seal) private seals;
    event Sealed(uint32 indexed period, bytes32 root, bytes32 evidenceHash, uint32 count);
    constructor(bytes32 rules) { owner = msg.sender; rulesHash = rules; }
    function seal(uint32 period, bytes32 root, bytes32 evidenceHash, uint32 count) external {
        require(msg.sender == owner, "Solo sellador");
        require(period == 202607 && count == 187, "Periodo o cantidad invalidos");
        require(seals[period].timestamp == 0, "Sello original inmutable");
        require(root != bytes32(0) && evidenceHash != bytes32(0), "Compromiso vacio");
        seals[period] = Seal(root, evidenceHash, count, uint64(block.timestamp));
        emit Sealed(period, root, evidenceHash, count);
    }
    function getSeal(uint32 period) external view returns (Seal memory) { return seals[period]; }
}