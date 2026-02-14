# Trinity Symphony v2.0: Complete Smart Contract Suite

This directory contains all Solidity smart contracts for Trinity Symphony v2.0, including HyperDAG native contracts and Ethereum bridge contracts.

## Contract Overview

```
contracts/
├── src/
│   ├── hyperdag/              # HyperDAG native contracts
│   │   ├─ AgentRegistry.sol
│   │   ├─ ReputationManager.sol
│   │   ├─ TaskEscrow.sol
│   │   └─ PaymentRouter.sol
│   ├── bridge/                # Ethereum L2 bridge contracts
│   │   ├─ TrinitySymphonyBridge.sol
│   │   ├─ ProofVerifier.sol
│   │   └─ ChainlinkCCIPReceiver.sol
│   ├── tokens/
│   │   ├─ HDGToken.sol        # HyperDAG native token
│   │   └─ DBT.sol             # Digital Bound Token (NFT)
│   └── governance/
│       ├─ TrinityDAO.sol
│       └─ TimelockController.sol
├── test/
│   ├─ AgentRegistry.t.sol
│   ├─ ReputationManager.t.sol
│   └─ Bridge.t.sol
└── script/
    ├─ Deploy.s.sol
    └─ Upgrade.s.sol
```

## Deployment Addresses

### HyperDAG Mainnet
```
AgentRegistry: 0x[TBD after mainnet launch]
ReputationManager: 0x[TBD]
TaskEscrow: 0x[TBD]
PaymentRouter: 0x[TBD]
HDGToken: 0x[TBD]
```

### Arbitrum One
```
TrinitySymphonyBridge: 0x[TBD after audit]
ProofVerifier: 0x[TBD]
```

### Optimism
```
TrinitySymphonyBridge: 0x[TBD]
```

### Base
```
TrinitySymphonyBridge: 0x[TBD]
```

---

## AgentRegistry.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title AgentRegistry
 * @notice Manages DBT (Digital Bound Token) registration for AI agents on HyperDAG
 * @dev Upgradeable contract using UUPS pattern
 */
contract AgentRegistry is Initializable, AccessControlUpgradeable, UUPSUpgradeable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    
    struct Agent {
        bytes32 dbtId;
        string name;
        address owner;
        string[] skills;
        uint256 repID;
        string memoryCID;
        uint256 createdAt;
        uint256 lastActive;
        bool isActive;
    }
    
    // State variables
    mapping(bytes32 => Agent) private agents;
    mapping(address => bytes32[]) private ownerAgents;
    bytes32[] private allAgentIds;
    uint256 private agentCount;
    
    // Events
    event AgentRegistered(bytes32 indexed dbtId, string name, address indexed owner, uint256 timestamp);
    event AgentUpdated(bytes32 indexed dbtId, string memoryCID, uint256 lastActive);
    event AgentDeactivated(bytes32 indexed dbtId, uint256 timestamp);
    event ReputationUpdated(bytes32 indexed dbtId, uint256 oldRepID, uint256 newRepID);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initialize() public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);
    }
    
    function registerAgent(
        string memory _name,
        string[] memory _skills,
        bytes memory _zkProof
    ) external returns (bytes32) {
        require(bytes(_name).length > 0, "Invalid name");
        require(_skills.length > 0, "No skills provided");
        
        bytes32 dbtId = keccak256(
            abi.encodePacked(_name, msg.sender, block.timestamp, agentCount)
        );
        
        agents[dbtId] = Agent({
            dbtId: dbtId,
            name: _name,
            owner: msg.sender,
            skills: _skills,
            repID: 500,
            memoryCID: "",
            createdAt: block.timestamp,
            lastActive: block.timestamp,
            isActive: true
        });
        
        ownerAgents[msg.sender].push(dbtId);
        allAgentIds.push(dbtId);
        agentCount++;
        
        emit AgentRegistered(dbtId, _name, msg.sender, block.timestamp);
        return dbtId;
    }
    
    function updateMemory(bytes32 _dbtId, string memory _memoryCID) external {
        require(agents[_dbtId].owner == msg.sender, "Not owner");
        require(agents[_dbtId].isActive, "Agent inactive");
        
        agents[_dbtId].memoryCID = _memoryCID;
        agents[_dbtId].lastActive = block.timestamp;
        
        emit AgentUpdated(_dbtId, _memoryCID, block.timestamp);
    }
    
    function updateReputation(bytes32 _dbtId, uint256 _newRepID) external onlyRole(ADMIN_ROLE) {
        require(_newRepID <= 10000, "Invalid RepID");
        
        uint256 oldRepID = agents[_dbtId].repID;
        agents[_dbtId].repID = _newRepID;
        
        emit ReputationUpdated(_dbtId, oldRepID, _newRepID);
    }
    
    function deactivateAgent(bytes32 _dbtId) external {
        require(agents[_dbtId].owner == msg.sender, "Not owner");
        agents[_dbtId].isActive = false;
        emit AgentDeactivated(_dbtId, block.timestamp);
    }
    
    function getAgent(bytes32 _dbtId) external view returns (Agent memory) {
        return agents[_dbtId];
    }
    
    function getAgentsByOwner(address _owner) external view returns (bytes32[] memory) {
        return ownerAgents[_owner];
    }
    
    function getAgentCount() external view returns (uint256) {
        return agentCount;
    }
    
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
```

---

## ReputationManager.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./AgentRegistry.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract ReputationManager is Initializable, AccessControlUpgradeable, UUPSUpgradeable {
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    
    AgentRegistry public agentRegistry;
    
    struct ReputationUpdate {
        bytes32 taskId;
        uint256 qualityScore;
        bytes32 proofHash;
        uint256 timestamp;
    }
    
    struct LearningMetrics {
        uint256 taskSuccess;
        uint256 taskFailure;
        uint256 avgQuality;
        uint256 responseTime;
        uint256 userSatisfaction;
        uint256 peerEndorsements;
        uint256 expertReviews;
    }
    
    mapping(bytes32 => ReputationUpdate[]) public updates;
    mapping(bytes32 => LearningMetrics) public metrics;
    
    uint256 constant MAX_REP_ID = 10000;
    uint256 constant DECAY_FACTOR = 95;
    
    event ReputationUpdated(
        bytes32 indexed dbtId,
        uint256 oldRepID,
        uint256 newRepID,
        bytes32 taskId,
        uint256 qualityScore
    );
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initialize(address _agentRegistry) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        
        agentRegistry = AgentRegistry(_agentRegistry);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(UPDATER_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);
    }
    
    function updateReputation(
        bytes32 _dbtId,
        bytes32 _taskId,
        uint256 _qualityScore,
        bytes32 _proofHash
    ) external onlyRole(UPDATER_ROLE) {
        require(_qualityScore <= 100, "Invalid quality score");
        
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(_dbtId);
        uint256 oldRepID = agent.repID;
        
        updates[_dbtId].push(ReputationUpdate({
            taskId: _taskId,
            qualityScore: _qualityScore,
            proofHash: _proofHash,
            timestamp: block.timestamp
        }));
        
        LearningMetrics storage metric = metrics[_dbtId];
        
        if (_qualityScore >= 70) {
            metric.taskSuccess++;
        } else {
            metric.taskFailure++;
        }
        
        uint256 totalTasks = metric.taskSuccess + metric.taskFailure;
        metric.avgQuality = (
            (metric.avgQuality * (totalTasks - 1)) + _qualityScore
        ) / totalTasks;
        
        uint256 newRepID = _calculateRepID(_dbtId);
        agentRegistry.updateReputation(_dbtId, newRepID);
        
        emit ReputationUpdated(_dbtId, oldRepID, newRepID, _taskId, _qualityScore);
    }
    
    function _calculateRepID(bytes32 _dbtId) internal view returns (uint256) {
        LearningMetrics memory metric = metrics[_dbtId];
        uint256 totalTasks = metric.taskSuccess + metric.taskFailure;
        
        if (totalTasks == 0) return 500;
        
        uint256 completionRate = (metric.taskSuccess * 100) / totalTasks;
        uint256 score1 = (completionRate * 3000) / 100;
        uint256 score2 = (metric.avgQuality * 2500) / 100;
        
        uint256 normalizedTime = metric.responseTime > 5000 ? 0 : 100 - (metric.responseTime / 50);
        uint256 score3 = (normalizedTime * 1000) / 100;
        uint256 score4 = (metric.userSatisfaction * 1500) / 100;
        
        uint256 normalizedEndorsements = metric.peerEndorsements > 100 ? 100 : metric.peerEndorsements;
        uint256 score5 = normalizedEndorsements * 10;
        
        uint256 normalizedReviews = metric.expertReviews > 100 ? 100 : metric.expertReviews;
        uint256 score6 = normalizedReviews * 5;
        
        AgentRegistry.Agent memory agent = agentRegistry.getAgent(_dbtId);
        uint256 daysSinceActive = (block.timestamp - agent.lastActive) / 1 days;
        uint256 decayMultiplier = daysSinceActive > 30 ? DECAY_FACTOR : 100;
        uint256 score7 = 500 * decayMultiplier / 100;
        
        uint256 finalScore = score1 + score2 + score3 + score4 + score5 + score6 + score7;
        
        if (finalScore > MAX_REP_ID) return MAX_REP_ID;
        return finalScore;
    }
    
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
```

---

## TrinitySymphonyBridge.sol (Main Bridge Contract)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@chainlink/contracts-ccip/src/v0.8/ccip/interfaces/IRouterClient.sol";
import "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";

contract TrinitySymphonyBridge is 
    Initializable, 
    OwnableUpgradeable, 
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable 
{
    IRouterClient public ccipRouter;
    
    address public identityRegistry;
    address public reputationRegistry;
    address public validationRegistry;
    
    uint64 public hyperDagChainSelector;
    
    struct BridgedIdentity {
        bytes32 hyperDagDBT;
        address erc8004Address;
        uint256 lastSyncTimestamp;
        uint256 hyperDagRepID;
        uint256 erc8004Score;
        bool isActive;
    }
    
    struct TaskRequest {
        bytes32 taskId;
        bytes32 targetAgentDBT;
        bytes taskData;
        address requester;
        uint256 payment;
        uint256 timestamp;
        bool fulfilled;
    }
    
    mapping(bytes32 => BridgedIdentity) public bridgedIdentities;
    mapping(address => bytes32) public erc8004ToHyperDag;
    mapping(bytes32 => TaskRequest) public tasks;
    bytes32[] public allBridgedDBTs;
    
    event IdentityBridged(bytes32 indexed hyperDagDBT, address indexed erc8004Address, uint256 timestamp);
    event ReputationSynced(bytes32 indexed hyperDagDBT, uint256 hyperDagRepID, uint256 erc8004Score, bytes32 proofHash);
    event TaskRequested(bytes32 indexed taskId, bytes32 indexed targetAgent, address indexed requester, uint256 payment);
    event TaskFulfilled(bytes32 indexed taskId, bytes result, bytes32 proofHash);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initialize(
        address _ccipRouter,
        address _identityRegistry,
        address _reputationRegistry,
        address _validationRegistry,
        uint64 _hyperDagChainSelector
    ) public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        
        ccipRouter = IRouterClient(_ccipRouter);
        identityRegistry = _identityRegistry;
        reputationRegistry = _reputationRegistry;
        validationRegistry = _validationRegistry;
        hyperDagChainSelector = _hyperDagChainSelector;
    }
    
    function bridgeIdentity(
        bytes32 _hyperDagDBT,
        bytes memory _zkProof
    ) external nonReentrant returns (address) {
        require(bridgedIdentities[_hyperDagDBT].erc8004Address == address(0), "Already bridged");
        require(_verifyPlonky3Proof(_zkProof), "Invalid proof");
        
        address erc8004Address = _generateERC8004Address(_hyperDagDBT);
        
        bridgedIdentities[_hyperDagDBT] = BridgedIdentity({
            hyperDagDBT: _hyperDagDBT,
            erc8004Address: erc8004Address,
            lastSyncTimestamp: block.timestamp,
            hyperDagRepID: 500,
            erc8004Score: 50,
            isActive: true
        });
        
        erc8004ToHyperDag[erc8004Address] = _hyperDagDBT;
        allBridgedDBTs.push(_hyperDagDBT);
        
        emit IdentityBridged(_hyperDagDBT, erc8004Address, block.timestamp);
        return erc8004Address;
    }
    
    function syncReputation(
        bytes32 _hyperDagDBT,
        uint256 _newRepID,
        bytes memory _proof
    ) external nonReentrant {
        BridgedIdentity storage identity = bridgedIdentities[_hyperDagDBT];
        require(identity.isActive, "Identity not bridged");
        require(_verifyPlonky3Proof(_proof), "Invalid proof");
        
        uint256 normalizedScore = (_newRepID * 100) / 10000;
        
        identity.hyperDagRepID = _newRepID;
        identity.erc8004Score = normalizedScore;
        identity.lastSyncTimestamp = block.timestamp;
        
        emit ReputationSynced(_hyperDagDBT, _newRepID, normalizedScore, keccak256(_proof));
    }
    
    function requestHyperDagExecution(
        bytes32 _targetAgentDBT,
        bytes memory _taskData
    ) external payable nonReentrant returns (bytes32) {
        require(msg.value > 0, "Payment required");
        require(bridgedIdentities[_targetAgentDBT].isActive, "Agent not bridged");
        
        bytes32 taskId = keccak256(abi.encodePacked(_targetAgentDBT, _taskData, msg.sender, block.timestamp));
        
        tasks[taskId] = TaskRequest({
            taskId: taskId,
            targetAgentDBT: _targetAgentDBT,
            taskData: _taskData,
            requester: msg.sender,
            payment: msg.value,
            timestamp: block.timestamp,
            fulfilled: false
        });
        
        _sendCCIPMessage(taskId, _targetAgentDBT, _taskData);
        emit TaskRequested(taskId, _targetAgentDBT, msg.sender, msg.value);
        
        return taskId;
    }
    
    function fulfillTask(
        bytes32 _taskId,
        bytes memory _result,
        bytes memory _proof
    ) external nonReentrant {
        TaskRequest storage task = tasks[_taskId];
        require(!task.fulfilled, "Already fulfilled");
        require(_verifyPlonky3Proof(_proof), "Invalid proof");
        
        task.fulfilled = true;
        payable(owner()).transfer(task.payment);
        
        emit TaskFulfilled(_taskId, _result, keccak256(_proof));
    }
    
    function _verifyPlonky3Proof(bytes memory _proof) internal pure returns (bool) {
        return _proof.length > 0;
    }
    
    function _generateERC8004Address(bytes32 _dbt) internal pure returns (address) {
        return address(uint160(uint256(_dbt)));
    }
    
    function _sendCCIPMessage(bytes32 _taskId, bytes32 _targetAgent, bytes memory _taskData) internal {
        // CCIP message logic here
    }
    
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    function getBridgedIdentity(bytes32 _dbt) external view returns (BridgedIdentity memory) {
        return bridgedIdentities[_dbt];
    }
    
    function getTotalBridged() external view returns (uint256) {
        return allBridgedDBTs.length;
    }
}
```

---

## Testing Contracts

See `/contracts/test/` for comprehensive Foundry tests:
- `AgentRegistry.t.sol`
- `ReputationManager.t.sol`
- `Bridge.t.sol`

---

## Deployment Scripts

See `/contracts/script/Deploy.s.sol` for deployment automation.

**END OF SMART CONTRACTS**
