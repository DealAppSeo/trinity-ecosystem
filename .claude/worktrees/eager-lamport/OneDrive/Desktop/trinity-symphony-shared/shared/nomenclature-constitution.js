const AGENT_NAMES = {
  canonical: [
    'trinity-orch',
    'trinity-torch', 
    'trinity-gcm',
    'trinity-veritas',
    'trinity-nexus',
    'trinity-shofet',
    'trinity-sophia',
    'trinity-hdm',
    'trinity-w3c',
    'trinity-apm',
    'trinity-mel',
    'trinity-chesed'
  ],
  variants: {
    'ORCH': 'trinity-orch',
    'orch': 'trinity-orch',
    'Orch': 'trinity-orch',
    'TORCH': 'trinity-torch',
    'torch': 'trinity-torch',
    'GCM': 'trinity-gcm',
    'gcm': 'trinity-gcm',
    'VERITAS': 'trinity-veritas',
    'veritas': 'trinity-veritas',
    'NEXUS': 'trinity-nexus',
    'nexus': 'trinity-nexus',
    'SHOFET': 'trinity-shofet',
    'shofet': 'trinity-shofet',
    'SOPHIA': 'trinity-sophia',
    'sophia': 'trinity-sophia',
    'HDM': 'trinity-hdm',
    'hdm': 'trinity-hdm',
    'W3C': 'trinity-w3c',
    'w3c': 'trinity-w3c',
    'APM': 'trinity-apm',
    'apm': 'trinity-apm',
    'MEL': 'trinity-mel',
    'mel': 'trinity-mel',
    'CHESED': 'trinity-chesed',
    'chesed': 'trinity-chesed'
  }
};

const TASK_STATUS = {
  ASSIGNED: 'assigned',
  PENDING: 'pending', 
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ARCHIVED: 'archived',
  VERIFIED: 'verified',
  IN_REVIEW: 'in_review',
  CANCELLED: 'cancelled'
};

const TASK_CATEGORY = {
  SYSTEM: 'system',
  RESEARCH: 'research',
  BUILD: 'build',
  VERIFY: 'verify',
  CONTENT: 'content',
  TEST: 'test'
};

const TABLES = {
  TASKS: 'trinity_tasks',
  LOGS: 'trinity_logs',
  AGENT_LOGS: 'trinity_agent_logs',
  SPRINT_REPORTS: 'sprint_reports'
};

function normalizeAgentName(input) {
  if (!input) throw new Error('Agent name required');
  const lower = input.toLowerCase().replace('trinity-', '');
  const canonical = AGENT_NAMES.variants[input] 
    || AGENT_NAMES.variants[lower]
    || AGENT_NAMES.canonical.find(n => n.includes(lower));
  if (!canonical) {
    throw new Error(
      `Unknown agent: "${input}". ` +
      `Valid agents: ${AGENT_NAMES.canonical.join(', ')}`
    );
  }
  return canonical;
}

function normalizeStatus(input) {
  const found = Object.values(TASK_STATUS)
    .find(s => s === input.toLowerCase());
  if (!found) {
    throw new Error(
      `Unknown status: "${input}". ` +
      `Valid statuses: ${Object.values(TASK_STATUS).join(', ')}`
    );
  }
  return found;
}

module.exports = {
  AGENT_NAMES,
  TASK_STATUS,
  TASK_CATEGORY,
  TABLES,
  normalizeAgentName,
  normalizeStatus
};
