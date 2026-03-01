#!/usr/bin/env npx tsx
/**
 * CRYPTO PROGNOSTICATOR — DEPLOYMENT VERIFICATION SUITE
 * Run after every Antigravity build + Railway deploy
 * Usage: npx tsx scripts/verify-deployment.ts [--check=all|supabase|alpaca|telegram|cycle|postmortem]
 *
 * Paste into your repo at: scripts/verify-deployment.ts
 */

import { createClient } from '@supabase/supabase-js';

// ── CONFIG ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;
const ALPACA_API_KEY = process.env.ALPACA_API_KEY!;
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY!;
const ALPACA_BASE_URL = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets/v2';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_OWNER_CHAT_ID || process.env.TELEGRAM_CHAT_ID!;

const REQUIRED_TABLES = [
    'prediction_regimes', 'prediction_signals', 'prediction_consensus',
    'prediction_outcomes', 'prediction_postmortems', 'agent_accuracy_matrix',
    'agent_capability_scores', 'agent_role_contributions', 'anfis_weight_history',
    'harmonic_cycles', 'peer_lessons', 'historical_wisdom_activations',
    'influencer_rep_scores', 'insider_trading_signals', 'bubble_migration_events',
    'beneficiary_analysis', 'trade_execution_log', 'hitl_hunch_log',
    'human_intuition_scores'
];

const REQUIRED_COLUMNS = {
    prediction_consensus: ['cycle_id', 'asset', 'final_signal', 'hitl_required', 'hitl_completed_at', 'comma_severity', 'reverse_cascade_detected'],
    hitl_hunch_log: ['hunch_category', 'confidence_in_self', 'consensus_id', 'hunch_was_correct'],
    prediction_signals: ['cycle_id', 'agent_id', 'asset', 'hallucination_risk', 'contradicting_evidence'],
    trade_execution_log: ['portfolio_assignment', 'execution_mode', 'alpaca_order_id'],
    human_intuition_scores: ['hias_score', 'veto_power_active', 'comma_trigger_active'],
};

const VALID_HUNCH_CATEGORIES = [
    'STRONG_YES', 'LEAN_YES', 'NEUTRAL', 'LEAN_NO',
    'STRONG_NO', 'PATTERN_SEEN', 'NEWS_AWARE', 'TIMING_FEEL'
];

// ── COLORS ─────────────────────────────────────────────────────────────────
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;
let warned = 0;

function ok(msg: string) { console.log(`  ${GREEN}✅ ${msg}${RESET}`); passed++; }
function fail(msg: string) { console.log(`  ${RED}❌ ${msg}${RESET}`); failed++; }
function warn(msg: string) { console.log(`  ${YELLOW}⚠️  ${msg}${RESET}`); warned++; }
function info(msg: string) { console.log(`  ${CYAN}ℹ️  ${msg}${RESET}`); }
function section(msg: string) { console.log(`\n${BOLD}${CYAN}── ${msg} ──${RESET}`); }

// ── CHECK 1: ENVIRONMENT VARIABLES ────────────────────────────────────────
async function checkEnvVars() {
    section('CHECK 1: Environment Variables');
    const required = [
        'SUPABASE_URL', 'ALPACA_API_KEY', 'ALPACA_SECRET_KEY',
        'TELEGRAM_BOT_TOKEN',
    ];
    const eitherOr = [
        ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'],
        ['TELEGRAM_OWNER_CHAT_ID', 'TELEGRAM_CHAT_ID'],
    ];

    for (const key of required) {
        process.env[key] ? ok(`${key} present`) : fail(`${key} MISSING`);
    }
    for (const [a, b] of eitherOr) {
        (process.env[a] || process.env[b])
            ? ok(`${a} or ${b} present`)
            : fail(`Neither ${a} nor ${b} found`);
    }
}

// ── CHECK 2: SUPABASE TABLES ───────────────────────────────────────────────
async function checkSupabaseTables() {
    section('CHECK 2: Supabase — All 19 Tables');
    if (!SUPABASE_URL || !SUPABASE_KEY) { fail('Supabase credentials missing — skipping'); return; }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data, error } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');

    if (error) { fail(`Supabase connection failed: ${error.message}`); return; }

    const existing = new Set((data || []).map((r: any) => r.table_name));
    for (const table of REQUIRED_TABLES) {
        existing.has(table) ? ok(table) : fail(`${table} — TABLE MISSING`);
    }
}

// ── CHECK 3: SUPABASE COLUMNS ─────────────────────────────────────────────
async function checkSupabaseColumns() {
    section('CHECK 3: Supabase — Critical Columns');
    if (!SUPABASE_URL || !SUPABASE_KEY) { fail('Supabase credentials missing — skipping'); return; }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
        const { data, error } = await supabase
            .from('information_schema.columns')
            .select('column_name')
            .eq('table_schema', 'public')
            .eq('table_name', table);

        if (error) { fail(`Could not query columns for ${table}`); continue; }

        const existing = new Set((data || []).map((r: any) => r.column_name));
        for (const col of columns) {
            existing.has(col)
                ? ok(`${table}.${col}`)
                : fail(`${table}.${col} — COLUMN MISSING`);
        }
    }
}

// ── CHECK 4: SUPABASE RPC ─────────────────────────────────────────────────
async function checkSupabaseRPC() {
    section('CHECK 4: Supabase — Atomic RPC Function');
    if (!SUPABASE_URL || !SUPABASE_KEY) { fail('Supabase credentials missing — skipping'); return; }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data, error } = await supabase
        .from('information_schema.routines')
        .select('routine_name')
        .eq('routine_schema', 'public')
        .eq('routine_name', 'process_prediction_postmortem');

    if (error || !data?.length) {
        fail('process_prediction_postmortem RPC — NOT FOUND. Run sql/postmortem_atomic.sql in Supabase editor.');
    } else {
        ok('process_prediction_postmortem RPC deployed');
    }
}

// ── CHECK 5: SUPABASE SEED DATA ───────────────────────────────────────────
async function checkSeedData() {
    section('CHECK 5: Supabase — Seed Data');
    if (!SUPABASE_URL || !SUPABASE_KEY) { fail('Supabase credentials missing — skipping'); return; }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { count: influencerCount } = await supabase
        .from('influencer_rep_scores')
        .select('*', { count: 'exact', head: true });

    influencerCount && influencerCount >= 16
        ? ok(`influencer_rep_scores: ${influencerCount} records seeded`)
        : fail(`influencer_rep_scores: only ${influencerCount || 0} records — expected 16+`);
}

// ── CHECK 6: ALPACA CONNECTION ────────────────────────────────────────────
async function checkAlpaca() {
    section('CHECK 6: Alpaca Paper Trading');
    if (!ALPACA_API_KEY || !ALPACA_SECRET_KEY) { fail('Alpaca credentials missing — skipping'); return; }

    try {
        const res = await fetch(`${ALPACA_BASE_URL}/account`, {
            headers: {
                'APCA-API-KEY-ID': ALPACA_API_KEY,
                'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
            }
        });

        if (!res.ok) { fail(`Alpaca API returned ${res.status}`); return; }

        const account = await res.json();
        ok(`Alpaca connected — Account: ${account.account_number}`);

        const buyingPower = parseFloat(account.buying_power);
        buyingPower >= 90000
            ? ok(`Buying power: $${buyingPower.toLocaleString()}`)
            : warn(`Buying power: $${buyingPower.toLocaleString()} — lower than expected $100k`);

        account.status === 'ACTIVE'
            ? ok(`Account status: ${account.status}`)
            : warn(`Account status: ${account.status}`);

    } catch (e: any) {
        fail(`Alpaca connection error: ${e.message}`);
    }
}

// ── CHECK 7: TELEGRAM BOT ─────────────────────────────────────────────────
async function checkTelegram() {
    section('CHECK 7: Telegram @AITrinityBot');
    if (!TELEGRAM_BOT_TOKEN) { fail('TELEGRAM_BOT_TOKEN missing — skipping'); return; }

    try {
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
        const data = await res.json();

        if (!data.ok) { fail(`Telegram bot error: ${data.description}`); return; }

        ok(`Bot connected: @${data.result.username}`);

        if (TELEGRAM_CHAT_ID) {
            const msgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: '🔧 *Deployment Verification* — Telegram connectivity confirmed\n_Crypto Prognosticator v3.1_',
                    parse_mode: 'Markdown'
                })
            });
            const msgData = await msgRes.json();
            msgData.ok
                ? ok(`Test message sent — message_id: ${msgData.result.message_id}`)
                : fail(`Test message failed: ${msgData.description}`);
        } else {
            warn('TELEGRAM_CHAT_ID not set — skipping test message');
        }
    } catch (e: any) {
        fail(`Telegram error: ${e.message}`);
    }
}

// ── CHECK 8: LIVE CYCLE DATA ───────────────────────────────────────────────
async function checkLiveCycleData() {
    section('CHECK 8: Live Prediction Cycle Data');
    if (!SUPABASE_URL || !SUPABASE_KEY) { fail('Supabase credentials missing — skipping'); return; }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Most recent regime
    const { data: regimes, error: rErr } = await supabase
        .from('prediction_regimes')
        .select('id, regime_type, detected_at, regime_confidence')
        .order('detected_at', { ascending: false })
        .limit(1);

    if (rErr || !regimes?.length) {
        fail('prediction_regimes — no rows found. Prediction cycle has not run yet.');
    } else {
        const r = regimes[0];
        ok(`Latest regime: id=${r.id} type=${r.regime_type} confidence=${r.regime_confidence} at ${r.detected_at}`);
    }

    // Most recent signals
    const { data: signals, error: sErr } = await supabase
        .from('prediction_signals')
        .select('id, cycle_id, agent_id, asset, final_direction, hallucination_risk')
        .order('created_at', { ascending: false })
        .limit(5);

    if (sErr || !signals?.length) {
        fail('prediction_signals — no rows found.');
    } else {
        ok(`Latest signals: ${signals.length} found`);
        for (const s of signals) {
            info(`  → agent=${s.agent_id} asset=${s.asset} direction=${s.final_direction} hallucination=${s.hallucination_risk}`);
        }
    }

    // Most recent consensus
    const { data: consensus, error: cErr } = await supabase
        .from('prediction_consensus')
        .select('id, cycle_id, asset, final_signal, hitl_required, comma_severity')
        .order('initiated_at', { ascending: false })
        .limit(3);

    if (cErr || !consensus?.length) {
        fail('prediction_consensus — no rows found.');
    } else {
        ok(`Latest consensus: ${consensus.length} found`);
        for (const c of consensus) {
            info(`  → id=${c.id} asset=${c.asset} signal=${c.final_signal} hitl=${c.hitl_required} comma=${c.comma_severity}`);
        }
    }

    // HITL pending
    const { count: hitlPending } = await supabase
        .from('prediction_consensus')
        .select('*', { count: 'exact', head: true })
        .eq('hitl_required', true)
        .is('hitl_completed_at', null);

    hitlPending === 0
        ? ok('No HITL decisions pending')
        : warn(`${hitlPending} HITL decisions pending review in @AITrinityBot`);
}

// ── CHECK 9: HUNCH CATEGORIES ──────────────────────────────────────────────
async function checkHunchCategories() {
    section('CHECK 9: Hunch Category Constraint Validation');
    if (!SUPABASE_URL || !SUPABASE_KEY) { fail('Supabase credentials missing — skipping'); return; }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Check constraint exists with correct values
    const { data, error } = await supabase
        .from('information_schema.check_constraints')
        .select('constraint_name, check_clause')
        .like('check_clause', '%hunch_category%');

    if (error || !data?.length) {
        warn('Could not verify hunch_category constraint — check manually');
    } else {
        const clause = data[0].check_clause;
        const allValid = VALID_HUNCH_CATEGORIES.every(cat => clause.includes(cat));
        allValid
            ? ok(`hunch_category constraint contains all 8 correct values`)
            : fail(`hunch_category constraint WRONG — may contain Psychological/Technical/Insider/Harmonic. Check HITLCallbackHandler.ts`);
    }

    // Check any existing hunch records have valid categories
    const { data: hunches } = await supabase
        .from('hitl_hunch_log')
        .select('hunch_category')
        .limit(20);

    if (hunches?.length) {
        const invalid = hunches.filter((h: any) => !VALID_HUNCH_CATEGORIES.includes(h.hunch_category));
        invalid.length === 0
            ? ok(`All ${hunches.length} existing hunch records have valid categories`)
            : fail(`${invalid.length} hunch records have invalid categories: ${JSON.stringify(invalid)}`);
    } else {
        info('No hunch records yet — categories not testable until first HITL decision');
    }
}

// ── CHECK 10: ALPACA BETA TRADES ──────────────────────────────────────────
async function checkAlphaBetaTrades() {
    section('CHECK 10: Alpaca Portfolio Tagging');
    if (!ALPACA_API_KEY || !ALPACA_SECRET_KEY) { fail('Alpaca credentials missing — skipping'); return; }

    try {
        const res = await fetch(`${ALPACA_BASE_URL}/orders?status=all&limit=20`, {
            headers: {
                'APCA-API-KEY-ID': ALPACA_API_KEY,
                'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
            }
        });

        const orders = await res.json();
        if (!Array.isArray(orders) || orders.length === 0) {
            info('No orders yet — portfolio tagging not testable until first trade');
            return;
        }

        const betaOrders = orders.filter((o: any) => o.client_order_id?.startsWith('ATS-BETA-'));
        const alphaOrders = orders.filter((o: any) => !o.client_order_id?.startsWith('ATS-BETA-'));

        ok(`Total orders: ${orders.length}`);
        info(`  BETA (ATS automated): ${betaOrders.length}`);
        info(`  ALPHA (manual): ${alphaOrders.length}`);

        if (betaOrders.length > 0) {
            ok(`Latest BETA order: ${betaOrders[0].client_order_id} — ${betaOrders[0].symbol} ${betaOrders[0].side}`);
        }

    } catch (e: any) {
        fail(`Alpaca orders check error: ${e.message}`);
    }
}

// ── SUMMARY ───────────────────────────────────────────────────────────────
function printSummary() {
    console.log(`\n${BOLD}${'═'.repeat(50)}${RESET}`);
    console.log(`${BOLD}VERIFICATION SUMMARY${RESET}`);
    console.log(`${'═'.repeat(50)}`);
    console.log(`  ${GREEN}✅ Passed: ${passed}${RESET}`);
    console.log(`  ${YELLOW}⚠️  Warned: ${warned}${RESET}`);
    console.log(`  ${RED}❌ Failed: ${failed}${RESET}`);
    console.log(`${'═'.repeat(50)}`);

    if (failed === 0 && warned === 0) {
        console.log(`\n${GREEN}${BOLD}🎵 ALL CHECKS PASSED — System is live and verified${RESET}\n`);
    } else if (failed === 0) {
        console.log(`\n${YELLOW}${BOLD}⚠️  WARNINGS PRESENT — Review above before trading${RESET}\n`);
    } else {
        console.log(`\n${RED}${BOLD}❌ FAILURES DETECTED — Do not run live cycles until resolved${RESET}\n`);
    }

    process.exit(failed > 0 ? 1 : 0);
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
    const arg = process.argv.find(a => a.startsWith('--check='))?.split('=')[1] || 'all';

    console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════╗${RESET}`);
    console.log(`${BOLD}${CYAN}║  CRYPTO PROGNOSTICATOR — DEPLOYMENT VERIFICATION ║${RESET}`);
    console.log(`${BOLD}${CYAN}║  AI Trinity Symphony v3.1  |  ${new Date().toISOString().slice(0, 19)}  ║${RESET}`);
    console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════╝${RESET}`);
    console.log(`  Mode: ${arg.toUpperCase()}\n`);

    const checks: Record<string, () => Promise<void>> = {
        env: checkEnvVars,
        tables: checkSupabaseTables,
        columns: checkSupabaseColumns,
        rpc: checkSupabaseRPC,
        seed: checkSeedData,
        alpaca: checkAlpaca,
        telegram: checkTelegram,
        cycle: checkLiveCycleData,
        hunches: checkHunchCategories,
        trades: checkAlphaBetaTrades,
    };

    if (arg === 'all') {
        for (const fn of Object.values(checks)) await fn();
    } else if (checks[arg]) {
        await checks[arg]();
    } else {
        console.log(`Unknown check: ${arg}. Valid options: ${Object.keys(checks).join(', ')}, all`);
        process.exit(1);
    }

    printSummary();
}

main().catch(e => { console.error(RED + 'Fatal error: ' + e.message + RESET); process.exit(1); });
