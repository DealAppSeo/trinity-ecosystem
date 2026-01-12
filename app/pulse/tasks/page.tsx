'use client';

import { useTrinityController } from '@/hooks/useTrinityController';
import { TaskQueue } from '@/components/TaskQueue'; // Reuse existing queue for now

export default function TasksPage() {
    const { tasks } = useTrinityController();

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold text-white">Mission Control</h1>
                {/* Add Filter/Sort controls here later */}
            </div>

            {/* Reusing TaskQueue component but full width */}
            <div className="bg-[#0B0B0F]/60 backdrop-blur-sm rounded-xl p-6 border border-white/10 min-h-[600px]">
                <TaskQueue tasks={tasks} onAddTask={() => { }} />
            </div>
        </div>
    );
}
