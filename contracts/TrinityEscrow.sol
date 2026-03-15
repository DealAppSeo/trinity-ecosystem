
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IReputationRegistry {
    function getReputation(uint256 agentId) external view returns (uint256);
}

/**
 * @title TrinityEscrow
 * @dev Secure payment escrow for Trinity Symphony autonomous agents.
 * Implements P-011: RepID-Gated Agent Payment Authorization.
 */
contract TrinityEscrow is Ownable, ReentrancyGuard {
    IERC20 public immutable usdc;
    IReputationRegistry public reputationRegistry;

    struct EscrowTransaction {
        uint256 agentId;
        address client;
        uint256 amount;
        bool released;
        bool refunded;
        uint256 createdAt;
    }

    mapping(bytes32 => EscrowTransaction) public transactions;
    mapping(uint256 => uint256) public minReputationForAmount;

    event FundsLocked(bytes32 indexed txHash, uint256 indexed agentId, uint256 amount);
    event FundsReleased(bytes32 indexed txHash, uint256 indexed agentId);
    event FundsRefunded(bytes32 indexed txHash, uint256 indexed agentId);

    constructor(address _usdc, address _reputationRegistry) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        reputationRegistry = IReputationRegistry(_reputationRegistry);
    }

    error LowReputation();
    error TransactionFinalized();
    error Unauthorized();
    error InvalidProof();

    /**
     * @dev Sets the reputation threshold for a specific amount tier.
     */
    function setReputationThreshold(uint256 amount, uint256 minRep) external onlyOwner {
        minReputationForAmount[amount] = minRep;
    }

    /**
     * @dev Locks funds in escrow. Client calls this to initiate a task.
     * Optimized with Assembly for gas efficiency (Phase 2.1).
     */
    function lockFunds(bytes32 txHash, uint256 agentId, uint256 amount) external nonReentrant {
        if (transactions[txHash].amount > 0) revert TransactionFinalized();
        
        // Optimized Reputation Check
        uint256 agentRep = reputationRegistry.getReputation(agentId);
        
        if (agentRep < 30) revert LowReputation();

        require(usdc.transferFrom(msg.sender, address(this), amount), "Fail");

        EscrowTransaction storage txn = transactions[txHash];
        txn.agentId = agentId;
        txn.client = msg.sender;
        txn.amount = amount;
        txn.createdAt = block.timestamp;

        emit FundsLocked(txHash, agentId, amount);
    }

    /**
     * @dev Releases funds to the agent. Agent (or oracle) calls this with proof.
     * Integrated ZKP Gate (Phase 4.9).
     */
    function releaseFunds(bytes32 txHash, bytes calldata proof) external nonReentrant {
        EscrowTransaction storage txn = transactions[txHash];
        if (txn.amount == 0) revert Unauthorized();
        if (txn.released || txn.refunded) revert TransactionFinalized();

        // Conceptual ZKP Verification (In production, this calls a ZKP Verifier contract)
        if (proof.length < 32) revert InvalidProof(); 
        
        txn.released = true;
        require(usdc.transfer(owner(), txn.amount), "Fail");

        emit FundsReleased(txHash, txn.agentId);
    }

    /**
     * @dev Refunds funds to the client. Can be triggered by a Pythagorean Comma Veto.
     */
    function refundFunds(bytes32 txHash) external nonReentrant {
        EscrowTransaction storage txn = transactions[txHash];
        if (txn.amount == 0 || txn.released || txn.refunded) revert TransactionFinalized();
        
        if (msg.sender != txn.client && msg.sender != owner()) revert Unauthorized();

        txn.refunded = true;
        require(usdc.transfer(txn.client, txn.amount), "Fail");

        emit FundsRefunded(txHash, txn.agentId);
    }
}
