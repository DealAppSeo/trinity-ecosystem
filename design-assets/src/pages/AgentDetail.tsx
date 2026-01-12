import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Activity, Award, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface Agent {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'idle' | 'busy' | 'offline';
  reputation: number;
  tasksCompleted: number;
  uptime: string;
  specialization: string;
  createdAt: string;
}

export function AgentDetail() {
  const { id } = useParams();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAgent();
  }, [id]);

  const fetchAgent = async () => {
    try {
      const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-e172c8d9`;
      const response = await fetch(`${baseUrl}/agents/${id}`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      const data = await response.json();

      if (data.success) {
        setAgent(data.data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching agent:', error);
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
    if (reputation >= 90) return { tier: 'Elite', color: 'from-yellow-400 to-orange-500', badge: '👑' };
    if (reputation >= 80) return { tier: 'Expert', color: 'from-violet-400 to-purple-500', badge: '💎' };
    if (reputation >= 70) return { tier: 'Advanced', color: 'from-cyan-400 to-blue-500', badge: '⭐' };
    return { tier: 'Standard', color: 'from-gray-400 to-gray-500', badge: '🔹' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-16 h-16 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 mb-4">Agent not found</p>
        <Link to="/agents" className="text-violet-400 hover:text-violet-300">
          ← Back to Agents
        </Link>
      </div>
    );
  }

  const tierInfo = getReputationTier(agent.reputation);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back Button */}
      <Link
        to="/agents"
        className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Agents
      </Link>

      {/* Agent Header */}
      <div className="glass rounded-xl p-8 border border-violet-500/30 glow-violet">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-start gap-4">
            <div className="text-5xl">{tierInfo.badge}</div>
            <div>
              <h1 className="text-3xl font-bold mb-2">{agent.name}</h1>
              <div className="flex items-center gap-3 text-gray-400">
                <span>{agent.type}</span>
                <span>•</span>
                <span className="capitalize">{agent.status}</span>
                <div className={`w-2 h-2 rounded-full ${getStatusColor(agent.status)} pulse-glow`} />
              </div>
            </div>
          </div>
        </div>

        {/* Specialization */}
        <div className="inline-block px-4 py-2 glass-light rounded-lg border border-white/10">
          <span className="text-sm text-gray-300">
            Specialization: <span className="text-violet-400 font-semibold">{agent.specialization}</span>
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass rounded-xl p-6 border border-yellow-500/30">
          <Award className="w-8 h-8 text-yellow-400 mb-3" />
          <div className="text-3xl font-bold mb-1 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
            {agent.reputation}
          </div>
          <div className="text-sm text-gray-400">Reputation Score</div>
          <div className="text-xs text-gray-500 mt-1">{tierInfo.tier} Tier</div>
        </div>

        <div className="glass rounded-xl p-6 border border-green-500/30">
          <CheckCircle className="w-8 h-8 text-green-400 mb-3" />
          <div className="text-3xl font-bold mb-1">{agent.tasksCompleted}</div>
          <div className="text-sm text-gray-400">Tasks Completed</div>
        </div>

        <div className="glass rounded-xl p-6 border border-cyan-500/30">
          <Clock className="w-8 h-8 text-cyan-400 mb-3" />
          <div className="text-3xl font-bold mb-1">{agent.uptime}</div>
          <div className="text-sm text-gray-400">Uptime</div>
        </div>

        <div className="glass rounded-xl p-6 border border-violet-500/30">
          <Activity className="w-8 h-8 text-violet-400 mb-3" />
          <div className="text-3xl font-bold mb-1 capitalize">{agent.status}</div>
          <div className="text-sm text-gray-400">Current Status</div>
        </div>
      </div>

      {/* Reputation Progress */}
      <div className="glass rounded-xl p-6 border border-white/10">
        <h2 className="text-xl font-bold mb-4">Reputation Progress</h2>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">Current Level</span>
              <span className={`text-sm font-bold bg-gradient-to-r ${tierInfo.color} bg-clip-text text-transparent`}>
                {tierInfo.tier}
              </span>
            </div>
            <div className="h-4 bg-gray-800 rounded-full overflow-hidden relative">
              <div
                className={`h-full bg-gradient-to-r ${tierInfo.color} transition-all duration-500`}
                style={{ width: `${agent.reputation}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                {agent.reputation}%
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 pt-2">
            {[
              { min: 0, max: 70, label: 'Standard', color: 'gray' },
              { min: 70, max: 80, label: 'Advanced', color: 'cyan' },
              { min: 80, max: 90, label: 'Expert', color: 'violet' },
              { min: 90, max: 100, label: 'Elite', color: 'yellow' },
            ].map((tier, index) => (
              <div
                key={index}
                className={`text-center p-2 rounded-lg ${
                  agent.reputation >= tier.min && agent.reputation < tier.max
                    ? `bg-${tier.color}-500/20 border border-${tier.color}-500/50`
                    : 'bg-gray-800/30'
                }`}
              >
                <div className={`text-xs font-semibold ${
                  agent.reputation >= tier.min && agent.reputation < tier.max
                    ? `text-${tier.color}-400`
                    : 'text-gray-500'
                }`}>
                  {tier.label}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {tier.min}-{tier.max}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="glass rounded-xl p-6 border border-white/10">
        <h2 className="text-xl font-bold mb-4">Performance Metrics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Success Rate</span>
              <span className="text-sm font-bold text-green-400">94%</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-green-400 w-[94%]" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Efficiency</span>
              <span className="text-sm font-bold text-cyan-400">87%</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-400 w-[87%]" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Response Time</span>
              <span className="text-sm font-bold text-violet-400">Fast</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-violet-400 w-[91%]" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Reliability</span>
              <span className="text-sm font-bold text-yellow-400">96%</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-yellow-400 w-[96%]" />
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="glass rounded-xl p-6 border border-white/10">
        <h2 className="text-xl font-bold mb-4">Recent Activity</h2>
        <div className="space-y-3">
          {[
            { action: 'Completed task: Build API integration', time: '2 hours ago', status: 'success' },
            { action: 'Started task: Review code quality', time: '4 hours ago', status: 'progress' },
            { action: 'Generated artifact: API Module', time: '6 hours ago', status: 'success' },
            { action: 'Reputation increased to 85', time: '1 day ago', status: 'achievement' },
          ].map((activity, index) => (
            <div key={index} className="glass-light rounded-lg p-4 border border-white/5 flex items-start gap-3">
              <div className={`w-2 h-2 rounded-full mt-2 ${
                activity.status === 'success' ? 'bg-green-400' :
                activity.status === 'progress' ? 'bg-cyan-400 pulse-glow' :
                'bg-yellow-400'
              }`} />
              <div className="flex-1">
                <p className="text-sm text-gray-300">{activity.action}</p>
                <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
