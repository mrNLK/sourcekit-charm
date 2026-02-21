
-- Create candidates table
CREATE TABLE public.candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  role TEXT,
  enrichment_data JSONB,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

-- Helper function
CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.uid() IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- All authenticated users can read all candidates
CREATE POLICY "Authenticated users can view all candidates"
ON public.candidates FOR SELECT
USING (public.is_authenticated());

-- All authenticated users can insert candidates
CREATE POLICY "Authenticated users can insert candidates"
ON public.candidates FOR INSERT
WITH CHECK (public.is_authenticated() AND auth.uid() = created_by);

-- All authenticated users can update any candidate
CREATE POLICY "Authenticated users can update candidates"
ON public.candidates FOR UPDATE
USING (public.is_authenticated());

-- All authenticated users can delete any candidate
CREATE POLICY "Authenticated users can delete candidates"
ON public.candidates FOR DELETE
USING (public.is_authenticated());

-- Index for faster lookups
CREATE INDEX idx_candidates_created_at ON public.candidates(created_at DESC);
CREATE INDEX idx_candidates_name ON public.candidates(name);
