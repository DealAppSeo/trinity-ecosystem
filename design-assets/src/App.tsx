import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AppLayout } from './components/AppLayout';
import { ShareModal } from './components/ShareModal';
import { Dashboard } from './pages/Dashboard';
import { Agents } from './pages/Agents';
import { Tasks } from './pages/Tasks';
import { Artifacts } from './pages/Artifacts';
import { NewMission } from './pages/NewMission';
import { AgentDetail } from './pages/AgentDetail';
import { projectId, publicAnonKey } from './utils/supabase/info';

export default function App() {
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-e172c8d9`;
      
      // Check if data exists
      const agentsRes = await fetch(`${baseUrl}/agents`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      const agentsData = await agentsRes.json();

      // If no agents exist, seed the database
      if (agentsData.success && agentsData.data.length === 0) {
        console.log('Seeding database with initial data...');
        await fetch(`${baseUrl}/seed`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        });
        console.log('Database seeded successfully');
      }

      setInitialized(true);
    } catch (error) {
      console.error('Error initializing app:', error);
      setInitialized(true);
    }
  };

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Initializing Trinity Controller...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <AppLayout onShareClick={() => setShareModalOpen(true)}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/agents/:id" element={<AgentDetail />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/artifacts" element={<Artifacts />} />
          <Route path="/new-mission" element={<NewMission />} />
        </Routes>
      </AppLayout>

      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        title="Trinity Controller"
      />
    </Router>
  );
}
