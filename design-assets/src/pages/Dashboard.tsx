import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, TrendingUp, Zap, Clock } from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface Agent {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'idle' | 'busy' | 'offline';
  reputation: number;
  tasksCompleted: number;
  uptime: string;
}

interface Stats {
  totalAgents: number;
  activeAgents: number;
  totalTasks: number;
  completedTasks: number;
  systemHealth: number;
}

interface ActivityItem {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

export function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalAgents: 0,
    activeAgents: 0,
    totalTasks: 0,
    completedTasks: 0,
    systemHealth: 0,
  });
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-e172c8d9`;
      
      const [agentsRes, statsRes, activityRes] = await Promise.all([
        fetch(`${baseUrl}/agents`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        }),
        fetch(`${baseUrl}/stats`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        }),
        fetch(`${baseUrl}/activity`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        }),
      ]);

      const [agentsData, statsData, activityData] = await Promise.all([
        agentsRes.json(),
        statsRes.json(),
        activityRes.json(),
      ]);

      if (agentsData.success) {
        setAgents(agentsData.data.slice(0, 9)); // Show first 9 for 3x3 grid
      }
      if (statsData.success) {
        setStats(statsData.data);
      }
      if (activityData.success) {
        setActivities(activityData.data.slice(0, 10));
      }

      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-400';
      case 'busy':
        return 'bg-yellow-400';
      case 'idle':
        return 'bg-blue-400';
      case 'offline':
        return 'bg-gray-400';
      default:
        return 'bg-gray-400';
    }
  };

  const getReputationTier = (reputation: number) => {
    if (reputation >= 90) return { tier: 'Elite', color: 'from-yellow-400 to-orange-500' };
    if (reputation >= 80) return { tier: 'Expert', color: 'from-violet-400 to-purple-500' };
    if (reputation >= 70) return { tier: 'Advanced', color: 'from-cyan-400 to-blue-500' };
    return { tier: 'Standard', color: 'from-gray-400 to-gray-500' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-16 h-16 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* System Health HUD */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass rounded-xl p-6 border border-violet-500/30 glow-violet">
          <div className="flex items-center justify-between mb-4">
            <Activity className="w-8 h-8 text-violet-400" />
            <div className={`w-3 h-3 rounded-full ${getStatusColor('active')} pulse-glow`} />
          </div>
          <div className="text-3xl font-bold mb-1">{stats.activeAgents}</div>
          <div className="text-sm text-gray-400">Active Agents</div>
        </div>

        <div className="glass rounded-xl p-6 border border-cyan-500/30 glow-cyan">
          <div className="flex items-center justify-between mb-4">
            <TrendingUp className="w-8 h-8 text-cyan-400" />
            <Zap className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="text-3xl font-bold mb-1">{stats.completedTasks}</div>
          <div className="text-sm text-gray-400">Tasks Completed</div>
        </div>

        <div className="glass rounded-xl p-6 border border-green-500/30">
          <div className="flex items-center justify-between mb-4">
            <Activity className="w-8 h-8 text-green-400" />
          </div>
          <div className="text-3xl font-bold mb-1">{stats.systemHealth}%</div>
          <div className="text-sm text-gray-400">System Health</div>
        </div>

        <div className="glass rounded-xl p-6 border border-yellow-500/30">
          <div className="flex items-center justify-between mb-4">
            <Clock className="w-8 h-8 text-yellow-400" />
          </div>
          <div className="text-3xl font-bold mb-1">{stats.totalTasks}</div>
          <div className="text-sm text-gray-400">Total Tasks</div>
        </div>
      </div>

      {/* 3x3 Agent Swarm Grid */}
      <div className="glass rounded-xl p-6 border border-white/10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Active Swarm</h2>
          <Link
            to="/agents"
            className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
          >
            View All →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => {
            const tierInfo = getReputationTier(agent.reputation);
            return (
              <Link
                key={agent.id}
                to={`/agents/${agent.id}`}
                className="glass-light rounded-lg p-4 border border-white/10 hover:border-violet-500/50 transition-all duration-200 group hover:scale-105"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="font-semibold mb-1 group-hover:text-violet-400 transition-colors">
                      {agent.name}
                    </div>
                    <div className="text-xs text-gray-400">{agent.type}</div>
                  </div>
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(agent.status)} pulse-glow`} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Reputation</span>
                    <span className={`font-bold bg-gradient-to-r ${tierInfo.color} bg-clip-text text-transparent`}>
                      {agent.reputation}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Tasks</span>
                    <span className="text-white">{agent.tasksCompleted}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Uptime</span>
                    <span className="text-white">{agent.uptime}</span>
                  </div>
                </div>

                {/* Reputation Progress Bar */}
                <div className="mt-3 h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${tierInfo.color} transition-all duration-500`}
                    style={{ width: `${agent.reputation}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Real-time Activity Feed */}
      <div className="glass rounded-xl p-6 border border-white/10">
        <h2 className="text-xl font-bold mb-6">Real-time Activity</h2>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {activities.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No recent activity
            </div>
          ) : (
            activities.map((activity) => (
              <div
                key={activity.id}
                className="glass-light rounded-lg p-4 border border-white/5 hover:border-white/10 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-violet-400 pulse-glow mt-2" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-300">{activity.message}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(activity.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
