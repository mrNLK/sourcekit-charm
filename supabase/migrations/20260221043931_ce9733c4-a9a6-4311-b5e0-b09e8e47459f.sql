
-- Create role_research table
CREATE TABLE public.role_research (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  job_spec TEXT,
  research_data JSONB,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.role_research ENABLE ROW LEVEL SECURITY;

-- Policies: all authenticated users can view/insert/delete
CREATE POLICY "Authenticated users can view research"
  ON public.role_research FOR SELECT
  USING (public.is_authenticated());

CREATE POLICY "Authenticated users can insert research"
  ON public.role_research FOR INSERT
  WITH CHECK (public.is_authenticated() AND auth.uid() = created_by);

CREATE POLICY "Authenticated users can delete research"
  ON public.role_research FOR DELETE
  USING (public.is_authenticated());
