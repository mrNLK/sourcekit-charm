
-- Add picture_url column to candidates
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS picture_url text;

-- Create outreach_history table
CREATE TABLE public.outreach_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.outreach_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view outreach history"
ON public.outreach_history FOR SELECT
USING (public.is_authenticated());

CREATE POLICY "Users can insert own outreach history"
ON public.outreach_history FOR INSERT
WITH CHECK (public.is_authenticated() AND auth.uid() = created_by);

CREATE POLICY "Users can delete own outreach history"
ON public.outreach_history FOR DELETE
USING (public.is_authenticated() AND auth.uid() = created_by);
