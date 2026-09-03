import random
from pydantic import BaseModel
from typing import List, Dict, Optional

class BidRequest(BaseModel):
    task_id: str
    required_gpu: bool
    required_ram_gb: int
    strategy: str = "BALANCED" # CHEAP, FAST, BALANCED

class BidOffer(BaseModel):
    provider_id: str
    price_usd_per_hour: float
    estimated_latency_ms: int
    confidence: float

class MarketResponse(BaseModel):
    winning_offer: BidOffer
    all_offers: List[BidOffer]
    reason: str

class ArbitrageSystem:
    def __init__(self):
        # Mock Providers for MVP
        self.providers = [
            {"id": "aws-us-east", "base_price": 0.50, "latency_base": 50, "gpu_premium": 0.80},
            {"id": "akash-decentralized", "base_price": 0.05, "latency_base": 200, "gpu_premium": 0.10},
            {"id": "bacalhau-edge", "base_price": 0.02, "latency_base": 500, "gpu_premium": 0.15},
            {"id": "local-desktop", "base_price": 0.00, "latency_base": 10, "gpu_premium": 0.00},
        ]

    def get_offers(self, req: BidRequest) -> List[BidOffer]:
        offers = []
        for p in self.providers:
            # Simulate dynamic market conditions
            volatility = random.uniform(0.9, 1.1)
            
            price = p["base_price"] * volatility
            if req.required_gpu:
                price += p["gpu_premium"]
            
            # Simulate latency load
            latency = int(p["latency_base"] * random.uniform(1.0, 1.5))
            
            # Determine confidence (Local is mostly reliable, Edge less so)
            confidence = 0.95 if "local" in p["id"] else 0.85
            if "akash" in p["id"]: confidence = 0.80

            offers.append(BidOffer(
                provider_id=p["id"],
                price_usd_per_hour=round(price, 4),
                estimated_latency_ms=latency,
                confidence=confidence
            ))
        return offers

    def select_winner(self, offers: List[BidOffer], strategy: str) -> BidOffer:
        if strategy == "CHEAP":
            # Sort by price ascending
            return sorted(offers, key=lambda x: x.price_usd_per_hour)[0]
        elif strategy == "FAST":
            # Sort by latency ascending
            return sorted(offers, key=lambda x: x.estimated_latency_ms)[0]
        else: # BALANCED
            # Proprietary score: Price * 1000 + Latency
            # Lower is better
            return sorted(offers, key=lambda x: (x.price_usd_per_hour * 1000) + x.estimated_latency_ms)[0]

# Singleton
arbitrage_engine = ArbitrageSystem()
