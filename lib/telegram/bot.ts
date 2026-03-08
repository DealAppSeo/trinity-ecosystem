import { Telegraf, Context, Markup } from 'telegraf';
import { supabaseAdmin } from '../supabase';
import { transcribeVoice } from './voice';
import { AlphaTradeHandler } from './AlphaTradeHandler';
import { StatusCommandHandler } from './StatusCommandHandler';
import { HITLCallbackHandler } from '../hitl/HITLCallbackHandler';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
export const bot = new Telegraf(BOT_TOKEN);

// --- Helpers ---

const getUlabel = (u: number) => {
    if (u < 0.05) return '🟢 High confidence';
    if (u < 0.15) return '🟡 Moderate uncertainty';
    return '🔴 High uncertainty — review carefully';
};

const getRepTier = (rep: number) => {
    if (rep > 0.85) return '⭐⭐⭐ Trusted';
    if (rep > 0.65) return '⭐⭐ Established';
    return '⭐ New agent';
};

const OWNER_ID = process.env.TELEGRAM_OWNER_CHAT_ID;

const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
};

const getDrivingQuestion = async (userId: string) => {
    try {
        // [ANTIGRAVITY] CONTEXTUAL AWARENESS: Pull latest high-priority task for context
        const { data: latestTask } = await supabaseAdmin
            .from('trinity_tasks')
            .select('title, status')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (latestTask) {
            const contextMsg = latestTask.status === 'done' || latestTask.status === 'verified'
                ? `I see we just finished "${latestTask.title}".`
                : `Picking up from "${latestTask.title}" —`;

            const questions = [
                `${contextMsg} what should be our next strategic move?`,
                `${contextMsg} want me to scan for co-founders or grants related to this?`,
                `${contextMsg} how can I further automate this workflow for you?`,
                "Ready to conduct the symphony? What mission should we initiate next?"
            ];
            return questions[Math.floor(Math.random() * questions.length)];
        }
    } catch (e) {
        console.warn('[Bot] Context fetch failed, using defaults.');
    }

    const questions = [
        "What can I take off your plate today to free up your creative energy?",
        "How can I streamline your workflow—perhaps by routing a briefing or optimizing costs?",
        "What's one thing I can automate right now to make your day easier?",
        "Ready to conduct the symphony? What mission should we initiate next?"
    ];
    return questions[Math.floor(Math.random() * questions.length)];
};

/**
 * Proactively alert the owner about high-confidence swarm findings.
 * Used by the [SYSTEM] Pattern & Anomaly Detection mission.
 */
export const sendIntelligenceAlert = async (alert: {
    title: string;
    description: string;
    confidence: number;
    algorithms: string[];
    opportunity?: string;
}) => {
    if (!OWNER_ID) {
        console.warn('[Alert] No OWNER_ID configured. Alert suppressed.');
        return;
    }

    const uLabel = alert.confidence > 0.9 ? '💎 HIGH FIDELITY' : '📡 SWARM SIGNAL';
    const message = `
${uLabel}: *${alert.title}*
━━━━━━━━━━━━━━━━━━━━
📝 ${alert.description}

🎯 *Confidence*: ${(alert.confidence * 100).toFixed(1)}%
🧠 *Hybrid Stack*: ${alert.algorithms.join(', ')}
${alert.opportunity ? `\n💰 *Opportunity*: ${alert.opportunity}` : ''}

_Alert triggered by [SYSTEM] Anomaly Detection_
`;

    try {
        await bot.telegram.sendMessage(OWNER_ID, message, { parse_mode: 'Markdown' });
        console.log(`[Alert] Intelligence alert sent to ${OWNER_ID}`);
    } catch (err) {
        console.error('[Alert] Failed to send alert:', err);
    }
};

// --- Handlers ---

const handleHealth = async (ctx: Context) => {
    try {
        const userId = ctx.from?.id;
        const today = new Date().toISOString().split('T')[0];

        // 1. Fetch Stats
        const { count: tasksCount } = await supabaseAdmin.from('trinity_tasks').select('*', { count: 'exact', head: true }).eq('status', 'todo');
        const { count: pendingApprovals } = await supabaseAdmin.from('approval_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending');
        const { count: completedToday } = await supabaseAdmin.from('trinity_tasks').select('*', { count: 'exact', head: true }).eq('status', 'verified').gte('created_at', today);

        // 2. Fetch Savings
        const { data: savingsData } = await supabaseAdmin.from('trinity_cost_logs').select('savings_attribution').gte('created_at', today);
        const totalSavings = (savingsData || []).reduce((sum, row) => sum + (row.savings_attribution || 0), 0);

        // 3. Fetch Active Operations (Visibility requirement)
        const { data: activeOps } = await supabaseAdmin
            .from('trinity_tasks')
            .select('agent_id, task_type, metadata')
            .in('status', ['doing', 'in_progress', 'running'])
            .limit(5);

        const greeting = getGreeting();
        const drivingQuestion = await getDrivingQuestion(String(userId));

        const activeOpsList = activeOps && activeOps.length > 0
            ? activeOps.map(op => `• *${op.agent_id}*: Processing ${op.task_type}`).join('\n')
            : '• All agents on standby.';

        const message = `
🎻 *SYMPHONY HEALTH*
━━━━━━━━━━━━━━━━━━━━
📊 *Today's Alpha*: $${totalSavings.toFixed(4)}
⚡ *Swarm Velocity*: ${completedToday || 0} tasks verified
⏳ *Action Required*: ${pendingApprovals || 0} approvals
✅ *Todo Backlog*: ${tasksCount || 0} missions

🚀 *Active Operations*:
${activeOpsList}

${greeting}${ctx.from?.first_name ? `, ${ctx.from.first_name}` : ''}!
${drivingQuestion}
`;
        await supabaseAdmin.from('trinity_bot_users').update({ last_interaction: new Date().toISOString() }).eq('chat_id', String(userId));
        return ctx.replyWithMarkdown(message, commandCenter);
    } catch (err: any) {
        console.error('[Health] Failed:', err);
        return ctx.reply(`❌ System Health check failed: ${err.message}`);
    }
};

// --- Middleware & RBAC ---

type UserRole = 'owner' | 'admin' | 'observer';

const hasRole = (roles: UserRole[]) => async (ctx: Context, next: () => Promise<void>) => {
    const userId = String(ctx.from?.id);

    // Hardcoded owner fallback for safety
    if (OWNER_ID && userId === String(OWNER_ID)) return next();

    // Check DB for permissions
    const { data: user } = await supabaseAdmin
        .from('trinity_bot_users')
        .select('role')
        .eq('chat_id', userId)
        .single();

    if (user && roles.includes(user.role as UserRole)) {
        return next();
    }

    console.warn(`[Auth] Unauthorized access attempt by ${userId} (${ctx.from?.username}) - Required: ${roles.join(',')}`);
    return ctx.reply(`⛔ Access Denied. This feature requires ${roles.join(' or ')} permissions.`);
};

// Legacy alias for owner-only sections
const isOwner = hasRole(['owner']);
const isAdmin = hasRole(['owner', 'admin']);
const isObserver = hasRole(['owner', 'admin', 'observer']);

// --- Keyboard Config ---
const commandCenter = Markup.keyboard([
    ['📊 Health', '➕ Mission'],
    ['💎 Pulse', '💰 Grants']
]).resize();

// --- Commands ---

// --- Commands ---
bot.start(handleHealth);
bot.command('health', handleHealth);
bot.command('status', StatusCommandHandler.handleStatus);
bot.command('alpha', (ctx) => AlphaTradeHandler.handleAlphaCommand(ctx));
bot.command('portfolio', StatusCommandHandler.handlePortfolio);
bot.command('pause', StatusCommandHandler.handlePause);
bot.command('resume', StatusCommandHandler.handleResume);
bot.command('wolf', StatusCommandHandler.handleWolf);
bot.command('commands', async (ctx) => ctx.reply('🕹️ *Trinity Command Center* active.', { parse_mode: 'Markdown', ...commandCenter }));
bot.command('demo', async (ctx) => {
    try {
        const { count: agentsCount } = await supabaseAdmin.from('trinity_agents').select('*', { count: 'exact', head: true });
        const { count: tasksCount } = await supabaseAdmin.from('trinity_tasks').select('*', { count: 'exact', head: true }).in('status', ['todo', 'doing']);

        const message = `
🖥️ *TRINITY DEMO DASHBOARD SNAPSHOT*
━━━━━━━━━━━━━━━━━━━━
🗳️ *BFT Consensus*: Active (12/12)
🌊 *Superfluid*: 0.005 ETH/hr Streaming
🎭 *Agents Online*: ${agentsCount || 12}
📋 *Active Missions*: ${tasksCount || 0}
🧠 *ANFIS Mode*: Hybrid-Neural (Stable)

_Type /status for real-time portfolio vitals._
`;
        return ctx.replyWithMarkdown(message);
    } catch (e: any) {
        return ctx.reply(`❌ Demo snapshot failed: ${e.message}`);
    }
});

bot.command('tasks', isAdmin, async (ctx) => {
    const { data: pending, error } = await supabaseAdmin
        .from('approval_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error || !pending || pending.length === 0) {
        return ctx.reply('📭 No pending approvals in the queue.');
    }

    for (const task of pending) {
        const u = task.u_score || 0.5;
        const rep = task.rep_id_score || 0.5;

        const card = `
🤖 *${task.agent_id}* → *${task.task_type}*
━━━━━━━━━━━━━━━━━━━━
📋 ${task.output_summary.substring(0, 200)}...

🎯 RepID: ${rep.toFixed(2)} ${getRepTier(rep)}
🌊 WSCE:  ${(task.wsce_score || 0).toFixed(2)}
❓ u=${u.toFixed(2)} — ${getUlabel(u)}
💰 Saved: $${(task.cost_saved || 0).toFixed(4)}
🏷️ Domain: ${task.domain || 'general'}
`;

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ Approve', `approve:${task.id}`),
                Markup.button.callback('❌ Reject', `reject:${task.id}`),
                Markup.button.callback('↩️ Redirect', `redirect:${task.id}`)
            ],
            [
                Markup.button.callback('⏫ High Uni', `prio_high:${task.task_id}`),
                Markup.button.callback('⏬ Low Uni', `prio_low:${task.task_id}`),
                Markup.button.callback('✏️ Re-Target', `edit_task:${task.task_id}`)
            ],
            [
                Markup.button.callback('🔍 Full Output', `full:${task.id}`),
                Markup.button.callback('🧠 Agent History', `history:${task.agent_id}`)
            ]
        ]);

        await ctx.replyWithMarkdown(card, keyboard);
    }
});

bot.command('scan_network', async (ctx) => {
    const topic = ctx.payload || 'Web3 and Purpose-Driven AI';
    await ctx.reply(`🔍 *Trinity Network Scanner* active.\n\nSearching X and LinkedIn for partners and grants related to: "${topic}"...`, { parse_mode: 'Markdown' });

    try {
        // [ANTIGRAVITY] TRIGGER AGENT MISSION
        const { data: task, error } = await supabaseAdmin
            .from('trinity_tasks')
            .insert({
                title: `[SOCIAL] Network Scan: ${topic}`,
                description: `Scan X, LinkedIn, and Warpcast for mentions of "${topic}". Identify potential co-founders, grants, or high-value intros. Return ranked match cards with ANFIS scores.`,
                status: 'todo',
                priority: 80,
                task_type: 'social_research',
                metadata: {
                    source: 'telegram_scan',
                    topic: topic,
                    initiator: ctx.from?.first_name || 'Owner'
                }
            })
            .select()
            .single();

        if (error) throw error;

        await ctx.reply(`✅ *Mission Seeded*: Agent [SOCIAL] (Shofet/Veritas) is now hunting for yours. I'll alert you as soon as matches hit the dashboard.`);
    } catch (err: any) {
        await ctx.reply(`❌ Failed to seed network scan: ${err.message}`);
    }
});

bot.command('claim_grant', async (ctx) => {
    const userId = String(ctx.from?.id);
    const { data: user } = await supabaseAdmin.from('trinity_bot_users').select('grants_earned').eq('chat_id', userId).single();

    if (!user || (user.grants_earned || 0) <= 0) {
        return ctx.reply('⚠️ You do not have any unclaimed grants at this time. Complete quests or referrals to earn more!');
    }

    // Logic for claim (e.g., converting to virtual credits)
    await supabaseAdmin.from('trinity_bot_users').update({ grants_earned: 0 }).eq('chat_id', userId);

    await ctx.reply(`🎉 Grant claimed! $${user.grants_earned} has been added to your credits. Funded by the swarm's savings!`);
});

bot.command('grants', async (ctx) => {
    try {
        // [ANTIGRAVITY] Pull latest grant research
        const { data: grants } = await supabaseAdmin
            .from('trinity_tasks')
            .select('title, result, metadata')
            .ilike('title', '%grant%')
            .order('created_at', { ascending: false })
            .limit(3);

        if (!grants || grants.length === 0) {
            return ctx.reply('🔍 No active grant opportunities found in the current swarm cycle. Try /scan_network to initiate a new hunt.');
        }

        let message = `💰 *TRINITY GRANT HUD*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        grants.forEach(g => {
            message += `📍 *${g.title}*\n📝 ${g.result ? g.result.substring(0, 150) + '...' : 'Analysis in progress...'}\n\n`;
        });

        await ctx.replyWithMarkdown(message + `_Use /claim_grant if you have earned rewards._`);
    } catch (e: any) {
        await ctx.reply(`❌ Failed to fetch grants: ${e.message}`);
    }
});

// Deprecated: Consolidated into handleHealth

bot.command('agent', async (ctx) => {
    const agentName = ctx.payload;
    if (!agentName) return ctx.reply('Usage: /agent [name]');

    const { data: agent, error } = await supabaseAdmin
        .from('trinity_agents')
        .select('*')
        .eq('agent_id', agentName)
        .single();

    if (error || !agent) return ctx.reply(`❌ Agent "${agentName}" not found.`);

    const message = `
🤖 *Agent Internal HUD: ${agent.agent_id}*
━━━━━━━━━━━━━━━━━━━━
🎯 *RepID*: ${(agent.reputation || 0).toFixed(2)}
🌊 *Calibration*: ${(agent.calibration_score || 0).toFixed(2)}
✅ *Tasks Today*: ${agent.tasks_completed_today || 0}
📡 *Status*: ${agent.status || 'unknown'}

Architecture: ${agent.architecture || 'Major7 Standard'}
`;
    await ctx.replyWithMarkdown(message);
});

bot.command('pulse', async (ctx) => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.aitrinitysymphony.com';
    await ctx.reply(`💎 *Pulse: Swarm Intelligence Hub*
━━━━━━━━━━━━━━━━━━━━
Open the dashboard for real-time visibility into the agent collective.

_Grounded in Honor, Justice, and Truth._`,
        Markup.inlineKeyboard([
            [Markup.button.webApp('🌐 Launch Pulse Dashboard', `${appUrl}/pulse/watch`)]
        ])
    );
});

bot.command('wisdom', async (ctx) => {
    const { data: definitions } = await supabaseAdmin.from('trinity_definitions').select('*');
    if (!definitions || definitions.length === 0) return ctx.reply('📚 The Wisdom Portal is currently offline.');

    const random = definitions[Math.floor(Math.random() * definitions.length)];
    const message = `
📚 *Wisdom Portal: ${random.term}*
━━━━━━━━━━━━━━━━━━━━
${random.definition}

_Excellence in all things._
`;
    await ctx.replyWithMarkdown(message);
});

bot.command('task', isAdmin, async (ctx) => {
    const description = ctx.payload;
    if (!description) {
        return ctx.reply('Usage: /task [description]\nExample: /task Analyze the latest web3 trends');
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('trinity_tasks')
            .insert({
                title: description.substring(0, 100),
                description: description,
                status: 'todo',
                priority: 50, // Default mid-priority
                created_at: new Date().toISOString(),
                metadata: {
                    source: 'telegram_orch',
                    orchestrator: ctx.from?.first_name || 'Owner'
                }
            })
            .select()
            .single();

        if (error) throw error;

        await ctx.reply(`✅ *Task Orchestrated*
━━━━━━━━━━━━━━━━━━━━
ID: #${data.id}
Task: "${data.title}"
Status: Sent to swarm (todo)

Agents will pick this up autonomously.
`, { parse_mode: 'Markdown' });

    } catch (err: any) {
        ctx.reply(`❌ Failed to orchestrate task: ${err.message}`);
    }
});

bot.command('gentoken', isAdmin, async (ctx) => {
    const token = Math.random().toString(36).substring(2, 10).toUpperCase();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await supabaseAdmin.from('trinity_observers').insert({
        token,
        expires_at: expiresAt,
        created_at: new Date().toISOString()
    });

    const botUsername = ctx.botInfo.username;
    ctx.reply(`🎫 *Observer Token Generated*
━━━━━━━━━━━━━━━━━━━━
Token: \`${token}\` (Expires in 24h)
Share Link: \`t.me/${botUsername}?start=${token}\`

Observers have read-only access to the swarm feed.
`, { parse_mode: 'Markdown' });
});

bot.command('refer', isObserver, async (ctx) => {
    const userId = ctx.from?.id;
    const botUsername = ctx.botInfo.username;
    const referLink = `https://t.me/${botUsername}?start=ref_${userId}`;

    const message = `
🚀 *Viral Growth Engine*
━━━━━━━━━━━━━━━━━━━━
Invite your peers to the AI Trinity Symphony and earn reputation boosts!

Your Unique Referral Link:
\`${referLink}\`

_Shared excellence is the path to sovereignty._
`;
    await ctx.replyWithMarkdown(message);
});

bot.command('join', async (ctx) => {
    const token = ctx.payload;
    if (!token) return ctx.reply('Usage: /join [token]');

    const { data: observer } = await supabaseAdmin
        .from('trinity_observers')
        .select('*')
        .eq('token', token)
        .single();

    if (!observer || new Date(observer.expires_at) < new Date()) {
        return ctx.reply('❌ Invalid or expired token.');
    }

    await supabaseAdmin.from('trinity_observers').update({
        chat_id: String(ctx.chat.id),
        activated_at: new Date().toISOString()
    }).eq('token', token);

    ctx.reply('🔓 *Observer Mode Activated*\n━━━━━━━━━━━━━━━━━━━━\nYou now have read-only access to the AI Trinity Symphony swarm feed.\nType /start to see current system status.', { parse_mode: 'Markdown' });
});

// --- Assistant Evolution: Executive Briefing ---

// --- Assistant Evolution: Executive Briefing ---
// Deprecated: Consolidated into handleHealth

// --- Assistant Evolution: NL Intent Routing ---

bot.on('text', async (ctx, next) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return next();

    const lowerText = text.toLowerCase();

    // Exact Keyboard Matches
    if (lowerText.includes('📊 health')) return handleHealth(ctx);
    if (lowerText.includes('➕ mission')) return ctx.reply('🚀 Ready for a new mission. Type: `Task: [description]`', commandCenter);
    if (lowerText.includes('💎 pulse')) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.aitrinitysymphony.com';
        return ctx.reply('💎 Opening Pulse Dashboard...', Markup.inlineKeyboard([[Markup.button.webApp('Launch Pulse', `${appUrl}/pulse/watch`)]]));
    }

    // Intent Keywords (Priority 6: buy, sell, flower, pizza)
    if (lowerText.includes('buy') || lowerText.includes('sell') || lowerText.includes('order')) {
        // Simple regex or keyword matching for intent parsing
        if (lowerText.includes('flower')) {
            await ctx.reply('💐 *Flower Order Intent Detected*\nRouting to [SOCIAL] agent for Austin delivery coordination...', { parse_mode: 'Markdown' });
            // Insert task for flower agent...
            return;
        }
        if (lowerText.includes('pizza')) {
            await ctx.reply('🍕 *Pizza Order Intent Detected*\nRouting to [TORCH] agent for Domino\'s coordination...', { parse_mode: 'Markdown' });
            // Insert task for pizza agent...
            return;
        }

        const mission = text.replace(/^(task|mission|can you)\s*:?\s*/i, '');
        if (!mission) return ctx.reply('🚀 Ready for a new mission. Type: `Task: [description]`', commandCenter);
        // @ts-ignore
        ctx.payload = mission;
        return bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: `/task ${mission}` } });
    }

    if (lowerText.includes('status') || lowerText.includes('health') || lowerText.includes('doing') || lowerText.includes('how are we')) {
        return handleHealth(ctx);
    }
    if (lowerText.includes('savings') || lowerText.includes('money') || lowerText.includes('briefing')) {
        return handleHealth(ctx);
    }
    if (lowerText.includes('💰 grants')) {
        // @ts-ignore
        return bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/grants' } });
    }

    // Default: Forward to AlphaTradeHandler text input if applicable
    const handled = await AlphaTradeHandler.handleTextInput(ctx);
    if (handled) return;

    // Default: Chat feedback with keyboard
    await ctx.reply(`🤔 I've noted that. If you'd like me to start a new mission, try saying "Task: [mission description]".`, commandCenter);
});

// --- Voice Input ---

bot.on('voice', async (ctx) => {
    try {
        const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
        const statusMsg = await ctx.reply('👂 Listening...');
        const { text, confidence } = await transcribeVoice(fileLink.href);

        if (confidence < 0.7) {
            return ctx.reply(`🤔 I'm not sure I heard you correctly. Did you mean: "${text}"? \n\nPlease confirm or type.`);
        }

        await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `📝 *Transcript*: "${text}"`, { parse_mode: 'Markdown' });

        // Feed transcript into the text handler logic
        (ctx as any).message.text = text;
        return bot.handleUpdate(ctx.update);
    } catch (err: any) {
        ctx.reply(`❌ Voice processing failed: ${err.message}`);
    }
});

bot.action(/approve:(.+)/, isAdmin, async (ctx) => {
    const approvalId = ctx.match[1];

    // 1. Fetch task_id from approval_queue
    const { data: approval } = await supabaseAdmin
        .from('approval_queue')
        .select('task_id')
        .eq('id', approvalId)
        .single();

    // 2. Update approval_queue
    await supabaseAdmin.from('approval_queue').update({
        status: 'approved',
        resolved_at: new Date().toISOString(),
        resolved_by: ctx.from?.first_name || 'Sean'
    }).eq('id', approvalId);

    // 3. Update original task
    if (approval?.task_id) {
        await supabaseAdmin.from('trinity_tasks').update({
            status: 'verified', // Mobile approval counts as verification
            metadata: {
                mobile_approved_at: new Date().toISOString(),
                mobile_approved_by: ctx.from?.first_name || 'Sean'
            }
        }).eq('id', approval.task_id);
    }

    await ctx.answerCbQuery('✅ Task Approved.');
    await ctx.editMessageText(ctx.callbackQuery.message ? (ctx.callbackQuery.message as any).text + '\n\n✅ *Status: Approved (Verified)*' : '✅ Approved', { parse_mode: 'Markdown' });
});

bot.action(/reject:(.+)/, isAdmin, async (ctx) => {
    const approvalId = ctx.match[1];

    // 1. Fetch task_id
    const { data: approval } = await supabaseAdmin
        .from('approval_queue')
        .select('task_id')
        .eq('id', approvalId)
        .single();

    // 2. Update approval_queue
    await supabaseAdmin.from('approval_queue').update({
        status: 'rejected',
        resolved_at: new Date().toISOString(),
        resolved_by: ctx.from?.first_name || 'Sean'
    }).eq('id', approvalId);

    // 3. Update original task
    if (approval?.task_id) {
        await supabaseAdmin.from('trinity_tasks').update({
            status: 'todo', // Reset to todo for re-processing
            claimed_by: null,
            metadata: {
                mobile_rejected_at: new Date().toISOString(),
                mobile_rejected_by: ctx.from?.first_name || 'Sean'
            }
        }).eq('id', approval.task_id);
    }

    await ctx.answerCbQuery('❌ Task Rejected.');
    await ctx.editMessageText(ctx.callbackQuery.message ? (ctx.callbackQuery.message as any).text + '\n\n❌ *Status: Rejected (Reset to Todo)*' : '❌ Rejected', { parse_mode: 'Markdown' });
});

bot.action(/prio_high:(.+)/, isAdmin, async (ctx) => {
    const taskId = ctx.match[1];
    await supabaseAdmin.from('trinity_tasks').update({ priority: 100 }).eq('id', taskId);
    await ctx.answerCbQuery('🚀 Priority set to HIGH (100).');
});

bot.action(/prio_low:(.+)/, isAdmin, async (ctx) => {
    const taskId = ctx.match[1];
    await supabaseAdmin.from('trinity_tasks').update({ priority: 10 }).eq('id', taskId);
    await ctx.answerCbQuery('📉 Priority set to LOW (10).');
});

bot.action(/edit_task:(.+)/, isAdmin, async (ctx) => {
    const taskId = ctx.match[1];
    await ctx.reply(`✏️ *Editing Task #${taskId}*\n\nPlease reply to this message with the new description for the agent.`, { parse_mode: 'Markdown', reply_markup: { force_reply: true } });
    await ctx.answerCbQuery();
});

// --- HITL Bridge Handler ---
bot.on('callback_query', async (ctx, next) => {
    // Pass to the specialized HITL handler for HIAS Taxonomy decisions
    await HITLCallbackHandler.handleTelegramCallback(ctx.update);
    return next();
});

// Export a handler for Vercel
export const handleUpdate = async (update: any) => {
    // Proactively set the menu button if we're in a new session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.aitrinitysymphony.com';
    await bot.telegram.setChatMenuButton({
        menuButton: {
            type: 'web_app',
            text: '💎 Pulse',
            web_app: { url: `${appUrl}/pulse` }
        }
    }).catch(() => { });

    return bot.handleUpdate(update);
};
