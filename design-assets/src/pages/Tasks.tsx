import { useEffect, useState } from 'react';
import { Plus, Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'done' | 'failed';
  priority: 'low' | 'medium' | 'high';
  assignedAgent?: string;
  createdAt: string;
  updatedAt: string;
}

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium' });
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-e172c8d9`;
      const response = await fetch(`${baseUrl}/tasks`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      const data = await response.json();

      if (data.success) {
        setTasks(data.data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      setLoading(false);
    }
  };

  const createTask = async () => {
    if (!newTask.title.trim()) return;

    try {
      const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-e172c8d9`;
      const response = await fetch(`${baseUrl}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify(newTask),
      });
      const data = await response.json();

      if (data.success) {
        setTasks([...tasks, data.data]);
        setNewTask({ title: '', description: '', priority: 'medium' });
        setShowNewTaskForm(false);
      }
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  const updateTaskStatus = async (taskId: string, newStatus: Task['status']) => {
    try {
      const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-e172c8d9`;
      const response = await fetch(`${baseUrl}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await response.json();

      if (data.success) {
        setTasks(tasks.map((t) => (t.id === taskId ? data.data : t)));
      }
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-e172c8d9`;
      await fetch(`${baseUrl}/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      setTasks(tasks.filter((t) => t.id !== taskId));
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const getTasksByStatus = (status: Task['status']) => {
    return tasks.filter((task) => task.status === status);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'border-red-500/50 bg-red-500/10';
      case 'medium':
        return 'border-yellow-500/50 bg-yellow-500/10';
      case 'low':
        return 'border-blue-500/50 bg-blue-500/10';
      default:
        return 'border-gray-500/50 bg-gray-500/10';
    }
  };

  const columns = [
    { id: 'todo', title: 'To Do', icon: Clock, color: 'violet' },
    { id: 'in-progress', title: 'In Progress', icon: AlertCircle, color: 'cyan' },
    { id: 'done', title: 'Done', icon: CheckCircle, color: 'green' },
    { id: 'failed', title: 'Failed', icon: XCircle, color: 'red' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-16 h-16 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Mission Tasks</h2>
          <p className="text-gray-400 text-sm">Manage and track your swarm's objectives</p>
        </div>
        <button
          onClick={() => setShowNewTaskForm(!showNewTaskForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 hover:from-violet-600 hover:to-cyan-600 transition-all duration-200 glow-violet"
        >
          <Plus className="w-5 h-5" />
          <span className="font-medium">New Task</span>
        </button>
      </div>

      {/* New Task Form */}
      {showNewTaskForm && (
        <div className="glass rounded-xl p-6 border border-violet-500/30 glow-violet">
          <h3 className="text-lg font-bold mb-4">Create New Task</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Title</label>
              <input
                type="text"
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                placeholder="Enter task title..."
                className="w-full px-4 py-2 glass-light rounded-lg border border-white/10 focus:border-violet-500/50 outline-none transition-colors text-gray-200 placeholder-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Description</label>
              <textarea
                value={newTask.description}
                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                placeholder="Enter task description..."
                rows={3}
                className="w-full px-4 py-2 glass-light rounded-lg border border-white/10 focus:border-violet-500/50 outline-none transition-colors text-gray-200 placeholder-gray-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Priority</label>
              <select
                value={newTask.priority}
                onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                className="px-4 py-2 glass-light rounded-lg border border-white/10 focus:border-violet-500/50 outline-none transition-colors text-gray-200"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={createTask}
                className="px-4 py-2 rounded-lg bg-violet-500 hover:bg-violet-600 transition-colors font-medium"
              >
                Create Task
              </button>
              <button
                onClick={() => setShowNewTaskForm(false)}
                className="px-4 py-2 rounded-lg glass-light hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {columns.map((column) => {
          const Icon = column.icon;
          const columnTasks = getTasksByStatus(column.id as Task['status']);

          return (
            <div key={column.id} className="glass rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-4">
                <Icon className={`w-5 h-5 text-${column.color}-400`} />
                <h3 className="font-bold">{column.title}</h3>
                <span className="ml-auto text-sm text-gray-400">{columnTasks.length}</span>
              </div>

              <div className="space-y-3">
                {columnTasks.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">No tasks</div>
                ) : (
                  columnTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`glass-light rounded-lg p-4 border ${getPriorityColor(task.priority)} hover:scale-105 transition-transform duration-200 cursor-move`}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('taskId', task.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const taskId = e.dataTransfer.getData('taskId');
                        updateTaskStatus(taskId, column.id as Task['status']);
                      }}
                    >
                      <div className="mb-2">
                        <h4 className="font-semibold text-sm mb-1">{task.title}</h4>
                        {task.description && (
                          <p className="text-xs text-gray-400 line-clamp-2">{task.description}</p>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 uppercase">{task.priority}</span>
                        <button
                          onClick={() => deleteTask(task.id)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {columns.map((column) => {
          const count = getTasksByStatus(column.id as Task['status']).length;
          return (
            <div key={column.id} className={`glass rounded-lg p-4 border border-${column.color}-500/30`}>
              <div className={`text-2xl font-bold text-${column.color}-400 mb-1`}>{count}</div>
              <div className="text-xs text-gray-400">{column.title}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
