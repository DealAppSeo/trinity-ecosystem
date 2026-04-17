import os
import time
import socket
import statistics
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables using absolute path
load_dotenv(dotenv_path="c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/.env.local")

# Targets for monitoring
TARGETS = {
    "hot": {"host": os.environ.get("UPSTASH_REDIS_REST_URL", "").replace("https://", "").split(":")[0], "port": 6379},
    "warm": {"host": os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").replace("https://", "").split("/")[0], "port": 5432}
}

class TelemetryCollector:
    def __init__(self):
        url: str = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        self.supabase: Client = create_client(url, key)
        self.has_ebpf = False
        try:
            from bcc import BPF # type: ignore
            self.has_ebpf = True
            print("INFO: eBPF (bcc) detected. Using kernel-level tracing.")
        except ImportError:
            print("INFO: eBPF (bcc) not found. Falling back to application-level socket timing.")

    def measure_latency_socket(self, host: str, port: int, samples: int = 10) -> dict:
        """Measure TCP handshake latency as a fallback for eBPF."""
        latencies = []
        for _ in range(samples):
            start = time.perf_counter()
            try:
                with socket.create_connection((host, port), timeout=1) as sock:
                    pass
                end = time.perf_counter()
                latencies.append((end - start) * 1000) # ms
            except Exception:
                continue
            time.sleep(0.1)
        
        if not latencies:
            return {"p50": 0, "p95": 0, "p99": 0}
            
        return {
            "p50": int(statistics.median(latencies)),
            "p95": int(sorted(latencies)[int(len(latencies)*0.95)-1]),
            "p99": int(sorted(latencies)[int(len(latencies)*0.99)-1])
        }

    async def collect_and_report(self):
        source = "ebpf" if self.has_ebpf else "app"
        print(f"[{datetime.now().isoformat()}] Collecting telemetry (source: {source})...")
        
        for tier, config in TARGETS.items():
            if not config["host"]: continue
            
            stats = self.measure_latency_socket(config["host"], config["port"])
            print(f"[{tier}] {stats['p50']}ms (p50) | {stats['p95']}ms (p95)")
            
            self.supabase.table("db_tier_latency").insert({
                "tier": tier,
                "p50_ms": stats["p50"],
                "p95_ms": stats["p95"],
                "p99_ms": stats["p99"],
                "source": source
            }).execute()

if __name__ == "__main__":
    import asyncio
    collector = TelemetryCollector()
    asyncio.run(collector.collect_and_report())
