// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title OpenFeedRegistry
/// @notice Stores restorable feed recipes and their fork lineage. Content and reading history stay off-chain.
contract OpenFeedRegistry {
    struct Recipe {
        uint256 parentId;
        address creator;
        uint64 createdAt;
        string name;
        uint16[6] weightsBps;
        bytes32 contentManifestHash;
    }

    uint256 public recipeCount;
    mapping(uint256 => Recipe) private recipes;

    event RecipePublished(
        uint256 indexed recipeId,
        uint256 indexed parentId,
        address indexed creator,
        string name,
        uint16[6] weightsBps,
        bytes32 contentManifestHash
    );

    constructor() {
        bytes32 manifest = keccak256(bytes("unbubble-meme-culture-v1-2026-09-05"));
        uint16[6] memory bridge = [uint16(2800), 2400, 1800, 1600, 600, 800];
        uint16[6] memory sources = [uint16(2200), 1600, 2800, 1700, 900, 800];
        uint16[6] memory evidence = [uint16(2500), 1600, 1200, 3400, 500, 800];
        _storeRecipe(0, "Bridge Builder", bridge, manifest);
        _storeRecipe(0, "Source Explorer", sources, manifest);
        _storeRecipe(0, "Evidence First", evidence, manifest);
    }

    function publishRecipe(
        uint256 parentId,
        string calldata name,
        uint16[6] calldata weightsBps,
        bytes32 contentManifestHash
    ) external returns (uint256 recipeId) {
        require(bytes(name).length > 0 && bytes(name).length <= 80, "Invalid name");
        require(contentManifestHash != bytes32(0), "Empty manifest");
        if (parentId != 0) require(parentId <= recipeCount, "Unknown parent");

        uint256 total;
        for (uint256 index; index < 6; ++index) {
            total += weightsBps[index];
        }
        require(total == 10_000, "Weights must total 10000");

        recipeId = _storeRecipe(parentId, name, weightsBps, contentManifestHash);
    }

    function _storeRecipe(
        uint256 parentId,
        string memory name,
        uint16[6] memory weightsBps,
        bytes32 contentManifestHash
    ) internal returns (uint256 recipeId) {
        recipeId = ++recipeCount;
        recipes[recipeId] = Recipe({
            parentId: parentId,
            creator: msg.sender,
            createdAt: uint64(block.timestamp),
            name: name,
            weightsBps: weightsBps,
            contentManifestHash: contentManifestHash
        });

        emit RecipePublished(recipeId, parentId, msg.sender, name, weightsBps, contentManifestHash);
    }

    function getRecipe(uint256 recipeId) external view returns (Recipe memory) {
        require(recipeId > 0 && recipeId <= recipeCount, "Unknown recipe");
        return recipes[recipeId];
    }
}
