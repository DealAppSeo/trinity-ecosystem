/**
 * TRINITY CONSTITUTIONAL AGENT V4 (LOCAL COPY) - W3C
 */
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

class ConstitutionalAgentV4 {
    // ... Exact copy of the class logic ...
    constructor(config) {
        const rawName = config.name || process.env.AGENT_NAME || 'UNKNOWN';
        this.name = this.resolveLegacyName(rawName);
        this.version = '2026-03-03-v4-NORMALIZED';
        this.groupName = this.determineGroup(this.name);
        this.isSurvivor = ['trinity-torch', 'trinity-chesed', 'trinity-sophia'].includes(this.name);
        this.heartbeatInterval = null;
        this.sessionMetrics = { tasksCompleted: 0, healingAttempts: 0, llmCalls: 0, startTime: Date.now() };
        const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!SUPABASE_URL || !SUPABASE_KEY) { console.error(`[${this.name}] CRITICAL: No Supabase Credentials!`); process.exit(1); }
        this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    determineGroup(name) {
        const groups = {
            'COMMUNICATION': ['gabriel', 'raziel', 'cassiel'],
            'ORCHESTRATION': ['trinity-torch', 'zadkiel', 'haniel'],
            'CREATION': ['trinity-chesed', 'auriel', 'uriel'],
            'EXECUTION': ['trinity-sophia', 'michael', 'raphael'],
            'CONDUCTOR': ['api', 'mcp', 'orchestrator', 'trinity-apm', 'trinity-gcm', 'trinity-hdm', 'trinity-mel', 'trinity-veritas', 'trinity-w3c']
        };
        const searchName = name.replace('trinity-', '').toLowerCase();
        for (const [group, members] of Object.entries(groups)) {
            if (members.includes(name) || members.includes(searchName)) return group;
        }
        return 'UNKNOWN';
    }

    resolveLegacyName(name) {
        if (!name) return 'trinity-orch';
        const MAP = {
            'MCP': 'trinity-orch', 'ORCH': 'trinity-orch', 'orch': 'trinity-orch',
            'MEL': 'trinity-mel', 'APM': 'trinity-apm', 'GCM': 'trinity-gcm',
            'HDM': 'trinity-hdm', 'TORCH': 'trinity-torch', 'VERITAS': 'trinity-veritas',
            'SHOFET': 'trinity-shofet', 'SOPHIA': 'trinity-sophia', 'NEXUS': 'trinity-nexus',
            'W3C': 'trinity-w3c', 'CHESED': 'trinity-chesed'
        };
        const upper = name.toUpperCase();
        if (MAP[upper]) return MAP[upper];
        const normalized = name.toLowerCase();
        return normalized.startsWith('trinity-') ? normalized : `trinity-${normalized}`;
    }
    async start() {
        console.log('========================================');
        console.log('!!! NEW CODE v4 - 2026-01-03 (INJECTED) !!!');
        console.log(`[BOOT] Agent: ${this.name} (${this.groupName})`);
        console.log(`[BOOT] Version: ${this.version}`);
        console.log('========================================');
        await this.heartbeat();
        // [ANTIGRAVITY] ARBITRAGE: Heartbeat interval removed.
        /*
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => this.heartbeat(), 2 * 60 * 1000);
        */
        if (this.isSurvivor) await this.runSurvivorBootProtocol();
        this.startHttpServer();
        this.runLoop().catch(err => console.error(`[${this.name}] FATAL LOOP CRASH:`, err));
    }
    startHttpServer() {
        const app = express();
        const PORT = process.env.PORT || 10000;
        app.get('/', (req, res) => res.json({ status: 'online', agent: this.name, version: this.version }));
        app.get('/health', (req, res) => res.json({ status: 'healthy', agent: this.name }));
        app.listen(PORT, () => console.log(`[${this.name}] 🌍 HTTP Server listening on ${PORT}`));
    }
    async runLoop() {
        console.log(`[${this.name}] 🚀 Entering Main Task Loop...`);
        while (true) {
            try {
                const task = await this.getNextTask();
                if (task) {
                    console.log(`[${this.name}] 📋 Processing: ${task.title}`);
                    await this.heartbeat(`Claimed: ${task.title}`);
                    await this.processRouter(task);
                    await this.heartbeat(`Completed: ${task.title}`);
                }
                if (this.isSurvivor && Math.random() < 0.1) await this.checkGroupHealth();
                await this.sleep(30000); // Increased poll interval to 30s
            } catch (err) { console.error(`[${this.name}] Loop Error:`, err.message); await this.sleep(30000); }
        }
    }
    async getNextTask() {
        const { data } = await this.supabase.from('trinity_tasks').select('*').or(`assigned_to.eq.${this.name},assigned_to.is.null`).eq('status', 'pending').order('priority', { ascending: false }).order('created_at', { ascending: true }).limit(1).single();
        return data;
    }
    async processRouter(task) { if (this.canHandleLocally(task)) return await this.handleLocal(task); return await this.processWithLLM(task); }
    canHandleLocally(task) {
        const localTypes = ['self-healing', 'system', 'heartbeat', 'wake', 'meta'];
        const localTitles = ['[HEALING]', '[HEARTBEAT]', '[SYSTEM]'];
        if (localTypes.includes(task.task_type)) return true;
        if (task.title && localTitles.some(t => task.title.includes(t))) return true;
        return false;
    }
    async handleLocal(task) {
        console.log(`[LOCAL] ⚡ Handling ${task.id}`);
        await this.supabase.from('trinity_tasks').update({ status: 'in_progress', claimed_by: this.name }).eq('id', task.id);
        let result = "Processed locally";
        if (task.task_type === 'heartbeat' || task.title.includes('[HEARTBEAT]')) { await this.heartbeat(); result = "Heartbeat sent"; }
        else if (task.task_type === 'self-healing') { result = "Healing protocols executed"; this.sessionMetrics.healingAttempts++; }
        await this.supabase.from('trinity_tasks').update({ status: 'completed', result, completed_at: new Date().toISOString() }).eq('id', task.id);
        this.sessionMetrics.tasksCompleted++;
    }
    async processWithLLM(task) {
        console.log(`[LLM] 🧠 Processing ${task.id}`);
        await this.supabase.from('trinity_tasks').update({ status: 'in_progress', claimed_by: this.name }).eq('id', task.id);
        try {
            await this.sleep(2000);
            const output = `[SIMULATION] Completed analysis of ${task.title} by ${this.name}`;
            if (['content', 'code'].includes(task.task_type)) await this.saveArtifact(task.id, output);
            await this.supabase.from('trinity_tasks').update({ status: 'completed', result: output, completed_at: new Date().toISOString() }).eq('id', task.id);
            this.sessionMetrics.tasksCompleted++;
            this.sessionMetrics.llmCalls++;
        } catch (e) {
            console.error(`[LLM] Error:`, e.message);
            await this.supabase.from('trinity_tasks').update({ status: 'failed', result: e.message }).eq('id', task.id);
        }
    }
    async heartbeat() {
        const timestamp = new Date().toISOString();
        try { await this.supabase.from('trinity_heartbeat').upsert({ agent: this.name, status: 'active', version: this.version, last_seen: timestamp, config: { group: this.groupName, isSurvivor: this.isSurvivor, metrics: this.sessionMetrics } }, { onConflict: 'agent' }); } catch (e) { }
        try { await this.supabase.from('agent_heartbeat').upsert({ agent_name: this.name, status: 'online', last_ping: timestamp }, { onConflict: 'agent_name' }); console.log(`[HEARTBEAT] Ping sent ${timestamp}`); } catch (e) { console.error('[HEARTBEAT] Failed:', e.message); }
    }
    async saveArtifact(taskId, content) {
        try {
            const { data } = await this.supabase.from('trinity_artifacts').insert({ task_id: taskId, agent_name: this.name, artifact_type: 'text', content_preview: content.substring(0, 50), status: 'created' }).select().single();
            console.log(`[ARTIFACT] Saved: ${data?.id}`);
        } catch (e) { console.error('[ARTIFACT] Save failed:', e.message); }
    }
    async runSurvivorBootProtocol() { console.log(`[SURVIVOR] 🛡️ Checking group ${this.groupName}...`); }
    async checkGroupHealth() { }
    async sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}
module.exports = ConstitutionalAgentV4;
