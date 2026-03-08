
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

    /**
     * @dev Sets the reputation threshold for a specific amount tier.
     */
    function setReputationThreshold(uint256 amount, uint256 minRep) external onlyOwner {
        minReputationForAmount[amount] = minRep;
    }

    /**
     * @dev Locks funds in escrow. Client calls this to initiate a task.
     */
    function lockFunds(bytes32 txHash, uint256 agentId, uint256 amount) external nonReentrant {
        require(transactions[txHash].amount == 0, "Transaction already exists");
        
        // Anti-Sybil check: Verify agent reputation before locking
        uint256 agentRep = reputationRegistry.getReputation(agentId);
        // Minimum threshold check (Dynamic logic can be added here)
        require(agentRep >= 30, "Agent reputation too low for escrow");

        require(usdc.transferFrom(msg.sender, address(this), amount), "USDC transfer failed");

        transactions[txHash] = EscrowTransaction({
            agentId: agentId,
            client: msg.sender,
            amount: amount,
            released: false,
            refunded: false,
            createdAt: block.timestamp
        });

        emit FundsLocked(txHash, agentId, amount);
    }

    /**
     * @dev Releases funds to the agent. Agent (or oracle) calls this with proof.
     */
    function releaseFunds(bytes32 txHash, bytes calldata proof) external nonReentrant {
        EscrowTransaction storage txn = transactions[txHash];
        require(txn.amount > 0, "Transaction does not exist");
        require(!txn.released && !txn.refunded, "Transaction already finalized");

        // In production, verify the ZKP proof or a signature from a verifier agent
        // For Phase 4.9, we assume a trusted release trigger (e.g. from the Verifier agent)
        
        txn.released = true;
        // In this implementation, the contract owner or a designated 'factory' wallet 
        // usually distributes to the agent's wallet address.
        require(usdc.transfer(owner(), txn.amount), "USDC transfer to agent failed");

        emit FundsReleased(txHash, txn.agentId);
    }

    /**
     * @dev Refunds funds to the client. Can be triggered by a Pythagorean Comma Veto.
     */
    function refundFunds(bytes32 txHash) external nonReentrant {
        EscrowTransaction storage txn = transactions[txHash];
        require(txn.amount > 0, "Transaction does not exist");
        require(!txn.released && !txn.refunded, "Transaction already finalized");
        
        // Only the client or the contract owner (governance) can trigger a refund
        require(msg.sender == txn.client || msg.sender == owner(), "Unauthorized refund");

        txn.refunded = true;
        require(usdc.transfer(txn.client, txn.amount), "USDC refund failed");

        emit FundsRefunded(txHash, txn.agentId);
    }
}
