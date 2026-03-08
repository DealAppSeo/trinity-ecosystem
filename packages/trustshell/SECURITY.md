# Security Policy

## Reporting a Vulnerability

We take the security of the Trinity Symphony ecosystem seriously. If you find a security vulnerability, please report it via [security@trustshell.dev](mailto:security@trustshell.dev).

### Key Management
- TrustShell **never** stores your private keys locally or sends them to any external server.
- Keys are used only for on-chain signing via standard libraries (`viem`/`ethers`).
- Ensure you use a secure Key Management System (KMS) for production agents.

### Audit Status
The TrustShell core is currently in **Beta (0.1.0)**. Formal audit results for the ERC-8004 smart contracts will be published in Q2 2026.
