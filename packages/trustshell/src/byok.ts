/**
 * BYOK (Bring Your Own Key) Encryption
 * AES-256-GCM encryption for user-provided LLM API keys.
 *
 * Keys are encrypted at rest and never logged. Only the first4...last4
 * preview is stored in plaintext for UI display.
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

export interface EncryptedKey {
  ciphertext: string;   // base64
  iv: string;           // base64
  tag: string;          // base64
  preview: string;      // first4...last4
}

export interface BYOKCredential {
  provider: string;
  encrypted: EncryptedKey;
  verified: boolean;
  createdAt: string;
}

/**
 * Encrypts an API key using AES-256-GCM.
 * @param plainKey - The raw API key from the user
 * @param encryptionKey - 32-byte encryption key (from env or KMS)
 * @returns EncryptedKey with ciphertext, IV, auth tag, and preview
 */
export function encryptAPIKey(plainKey: string, encryptionKey: Buffer): EncryptedKey {
  if (encryptionKey.length !== 32) {
    throw new Error('Encryption key must be 32 bytes (256 bits)');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);

  let ciphertext = cipher.update(plainKey, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const tag = cipher.getAuthTag();

  const preview = plainKey.length >= 8
    ? `${plainKey.slice(0, 4)}...${plainKey.slice(-4)}`
    : '****';

  return {
    ciphertext,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    preview
  };
}

/**
 * Decrypts an API key from its encrypted form.
 * @param encrypted - The EncryptedKey object
 * @param encryptionKey - 32-byte encryption key (same as used for encryption)
 * @returns The plaintext API key
 */
export function decryptAPIKey(encrypted: EncryptedKey, encryptionKey: Buffer): string {
  if (encryptionKey.length !== 32) {
    throw new Error('Encryption key must be 32 bytes (256 bits)');
  }

  const iv = Buffer.from(encrypted.iv, 'base64');
  const tag = Buffer.from(encrypted.tag, 'base64');
  const decipher = createDecipheriv(ALGORITHM, encryptionKey, iv);
  decipher.setAuthTag(tag);

  let plaintext = decipher.update(encrypted.ciphertext, 'base64', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * Validates that an API key has the expected format for a given provider.
 */
export function validateKeyFormat(provider: string, key: string): boolean {
  const patterns: Record<string, RegExp> = {
    openai: /^sk-[a-zA-Z0-9]{20,}$/,
    anthropic: /^sk-ant-[a-zA-Z0-9]{20,}$/,
    groq: /^gsk_[a-zA-Z0-9]{20,}$/,
    gemini: /^AI[a-zA-Z0-9]{20,}$/,
  };
  const pattern = patterns[provider.toLowerCase()];
  return pattern ? pattern.test(key) : key.length > 10;
}
