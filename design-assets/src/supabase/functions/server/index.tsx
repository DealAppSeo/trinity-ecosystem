import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import * as kv from './kv_store.tsx';

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger(console.log));

// Helper to generate IDs
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// ============================================
// AGENTS ENDPOINTS
// ============================================

app.get('/make-server-e172c8d9/agents', async (c) => {
  try {
    const agents = await kv.getByPrefix('agent:');
    return c.json({ success: true, data: agents });
  } catch (error) {
    console.log('Error fetching agents:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.get('/make-server-e172c8d9/agents/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const agent = await kv.get(`agent:${id}`);
    if (!agent) {
      return c.json({ success: false, error: 'Agent not found' }, 404);
    }
    return c.json({ success: true, data: agent });
  } catch (error) {
    console.log('Error fetching agent:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.post('/make-server-e172c8d9/agents', async (c) => {
  try {
    const body = await c.req.json();
    const id = generateId();
    const agent = {
      id,
      name: body.name || `Agent ${id.slice(0, 6)}`,
      type: body.type || 'Worker',
      status: body.status || 'idle',
      reputation: body.reputation || 75,
      tasksCompleted: body.tasksCompleted || 0,
      uptime: body.uptime || '0h',
      specialization: body.specialization || 'General',
      createdAt: new Date().toISOString(),
    };
    await kv.set(`agent:${id}`, agent);
    return c.json({ success: true, data: agent });
  } catch (error) {
    console.log('Error creating agent:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.patch('/make-server-e172c8d9/agents/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const existing = await kv.get(`agent:${id}`);
    if (!existing) {
      return c.json({ success: false, error: 'Agent not found' }, 404);
    }
    const updated = { ...existing, ...body };
    await kv.set(`agent:${id}`, updated);
    return c.json({ success: true, data: updated });
  } catch (error) {
    console.log('Error updating agent:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ============================================
// TASKS ENDPOINTS
// ============================================

app.get('/make-server-e172c8d9/tasks', async (c) => {
  try {
    const tasks = await kv.getByPrefix('task:');
    return c.json({ success: true, data: tasks });
  } catch (error) {
    console.log('Error fetching tasks:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.post('/make-server-e172c8d9/tasks', async (c) => {
  try {
    const body = await c.req.json();
    const id = generateId();
    const task = {
      id,
      title: body.title || 'New Task',
      description: body.description || '',
      status: body.status || 'todo',
      priority: body.priority || 'medium',
      assignedAgent: body.assignedAgent || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await kv.set(`task:${id}`, task);
    return c.json({ success: true, data: task });
  } catch (error) {
    console.log('Error creating task:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.patch('/make-server-e172c8d9/tasks/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const existing = await kv.get(`task:${id}`);
    if (!existing) {
      return c.json({ success: false, error: 'Task not found' }, 404);
    }
    const updated = { ...existing, ...body, updatedAt: new Date().toISOString() };
    await kv.set(`task:${id}`, updated);
    return c.json({ success: true, data: updated });
  } catch (error) {
    console.log('Error updating task:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.delete('/make-server-e172c8d9/tasks/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await kv.del(`task:${id}`);
    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting task:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ============================================
// ARTIFACTS ENDPOINTS
// ============================================

app.get('/make-server-e172c8d9/artifacts', async (c) => {
  try {
    const artifacts = await kv.getByPrefix('artifact:');
    return c.json({ success: true, data: artifacts });
  } catch (error) {
    console.log('Error fetching artifacts:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.post('/make-server-e172c8d9/artifacts', async (c) => {
  try {
    const body = await c.req.json();
    const id = generateId();
    const artifact = {
      id,
      title: body.title || 'Untitled Artifact',
      type: body.type || 'code',
      content: body.content || '',
      agentId: body.agentId || null,
      createdAt: new Date().toISOString(),
      shareCount: 0,
    };
    await kv.set(`artifact:${id}`, artifact);
    return c.json({ success: true, data: artifact });
  } catch (error) {
    console.log('Error creating artifact:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.post('/make-server-e172c8d9/artifacts/:id/share', async (c) => {
  try {
    const id = c.req.param('id');
    const artifact = await kv.get(`artifact:${id}`);
    if (!artifact) {
      return c.json({ success: false, error: 'Artifact not found' }, 404);
    }
    artifact.shareCount = (artifact.shareCount || 0) + 1;
    await kv.set(`artifact:${id}`, artifact);
    return c.json({ success: true, data: artifact });
  } catch (error) {
    console.log('Error sharing artifact:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ============================================
// MISSIONS ENDPOINTS
// ============================================

app.post('/make-server-e172c8d9/missions', async (c) => {
  try {
    const body = await c.req.json();
    const id = generateId();
    const mission = {
      id,
      name: body.name,
      objective: body.objective,
      swarmSize: body.swarmSize,
      budget: body.budget,
      priority: body.priority,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    await kv.set(`mission:${id}`, mission);
    
    // Create initial tasks for the mission
    const taskPromises = [];
    for (let i = 0; i < body.swarmSize; i++) {
      const taskId = generateId();
      taskPromises.push(
        kv.set(`task:${taskId}`, {
          id: taskId,
          title: `${body.name} - Subtask ${i + 1}`,
          description: body.objective,
          status: 'todo',
          priority: body.priority,
          missionId: id,
          createdAt: new Date().toISOString(),
        })
      );
    }
    await Promise.all(taskPromises);
    
    return c.json({ success: true, data: mission });
  } catch (error) {
    console.log('Error creating mission:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ============================================
// ACTIVITY FEED ENDPOINT
// ============================================

app.get('/make-server-e172c8d9/activity', async (c) => {
  try {
    const activities = await kv.getByPrefix('activity:');
    // Sort by timestamp descending
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return c.json({ success: true, data: activities.slice(0, 50) });
  } catch (error) {
    console.log('Error fetching activity:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.post('/make-server-e172c8d9/activity', async (c) => {
  try {
    const body = await c.req.json();
    const id = generateId();
    const activity = {
      id,
      type: body.type,
      message: body.message,
      agentId: body.agentId || null,
      timestamp: new Date().toISOString(),
    };
    await kv.set(`activity:${id}`, activity);
    return c.json({ success: true, data: activity });
  } catch (error) {
    console.log('Error creating activity:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ============================================
// SYSTEM STATS ENDPOINT
// ============================================

app.get('/make-server-e172c8d9/stats', async (c) => {
  try {
    const agents = await kv.getByPrefix('agent:');
    const tasks = await kv.getByPrefix('task:');
    
    const stats = {
      totalAgents: agents.length,
      activeAgents: agents.filter((a: any) => a.status === 'active').length,
      totalTasks: tasks.length,
      completedTasks: tasks.filter((t: any) => t.status === 'done').length,
      systemHealth: agents.length > 0 ? Math.round((agents.filter((a: any) => a.status === 'active').length / agents.length) * 100) : 0,
      timestamp: new Date().toISOString(),
    };
    
    return c.json({ success: true, data: stats });
  } catch (error) {
    console.log('Error fetching stats:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ============================================
// SEED DATA ENDPOINT (for initialization)
// ============================================

app.post('/make-server-e172c8d9/seed', async (c) => {
  try {
    // Create sample agents
    const agentTypes = ['Researcher', 'Developer', 'Analyst', 'Designer', 'QA Tester', 'Writer', 'Strategist', 'Engineer', 'Coordinator'];
    const statuses = ['active', 'idle', 'busy', 'offline'];
    
    const agentPromises = [];
    for (let i = 0; i < 9; i++) {
      const id = generateId();
      agentPromises.push(
        kv.set(`agent:${id}`, {
          id,
          name: `Agent-${String(i + 1).padStart(3, '0')}`,
          type: agentTypes[i],
          status: statuses[Math.floor(Math.random() * statuses.length)],
          reputation: Math.floor(Math.random() * 30) + 70,
          tasksCompleted: Math.floor(Math.random() * 100),
          uptime: `${Math.floor(Math.random() * 72)}h`,
          specialization: agentTypes[i],
          createdAt: new Date().toISOString(),
        })
      );
    }
    
    // Create sample tasks
    const taskTitles = [
      'Analyze market trends',
      'Build API integration',
      'Review code quality',
      'Design landing page',
      'Test payment flow',
      'Write documentation',
      'Plan Q1 strategy',
    ];
    
    const taskStatuses = ['todo', 'in-progress', 'done', 'failed'];
    const taskPromises = [];
    
    for (let i = 0; i < taskTitles.length; i++) {
      const id = generateId();
      taskPromises.push(
        kv.set(`task:${id}`, {
          id,
          title: taskTitles[i],
          description: `Complete ${taskTitles[i].toLowerCase()}`,
          status: taskStatuses[Math.floor(Math.random() * taskStatuses.length)],
          priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );
    }
    
    // Create sample artifacts
    const artifactPromises = [];
    const artifactTypes = ['code', 'document', 'design', 'report'];
    const artifactTitles = [
      'API Integration Module',
      'Market Analysis Report',
      'Landing Page Design',
      'Testing Framework',
      'User Documentation',
    ];
    
    for (let i = 0; i < artifactTitles.length; i++) {
      const id = generateId();
      artifactPromises.push(
        kv.set(`artifact:${id}`, {
          id,
          title: artifactTitles[i],
          type: artifactTypes[Math.floor(Math.random() * artifactTypes.length)],
          content: `Content for ${artifactTitles[i]}`,
          createdAt: new Date().toISOString(),
          shareCount: Math.floor(Math.random() * 20),
        })
      );
    }
    
    // Create sample activity
    const activityPromises = [];
    const activityMessages = [
      'Agent-001 completed task: Build API integration',
      'Agent-003 started task: Review code quality',
      'New artifact created: API Integration Module',
      'Agent-005 reputation increased to 95',
      'Mission deployed: Q1 Growth Strategy',
    ];
    
    for (let i = 0; i < activityMessages.length; i++) {
      const id = generateId();
      activityPromises.push(
        kv.set(`activity:${id}`, {
          id,
          type: ['task', 'agent', 'artifact', 'mission'][Math.floor(Math.random() * 4)],
          message: activityMessages[i],
          timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(),
        })
      );
    }
    
    await Promise.all([...agentPromises, ...taskPromises, ...artifactPromises, ...activityPromises]);
    
    return c.json({ success: true, message: 'Seed data created successfully' });
  } catch (error) {
    console.log('Error seeding data:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

Deno.serve(app.fetch);
