
-- Add action_type and metadata columns to search_history
ALTER TABLE public.search_history ADD COLUMN IF NOT EXISTS action_type text NOT NULL DEFAULT 'search';
ALTER TABLE public.search_history ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Create candidate_notes table
CREATE TABLE public.candidate_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.candidate_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view candidate notes"
ON public.candidate_notes FOR SELECT
USING (public.is_authenticated());

CREATE POLICY "Users can insert own candidate notes"
ON public.candidate_notes FOR INSERT
WITH CHECK (public.is_authenticated() AND auth.uid() = user_id);

CREATE POLICY "Users can delete own candidate notes"
ON public.candidate_notes FOR DELETE
USING (public.is_authenticated() AND auth.uid() = user_id);

-- Create stage_changes table
CREATE TABLE public.stage_changes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  from_stage text NOT NULL,
  to_stage text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stage_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view stage changes"
ON public.stage_changes FOR SELECT
USING (public.is_authenticated());

CREATE POLICY "Users can insert own stage changes"
ON public.stage_changes FOR INSERT
WITH CHECK (public.is_authenticated() AND auth.uid() = user_id);
