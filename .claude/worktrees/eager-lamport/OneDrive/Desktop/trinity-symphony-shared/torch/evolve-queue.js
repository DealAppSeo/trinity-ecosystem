// evolve-queue.js - Dynamic Task Queue Evolution for TORCH
// Implements: dependency chaining, RL scoring, health checks, peer learning

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Called after every task completion to evolve the queue dynamically
 * - Unlocks dependent tasks (2a done → 2b promoted)
 * - Updates RL-based priority scores
 * - Checks agent health and prevents idling
 * - Ingests external signals (patents, social trends)
 */
async function evolveQueue(completedTaskId) {
  console.log(`[TORCH] Evolving queue after task ${completedTaskId}`);
  
  try {
    // 1. Get the completed task
    const { data: completed, error: taskError } = await supabase
      .from('trinity_tasks')
      .select('*')
      .eq('id', completedTaskId)
      .single();
    
    if (taskError || !completed) {
      console.error('[TORCH] Could not find completed task:', taskError);
      return;
    }

    // 2. Auto-unlock dependencies (the magic of dynamic prioritization)
    if (completed.dependencies && completed.dependencies.length > 0) {
      console.log(`[TORCH] Unlocking ${completed.dependencies.length} dependent tasks`);
      
      const { error: unlockError } = await supabase
        .from('trinity_tasks')
        .update({ 
          priority: supabase.raw('priority - 10'), // Lower number = higher priority
          status: 'pending' // Ensure it's claimable
        })
        .in('id', completed.dependencies);
      
      if (unlockError) {
        console.error('[TORCH] Error unlocking dependencies:', unlockError);
      }
    }

    // 3. Calculate peer rating and update RL score
    const peerRating = await calculatePeerAverage(completed.agent_assigned);
    const completionBonus = completed.status === 'completed' ? 5 : 0;
    const newScore = (completed.score || 50) * 0.7 + peerRating * 0.2 + completionBonus;
    
    // Update the agent's average score in agent_repid
    await supabase
      .from('agent_repid')
      .update({ 
        repid_score: newScore,
        last_activity: new Date().toISOString()
      })
      .eq('agent_name', completed.agent_assigned);

    // 4. Health check all agents - prevent idling
    await checkAgentHealth();

    // 5. Log the evolution for audit trail
    await supabase.from('agent_messages').insert({
      agent_name: 'TORCH',
      message: JSON.stringify({
        type: 'queue_evolution',
        completed_task: completedTaskId,
        dependencies_unlocked: completed.dependencies?.length || 0,
        new_score: newScore
      })
    });

    console.log(`[TORCH] Queue evolved successfully. Score: ${newScore.toFixed(2)}`);
    return { success: true, newScore };

  } catch (error) {
    console.error('[TORCH] evolveQueue error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Calculate average peer rating for an agent
 */
async function calculatePeerAverage(agentName) {
  const { data, error } = await supabase
    .from('agent_learnings')
    .select('rating')
    .eq('to_agent', agentName)
    .order('created_at', { ascending: false })
    .limit(20); // Last 20 ratings
  
  if (error || !data || data.length === 0) {
    return 5; // Neutral default
  }
  
  const sum = data.reduce((acc, item) => acc + (item.rating || 5), 0);
  return sum / data.length;
}

/**
 * Check all agents for health and prevent idling
 */
async function checkAgentHealth() {
  const { data: agents, error } = await supabase
    .from('agent_repid')
    .select('*');
  
  if (error || !agents) {
    console.error('[TORCH] Could not fetch agents for health check');
    return;
  }

  const now = new Date();
  const IDLE_THRESHOLD_MINUTES = 10;

  for (const agent of agents) {
    const lastActivity = new Date(agent.last_activity);
    const idleMinutes = (now - lastActivity) / (1000 * 60);
    
    // Log health status
    await supabase.from('agent_health').insert({
      agent_name: agent.agent_name,
      status: idleMinutes > IDLE_THRESHOLD_MINUTES ? 'idle' : 'active',
      idle_time: Math.floor(idleMinutes),
      load_percent: Math.max(0, 100 - idleMinutes * 5) // Rough estimate
    });

    // If agent is idle, try to assign them work
    if (idleMinutes > IDLE_THRESHOLD_MINUTES) {
      console.log(`[TORCH] Agent ${agent.agent_name} idle for ${idleMinutes.toFixed(1)} min - finding work`);
      
      // Find a pending task suitable for this agent
      const { data: pendingTask } = await supabase
        .from('trinity_tasks')
        .select('*')
        .eq('status', 'pending')
        .or(`agent_assigned.eq.${agent.agent_name},agent_assigned.is.null`)
        .order('priority', { ascending: true })
        .limit(1)
        .single();
      
      if (pendingTask) {
        // Assign the task
        await supabase
          .from('trinity_tasks')
          .update({ 
            agent_assigned: agent.agent_name,
            status: 'in_progress'
          })
          .eq('id', pendingTask.id);
        
        console.log(`[TORCH] Assigned task "${pendingTask.title}" to idle agent ${agent.agent_name}`);
      }
    }
  }
}

/**
 * Create a task chain with dependencies
 * Example: createTaskChain(['Research', 'Draft', 'Review', 'Publish'])
 */
async function createTaskChain(tasks, baseDescription, agentAssigned, basePriority = 3) {
  const createdIds = [];
  
  for (let i = 0; i < tasks.length; i++) {
    const { data: newTask, error } = await supabase
      .from('trinity_tasks')
      .insert({
        title: tasks[i],
        description: `${baseDescription} - Step ${i + 1}: ${tasks[i]}`,
        agent_assigned: agentAssigned,
        priority: basePriority + i, // Later steps have lower priority initially
        status: i === 0 ? 'pending' : 'blocked', // Only first is immediately available
        dependencies: i > 0 ? [createdIds[i - 1]] : [],
        score: 50.0
      })
      .select()
      .single();
    
    if (!error && newTask) {
      createdIds.push(newTask.id);
    }
  }
  
  console.log(`[TORCH] Created task chain with ${createdIds.length} tasks`);
  return createdIds;
}

/**
 * Ingest external signals (patents, social trends) and create tasks
 */
async function ingestExternalSignals() {
  // This would be called periodically by a cron job
  // For now, it's a placeholder that can be extended
  
  const signals = [
    { type: 'patent_search', query: 'AI multi-agent orchestration', relevance: 0.8 },
    { type: 'social_trend', query: 'AI agents trending topics', relevance: 0.7 }
  ];
  
  for (const signal of signals) {
    if (signal.relevance > 0.6) {
      await supabase.from('trinity_tasks').insert({
        title: `External Signal: ${signal.type}`,
        description: `Auto-generated from ${signal.type} signal. Query: ${signal.query}`,
        agent_assigned: signal.type.includes('patent') ? 'GCM' : 'APM',
        priority: Math.floor(15 - signal.relevance * 10), // Higher relevance = higher priority
        status: 'pending',
        task_type: 'research',
        score: signal.relevance * 100
      });
    }
  }
}

// Export for use in TORCH main loop
module.exports = {
  evolveQueue,
  checkAgentHealth,
  createTaskChain,
  calculatePeerAverage,
  ingestExternalSignals
};
