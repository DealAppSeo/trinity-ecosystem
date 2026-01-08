
CREATE TABLE IF NOT EXISTS public.trinity_artifacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID REFERENCES public.trinity_tasks(id),
    agent_name TEXT,
    artifact_type TEXT, 
    content TEXT, -- For text content (or small updates)
    file_path TEXT, -- Link to FileSystem path or S3 url
    repid_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS (allow public read/write for now as per dev mode)
-- Enable RLS (allow public read/write for now as per dev mode)
DROP POLICY IF EXISTS "Allow All" ON public.trinity_artifacts;
CREATE POLICY "Allow All" ON public.trinity_artifacts FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.trinity_artifacts ENABLE ROW LEVEL SECURITY;
