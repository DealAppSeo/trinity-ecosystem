const crypto = require('crypto');

/**
 * Merkle/Multihash Utility for Trinity Symphony Artifacts
 * Implements sha2-256 (0x12) with 32-byte length (0x20)
 * Format: 1220[sha256_hex]
 */

const MULTIHASH_PREFIX_SHA256 = '1220';

/**
 * Computes a standard Multihash (sha2-256) for any content
 * @param {string|Buffer|Object} content 
 * @returns {string} The 1220 prefixed hex hash
 */
function computeHash(content) {
    if (!content) return null;

    let data = content;
    if (typeof content === 'object') {
        data = JSON.stringify(content);
    }

    const hash = crypto.createHash('sha256').update(data).digest('hex');
    return `${MULTIHASH_PREFIX_SHA256}${hash}`;
}

/**
 * Verifies if content matches a given multihash
 * @param {string|Buffer|Object} content 
 * @param {string} hash To compare against
 * @returns {boolean}
 */
function verifyHash(content, hash) {
    if (!content || !hash) return false;
    const computed = computeHash(content);
    return computed === hash;
}

/**
 * Checks if a string is a valid Trinity multihash (starts with 1220 and is 68 chars long)
 * @param {string} hash 
 * @returns {boolean}
 */
function isValidHash(hash) {
    return typeof hash === 'string' &&
        hash.startsWith(MULTIHASH_PREFIX_SHA256) &&
        hash.length === 68;
}

module.exports = {
    computeHash,
    verifyHash,
    isValidHash,
    PREFIX: MULTIHASH_PREFIX_SHA256
};
