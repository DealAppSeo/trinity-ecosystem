import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, TrendingUp, Award } from 'lucide-react';
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
}

export function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filteredAgents, setFilteredAgents] = useState<Agent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAgents();
  }, []);

  useEffect(() => {
    let filtered = agents;

    if (searchQuery) {
      filtered = filtered.filter(
        (agent) =>
          agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          agent.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
          agent.specialization.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((agent) => agent.status === statusFilter);
    }

    setFilteredAgents(filtered);
  }, [searchQuery, statusFilter, agents]);

  const fetchAgents = async () => {
    try {
      const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-e172c8d9`;
      const response = await fetch(`${baseUrl}/agents`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      const data = await response.json();

      if (data.success) {
        setAgents(data.data);
        setFilteredAgents(data.data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching agents:', error);
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

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass rounded-xl p-6 border border-violet-500/30">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-6 h-6 text-violet-400" />
            <span className="text-2xl font-bold">{agents.length}</span>
          </div>
          <div className="text-sm text-gray-400">Total Agents</div>
        </div>
        <div className="glass rounded-xl p-6 border border-green-500/30">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-3 h-3 rounded-full bg-green-400 pulse-glow" />
            <span className="text-2xl font-bold">
              {agents.filter((a) => a.status === 'active').length}
            </span>
          </div>
          <div className="text-sm text-gray-400">Active Now</div>
        </div>
        <div className="glass rounded-xl p-6 border border-cyan-500/30">
          <div className="flex items-center gap-3 mb-2">
            <Award className="w-6 h-6 text-cyan-400" />
            <span className="text-2xl font-bold">
              {Math.round(agents.reduce((sum, a) => sum + a.reputation, 0) / agents.length) || 0}
            </span>
          </div>
          <div className="text-sm text-gray-400">Avg. Reputation</div>
        </div>
      </div>

      {/* Filters */}
      <div className="glass rounded-xl p-6 border border-white/10">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search agents by name, type, or specialization..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 glass-light rounded-lg border border-white/10 focus:border-violet-500/50 outline-none transition-colors text-gray-200 placeholder-gray-500"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-11 pr-8 py-3 glass-light rounded-lg border border-white/10 focus:border-violet-500/50 outline-none transition-colors text-gray-200 appearance-none cursor-pointer min-w-[150px]"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="busy">Busy</option>
              <option value="idle">Idle</option>
              <option value="offline">Offline</option>
            </select>
          </div>
        </div>
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredAgents.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-400">
            No agents found matching your criteria
          </div>
        ) : (
          filteredAgents.map((agent) => {
            const tierInfo = getReputationTier(agent.reputation);
            return (
              <Link
                key={agent.id}
                to={`/agents/${agent.id}`}
                className="glass rounded-xl p-5 border border-white/10 hover:border-violet-500/50 transition-all duration-200 group hover:scale-105"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{tierInfo.badge}</span>
                      <span className="font-bold group-hover:text-violet-400 transition-colors">
                        {agent.name}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">{agent.type}</div>
                  </div>
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(agent.status)} pulse-glow mt-1`} />
                </div>

                {/* Specialization Badge */}
                <div className="mb-4">
                  <div className="inline-block px-3 py-1 glass-light rounded-full text-xs text-gray-300 border border-white/10">
                    {agent.specialization}
                  </div>
                </div>

                {/* Stats */}
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-gray-400">Reputation</span>
                      <span className={`font-bold bg-gradient-to-r ${tierInfo.color} bg-clip-text text-transparent`}>
                        {agent.reputation} • {tierInfo.tier}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${tierInfo.color} transition-all duration-500`}
                        style={{ width: `${agent.reputation}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Tasks Completed</span>
                    <span className="text-white font-semibold">{agent.tasksCompleted}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Uptime</span>
                    <span className="text-white font-semibold">{agent.uptime}</span>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="mt-4 pt-4 border-t border-white/5">
                  <span className="text-xs text-gray-400 uppercase tracking-wider">
                    {agent.status}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
