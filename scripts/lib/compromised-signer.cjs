// scripts/lib/compromised-signer.cjs — refuse to sign with a known-leaked key.
//
// WHY THIS EXISTS. `scripts/register-agents-erc8004.js` once held a literal EVM
// private key. It is out of the working tree, but a private key committed to git
// is in that history forever; no commit removes it. Rotation is what makes the
// history entry harmless — it turns the leaked key into a key to an empty
// account — and rotation is a manual, Sean-gated operation.
//
// The gap this closes is the window between "we rotated" and "everything
// actually stopped using the old signer". `broadcast.js` reads
// `TRINITY_DEPLOYER_PRIVATE_KEY || TRINITY_DEPLOYER`, so an environment where
// the SECOND name still holds the old key and the first is unset would keep
// signing with the compromised address — and the rotation would look complete
// while the exposure continued. That is this repo's recurring defect shape: a
// system reporting success it has not earned.
//
// So the check is on the DERIVED ADDRESS, not on the variable name. Whatever
// route a key arrives by, if it derives the leaked address, the script stops.
//
// TAKES AN ADDRESS, NOT A KEY. Every call site already has a library that can
// derive one (viem, ethers), and they are not the same library. Passing the
// derived address keeps this module dependency-free and means a private key is
// never handed to shared code.
//
// NOT A SUBSTITUTE FOR ROTATING. This prevents *our* scripts from using the key.
// Anyone who reads git history still holds it and can act on-chain themselves
// until the identities are moved. See docs/KEY-ROTATION.md.

/**
 * Addresses whose private key is public. Lower-case, compared case-insensitively
 * because EIP-55 checksummed forms of the same address are the same address.
 *
 * 0xdf6b…271d — leaked via `scripts/register-agents-erc8004.js:9`. Verified
 * on-chain 2026-08-14 as the owner of ERC-8004 identities 3747 (SOPHIA),
 * 3748 (RAVEN) and 3750 (GUARDIAN) on Base Sepolia.
 */
const COMPROMISED = new Map([
  [
    '0xdf6b8215d193b11b4903d223729c3cf7a6de271d',
    'committed to git history in scripts/register-agents-erc8004.js; owns ERC-8004 ids 3747/3748/3750 until rotated',
  ],
]);

/** True when this address's private key is known to be public. */
function isCompromised(address) {
  return typeof address === 'string' && COMPROMISED.has(address.toLowerCase());
}

/**
 * Abort if `address` is a known-leaked signer.
 *
 * Exits rather than throwing: these are operator-run scripts that broadcast
 * transactions, and a thrown error inside a try/catch somewhere upstream could
 * be swallowed into a warning. Refusing to sign is not a recoverable condition.
 */
function assertNotCompromised(address, context = 'this script') {
  if (!isCompromised(address)) return address;
  console.error(
    `\nREFUSING TO SIGN — ${context} derived a signer whose private key is public.\n` +
      `  address ${address}\n` +
      `  reason  ${COMPROMISED.get(address.toLowerCase())}\n\n` +
      `  The key reached this process even though it should have been rotated out.\n` +
      `  Check EVERY name that can supply it, not just the one you set:\n` +
      `    TRINITY_DEPLOYER_PRIVATE_KEY   (primary)\n` +
      `    TRINITY_DEPLOYER               (fallback read by scripts/broadcast.js)\n` +
      `  and any .env.local, shell export, or deployment secret store.\n\n` +
      `  See docs/KEY-ROTATION.md. Nothing was broadcast.\n`
  );
  process.exit(1);
}

module.exports = { COMPROMISED, isCompromised, assertNotCompromised };
