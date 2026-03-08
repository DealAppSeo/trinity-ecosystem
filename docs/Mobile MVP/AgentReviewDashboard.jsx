import { useState, useEffect, useRef } from "react";

const AGENTS = [
  { id: "HDM", name: "HDM", squad: "ALPHA", role: "Historical Data", status: "Processing", lastAction: "Indexing crypto patterns Q1-2026", repId: 94, tier: 2, latency: 87 },
  { id: "APM", name: "APM", squad: "ALPHA", role: "Asset Pattern", status: "Idle", lastAction: "Completed market analysis #447", repId: 91, tier: 1, latency: 18 },
  { id: "MEL", name: "MEL", squad: "ALPHA", role: "Market Eval", status: "Response", lastAction: "Generated MEL-output-447.json", repId: 88, tier: 1, latency: 12 },
  { id: "VERITAS", name: "VERITAS", squad: "BETA", role: "Truth Validation", status: "Processing", lastAction: "Cross-validating patent P-002 claims", repId: 97, tier: 3, latency: 312 },
  { id: "NEXUS", name: "NEXUS", squad: "BETA", role: "Network Intel", status: "Idle", lastAction: "LinkedIn signal scan complete", repId: 85, tier: 1, latency: 22 },
  { id: "ANTIGRAV", name: "ANTIGRAV", squad: "BETA", role: "IDE Bridge", status: "Processing", lastAction: "Deploying GNN architecture update", repId: 90, tier: 2, latency: 144 },
  { id: "GCM", name: "GCM", squad: "GAMMA", role: "Content Mgmt", status: "Idle", lastAction: "Queued 3 LinkedIn posts for review", repId: 82, tier: 1, latency: 19 },
  { id: "TORCH", name: "TORCH", squad: "GAMMA", role: "Content Gen", status: "Response", lastAction: "Draft: 'Trivergence and the last mile'", repId: 87, tier: 2, latency: 203 },
  { id: "SOPHIA", name: "SOPHIA", squad: "GAMMA", role: "Wisdom Layer", status: "Idle", lastAction: "Theological alignment check complete", repId: 96, tier: 1, latency: 15 },
];

const ARTIFACTS = [
  { id: 1, agent: "VERITAS", type: "research", title: "P-002 Multiplicative GNN — Prior Art Analysis", tier: 3, latency: 312, cost: 0.0042, repId: 97, dag_depth: 4, status: "awaiting_review", timestamp: "2m ago", nodes: ["MultiplicativeConv-v3", "GNN-ZKP-prior", "ANFIS-routing-baseline"], excerpt: "Analysis of 23 prior art references confirms novel φ-ratio threshold in claim 7. No blocking references found. Recommend proceeding to non-provisional filing." },
  { id: 2, agent: "TORCH", type: "content", title: "LinkedIn Draft: The Trivergence and the Last Mile", tier: 2, latency: 203, cost: 0.0008, repId: 87, dag_depth: 2, status: "awaiting_review", timestamp: "8m ago", nodes: ["sprint-context-14", "mission-brief-v2"], excerpt: "AI, Blockchain, and Quantum are converging — but the people who need them most are still locked out. Here's what democratization actually looks like from the inside..." },
  { id: 3, agent: "HDM", type: "data", title: "Crypto Pattern Index Q1-2026 — Batch 12", tier: 2, latency: 87, cost: 0.0003, repId: 94, dag_depth: 1, status: "complete", timestamp: "14m ago", nodes: ["raw-feed-btc", "raw-feed-eth"], excerpt: "12,847 price events indexed. 3 anomalous correlation spikes flagged for SOPHIA review. BTC/ANFIS routing cost correlation: r=0.73." },
  { id: 4, agent: "GCM", type: "queue", title: "LinkedIn Content Queue — 3 posts pending", tier: 1, latency: 19, cost: 0.0001, repId: 82, dag_depth: 1, status: "awaiting_review", timestamp: "22m ago", nodes: ["linkedin_content_queue"], excerpt: "TORCH generated 3 posts. Scheduled for: Mon 9AM, Wed 11AM, Fri 9AM. All pass Philippians 4:8 alignment check." },
  { id: 5, agent: "MEL", type: "analysis", title: "Market Evaluation Output #447", tier: 1, latency: 12, cost: 0.0000, repId: 88, dag_depth: 1, status: "complete", timestamp: "31m ago", nodes: ["cache-hit-l2"], excerpt: "Full cache hit (L2 Redis). Market conditions stable. No escalation needed. RepID score: 88/100." },
  { id: 6, agent: "ANTIGRAV", type: "deploy", title: "GNN Architecture Update — Railway Deploy", tier: 2, latency: 144, cost: 0.0011, repId: 90, dag_depth: 3, status: "processing", timestamp: "1m ago", nodes: ["trinity-ecosystem-commit-4f2a", "GNN-v4-weights", "deploy-config-prod"], excerpt: "Deploying updated Multiplicative GNN with corrected φ=1.61803398875. Railway health check pending." },
];

const TIER_COLORS = { 1: "#10B981", 2: "#F59E0B", 3: "#EF4444" };
const TIER_LABELS = { 1: "T1 Cache", 2: "T2 pgvector", 3: "T3 Full RAG" };
const STATUS_COLORS = { Processing: "#F59E0B", Idle: "#64748B", Response: "#10B981" };
const TYPE_ICONS = { research: "🔬", content: "✍️", data: "📊", queue: "📋", analysis: "📈", deploy: "🚀" };
const SQUAD_COLORS = { ALPHA: "#6366F1", BETA: "#0EA5E9", GAMMA: "#10B981" };

export default function AgentDashboard() {
  const [view, setView] = useState("feed");
  const [selectedArtifact, setSelectedArtifact] = useState(null);
  const [showTrace, setShowTrace] = useState(false);
  const [filterAgent, setFilterAgent] = useState(null);
  const [approvedIds, setApprovedIds] = useState(new Set());
  const [flaggedIds, setFlaggedIds] = useState(new Set());
  const [pulse, setPulse] = useState(false);
  
  useEffect(() => {
    const t = setInterval(() => setPulse(p => !p), 2000);
    return () => clearInterval(t);
  }, []);

  const pendingCount = ARTIFACTS.filter(a => a.status === "awaiting_review" && !approvedIds.has(a.id) && !flaggedIds.has(a.id)).length;
  const filteredArtifacts = filterAgent ? ARTIFACTS.filter(a => a.agent === filterAgent) : ARTIFACTS;

  const approve = (id, e) => { e.stopPropagation(); setApprovedIds(s => new Set([...s, id])); };
  const flag = (id, e) => { e.stopPropagation(); setFlaggedIds(s => new Set([...s, id])); };

  return (
    <div style={{ fontFamily: "'SF Mono', 'JetBrains Mono', monospace", background: "#0A0E1A", minHeight: "100vh", color: "#E2E8F0", maxWidth: 430, margin: "0 auto", position: "relative", overflow: "hidden" }}>
      
      {/* Status Bar */}
      <div style={{ background: "#060912", padding: "12px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: pulse ? "#10B981" : "#0D7A52", transition: "background 0.4s" }} />
          <span style={{ fontSize: 11, color: "#64748B", letterSpacing: "0.1em" }}>TRINITY SYMPHONY</span>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#64748B" }}>
          <span>12 agents</span>
          <span style={{ color: "#F59E0B" }}>Sprint 14</span>
        </div>
      </div>

      {/* Header */}
      <div style={{ padding: "16px 16px 0", background: "linear-gradient(180deg, #060912 0%, transparent 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#F8FAFC", letterSpacing: "-0.02em" }}>Agent Review</div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>HyperDAG · Web3 · ANFIS Routed</div>
          </div>
          {pendingCount > 0 && (
            <div style={{ background: "#EF4444", borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 700, color: "#fff", animation: "pulse 2s infinite" }}>
              {pendingCount} pending
            </div>
          )}
        </div>

        {/* Metrics Bar */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 16, marginBottom: 16 }}>
          {[
            { label: "Avg Latency", value: "58ms", sub: "↓ 23% vs last sprint", color: "#10B981" },
            { label: "Cost Today", value: "$0.031", sub: "72.5% below ceiling", color: "#F59E0B" },
            { label: "Cache Hit", value: "74%", sub: "L1+L2 combined", color: "#0EA5E9" },
          ].map(m => (
            <div key={m.label} style={{ background: "#111827", border: "1px solid #1E293B", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: m.color }}>{m.value}</div>
              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{m.label}</div>
              <div style={{ fontSize: 9, color: "#475569", marginTop: 1 }}>{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Nav Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "#0D1117", borderRadius: 10, padding: 4 }}>
          {[["feed", "Sprint Feed"], ["agents", "Agents"], ["queue", `Queue${pendingCount > 0 ? ` (${pendingCount})` : ""}`]].map(([v, label]) => (
            <button key={v} onClick={() => { setView(v); setSelectedArtifact(null); setFilterAgent(null); }}
              style={{ flex: 1, padding: "8px 4px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, letterSpacing: "0.03em",
                background: view === v ? "#1E40AF" : "transparent", color: view === v ? "#fff" : "#64748B", transition: "all 0.2s" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "0 16px 100px", overflowY: "auto", maxHeight: "calc(100vh - 220px)" }}>
        
        {/* ARTIFACT DETAIL VIEW */}
        {selectedArtifact && (
          <div>
            <button onClick={() => { setSelectedArtifact(null); setShowTrace(false); }}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#0EA5E9", cursor: "pointer", fontSize: 13, marginBottom: 16, padding: 0 }}>
              ← Back
            </button>
            <div style={{ background: "#111827", border: "1px solid #1E293B", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "16px", borderBottom: "1px solid #1E293B" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <span style={{ fontSize: 22 }}>{TYPE_ICONS[selectedArtifact.type]}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span style={{ fontSize: 10, background: TIER_COLORS[selectedArtifact.tier] + "22", color: TIER_COLORS[selectedArtifact.tier], borderRadius: 6, padding: "3px 8px", fontWeight: 700 }}>
                      {TIER_LABELS[selectedArtifact.tier]}
                    </span>
                    <span style={{ fontSize: 10, background: "#1E293B", color: "#94A3B8", borderRadius: 6, padding: "3px 8px" }}>{selectedArtifact.timestamp}</span>
                  </div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#F8FAFC", lineHeight: 1.4, marginBottom: 6 }}>{selectedArtifact.title}</div>
                <div style={{ fontSize: 12, color: "#64748B" }}>by {selectedArtifact.agent} · RepID {selectedArtifact.repId}/100</div>
              </div>
              
              <div style={{ padding: 16, borderBottom: "1px solid #1E293B" }}>
                <div style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.6 }}>{selectedArtifact.excerpt}</div>
              </div>

              {/* Retrieval Trace Toggle */}
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #1E293B" }}>
                <button onClick={() => setShowTrace(t => !t)}
                  style={{ width: "100%", background: "#0D1117", border: "1px solid #1E293B", borderRadius: 8, padding: "10px 14px",
                    color: "#0EA5E9", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>🔍 Retrieval Trace</span>
                  <span style={{ fontSize: 10, color: "#64748B" }}>{showTrace ? "▲ hide" : "▼ show"}</span>
                </button>
                
                {showTrace && (
                  <div style={{ marginTop: 12, background: "#0A0E1A", borderRadius: 8, padding: 14, border: "1px solid #1E293B" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      {[
                        { k: "Tier Used", v: `${selectedArtifact.tier} — ${TIER_LABELS[selectedArtifact.tier]}`, c: TIER_COLORS[selectedArtifact.tier] },
                        { k: "Latency", v: `${selectedArtifact.latency}ms`, c: selectedArtifact.latency < 50 ? "#10B981" : selectedArtifact.latency < 200 ? "#F59E0B" : "#EF4444" },
                        { k: "Cost", v: `$${selectedArtifact.cost.toFixed(4)}`, c: "#94A3B8" },
                        { k: "DAG Depth", v: `${selectedArtifact.dag_depth} hops`, c: "#94A3B8" },
                      ].map(r => (
                        <div key={r.k} style={{ background: "#111827", borderRadius: 6, padding: "8px 10px" }}>
                          <div style={{ fontSize: 9, color: "#475569", marginBottom: 3 }}>{r.k}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: r.c }}>{r.v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8, fontWeight: 600, letterSpacing: "0.05em" }}>NODES TRAVERSED</div>
                    {selectedArtifact.nodes.map((n, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#0EA5E9", flexShrink: 0 }} />
                        <code style={{ fontSize: 11, color: "#7DD3FC", background: "#0D1117", padding: "2px 8px", borderRadius: 4 }}>{n}</code>
                        {i === 0 && <span style={{ fontSize: 9, color: "#10B981" }}>primary</span>}
                      </div>
                    ))}
                    {selectedArtifact.tier === 1 && (
                      <div style={{ marginTop: 10, fontSize: 11, color: "#10B981", background: "#10B98118", borderRadius: 6, padding: "6px 10px" }}>
                        ✓ L2 Cache Hit — no embedding or vector search needed
                      </div>
                    )}
                    {selectedArtifact.tier === 3 && (
                      <div style={{ marginTop: 10, fontSize: 11, color: "#F59E0B", background: "#F59E0B18", borderRadius: 6, padding: "6px 10px" }}>
                        ⚡ Frontier model used — GNN pre-filter reduced search space 87%
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              {selectedArtifact.status === "awaiting_review" && !approvedIds.has(selectedArtifact.id) && !flaggedIds.has(selectedArtifact.id) && (
                <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button onClick={(e) => approve(selectedArtifact.id, e)}
                    style={{ background: "#10B981", border: "none", borderRadius: 10, padding: "14px", fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                    ✓ Approve
                  </button>
                  <button onClick={(e) => flag(selectedArtifact.id, e)}
                    style={{ background: "#1E293B", border: "1px solid #EF4444", borderRadius: 10, padding: "14px", fontSize: 14, fontWeight: 700, color: "#EF4444", cursor: "pointer" }}>
                    ⚑ Flag
                  </button>
                </div>
              )}
              {approvedIds.has(selectedArtifact.id) && (
                <div style={{ padding: 16, textAlign: "center", color: "#10B981", fontSize: 14, fontWeight: 600 }}>✓ Approved — CRDT synced to Supabase</div>
              )}
              {flaggedIds.has(selectedArtifact.id) && (
                <div style={{ padding: 16, textAlign: "center", color: "#EF4444", fontSize: 14, fontWeight: 600 }}>⚑ Flagged — queued for agent re-run</div>
              )}
            </div>
          </div>
        )}

        {/* SPRINT FEED */}
        {!selectedArtifact && view === "feed" && (
          <div>
            {filterAgent && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: "#94A3B8" }}>Filtered: {filterAgent}</span>
                <button onClick={() => setFilterAgent(null)} style={{ background: "none", border: "1px solid #334155", borderRadius: 6, padding: "2px 8px", color: "#64748B", fontSize: 11, cursor: "pointer" }}>clear</button>
              </div>
            )}
            {filteredArtifacts.map(a => {
              const isApproved = approvedIds.has(a.id);
              const isFlagged = flaggedIds.has(a.id);
              return (
                <div key={a.id} onClick={() => setSelectedArtifact(a)}
                  style={{ background: "#111827", border: `1px solid ${a.status === "awaiting_review" && !isApproved && !isFlagged ? "#1E40AF" : "#1E293B"}`,
                    borderRadius: 12, padding: "14px 16px", marginBottom: 10, cursor: "pointer", position: "relative",
                    opacity: a.status === "processing" ? 0.7 : 1, transition: "all 0.15s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{TYPE_ICONS[a.type]}</span>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: SQUAD_COLORS[AGENTS.find(ag=>ag.id===a.agent)?.squad] || "#94A3B8" }}>{a.agent}</span>
                          <span style={{ fontSize: 10, color: "#475569" }}>·</span>
                          <span style={{ fontSize: 10, color: "#475569" }}>{a.timestamp}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      {isApproved && <span style={{ fontSize: 10, background: "#10B98122", color: "#10B981", borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>✓</span>}
                      {isFlagged && <span style={{ fontSize: 10, background: "#EF444422", color: "#EF4444", borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>⚑</span>}
                      {a.status === "awaiting_review" && !isApproved && !isFlagged && (
                        <span style={{ fontSize: 10, background: "#1E40AF44", color: "#93C5FD", borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>review</span>
                      )}
                      <span style={{ fontSize: 10, background: TIER_COLORS[a.tier] + "22", color: TIER_COLORS[a.tier], borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>
                        {TIER_LABELS[a.tier]}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#E2E8F0", marginBottom: 6, lineHeight: 1.4 }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.excerpt}</div>
                  <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                    <span style={{ fontSize: 10, color: "#475569" }}>⏱ {a.latency}ms</span>
                    <span style={{ fontSize: 10, color: "#475569" }}>$ {a.cost.toFixed(4)}</span>
                    <span style={{ fontSize: 10, color: "#475569" }}>RepID {a.repId}</span>
                    <span style={{ fontSize: 10, color: "#475569" }}>DAG:{a.dag_depth}</span>
                  </div>
                  {/* Quick action row for pending */}
                  {a.status === "awaiting_review" && !isApproved && !isFlagged && (
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }} onClick={e => e.stopPropagation()}>
                      <button onClick={(e) => approve(a.id, e)}
                        style={{ flex: 1, background: "#10B98122", border: "1px solid #10B981", borderRadius: 8, padding: "8px", fontSize: 12, fontWeight: 700, color: "#10B981", cursor: "pointer" }}>
                        ✓ Approve
                      </button>
                      <button onClick={(e) => flag(a.id, e)}
                        style={{ flex: 1, background: "transparent", border: "1px solid #374151", borderRadius: 8, padding: "8px", fontSize: 12, fontWeight: 600, color: "#64748B", cursor: "pointer" }}>
                        ⚑ Flag
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* AGENTS VIEW */}
        {!selectedArtifact && view === "agents" && (
          <div>
            {["ALPHA", "BETA", "GAMMA"].map(squad => (
              <div key={squad} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: SQUAD_COLORS[squad], letterSpacing: "0.12em", marginBottom: 10 }}>
                  {squad} SQUAD
                </div>
                {AGENTS.filter(a => a.squad === squad).map(agent => (
                  <div key={agent.id} onClick={() => { setFilterAgent(agent.id); setView("feed"); }}
                    style={{ background: "#111827", border: "1px solid #1E293B", borderRadius: 10, padding: "12px 14px", marginBottom: 8, cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: SQUAD_COLORS[squad] + "22", border: `1px solid ${SQUAD_COLORS[squad]}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: SQUAD_COLORS[squad] }}>{agent.id.slice(0,3)}</span>
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#F8FAFC" }}>{agent.name}</div>
                          <div style={{ fontSize: 10, color: "#64748B" }}>{agent.role}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLORS[agent.status], marginBottom: 2 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLORS[agent.status], display: "inline-block", marginRight: 4 }} />
                          {agent.status}
                        </div>
                        <div style={{ fontSize: 10, color: "#475569" }}>RepID {agent.repId}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: "#64748B", borderTop: "1px solid #1E293B", paddingTop: 8 }}>
                      <span style={{ color: "#475569" }}>Last: </span>{agent.lastAction}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <span style={{ fontSize: 10, background: TIER_COLORS[agent.tier] + "18", color: TIER_COLORS[agent.tier], borderRadius: 5, padding: "2px 7px" }}>{TIER_LABELS[agent.tier]}</span>
                      <span style={{ fontSize: 10, color: "#475569" }}>{agent.latency}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* QUEUE VIEW */}
        {!selectedArtifact && view === "queue" && (
          <div>
            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 16, padding: "10px 14px", background: "#0D1117", borderRadius: 10, border: "1px solid #1E293B" }}>
              <span style={{ color: "#F59E0B" }}>Ask First</span> tier — these artifacts require your approval before agents proceed.
            </div>
            {ARTIFACTS.filter(a => a.status === "awaiting_review").map(a => {
              const isApproved = approvedIds.has(a.id);
              const isFlagged = flaggedIds.has(a.id);
              if (isApproved || isFlagged) return (
                <div key={a.id} style={{ background: "#0D1117", border: "1px solid #1E293B", borderRadius: 12, padding: "12px 16px", marginBottom: 8, opacity: 0.6 }}>
                  <div style={{ fontSize: 13, color: "#64748B" }}>{a.title}</div>
                  <div style={{ fontSize: 11, marginTop: 4, color: isApproved ? "#10B981" : "#EF4444" }}>
                    {isApproved ? "✓ Approved" : "⚑ Flagged"}
                  </div>
                </div>
              );
              return (
                <div key={a.id} onClick={() => setSelectedArtifact(a)}
                  style={{ background: "#111827", border: "1px solid #1E40AF", borderRadius: 12, padding: "14px 16px", marginBottom: 12, cursor: "pointer" }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 18 }}>{TYPE_ICONS[a.type]}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", lineHeight: 1.4 }}>{a.title}</div>
                      <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>by {a.agent} · {a.timestamp}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.excerpt}</div>
                  <div style={{ display: "flex", gap: 8 }} onClick={e => e.stopPropagation()}>
                    <button onClick={(e) => approve(a.id, e)}
                      style={{ flex: 1, background: "#10B981", border: "none", borderRadius: 10, padding: "12px", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                      ✓ Approve
                    </button>
                    <button onClick={(e) => flag(a.id, e)}
                      style={{ background: "transparent", border: "1px solid #374151", borderRadius: 10, padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "#64748B", cursor: "pointer" }}>
                      ⚑
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setSelectedArtifact(a); setShowTrace(true); }}
                      style={{ background: "#0D1117", border: "1px solid #1E3A5F", borderRadius: 10, padding: "12px 14px", fontSize: 12, fontWeight: 600, color: "#0EA5E9", cursor: "pointer" }}>
                      Trace
                    </button>
                  </div>
                </div>
              );
            })}
            {ARTIFACTS.filter(a => a.status === "awaiting_review" && !approvedIds.has(a.id) && !flaggedIds.has(a.id)).length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#475569" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#94A3B8" }}>Queue cleared</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>All pending items reviewed</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "#060912", borderTop: "1px solid #1E293B", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "8px 0 12px" }}>
        {[["feed", "⬛", "Feed"], ["agents", "◈", "Agents"], ["queue", "◉", `Queue`]].map(([v, icon, label]) => (
          <button key={v} onClick={() => { setView(v); setSelectedArtifact(null); setFilterAgent(null); }}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 0" }}>
            <span style={{ fontSize: 18, opacity: view === v ? 1 : 0.4 }}>{icon}</span>
            <span style={{ fontSize: 10, color: view === v ? "#0EA5E9" : "#475569", fontWeight: view === v ? 700 : 400 }}>
              {label}{v === "queue" && pendingCount > 0 ? ` · ${pendingCount}` : ""}
            </span>
          </button>
        ))}
      </div>

      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1E293B; border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>
    </div>
  );
}
