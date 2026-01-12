import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, Target, Users, DollarSign, AlertTriangle } from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

export function NewMission() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    objective: '',
    swarmSize: 3,
    budget: 1000,
    priority: 'medium',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-e172c8d9`;
      const response = await fetch(`${baseUrl}/missions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify(formData),
      });
      const data = await response.json();

      if (data.success) {
        // Create activity log
        await fetch(`${baseUrl}/activity`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            type: 'mission',
            message: `Mission deployed: ${formData.name}`,
          }),
        });

        alert('Mission deployed successfully!');
        navigate('/tasks');
      }
    } catch (error) {
      console.error('Error deploying mission:', error);
      alert('Failed to deploy mission');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="glass rounded-xl p-6 border border-violet-500/30 glow-violet">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
            <Rocket className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Deploy New Mission</h2>
            <p className="text-sm text-gray-400">Configure and launch an autonomous swarm objective</p>
          </div>
        </div>
      </div>

      {/* Mission Configuration Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Mission Name */}
        <div className="glass rounded-xl p-6 border border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <Target className="w-5 h-5 text-violet-400" />
            <h3 className="font-bold">Mission Name</h3>
          </div>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Q1 Growth Strategy, API Integration Sprint"
            className="w-full px-4 py-3 glass-light rounded-lg border border-white/10 focus:border-violet-500/50 outline-none transition-colors text-gray-200 placeholder-gray-500"
          />
        </div>

        {/* Objective */}
        <div className="glass rounded-xl p-6 border border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold">Mission Objective</h3>
          </div>
          <textarea
            required
            value={formData.objective}
            onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
            placeholder="Describe the mission objective in detail..."
            rows={4}
            className="w-full px-4 py-3 glass-light rounded-lg border border-white/10 focus:border-violet-500/50 outline-none transition-colors text-gray-200 placeholder-gray-500 resize-none"
          />
          <p className="text-xs text-gray-500 mt-2">
            Be specific about goals, deliverables, and success criteria
          </p>
        </div>

        {/* Swarm Configuration */}
        <div className="glass rounded-xl p-6 border border-white/10">
          <div className="flex items-center gap-3 mb-6">
            <Users className="w-5 h-5 text-violet-400" />
            <h3 className="font-bold">Swarm Configuration</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Swarm Size */}
            <div>
              <label className="block text-sm text-gray-400 mb-3">
                Swarm Size (Agents)
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={formData.swarmSize}
                  onChange={(e) => setFormData({ ...formData, swarmSize: parseInt(e.target.value) })}
                  className="flex-1 h-2 glass-light rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, rgb(168 85 247) 0%, rgb(168 85 247) ${
                      (formData.swarmSize / 20) * 100
                    }%, rgba(255,255,255,0.1) ${(formData.swarmSize / 20) * 100}%, rgba(255,255,255,0.1) 100%)`,
                  }}
                />
                <div className="w-16 px-3 py-2 glass-light rounded-lg text-center font-bold text-violet-400">
                  {formData.swarmSize}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                More agents = faster execution, higher cost
              </p>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm text-gray-400 mb-3">Priority Level</label>
              <div className="grid grid-cols-3 gap-2">
                {['low', 'medium', 'high'].map((priority) => (
                  <button
                    key={priority}
                    type="button"
                    onClick={() => setFormData({ ...formData, priority })}
                    className={`px-4 py-2 rounded-lg capitalize transition-all duration-200 ${
                      formData.priority === priority
                        ? priority === 'high'
                          ? 'bg-red-500/30 border-2 border-red-500 text-red-300'
                          : priority === 'medium'
                          ? 'bg-yellow-500/30 border-2 border-yellow-500 text-yellow-300'
                          : 'bg-blue-500/30 border-2 border-blue-500 text-blue-300'
                        : 'glass-light border border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    {priority}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Budget */}
        <div className="glass rounded-xl p-6 border border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <DollarSign className="w-5 h-5 text-green-400" />
            <h3 className="font-bold">Budget Allocation</h3>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-400">$</span>
            <input
              type="number"
              min="0"
              step="100"
              value={formData.budget}
              onChange={(e) => setFormData({ ...formData, budget: parseInt(e.target.value) })}
              className="flex-1 px-4 py-3 glass-light rounded-lg border border-white/10 focus:border-violet-500/50 outline-none transition-colors text-gray-200"
            />
            <span className="text-gray-400">USD</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Estimated compute and API costs for mission completion
          </p>
        </div>

        {/* Mission Summary */}
        <div className="glass rounded-xl p-6 border border-cyan-500/30 glow-cyan">
          <h3 className="font-bold mb-4">Mission Summary</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Mission Name:</span>
              <span className="text-white font-medium">{formData.name || 'Not set'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Swarm Size:</span>
              <span className="text-white font-medium">{formData.swarmSize} agents</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Priority:</span>
              <span className={`font-medium capitalize ${
                formData.priority === 'high'
                  ? 'text-red-400'
                  : formData.priority === 'medium'
                  ? 'text-yellow-400'
                  : 'text-blue-400'
              }`}>
                {formData.priority}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Budget:</span>
              <span className="text-green-400 font-medium">${formData.budget}</span>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 hover:from-violet-600 hover:to-cyan-600 transition-all duration-200 glow-violet disabled:opacity-50 disabled:cursor-not-allowed font-bold text-lg"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Deploying...
              </>
            ) : (
              <>
                <Rocket className="w-5 h-5" />
                Deploy Mission
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-6 py-4 rounded-lg glass-light hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
