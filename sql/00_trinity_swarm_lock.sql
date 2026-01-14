CREATE TABLE IF NOT EXISTS trinity_swarm_lock (
    id INT PRIMARY KEY DEFAULT 1,
    locked BOOLEAN DEFAULT false,
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    pid INTEGER
);

INSERT INTO trinity_swarm_lock (id, locked) VALUES (1, false) ON CONFLICT (id) DO NOTHING;
