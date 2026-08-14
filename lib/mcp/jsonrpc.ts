// lib/mcp/jsonrpc.ts — JSON-RPC 2.0 envelope handling for the MCP endpoint.
//
// Deliberately hand-rolled rather than pulling in @modelcontextprotocol/sdk.
// Three reasons, in order of weight:
//
//   1. This repo's builds are fragile in a specific way (see app/api/CLAUDE.md:
//      `next build` imports every route module, so a dependency that touches
//      config at import time fails the build rather than the request). A new
//      transitive dependency tree behind a route is the exact shape of the
//      thing that broke every deployment from 2026-06-05 to 2026-08-11.
//   2. A read-mostly tool server needs five methods. The SDK is not carrying
//      its weight at this size.
//   3. Every byte on the wire stays auditable here, which matters because this
//      endpoint speaks for the fleet.
//
// If this prototype grows sampling, resources, prompts, or bidirectional
// streaming, revisit — the SDK earns its keep there and hand-rolling does not.

/** Spec-defined JSON-RPC 2.0 error codes, plus MCP's use of -32602. */
export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

export type RpcId = string | number | null;

export interface RpcRequest {
  jsonrpc: '2.0';
  id?: RpcId;
  method: string;
  params?: unknown;
}

export interface RpcSuccess {
  jsonrpc: '2.0';
  id: RpcId;
  result: unknown;
}

export interface RpcFailure {
  jsonrpc: '2.0';
  id: RpcId;
  error: { code: number; message: string; data?: unknown };
}

export type RpcResponse = RpcSuccess | RpcFailure;

export function ok(id: RpcId, result: unknown): RpcSuccess {
  return { jsonrpc: '2.0', id, result };
}

export function fail(id: RpcId, code: number, message: string, data?: unknown): RpcFailure {
  const error: RpcFailure['error'] = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id, error };
}

/**
 * A notification is a request with no `id`. The distinction is load-bearing:
 * the spec says a server must NOT reply to one, and a client that receives a
 * response to `notifications/initialized` may treat the stream as corrupt.
 */
export function isNotification(msg: RpcRequest): boolean {
  return msg.id === undefined;
}

/**
 * Validate the envelope only — `method` semantics are the caller's business.
 *
 * Returns the reason it is invalid, or null when the shape is acceptable.
 */
export function envelopeError(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'Request must be a JSON object.';
  }
  const msg = value as Record<string, unknown>;
  if (msg.jsonrpc !== '2.0') return "Field `jsonrpc` must be exactly '2.0'.";
  if (typeof msg.method !== 'string' || msg.method.length === 0) {
    return 'Field `method` must be a non-empty string.';
  }
  if ('id' in msg) {
    const id = msg.id;
    const idOk = typeof id === 'string' || typeof id === 'number' || id === null;
    if (!idOk) return 'Field `id` must be a string, number, or null when present.';
  }
  return null;
}

/** Read a required string argument, or throw a message suitable for isError. */
export function requireString(args: Record<string, unknown>, key: string): string {
  const raw = args[key];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new ToolInputError(`Argument \`${key}\` is required and must be a non-empty string.`);
  }
  return raw.trim();
}

/** Read an optional string argument. Absent and empty both read as undefined. */
export function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const raw = args[key];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') {
    throw new ToolInputError(`Argument \`${key}\` must be a string when provided.`);
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** Read an optional boolean argument. */
export function optionalBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
  const raw = args[key];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'boolean') {
    throw new ToolInputError(`Argument \`${key}\` must be a boolean when provided.`);
  }
  return raw;
}

/**
 * Bad tool *input* is not a protocol error.
 *
 * MCP draws this line deliberately: a malformed argument comes back as a
 * successful `tools/call` carrying `isError: true`, so the model sees the
 * message and can correct itself. A JSON-RPC error code goes to the client
 * runtime instead, where the model never sees it and simply loses the turn.
 */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
    // Required, not decoration. tsconfig.json specifies no `target`, so tsc
    // downlevels to ES5, where subclassing a built-in silently breaks the
    // prototype chain and `instanceof ToolInputError` returns false. The
    // failure is invisible at compile time and shows up as bad tool input
    // being reported as an internal server error — caught by
    // scripts/mcp-fleet-smoke.mjs on its first run.
    Object.setPrototypeOf(this, ToolInputError.prototype);
  }
}
