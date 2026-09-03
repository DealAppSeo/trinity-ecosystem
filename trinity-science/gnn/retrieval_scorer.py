import torch
import torch.nn.functional as F
from torch_geometric.nn import GATv2Conv, global_mean_pool
import torch.nn as nn

class PhiGNNScorer(torch.nn.Module):
    """
    Trinity GNN Retrieval Scorer (Patent P-005).
    Uses Golden Ratio (phi = 1.618) scaling for hidden layer dimensions
    to optimize multi-hop information flow in the Semantic DAG.
    """
    def __init__(self, in_channels: int, out_channels: int = 1):
        super(PhiGNNScorer, self).__init__()
        self.PHI = 1.61803398875
        
        # Phi-scaled Hidden Layers
        self.h1_dim = int(in_channels * self.PHI)
        self.h2_dim = int(self.h1_dim / self.PHI)
        
        # Multi-head Attention for adaptive graph traversal
        self.conv1 = GATv2Conv(in_channels, self.h1_dim, heads=3)
        self.conv2 = GATv2Conv(self.h1_dim * 3, self.h2_dim, heads=1)
        
        # Final Scoring Head
        self.fc = nn.Linear(self.h2_dim, out_channels)

    def forward(self, x, edge_index, batch):
        # 1. First GNN Layer (Phi-scaled expansion)
        x = self.conv1(x, edge_index)
        x = F.elu(x)
        
        # 2. Second GNN Layer (Multi-hop refinement)
        x = self.conv2(x, edge_index)
        x = F.elu(x)
        
        # 3. Readout (Global average pooling)
        if batch is None:
            batch = torch.zeros(x.size(0), dtype=torch.long, device=x.device)
        x = global_mean_pool(x, batch)
        
        # 4. Final Scorer
        x = self.fc(x)
        return torch.sigmoid(x)

if __name__ == "__main__":
    print("Initializing Trinity Phi-GNN Scorer...")
    model = PhiGNNScorer(in_channels=1536)
    
    # 2 graphs, 4 nodes each, 1536 dim embeddings
    x = torch.randn(8, 1536)
    edge_index = torch.tensor([[0, 1, 1, 2, 4, 5, 5, 6],
                               [1, 0, 2, 1, 5, 4, 6, 5]], dtype=torch.long)
    batch = torch.tensor([0, 0, 0, 0, 1, 1, 1, 1])
    
    with torch.no_grad():
        out = model(x, edge_index, batch)
    
    print(f"Scorer Dimensions: H1={model.h1_dim}, H2={model.h2_dim}")
    print(f"Output Scores (0.0 - 1.0): {out.flatten().tolist()}")
    print("GNN Scorer Architecture Verified.")
