// lib/institution-config-schema.ts
//
// An allowlist for institution_config writes, split by the role required to
// change each field.
//
// The settings route previously did `.update(config)` with the request body,
// which meant every column was writable by anyone who could reach the endpoint
// — including `frozen` (the kill switch), `pythagorean_veto_enabled` (the
// veto), `min_repid_payment` (the trust floor) and `max_aggregate_daily_usdc`
// (the spend cap). A denylist would be the wrong shape here: a column added
// later would be writable by default. This is an allowlist, so a new column is
// unwritable until someone classifies it.

export type FieldKind = 'boolean' | 'number' | 'integer' | 'string' | 'string[]' | 'json';

/** Risk and policy thresholds — changeable by an operator or above. */
export const OPERATOR_FIELDS: Record<string, FieldKind> = {
  institution_name:                   'string',
  // BFT / consensus
  bft_min_llms:                       'integer',
  bft_min_repid:                      'number',
  approved_llm_providers:             'string[]',
  require_provider_diversity:         'boolean',
  pythagorean_veto_enabled:           'boolean',
  veto_suspicion_threshold:           'number',
  // RepID thresholds
  min_repid_payment:                  'number',
  min_repid_vault:                    'number',
  min_repid_single_llm_override:      'number',
  repid_decay_rate_daily:             'number',
  min_agent_trust_requirement:        'string',
  // Human custody
  require_human_custody_vault:        'boolean',
  require_human_custody_payment:      'boolean',
  human_custody_threshold_usdc:       'number',
  // High-security mode
  high_security_mode:                 'boolean',
  high_security_min_llms:             'integer',
  high_security_min_repid:            'number',
  // Receipts
  require_compliance_receipt:         'boolean',
  receipt_includes_llm_votes:         'boolean',
  fireblocks_preauth_enabled:         'boolean',
  // Spend limits
  max_aggregate_daily_usdc:           'number',
  aggregate_alert_pct:                'integer',
  auto_suspend_on_alert:              'boolean',
  // Time windows
  trading_hours_only:                 'boolean',
  allowed_days:                       'string[]',
  allowed_hours_start:                'integer',
  allowed_hours_end:                  'integer',
  // Counterparty / jurisdiction
  counterparty_whitelist_only:        'boolean',
  new_counterparty_requires_dual_sig: 'boolean',
  jurisdiction_allowlist:             'string[]',
  // Step-up auth
  mobile_auth_required_above:         'number',
  mobile_auth_method:                 'string',
  mobile_auth_timeout_seconds:        'integer',
  // Regulatory
  regulatory_profile:                 'string',
  sanctions_refresh_hours:            'integer',
  auto_sar_threshold_usdc:            'number',
  // Notifications
  alpha_protection_mode:              'boolean',
  board_notification_threshold:       'number',
  notify_on_dual_sig_request:         'boolean',
  notify_on_suspicious_pattern:       'boolean',
};

/**
 * Fields that stop an institution or hold credentials. Owner only.
 *
 * `frozen` is here rather than under operator because freezing and unfreezing
 * are the controls you least want available to the widest role — an operator
 * who can unfreeze can undo the response to an incident.
 */
export const OWNER_FIELDS: Record<string, FieldKind> = {
  frozen:                        'boolean',
  freeze_requires_dual_unfreeze: 'boolean',
  fireblocks_policy_id:          'string',
  byok_config:                   'json',
};

/**
 * Server-managed. Never writable through the API at any role — `id` and
 * `institution_id` are identity, and the audit columns must reflect the
 * authenticated actor rather than whatever the caller claims.
 */
export const SERVER_MANAGED = new Set([
  'id',
  'institution_id',
  'updated_at',
  'updated_by',
  'frozen_at',
  'frozen_by',
]);

function typeOk(value: unknown, kind: FieldKind): boolean {
  switch (kind) {
    case 'boolean': return typeof value === 'boolean';
    // Reject NaN/Infinity explicitly — both are typeof 'number' and both
    // corrupt a numeric threshold rather than failing loudly at the database.
    case 'number':  return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'string':  return typeof value === 'string';
    case 'string[]':return Array.isArray(value) && value.every((v) => typeof v === 'string');
    case 'json':    return value !== undefined && (typeof value === 'object' || value === null);
  }
}

export interface ValidationResult {
  /** Only the fields that passed both the allowlist and the type check. */
  patch: Record<string, unknown>;
  /** Present in the request but not permitted at this role, or unknown. */
  rejected: string[];
  /** Allowed by role but the wrong type. */
  invalid: string[];
}

/**
 * Reduce an arbitrary request body to a safe patch.
 *
 * Rejections are reported rather than silently dropped: a caller who thinks
 * they disabled the veto and got a 200 has been misled, which is the same class
 * of failure as a check that reports success without running.
 */
export function validateConfigPatch(
  body: unknown,
  role: 'viewer' | 'operator' | 'owner'
): ValidationResult {
  const patch: Record<string, unknown> = {};
  const rejected: string[] = [];
  const invalid: string[] = [];

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { patch, rejected, invalid };
  }

  const allowed: Record<string, FieldKind> =
    role === 'owner'
      ? { ...OPERATOR_FIELDS, ...OWNER_FIELDS }
      : role === 'operator'
        ? OPERATOR_FIELDS
        : {};

  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (SERVER_MANAGED.has(key) || !(key in allowed)) {
      rejected.push(key);
      continue;
    }
    if (!typeOk(value, allowed[key])) {
      invalid.push(key);
      continue;
    }
    patch[key] = value;
  }

  return { patch, rejected, invalid };
}
