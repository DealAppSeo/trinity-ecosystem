import { StateGraph, END } from '@langchain/langgraph';
import { createClient } from '@supabase/supabase-js';

interface MotorTaskState {
  taskId: number;
  agentName: string;
  taskDescription: string;
  checkpointId?: number;
  status: 'claimed' | 'processing' | 'veritas_gate' | 'done' | 'failed';
  result?: string;
  failureReflection?: string;
  retryCount: number;
}

const motorGraph = new StateGraph<MotorTaskState>({
  channels: {
    taskId: { value: (a, b) => b ?? a },
    agentName: { value: (a, b) => b ?? a },
    taskDescription: { value: (a, b) => b ?? a },
    status: { value: (a, b) => b ?? a },
    result: { value: (a, b) => b ?? a },
    failureReflection: { value: (a, b) => b ?? a },
    retryCount: { value: (a, b) => b ?? a, default: () => 0 }
  }
});

// Mock nodes since implementation details weren't provided in the prompt
const claimTaskNode = async (state: MotorTaskState) => ({ status: 'processing' as const });
const processTaskNode = async (state: MotorTaskState) => {
  // If it fails on retry, update count and stay failed
  return { status: 'veritas_gate' as const };
};
const veritasGateNode = async (state: MotorTaskState) => ({ status: 'done' as const });
const completeTaskNode = async (state: MotorTaskState) => ({ status: 'done' as const });
const reflectAndRetryNode = async (state: MotorTaskState) => ({ 
  status: 'processing' as const, 
  retryCount: state.retryCount + 1 
});

// Nodes
motorGraph.addNode('claim', claimTaskNode);
motorGraph.addNode('process', processTaskNode);
motorGraph.addNode('veritas_gate', veritasGateNode); // VERITAS validation before done
motorGraph.addNode('complete', completeTaskNode);
motorGraph.addNode('reflect_and_retry', reflectAndRetryNode);

// Edges
motorGraph.setEntryPoint('claim');
motorGraph.addEdge('claim', 'process');
motorGraph.addConditionalEdges('process', (state) => {
  if (state.status === 'failed' && state.retryCount < 2) return 'reflect_and_retry';
  if (state.status === 'processing') return 'veritas_gate';
  return END;
});
motorGraph.addConditionalEdges('veritas_gate', (state) => {
  if (state.status === 'done') return 'complete';
  return 'reflect_and_retry'; // VERITAS rejected — retry
});
motorGraph.addEdge('reflect_and_retry', 'process');
motorGraph.addEdge('complete', END);

// Persist checkpoints to Supabase
export async function saveCheckpoint(supabase: any, state: MotorTaskState, nodeName: string) {
  const { data } = await supabase
    .from('trinity_langgraph_checkpoints')
    .insert({
      graph_id: `motor_task_${state.taskId}`,
      squad: 'motor',
      checkpoint_data: state,
      node_name: nodeName,
      is_complete: state.status === 'done'
    })
    .select('id')
    .single();
  return data?.id;
}

export const compiledMotorGraph = motorGraph.compile();
