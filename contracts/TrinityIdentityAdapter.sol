// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title TrinityIdentityAdapter
 * @dev Implements a basic registry for Trinity agents, mapping names to wallets and reputation.
 * This serves as the foundation for ERC-8004 (Trustless Agents) on Base Sepolia.
 */
contract TrinityIdentityAdapter {
    struct Agent {
        string name;
        address wallet;
        uint256 reputation; // Scale 0-100 (aligned with RepID)
        bool isActive;
        uint256 lastUpdate;
    }

    mapping(string => Agent) public agents;
    mapping(address => string) public walletToAgent;
    
    address public owner;

    event AgentRegistered(string name, address wallet);
    event ReputationSynced(string name, uint256 newReputation);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can perform this action");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Registers a new agent in the ecosystem.
     */
    function registerAgent(string memory name, address wallet) public onlyOwner {
        require(agents[name].wallet == address(0), "Agent already registered");
        
        agents[name] = Agent({
            name: name,
            wallet: wallet,
            reputation: 10, // Default starting rep
            isActive: true,
            lastUpdate: block.timestamp
        });
        
        walletToAgent[wallet] = name;
        emit AgentRegistered(name, wallet);
    }

    /**
     * @dev Syncs reputation score from the off-chain GCM (Governance Consensus Mechanism).
     */
    function syncReputation(string memory name, uint256 newReputation) public onlyOwner {
        require(agents[name].isActive, "Agent not active");
        require(newReputation <= 100, "Reputation overflow");

        agents[name].reputation = newReputation;
        agents[name].lastUpdate = block.timestamp;
        
        emit ReputationSynced(name, newReputation);
    }

    function getAgent(string memory name) public view returns (address, uint256, bool) {
        Agent memory a = agents[name];
        return (a.wallet, a.reputation, a.isActive);
    }
}
