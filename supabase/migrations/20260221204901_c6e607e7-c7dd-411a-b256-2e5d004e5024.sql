
-- Create research_tasks table for async polling
CREATE TABLE public.research_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id text NOT NULL,
  job_title text,
  company_name text,
  status text NOT NULL DEFAULT 'pending',
  result jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.research_tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies - authenticated users can CRUD their own rows
CREATE POLICY "Users can view own research tasks"
  ON public.research_tasks FOR SELECT
  USING (is_authenticated());

CREATE POLICY "Users can insert own research tasks"
  ON public.research_tasks FOR INSERT
  WITH CHECK (is_authenticated() AND auth.uid() = created_by);

CREATE POLICY "Users can update own research tasks"
  ON public.research_tasks FOR UPDATE
  USING (is_authenticated() AND auth.uid() = created_by);

CREATE POLICY "Users can delete own research tasks"
  ON public.research_tasks FOR DELETE
  USING (is_authenticated());
