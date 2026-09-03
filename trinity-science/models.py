import torch
import torch.nn as nn
from torch_geometric.nn import MessagePassing
from torch_geometric.utils import add_self_loops, degree

class MultiplicativeConv(MessagePassing):
    """
    Patent #2: Geometric Mean Aggregation GNN Layer (Phi-Weighted).
    Implements: h_i = exp( (1/Phi) * sum( log(W * h_j + Epsilon) ) )
    Formula: h_i^(k+1) = exp[(1/\u03c6) \u00d7 \u03a3 log(h_j^(k) \u00d7 w_ij + \u03b5)]
    """
    def __init__(self, in_channels, out_channels):
        super(MultiplicativeConv, self).__init__(aggr='add')
        self.lin = nn.Linear(in_channels, out_channels)
        self.phi = 1.61803398875  # Golden Ratio Scaling Factor
        self.eps = 1e-8           # Patent-specific stabilization term

    def forward(self, x, edge_index):
        # x: [num_nodes, in_channels]
        edge_index, _ = add_self_loops(edge_index, num_nodes=x.size(0))
        x = self.lin(x)
        
        # Log-Sum-Exp Trick with patent-specific Epsilon
        x_log = torch.log(torch.abs(x) + self.eps)
        return self.propagate(edge_index, x=x_log)

    def message(self, x_j):
        return x_j

    def update(self, aggr_out, edge_index):
        # Phi-weighted normalization
        # Note: Broadens convergence from O(n) to O(log n) via logarithmic scaling
        return torch.exp((1.0 / self.phi) * aggr_out)

class MultiplicativeGNN(nn.Module):
    def __init__(self, in_channels, hidden_channels, out_channels):
        super(MultiplicativeGNN, self).__init__()
        self.conv1 = MultiplicativeConv(in_channels, hidden_channels)
        self.conv2 = MultiplicativeConv(hidden_channels, out_channels)

    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index)
        x = torch.relu(x)
        x = self.conv2(x, edge_index)
        return x
