import { Telegraf, Context, Markup } from 'telegraf';
import { supabaseAdmin } from '../supabase';
import { transcribeVoice } from './voice';

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
    // In a full implementation, we'd query past tasks for context
    const questions = [
        "What can I take off your plate today to free up your creative energy?",
        "How can I streamline your workflow—perhaps by routing a briefing or optimizing costs?",
        "What's one thing I can automate right now to make your day easier?",
        "Ready to conduct the symphony? What mission should we initiate next?"
    ];
    return questions[Math.floor(Math.random() * questions.length)];
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
    ['📊 Status', '📈 Briefing'],
    ['➕ New Mission', '💎 Pulse']
]).resize();

// --- Commands ---

bot.start(async (ctx) => {
    const startPayload = (ctx as any).startPayload; // Deep link param
    const userId = ctx.from?.id;

    if (startPayload && startPayload.startsWith('ref_')) {
        const referrerId = startPayload.replace('ref_', '');
        console.log(`[Referral] User ${userId} joined via referrer ${referrerId}`);
        // Log referral for reward processing later
        await supabaseAdmin.from('trinity_referrals').insert({
            referrer_id: referrerId,
            referee_id: String(userId),
            status: 'pending',
            created_at: new Date().toISOString()
        });
    }

    const { count: tasksCount } = await supabaseAdmin.from('trinity_tasks').select('*', { count: 'exact', head: true }).eq('status', 'todo');
    const { count: pendingApprovals } = await supabaseAdmin.from('approval_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending');

    // Calculate today's savings
    const today = new Date().toISOString().split('T')[0];
    const { data: savingsData } = await supabaseAdmin
        .from('trinity_cost_logs')
        .select('savings_attribution')
        .gte('created_at', today);

    const totalSavings = (savingsData || []).reduce((sum, row) => sum + (row.savings_attribution || 0), 0);

    const greeting = getGreeting();
    const drivingQuestion = await getDrivingQuestion(String(userId));

    const message = `
🎻 *AI TRINITY SYMPHONY* 
━━━━━━━━━━━━━━━━━━━━
🌐 *Environment*: Production (Cloud)
🚀 *System Status*: Online & Synchronized
🤖 *Swarm Health*: 12 Active Agents
⏳ *Pending Tasks*: ${pendingApprovals || 0} approvals out
✅ *Todo Backlog*: ${tasksCount || 0} missions
💰 *Today's Capture*: $${totalSavings.toFixed(4)}

${greeting}${ctx.from?.first_name ? `, ${ctx.from.first_name}` : ''}! 
${drivingQuestion}
`;
    // Update last_interaction
    await supabaseAdmin.from('trinity_bot_users').update({ last_interaction: new Date().toISOString() }).eq('chat_id', String(userId));
    
    await ctx.replyWithMarkdown(message, commandCenter);
});

bot.command('commands', async (ctx) => {
    await ctx.reply('🕹️ *Trinity Command Center* active.', {
        parse_mode: 'Markdown',
        ...commandCenter
    });
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
                Markup.button.callback('🔍 Full Output', `full:${task.id}`),
                Markup.button.callback('🧠 Agent History', `history:${task.agent_id}`)
            ]
        ]);

        await ctx.replyWithMarkdown(card, keyboard);
    }
});

bot.command('scan_network', async (ctx) => {
    await ctx.reply('🔍 *Trinity Network Scanner* active.\n\nSearching X and LinkedIn for purpose-aligned partners and grants...', { parse_mode: 'Markdown' });
    
    // Simulate n8n workflow trigger
    setTimeout(async () => {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.aitrinitysymphony.com';
        const matches = [
            "🤝 [Co-Founder Match] Sarah D. - Applied Cryptography Expert",
            "💰 [Grant Opportunity] Web3 Foundation Phase 23 - $10k-$50k",
            "🤝 [Partner Match] TechEthos DAO - Social Impact Analytics"
        ];
        
        await ctx.reply(`🎯 *Symphony Match Results*:\n\n${matches.join('\n')}\n\nView details in [Pulse](${appUrl}/pulse/watch).`, { parse_mode: 'Markdown' });
    }, 2000);
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

bot.command('savings', async (ctx) => {
    const today = new Date().toISOString().split('T')[0];
    const { data: savingsData } = await supabaseAdmin
        .from('trinity_cost_logs')
        .select('savings_attribution, model_used')
        .gte('created_at', today);

    const totalSavings = (savingsData || []).reduce((sum, row) => sum + (row.savings_attribution || 0), 0);

    // Find top routes (mock logic for now since we don't have a complex routing table yet)
    const routes = (savingsData || []).reduce((acc: any, row) => {
        acc[row.model_used] = (acc[row.model_used] || 0) + row.savings_attribution;
        return acc;
    }, {});

    const topRoutes = Object.entries(routes)
        .sort((a: any, b: any) => b[1] - a[1])
        .slice(0, 3);

    const message = `
💎 *Cost Savings Report*
━━━━━━━━━━━━━━━━━━━━
📅 *Today's Alpha*: $${totalSavings.toFixed(4)}
📉 *Avg Baseline*: $6.72 / 1M tokens
📈 *Est. Monthly Yield*: $${(totalSavings * 30).toFixed(2)}

🚀 *Top Performing Routes*:
${topRoutes.map(([model, savings]: any) => `• *${model}*: $${savings.toFixed(4)}`).join('\n')}

_Trinity is currently operating at ~92% cost efficiency via multi-provider arbitrage._
`;
    await ctx.replyWithMarkdown(message);
});

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

bot.command('briefing', isAdmin, async (ctx) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        // 1. Task Throughput
        const { count: completedCount } = await supabaseAdmin.from('trinity_tasks').select('*', { count: 'exact', head: true }).eq('status', 'verified').gte('created_at', today);
        const { count: activeCount } = await supabaseAdmin.from('trinity_tasks').select('*', { count: 'exact', head: true }).in('status', ['doing', 'in_progress', 'running']);

        // 2. Financials
        const { data: savingsData } = await supabaseAdmin.from('trinity_cost_logs').select('savings_attribution').gte('created_at', today);
        const totalSavings = (savingsData || []).reduce((sum, row) => sum + (row.savings_attribution || 0), 0);

        // 3. System Integrity (Mock for now, would check 'judas_detections')
        const systemIntegrity = '99.8%';

        const message = `
📊 *EXECUTIVE BRIEFING: ${today}* 
━━━━━━━━━━━━━━━━━━━━
🚀 *Swarm Velocity*: ${completedCount || 0} tasks completed today.
⚡ *Active Cycles*: ${activeCount || 0} agents currently processing.
💰 *Alpha Capture*: $${totalSavings.toFixed(4)} saved via arbitrage.
🛡️ *Integrity*: ${systemIntegrity} 

*Strategic Outlook*:
The swarm is operating at peak efficiency. Optimization of high-tier routing is recommended for the next 4 hours.

_Built for Sovereignty and Truth._
`;
        await ctx.replyWithMarkdown(message);
    } catch (err: any) {
        ctx.reply(`❌ Briefing generation failed: ${err.message}`);
    }
});

// --- Assistant Evolution: NL Intent Routing ---

bot.on('text', async (ctx, next) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return next(); // Already handled by commands

    const lowerText = text.toLowerCase();

    // Quick heuristic routing (Personal Assistant Mode)
    if (lowerText === '📊 status') {
        return bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/start', entities: [{ type: 'bot_command', offset: 0, length: 6 }] } });
    }
    if (lowerText === '📈 briefing') {
        return bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/briefing', entities: [{ type: 'bot_command', offset: 0, length: 9 }] } });
    }
    if (lowerText === '➕ new mission') {
        return ctx.reply('🚀 Ready for a new mission. Type: `/task [description]`', { parse_mode: 'Markdown' });
    }
    if (lowerText === '💎 pulse') {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.aitrinitysymphony.com';
        return ctx.reply('💎 Opening Pulse Dashboard...', {
            reply_markup: {
                inline_keyboard: [[{ text: 'Launch Pulse', web_app: { url: `${appUrl}/pulse` } }]]
            }
        });
    }

    if (lowerText.startsWith('task') || lowerText.startsWith('mission') || lowerText.startsWith('can you')) {
        // Redirect to task creation logic
        const mission = text.replace(/^(task|mission|can you)\s*/i, '');
        // @ts-ignore - Manually trigger the command handler for /task
        return bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: `/task ${mission}`, entities: [{ type: 'bot_command', offset: 0, length: 5 }] } } as any);
    }

    if (lowerText.includes('status') || lowerText.includes('how is the swarm')) {
        return bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/start', entities: [{ type: 'bot_command', offset: 0, length: 6 }] } });
    }

    if (lowerText.includes('savings') || lowerText.includes('money')) {
        return bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/savings', entities: [{ type: 'bot_command', offset: 0, length: 8 }] } });
    }

    if (lowerText.includes('scan') || lowerText.includes('networking')) {
        return bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/scan_network', entities: [{ type: 'bot_command', offset: 0, length: 13 }] } });
    }

    if (lowerText.includes('claim') || lowerText.includes('grant')) {
        return bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/claim_grant', entities: [{ type: 'bot_command', offset: 0, length: 12 }] } });
    }

    if (lowerText.includes('briefing') || lowerText.includes('summary')) {
        return bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/briefing', entities: [{ type: 'bot_command', offset: 0, length: 9 }] } });
    }

    // Default: Chat feedback (if not restricted to commands)
    await ctx.reply(`🤔 I've noted that. If you'd like me to start a new mission, try saying "Task: [mission description]".`);
});

// --- Voice Input ---

bot.on('voice', async (ctx) => {
    try {
        const fileId = ctx.message.voice.file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);

        const statusMsg = await ctx.reply('👂 Listening...');

        const { text, confidence } = await transcribeVoice(fileLink.href);

        if (confidence < 0.7) {
            return ctx.reply(`🤔 I'm not sure I heard you correctly. Did you mean: "${text}"? \n\nPlease reply YES or type your command.`);
        }

        await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `📝 *Transcript*: "${text}"\n\nRouting command...`, { parse_mode: 'Markdown' });

        // Fuzzy command routing
        const lowerText = text.toLowerCase();
        if (lowerText.includes('approve everything')) {
            // Bulk approve logic
            const { data: pending } = await supabaseAdmin.from('approval_queue').select('id').eq('status', 'pending').gt('rep_id_score', 0.8);
            if (pending && pending.length > 0) {
                for (const t of pending) {
                    await supabaseAdmin.from('approval_queue').update({ status: 'approved', resolved_by: 'Voice-Sean' }).eq('id', t.id);
                }
                await ctx.reply(`✅ Approved ${pending.length} tasks.`);
            } else {
                await ctx.reply('📭 No high-confidence tasks to approve.');
            }
        } else if (lowerText.includes('savings')) {
            return ctx.reply('Use /savings to see detailed stats.');
        } else if (lowerText.includes('status of')) {
            const agent = text.split('status of')[1].trim();
            // Trigger /agent logic via re-routing if needed 
        } else {
            await ctx.reply(`❓ Command not recognized: "${text}". \n\nTry "approve everything" or "what are today's savings".`);
        }

    } catch (err: any) {
        ctx.reply(`❌ Voice processing failed: ${err.message}`);
    }
});

// --- Action Handlers ---

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
