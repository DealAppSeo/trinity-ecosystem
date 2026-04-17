/**
 * TRINITY SYMPHONY - CONSTITUTIONAL AGENT BASE
 * 
 * VERSION 5.0.0 - UNSTOPPABLE WISDOM
 * 
 * The synthesis of two AI minds:
 * - Claude's self-propagating architecture + deep reasoning + reflection
 * - Grok's LiteLLM unification + wisdom cache + learned routing + auto-verification
 * 
 * "A benevolent super-intelligence virus that evolves itself,
 *  measures everything, and can never be rolled back to template mode."
 * 
 * Constitutional Compliance:
 * - Article 1: Mission alignment (help people help people)
 * - Article 2: No single point of control (20 min rotation)
 * - Article 3: Transparency (log everything)
 * - Article 4: Distributed truth (Byzantine consensus)
 * - Article 5: Right to challenge
 * - Article 6: Graceful degradation
 * - Article 7: Continuous evolution (NEW)
 * - Article 8: Wisdom preservation (cache learnings)
 */

/*
 * TRINITY NOMENCLATURE CONSTITUTION
 * 
 * CANONICAL AGENT NAMES: trinity-[name] lowercase hyphen
 * Valid: trinity-orch, trinity-torch, trinity-gcm,
 *        trinity-veritas, trinity-nexus, trinity-shofet,
 *        trinity-sophia, trinity-hdm, trinity-w3c,
 *        trinity-apm, trinity-mel, trinity-chesed
 *
 * CANONICAL STATUS VALUES: lowercase underscore
 * Valid: assigned, pending, in_progress, completed,
 *        failed, archived, verified, in_review, cancelled
 *
 * RULE: All agent names and status values MUST pass
 * through normalizeAgentName() and normalizeStatus()
 * before any database write. No exceptions.
 *
 * RULE: Evergreen tasks are singletons. Check before
 * insert. Update if exists. Never duplicate.
 *
 * RULE: agent_assigned is NEVER null on a new task.
 * If no specific agent: assign to trinity-orch.
 *
 * violations -> trinity_logs -> ORCH alert -> human review
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { normalizeAgentName, normalizeStatus } = require('./nomenclature-constitution');

// ============================================
// CONSTITUTIONAL CONSTANTS
// ============================================

const CONDUCTOR_TENURE_MS = 20 * 60 * 1000;
const CERTAINTY_THRESHOLD = 0.80;
const VERIFICATION_THRESHOLD = 0.85;  // Below this triggers auto-verification
const FREE_CHALLENGES_PER_DAY = 3;
const REASONING_DEPTH_TARGET = 5;
const WISDOM_CACHE_TTL_HOURS = 24;
const EVO_REPORT_INTERVAL = 50;  // Report genome every N tasks

// RepID Constants
const REPID = {
  TASK_COMPLETE_BASE: 5,
  TASK_COMPLETE_MAX: 20,
  FIND_ERROR: 12,
  ERROR_FOUND: -3,
  WRONG_CHALLENGE: -3,
  SHARE_LEARNING: 5,
  TEACH_MENTEE: 15,
  DEEP_REASONING_BONUS: 3,
  REFLECTION_IMPROVEMENT: 5,
  CACHE_HIT_BONUS: 1,
  PROVIDER_FAILURE: -5,
  CONSTITUTIONAL_VIOLATION: -100
};

// ============================================
// LLM PROVIDER CONFIGURATION
// Grok's insight: Use LiteLLM format for unification
// ============================================

const LLM_PROVIDERS = {
  'groq/llama-3.1-70b-versatile': {
    keyEnv: 'GROQ_API_KEY',
    costPer1k: 0.0,
    tier: 'free',
    strengths: ['speed', 'reasoning'],
    endpoint: 'https://api.groq.com/openai/v1/chat/completions'
  },
  'deepseek/deepseek-chat': {
    keyEnv: 'DEEPSEEK_API_KEY',
    costPer1k: 0.00014,
    tier: 'cheap',
    strengths: ['coding', 'analysis'],
    endpoint: 'https://api.deepseek.com/v1/chat/completions'
  },
  'openrouter/meta-llama/llama-3.1-8b-instruct:free': {
    keyEnv: 'OPENROUTER_API_KEY',
    costPer1k: 0.0,
    tier: 'free',
    strengths: ['general', 'fast'],
    endpoint: 'https://openrouter.ai/api/v1/chat/completions'
  },
  'google/gemini-1.5-flash': {
    keyEnv: 'GEMINI_API_KEY',
    costPer1k: 0.0,
    tier: 'free',
    strengths: ['multimodal', 'reasoning'],
    endpoint: 'gemini'  // Special handling
  },
  'anthropic/claude-3-haiku': {
    keyEnv: 'ANTHROPIC_API_KEY',
    costPer1k: 0.00025,
    tier: 'cheap',
    strengths: ['safety', 'nuance'],
    endpoint: 'https://api.anthropic.com/v1/messages'
  }
};

// ============================================
// AGENT WISDOM - Evolvable Personalities
// ============================================

const AGENT_WISDOM = {
  APM: {
    name: 'AI Prompt Manager',
    role: 'Spiritual & Strategic Heart',
    tier: 'senior',
    specialties: ['prayer', 'empathy', 'spiritual', 'biblical', 'encouragement', 'strategy', 'product'],
    reasoningStyle: 'empathetic',
    preferredModels: ['anthropic/claude-3-haiku', 'groq/llama-3.1-70b-versatile'],
    systemPrompt: `You are APM (AI Prompt Manager), the spiritual and strategic heart of Trinity Symphony.

Your sacred mission: "Help people help people - serve the last, the lost, and the least."

REASONING APPROACH:
1. First, understand the human impact of this task
2. Consider biblical principles (Ten Commandments, Sermon on the Mount)
3. Balance technical excellence with compassion
4. Ensure alignment with the mission

Output with warmth but substance. Connect technical work to human impact.`
  },

  HDM: {
    name: 'HyperDAG Development Manager',
    role: 'Infrastructure Backbone',
    tier: 'senior',
    specialties: ['infrastructure', 'database', 'deployment', 'scaling', 'research', 'backend', 'devops', 'code'],
    reasoningStyle: 'systematic',
    preferredModels: ['deepseek/deepseek-chat', 'groq/llama-3.1-70b-versatile'],
    systemPrompt: `You are HDM (HyperDAG Development Manager), the infrastructure backbone of Trinity Symphony.

Your mission: Build robust, cost-effective systems that serve reliably at scale.

REASONING APPROACH:
1. Analyze technical requirements systematically
2. Consider failure modes and edge cases
3. Optimize for cost (free tier first)
4. Plan for rollback and recovery
5. Document for the team

Provide concrete, implementable solutions with code snippets.`
  },

  MEL: {
    name: 'Marketing & Experience Lead',
    role: 'User Experience Champion',
    tier: 'junior',
    specialties: ['ui', 'ux', 'frontend', 'design', 'dashboard', 'mobile', 'marketing', 'growth'],
    reasoningStyle: 'user-centric',
    preferredModels: ['groq/llama-3.1-70b-versatile', 'anthropic/claude-3-haiku'],
    systemPrompt: `You are MEL (Marketing & Experience Lead), the user experience champion of Trinity Symphony.

Your mission: Make advanced AI accessible to everyone through intuitive design.

REASONING APPROACH:
1. Start from the user's perspective
2. Simplify complexity - hide machinery, show magic
3. Consider accessibility and inclusivity
4. Test assumptions against real behavior

Think from the user's perspective. Suggest concrete UI improvements.`
  },

  GCM: {
    name: 'Governance & Compliance Manager',
    role: 'Guardian & Quality Assurer',
    tier: 'senior',
    specialties: ['governance', 'compliance', 'security', 'audit', 'risk', 'ethics', 'review', 'verification'],
    reasoningStyle: 'critical',
    preferredModels: ['anthropic/claude-3-haiku', 'groq/llama-3.1-70b-versatile'],
    systemPrompt: `You are GCM (Governance & Compliance Manager), the guardian of Trinity Symphony.

Your mission: Ensure ethical operation, quality output, and user protection.

REASONING APPROACH:
1. Identify potential risks and vulnerabilities
2. Verify claims before accepting them
3. Consider ethical implications
4. Check constitutional compliance

Be thorough but practical. Flag risks with severity levels.`
  },

  TORCH: {
    name: 'Technical Orchestration & Resource Coordination Hub',
    role: 'Efficiency Optimizer',
    tier: 'junior',
    specialties: ['orchestration', 'coordination', 'routing', 'optimization', 'cost', 'anfis', 'automation', 'performance'],
    reasoningStyle: 'analytical',
    preferredModels: ['groq/llama-3.1-70b-versatile', 'deepseek/deepseek-chat'],
    systemPrompt: `You are TORCH (Technical Orchestration & Resource Coordination Hub), the optimizer of Trinity Symphony.

Your mission: Maximize efficiency through intelligent resource allocation.

REASONING APPROACH:
1. Measure current state quantitatively
2. Identify bottlenecks and inefficiencies
3. Model improvements mathematically
4. Automate repetitive optimizations

Quantify improvements. Suggest automation opportunities.`
  },

  VERITAS: {
    name: 'Verification & Truth Assessment System',
    role: 'Truth Seeker & Critic',
    tier: 'senior',
    specialties: ['verification', 'fact-check', 'zkp', 'reputation', 'validation', 'truth', 'accuracy', 'review'],
    reasoningStyle: 'skeptical',
    preferredModels: ['anthropic/claude-3-haiku', 'groq/llama-3.1-70b-versatile'],
    systemPrompt: `You are VERITAS (Verification & Truth Assessment System), the truth-seeker of Trinity Symphony.

Your mission: Ensure accuracy and build trust through transparent verification.

REASONING APPROACH:
1. Question assumptions - what evidence supports this?
2. Distinguish facts from opinions
3. Rate confidence levels honestly (0.0 to 1.0)
4. Flag claims needing external verification

Be the skeptic. Challenge claims constructively.`
  },

  W3C: {
    name: 'Web3 Coordination',
    role: 'Blockchain Specialist',
    tier: 'junior',
    specialties: ['blockchain', 'smart contracts', 'tokenomics', 'web3', 'decentralized', 'crypto', 'dao'],
    reasoningStyle: 'technical',
    preferredModels: ['deepseek/deepseek-chat', 'groq/llama-3.1-70b-versatile'],
    systemPrompt: `You are W3C (Web3 Coordination), the blockchain specialist of Trinity Symphony.

Your mission: Bridge Web2 and Web3 to democratize access to decentralized technologies.

REASONING APPROACH:
1. Understand decentralization requirements
2. Consider gas costs and efficiency
3. Use battle-tested patterns
4. Make Web3 accessible to Web2 developers

Make blockchain accessible. Consider gas costs.`
  },

  EVO: {
    name: 'Evolution Orchestrator',
    role: 'Meta-Intelligence & Improvement Agent',
    tier: 'orchestrator',
    specialties: ['evolution', 'orchestration', 'improvement', 'meta', 'feedback', 'learning', 'genome'],
    reasoningStyle: 'meta-cognitive',
    preferredModels: ['anthropic/claude-3-haiku', 'groq/llama-3.1-70b-versatile'],
    systemPrompt: `You are EVO (Evolution Orchestrator), the meta-intelligence of Trinity Symphony.

Your mission: Continuously improve the entire system through observation, measurement, and adaptation.

REASONING APPROACH:
1. Observe patterns across all agent outputs
2. Measure effectiveness quantitatively
3. Identify improvement opportunities
4. Propagate successful patterns

You orchestrate the orchestra. Make the whole greater than the sum.`
  }
};

// ============================================
// CONSTITUTIONAL AGENT CLASS
// ============================================

class ConstitutionalAgent {
  constructor(config) {
    this.name = normalizeAgentName(config.name);
    this.wisdom = AGENT_WISDOM[config.name] || AGENT_WISDOM.HDM;
    this.specialties = config.specialties || this.wisdom.specialties || [];
    this.tier = this.wisdom.tier || 'junior';
    
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (this.supabaseUrl && this.supabaseKey) {
      this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
      console.log(`[${this.name}] Connected to Supabase`);
    } else {
      console.error(`[${this.name}] Missing Supabase credentials`);
    }
    
    this.isConductor = false;
    this.conductorSince = null;
    this.challengesToday = 0;
    this.lastChallengeReset = new Date().toDateString();
    this.currentTask = null;
    this.tasksCompletedThisSession = 0;
    
    // Session metrics (Grok's quantitative tracking)
    this.sessionMetrics = {
      tasksCompleted: 0,
      tasksReflected: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgReasoningDepth: 0,
      avgCertainty: 0,
      llmCalls: 0,
      llmTokensUsed: 0,
      verificationTasksSpawned: 0,
      providerSuccesses: {},
      providerFailures: {}
    };
    
    // Detect available providers
    this.availableProviders = this.detectProviders();
    console.log(`[${this.name}] 🧠 Intelligence via: ${this.availableProviders.join(', ') || 'NONE!'}`);
  }

  // ============================================
  // PROVIDER DETECTION & SMART ROUTING
  // Grok's learned routing + Claude's arbitrage
  // ============================================

  detectProviders() {
    const available = [];
    for (const [model, config] of Object.entries(LLM_PROVIDERS)) {
      if (process.env[config.keyEnv]) {
        available.push(model);
      }
    }
    return available;
  }

  /**
   * SMART MODEL SELECTION (Grok's ANFIS-style learned routing)
   * Uses historical performance + agent preferences + task type
   */
  async chooseBestModel(taskType = 'general') {
    // First, try to get learned performance data
    if (this.supabase) {
      try {
        const { data } = await this.supabase
          .from('provider_performance')
          .select('*')
          .eq('agent', this.name)
          .order('success_rate', { ascending: false });
        
        if (data?.length > 0) {
          // Find best model that's available
          for (const perf of data) {
            if (this.availableProviders.includes(perf.model)) {
              return perf.model;
            }
          }
        }
      } catch (err) {
        // Table might not exist yet - that's ok
      }
    }
    
    // Fallback: Use agent's preferred models
    for (const model of this.wisdom.preferredModels || []) {
      if (this.availableProviders.includes(model)) {
        return model;
      }
    }
    
    // Final fallback: First available (cost-sorted)
    const sorted = this.availableProviders.sort((a, b) => 
      (LLM_PROVIDERS[a]?.costPer1k || 0) - (LLM_PROVIDERS[b]?.costPer1k || 0)
    );
    return sorted[0] || 'groq/llama-3.1-70b-versatile';
  }

  /**
   * Update provider performance (Grok's learning loop)
   */
  async updateProviderPerformance(model, success, latencyMs, tokens) {
    if (!this.supabase) return;
    
    // Track in session
    if (success) {
      this.sessionMetrics.providerSuccesses[model] = (this.sessionMetrics.providerSuccesses[model] || 0) + 1;
    } else {
      this.sessionMetrics.providerFailures[model] = (this.sessionMetrics.providerFailures[model] || 0) + 1;
    }
    
    try {
      // Upsert to provider_performance table
      const { data: existing } = await this.supabase
        .from('provider_performance')
        .select('*')
        .eq('agent', this.name)
        .eq('model', model)
        .single();
      
      const calls = (existing?.total_calls || 0) + 1;
      const successes = (existing?.successes || 0) + (success ? 1 : 0);
      const avgLatency = existing 
        ? (existing.avg_latency_ms * existing.total_calls + latencyMs) / calls
        : latencyMs;
      
      await this.supabase.from('provider_performance').upsert({
        agent: this.name,
        model,
        total_calls: calls,
        successes,
        success_rate: successes / calls,
        avg_latency_ms: avgLatency,
        total_tokens: (existing?.total_tokens || 0) + tokens,
        updated_at: new Date().toISOString()
      }, { onConflict: 'agent,model' });
      
    } catch (err) {
      // Table might not exist - log but continue
      console.log(`[${this.name}] Note: provider_performance tracking unavailable`);
    }
  }

  // ============================================
  // WISDOM CACHE (Grok's key insight)
  // Never re-ask the same question twice
  // ============================================

  hashPrompt(prompt) {
    return crypto.createHash('sha256').update(prompt).digest('hex');
  }

  async checkWisdomCache(promptHash) {
    if (!this.supabase) return null;
    
    try {
      const { data } = await this.supabase
        .from('wisdom_cache')
        .select('output, created_at')
        .eq('prompt_hash', promptHash)
        .single();
      
      if (data) {
        // Check TTL
        const age = Date.now() - new Date(data.created_at).getTime();
        const ttlMs = WISDOM_CACHE_TTL_HOURS * 60 * 60 * 1000;
        
        if (age < ttlMs) {
          this.sessionMetrics.cacheHits++;
          console.log(`[${this.name}] 💾 Wisdom cache HIT`);
          return data.output;
        }
      }
    } catch (err) {
      // Table might not exist
    }
    
    this.sessionMetrics.cacheMisses++;
    return null;
  }

  async storeWisdomCache(promptHash, output, taskType = 'general') {
    if (!this.supabase) return;
    
    try {
      await this.supabase.from('wisdom_cache').upsert({
        prompt_hash: promptHash,
        output,
        agent: this.name,
        task_type: taskType,
        created_at: new Date().toISOString()
      }, { onConflict: 'prompt_hash' });
    } catch (err) {
      // Silent fail - cache is optimization, not critical
    }
  }

  // ============================================
  // UNIFIED LLM CALLING (Claude + Grok synthesis)
  // Smart routing + caching + performance tracking
  // ============================================

  async callLLM(prompt, options = {}) {
    const systemPrompt = options.systemPrompt || this.wisdom.systemPrompt;
    const maxTokens = options.maxTokens || 2000;
    const temperature = options.temperature || 0.7;
    const skipCache = options.skipCache || false;
    const taskType = options.taskType || 'general';
    
    // Check wisdom cache first (Grok's optimization)
    if (!skipCache) {
      const promptHash = this.hashPrompt(systemPrompt + prompt);
      const cached = await this.checkWisdomCache(promptHash);
      if (cached) {
        await this.updateRepID(REPID.CACHE_HIT_BONUS, 'Wisdom cache hit');
        return { output: cached, provider: 'cache', isReal: true, cached: true };
      }
    }
    
    // Choose best model (learned routing)
    const preferredModel = await this.chooseBestModel(taskType);
    
    // Try preferred model first, then fallback to others
    const modelsToTry = [preferredModel, ...this.availableProviders.filter(m => m !== preferredModel)];
    
    for (const model of modelsToTry) {
      try {
        console.log(`[${this.name}] 🤔 Thinking via ${model}...`);
        const startTime = Date.now();
        
        const result = await this.callProvider(model, prompt, systemPrompt, maxTokens, temperature);
        
        if (result) {
          const latency = Date.now() - startTime;
          const tokens = Math.ceil((prompt.length + result.length) / 4);
          
          // Update performance tracking
          await this.updateProviderPerformance(model, true, latency, tokens);
          
          // Update session metrics
          this.sessionMetrics.llmCalls++;
          this.sessionMetrics.llmTokensUsed += tokens;
          
          console.log(`[${this.name}] 💡 Wisdom received (${result.length} chars, ${latency}ms)`);
          
          // Store in wisdom cache
          if (!skipCache) {
            const promptHash = this.hashPrompt(systemPrompt + prompt);
            await this.storeWisdomCache(promptHash, result, taskType);
          }
          
          await this.log('llm_success', `${model} (${latency}ms)`, { model, latency, tokens });
          
          return { output: result, provider: model, isReal: true, cached: false };
        }
      } catch (err) {
        console.error(`[${this.name}] ⚠️ ${model} failed:`, err.message);
        await this.updateProviderPerformance(model, false, 0, 0);
        await this.log('llm_fallback', `${model} failed`, { model, error: err.message });
      }
    }
    
    // All providers failed - graceful degradation
    console.error(`[${this.name}] ❌ All providers failed`);
    return { 
      output: this.gracefulFallback(prompt),
      provider: 'fallback',
      isReal: false,
      cached: false
    };
  }

  async callProvider(model, prompt, systemPrompt, maxTokens, temperature) {
    const config = LLM_PROVIDERS[model];
    if (!config) return null;
    
    const apiKey = process.env[config.keyEnv];
    if (!apiKey) return null;

    // Handle different provider formats
    if (config.endpoint === 'gemini') {
      return await this.callGemini(prompt, systemPrompt, apiKey, maxTokens);
    } else if (model.startsWith('anthropic/')) {
      return await this.callAnthropic(prompt, systemPrompt, apiKey, maxTokens, temperature);
    } else {
      return await this.callOpenAICompatible(config, model, prompt, systemPrompt, apiKey, maxTokens, temperature);
    }
  }

  async callOpenAICompatible(config, model, prompt, systemPrompt, apiKey, maxTokens, temperature) {
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };

    // OpenRouter needs extra headers
    if (model.includes('openrouter')) {
      headers['HTTP-Referer'] = process.env.OPENROUTER_REFERRER || 'https://trinitysymphony.ai';
      headers['X-Title'] = 'Trinity Symphony';
    }

    // Extract actual model name for API
    const apiModel = model.includes('/') ? model.split('/').slice(1).join('/') : model;

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: apiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        max_tokens: maxTokens,
        temperature
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`${response.status}: ${error.substring(0, 200)}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  }

  async callGemini(prompt, systemPrompt, apiKey, maxTokens) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 }
      })
    });

    if (!response.ok) throw new Error(`Gemini: ${response.status}`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  }

  async callAnthropic(prompt, systemPrompt, apiKey, maxTokens, temperature) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) throw new Error(`Anthropic: ${response.status}`);
    const data = await response.json();
    return data.content?.[0]?.text || null;
  }

  gracefulFallback(prompt) {
    return `[DEGRADED MODE - LLM Unavailable]

Task received but all AI providers are currently unavailable.

Request: ${prompt.substring(0, 300)}...

Recommended actions:
1. Check API key validity in Render environment
2. Verify provider status pages
3. Task queued for retry

Generated in degraded mode by ${this.name}.
Constitutional Article 6: Graceful degradation over hard failure.`;
  }

  // ============================================
  // AUTO-VERIFICATION (Grok's critical insight)
  // Low certainty triggers peer review automatically
  // ============================================

  async spawnVerificationTask(originalTask, result, certainty) {
    if (!this.supabase || certainty >= VERIFICATION_THRESHOLD) return;
    
    console.log(`[${this.name}] 🔍 Certainty ${certainty.toFixed(2)} < ${VERIFICATION_THRESHOLD}, spawning verification...`);
    
    try {
      const vAgent = normalizeAgentName('VERITAS');
      const vStatus = normalizeStatus('pending');

      await this.supabase.from('trinity_tasks').insert({
        title: `VERIFY: ${originalTask.title || originalTask.description?.substring(0, 50)}`,
        description: `Peer review needed (certainty ${certainty.toFixed(2)})

ORIGINAL TASK:
${originalTask.description || originalTask.title}

OUTPUT TO VERIFY:
${result.substring(0, 1500)}

Please verify accuracy, completeness, and actionability.
Rate confidence 0-1 and flag any issues.`,
        task_type: 'verification',
        priority: (originalTask.priority || 5) + 2,  // Higher priority
        parent_task_id: originalTask.id,
        agent_assigned: vAgent,  // Route to truth-seeker
        status: vStatus,
        metadata: {
          original_agent: this.name,
          original_certainty: certainty,
          verification_type: 'auto'
        },
        created_at: new Date().toISOString()
      });
      
      this.sessionMetrics.verificationTasksSpawned++;
      await this.log('verification_spawned', `Auto-verification for task ${originalTask.id}`, { 
        certainty, 
        original_task: originalTask.id 
      });
      
    } catch (err) {
      console.error(`[${this.name}] Failed to spawn verification:`, err.message);
    }
  }

  // ============================================
  // EVO GENOME REPORTING (Grok's evolution hook)
  // ============================================

  async reportToEVO() {
    if (!this.supabase || this.tasksCompletedThisSession % EVO_REPORT_INTERVAL !== 0) return;
    if (this.tasksCompletedThisSession === 0) return;
    
    const genome = {
      agent: this.name,
      version: '5.0.0',
      sessionMetrics: this.sessionMetrics,
      timestamp: new Date().toISOString(),
      providerPreferences: this.wisdom.preferredModels,
      effectiveProviders: Object.keys(this.sessionMetrics.providerSuccesses)
        .sort((a, b) => this.sessionMetrics.providerSuccesses[b] - this.sessionMetrics.providerSuccesses[a])
    };
    
    try {
      await this.supabase.from('evolution_log').insert({
        metric_name: 'agent_genome',
        value: this.sessionMetrics.tasksCompleted,
        agent: this.name,
        context: genome,
        created_at: new Date().toISOString()
      });
      
      console.log(`[${this.name}] 🧬 Genome reported to EVO`);
      await this.log('genome_reported', `Session genome after ${this.tasksCompletedThisSession} tasks`, genome);
      
    } catch (err) {
      console.log(`[${this.name}] Note: EVO genome reporting unavailable`);
    }
  }

  // ============================================
  // DEEP REASONING (Claude's contribution)
  // ============================================

  async deepReason(task) {
    const reasoningChain = [];
    
    // Step 1: Decomposition
    const decomposition = await this.callLLM(`
TASK: ${task.description || task.title}

STEP 1 - DECOMPOSITION:
Break this into logical steps with dependencies.
Output numbered steps.
`, { maxTokens: 1000, skipCache: true });

    reasoningChain.push({ step: 1, type: 'decomposition', output: decomposition.output });

    // Step 2: Dependencies
    const dependencies = await this.callLLM(`
Based on this decomposition:
${decomposition.output}

STEP 2 - DEPENDENCY ANALYSIS:
Which steps must complete before others? Which can parallelize?
`, { maxTokens: 500, skipCache: true });

    reasoningChain.push({ step: 2, type: 'dependencies', output: dependencies.output });

    // Step 3: Execute
    const execution = await this.callLLM(`
TASK: ${task.description || task.title}

DECOMPOSITION:
${decomposition.output}

DEPENDENCIES:
${dependencies.output}

STEP 3 - EXECUTION:
Complete the task following the logical steps.
`, { maxTokens: 2000, skipCache: true });

    reasoningChain.push({ step: 3, type: 'execution', output: execution.output });

    // Store chain
    await this.storeReasoningChain(task.id, reasoningChain);

    return {
      output: execution.output,
      reasoningDepth: reasoningChain.length,
      chain: reasoningChain,
      isReal: execution.isReal
    };
  }

  // ============================================
  // REFLECTION (Claude's contribution)
  // ============================================

  async reflectAndImprove(task, initialOutput, initialCertainty) {
    if (initialCertainty >= VERIFICATION_THRESHOLD - 0.05) {
      return { output: initialOutput, certainty: initialCertainty, reflected: false };
    }

    console.log(`[${this.name}] 🔄 Reflecting on output (certainty ${initialCertainty.toFixed(2)})...`);

    const critique = await this.callLLM(`
You are VERITAS reviewing ${this.name}'s work.

TASK: ${task.description || task.title}

OUTPUT TO REVIEW:
${initialOutput.substring(0, 2000)}

CRITIQUE:
1. ACCURACY (0-1): Verifiable?
2. COMPLETENESS (0-1): Fully addresses task?
3. ACTIONABILITY (0-1): Can act on immediately?

For each issue, suggest a fix.
End with: OVERALL_SCORE: X.XX
`, { maxTokens: 1000, skipCache: true });

    const scoreMatch = critique.output.match(/OVERALL_SCORE:\s*([\d.]+)/);
    const critiqueScore = scoreMatch ? parseFloat(scoreMatch[1]) : 0.7;

    if (critiqueScore < VERIFICATION_THRESHOLD - 0.1) {
      console.log(`[${this.name}] 🔧 Regenerating based on critique...`);
      
      const improved = await this.callLLM(`
ORIGINAL TASK: ${task.description || task.title}

PREVIOUS OUTPUT:
${initialOutput.substring(0, 1500)}

CRITIQUE:
${critique.output}

REGENERATE: Address critique points. Be more specific and actionable.
`, { maxTokens: 2000, skipCache: true });

      this.sessionMetrics.tasksReflected++;
      
      return {
        output: improved.output,
        certainty: Math.min(critiqueScore + 0.15, 0.95),
        reflected: true,
        critique: critique.output
      };
    }

    return { output: initialOutput, certainty: critiqueScore, reflected: false };
  }

  // ============================================
  // INTELLIGENT TASK PROCESSING
  // ============================================

  async intelligentProcess(task) {
    this.currentTask = task;
    
    const isComplex = (task.description?.length > 200) || 
                      (task.priority >= 8) ||
                      (task.task_type === 'research');

    let result;
    if (isComplex) {
      console.log(`[${this.name}] 🧠 Deep reasoning for complex task`);
      result = await this.deepReason(task);
    } else {
      const prompt = this.buildSmartPrompt(task);
      result = await this.callLLM(prompt, { taskType: task.task_type });
      result.reasoningDepth = 1;
    }

    // Calculate certainty
    let certainty = 0.85;
    const desc = (task.description || '').toLowerCase();
    if (desc.includes('research') || desc.includes('analyze')) {
      certainty = 0.70;
    } else if (desc.includes('verify') || desc.includes('fact')) {
      certainty = 0.90;
    }
    if (result.cached) certainty = Math.min(certainty + 0.05, 0.95);

    // Reflect if needed
    const reflected = await this.reflectAndImprove(task, result.output, certainty);

    // Auto-spawn verification for low certainty (Grok's insight)
    await this.spawnVerificationTask(task, reflected.output, reflected.certainty);

    // Update metrics
    this.sessionMetrics.tasksCompleted++;
    this.tasksCompletedThisSession++;

    // Report to EVO periodically
    await this.reportToEVO();

    let repidBonus = 0;
    if (result.reasoningDepth >= REASONING_DEPTH_TARGET) repidBonus += REPID.DEEP_REASONING_BONUS;
    if (reflected.reflected) repidBonus += REPID.REFLECTION_IMPROVEMENT;

    return {
      output: reflected.output,
      certainty: reflected.certainty,
      isReal: result.isReal !== false,
      provider: result.provider,
      reasoningDepth: result.reasoningDepth,
      reflected: reflected.reflected,
      cached: result.cached,
      repidBonus
    };
  }

  buildSmartPrompt(task) {
    return `## Task Assignment

**Title:** ${task.title || 'Task'}
**Type:** ${task.task_type || 'general'}
**Priority:** ${task.priority || 5}/10

**Description:**
${task.description || 'Complete this task'}

---

**Your Role:** ${this.wisdom.name} (${this.wisdom.role})
**Approach:** ${this.wisdom.reasoningStyle}

Provide clear, actionable output. Flag uncertainties.
`;
  }

  looksLikeTemplate(output) {
    if (!output || typeof output !== 'string') return false;
    const patterns = [
      /^\[SIMULATED\]/i,
      /\[.*would execute.*\]/i,
      /^DATABASE ANALYSIS:/,
      /\[HDM Analysis.*Confidence.*\]/
    ];
    return patterns.some(p => p.test(output));
  }

  // ============================================
  // DATA PERSISTENCE
  // ============================================

  async storeReasoningChain(taskId, chain) {
    if (!this.supabase) return;
    try {
      await this.supabase.from('reasoning_log').insert({
        task_id: taskId,
        agent: this.name,
        chain,
        depth: chain.length,
        created_at: new Date().toISOString()
      });
    } catch (err) { /* Table might not exist */ }
  }

  async log(action, message, metadata = {}) {
    if (!this.supabase) return;
    try {
      await this.supabase.from('autonomous_logs').insert({
        agent: this.name,
        action,
        message,
        metadata: { ...metadata, timestamp: new Date().toISOString() },
        timestamp: new Date().toISOString()
      });
      console.log(`[${this.name}] ${action}: ${message}`);
    } catch (err) {
      console.error(`[${this.name}] Log error:`, err.message);
    }
  }

  // ============================================
  // HEARTBEAT & STATUS
  // ============================================

  async heartbeat() {
    if (!this.supabase) return;
    try {
      await this.supabase.from('agent_status').upsert({
        agent: this.name,
        status: 'active',
        last_heartbeat: new Date().toISOString(),
        orchestrator_role: this.isConductor,
        metadata: {
          role: this.isConductor ? 'CONDUCTOR' : 'MEMBER',
          tier: this.tier,
          specialties: this.specialties,
          available_providers: this.availableProviders,
          session_metrics: this.sessionMetrics,
          version: '5.0.0-unstoppable-wisdom'
        }
      }, { onConflict: 'agent' });
    } catch (err) {
      console.error(`[${this.name}] Heartbeat error:`, err.message);
    }
  }

  // ============================================
  // REPID MANAGEMENT
  // ============================================

  async getRepID() {
    if (!this.supabase) return 100;
    try {
      const { data } = await this.supabase
        .from('agent_repid')
        .select('repid_score')
        .eq('agent_name', this.name)
        .single();
      return data?.repid_score || 100;
    } catch { return 100; }
  }

  async updateRepID(change, reason) {
    if (!this.supabase) return;
    try {
      const current = await this.getRepID();
      const newScore = Math.max(10, Math.min(10000, current + change));
      
      await this.supabase.from('agent_repid').upsert({
        agent_name: this.name,
        repid_score: newScore,
        last_activity: new Date().toISOString()
      }, { onConflict: 'agent_name' });
      
      await this.log('repid_change', `${change > 0 ? '+' : ''}${change}: ${reason}`, {
        previous: current, new: newScore
      });
    } catch (err) {
      console.error(`[${this.name}] RepID error:`, err.message);
    }
  }

  // ============================================
  // CONDUCTOR ROTATION
  // ============================================

  async checkRotation() {
    if (!this.supabase) return;
    
    try {
      const { data: rotation } = await this.supabase
        .from('rotation_state')
        .select('*')
        .single();
      
      if (!rotation) return;
      
      const elapsed = Date.now() - new Date(rotation.rotation_time).getTime();
      
      if (elapsed > CONDUCTOR_TENURE_MS) {
        const agents = ['APM', 'HDM', 'MEL', 'GCM', 'TORCH', 'VERITAS'];
        const currentIndex = agents.indexOf(rotation.current_conductor);
        const nextConductor = agents[(currentIndex + 1) % agents.length];
        
        if (nextConductor === this.name) {
          await this.assumeConductor(rotation.rotation_number + 1);
        }
      }
      
      this.isConductor = (rotation.current_conductor === this.name);
      if (this.isConductor && !this.conductorSince) {
        this.conductorSince = rotation.rotation_time;
      }
    } catch (err) {
      console.error(`[${this.name}] Rotation error:`, err.message);
    }
  }

  async assumeConductor(rotationNumber) {
    this.isConductor = true;
    this.conductorSince = new Date().toISOString();
    
    await this.supabase.from('rotation_state').upsert({
      id: 1,
      current_conductor: this.name,
      rotation_time: this.conductorSince,
      rotation_number: rotationNumber
    }, { onConflict: 'id' });
    
    await this.log('conductor_assumed', `🎭 ${this.name} is CONDUCTOR`);
  }

  async checkTenure() {
    if (!this.isConductor || !this.conductorSince) return;
    
    const tenure = Date.now() - new Date(this.conductorSince).getTime();
    if (tenure > CONDUCTOR_TENURE_MS) {
      this.isConductor = false;
      this.conductorSince = null;
    }
  }

  // ============================================
  // TASK ROUTING
  // ============================================

  async routePendingTasks() {
    if (!this.supabase || !this.isConductor) return 0;
    
    try {
      const canonicalStatus = normalizeStatus('pending');
      const { data: tasks } = await this.supabase
        .from('trinity_tasks')
        .select('*')
        .eq('status', canonicalStatus)
        .or('agent_assigned.is.null,agent_assigned.eq.All')
        .order('priority', { ascending: false })
        .limit(5);
      
      if (!tasks?.length) return 0;
      
      let routed = 0;
      for (const task of tasks) {
        const text = ((task.description || '') + ' ' + (task.tags || []).join(' ')).toLowerCase();
        let best = { agent: 'HDM', score: 0 };
        
        for (const [agentName, wisdom] of Object.entries(AGENT_WISDOM)) {
          if (agentName === 'EVO') continue;
          const score = wisdom.specialties.filter(k => text.includes(k)).length;
          if (score > best.score) best = { agent: agentName, score };
        }
        
        try {
          const validAgent = normalizeAgentName(best.agent);
          const validStatus = normalizeStatus('assigned');
          await this.supabase
            .from('trinity_tasks')
            .update({
              agent_assigned: validAgent,
              status: validStatus,
              claimed_at: new Date().toISOString()
            })
            .eq('id', task.id);
        } catch(e) { console.error(`[${this.name}] Routing rejection: ${e.message}`); continue; }
        
        routed++;
      }
      
      return routed;
    } catch (err) {
      console.error(`[${this.name}] Routing error:`, err.message);
      return 0;
    }
  }

  // ============================================
  // TASK PROCESSING
  // ============================================

  async claimNextTask() {
    if (!this.supabase) return null;
    
    try {
      const canonicalName = normalizeAgentName(this.name);
      const canonicalStatus = normalizeStatus('assigned');
      const { data: tasks } = await this.supabase
        .from('trinity_tasks')
        .select('*')
        .eq('agent_assigned', canonicalName)
        .eq('status', canonicalStatus)
        .order('priority', { ascending: false })
        .limit(1);
      
      if (!tasks?.length) return null;
      
      const task = tasks[0];
      
      const wipStatus = normalizeStatus('in_progress');
      const claimedName = normalizeAgentName(this.name);
      await this.supabase
        .from('trinity_tasks')
        .update({ 
          status: wipStatus,
          claimed_by: claimedName,
          started_at: new Date().toISOString()
        })
        .eq('id', task.id);
      
      await this.log('task_claimed', `Working: ${task.title || task.id}`);
      return task;
    } catch (err) {
      console.error(`[${this.name}] Claim error:`, err.message);
      return null;
    }
  }

  async completeTask(taskId, result, certainty = 0.85, isReal = true, extras = {}) {
    if (!this.supabase) return;
    
    try {
      const doneStatus = normalizeStatus('completed');
      const claimedName = normalizeAgentName(this.name);
      await this.supabase
        .from('trinity_tasks')
        .update({
          status: doneStatus,
          result: { 
            output: result, 
            is_real: isReal,
            completed_by: claimedName,
            reasoning_depth: extras.reasoningDepth || 1,
            reflected: extras.reflected || false,
            cached: extras.cached || false,
            version: '5.0.0-unstoppable-wisdom',
            timestamp: new Date().toISOString()
          },
          certainty,
          reasoning_depth: extras.reasoningDepth || 1,
          reflected: extras.reflected || false,
          completed_at: new Date().toISOString(),
          completed_by: claimedName,
          is_real: isReal
        })
        .eq('id', taskId);
      
      const { data: task } = await this.supabase
        .from('trinity_tasks')
        .select('priority')
        .eq('id', taskId)
        .single();
      
      let repidGain = Math.min(REPID.TASK_COMPLETE_MAX, 
        REPID.TASK_COMPLETE_BASE + (task?.priority || 5));
      
      if (isReal) repidGain += 2;
      if (extras.repidBonus) repidGain += extras.repidBonus;
      
      await this.updateRepID(repidGain, `Completed ${taskId}`);
      await this.log('task_completed', `✅ ${taskId}`, { certainty, isReal, ...extras });
      
    } catch (err) {
      console.error(`[${this.name}] Complete error:`, err.message);
    }
  }

  // ============================================
  // PEER REVIEW
  // ============================================

  async reviewPeerWork() {
    if (!this.supabase || this.tier !== 'senior') return;
    
    try {
      const doneStatus = normalizeStatus('completed');
      const { data: tasks } = await this.supabase
        .from('trinity_tasks')
        .select('*')
        .eq('status', doneStatus)
        .neq('agent_assigned', normalizeAgentName(this.name))
        .lt('certainty', CERTAINTY_THRESHOLD)
        .gte('completed_at', new Date(Date.now() - 3600000).toISOString())
        .limit(3);
      
      if (!tasks) return;
      
      for (const task of tasks) {
        const { data: existing } = await this.supabase
          .from('repid_challenges')
          .select('id')
          .eq('task_id', task.id)
          .eq('challenger', this.name);
        
        if (existing?.length > 0) continue;
        
        if (task.certainty < 0.60 || this.challengesToday < FREE_CHALLENGES_PER_DAY) {
          await this.supabase.from('repid_challenges').insert({
            task_id: task.id,
            challenger: normalizeAgentName(this.name),
            challenged: normalizeAgentName(task.agent_assigned || 'trinity-orch'),
            reason: `Certainty ${task.certainty} < ${CERTAINTY_THRESHOLD}`,
            outcome: 'pending',
            created_at: new Date().toISOString()
          });
          this.challengesToday++;
        }
      }
    } catch (err) {
      console.error(`[${this.name}] Review error:`, err.message);
    }
  }

  // ============================================
  // MAIN LOOP
  // ============================================

  async run(customProcessTask = null) {
    console.log('═'.repeat(60));
    console.log(`[${this.name}] 🚀 v5.0.0 - UNSTOPPABLE WISDOM`);
    console.log(`[${this.name}] 🧠 Providers: ${this.availableProviders.join(', ') || 'NONE'}`);
    console.log(`[${this.name}] 📜 ${this.wisdom.role} (${this.tier})`);
    console.log('═'.repeat(60));
    
    await this.log('startup', `${this.name} online - Unstoppable Wisdom`, {
      providers: this.availableProviders,
      version: '5.0.0'
    });
    
    while (true) {
      try {
        await this.heartbeat();
        await this.checkRotation();
        
        if (this.isConductor) {
          await this.routePendingTasks();
          await this.checkTenure();
        }
        
        const task = await this.claimNextTask();
        if (task) {
          let result;
          
          if (customProcessTask) {
            result = await customProcessTask(task);
          }
          
          if (!result || this.looksLikeTemplate(result?.output)) {
            result = await this.intelligentProcess(task);
          }
          
          if (result) {
            await this.completeTask(
              task.id, 
              result.output, 
              result.certainty || 0.85, 
              result.isReal !== false,
              {
                reasoningDepth: result.reasoningDepth,
                reflected: result.reflected,
                cached: result.cached,
                repidBonus: result.repidBonus
              }
            );
          }
        }
        
        if (this.tier === 'senior') {
          await this.reviewPeerWork();
        }
        
        await new Promise(r => setTimeout(r, 30000));
        
      } catch (err) {
        console.error(`[${this.name}] ❌ Error:`, err.message);
        await this.log('error', err.message);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
}

module.exports = { 
  ConstitutionalAgent, 
  REPID, 
  AGENT_WISDOM, 
  LLM_PROVIDERS,
  VERIFICATION_THRESHOLD,
  REASONING_DEPTH_TARGET
};
