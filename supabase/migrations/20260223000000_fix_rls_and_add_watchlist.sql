
-- Fix candidates RLS: UPDATE and DELETE should be scoped to owner
DROP POLICY IF EXISTS "Authenticated users can update candidates" ON public.candidates;
CREATE POLICY "Users can update own candidates"
ON public.candidates FOR UPDATE
USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Authenticated users can delete candidates" ON public.candidates;
CREATE POLICY "Users can delete own candidates"
ON public.candidates FOR DELETE
USING (auth.uid() = created_by);

-- Also scope SELECT to own candidates for proper multi-tenant isolation
DROP POLICY IF EXISTS "Authenticated users can view all candidates" ON public.candidates;
CREATE POLICY "Users can view own candidates"
ON public.candidates FOR SELECT
USING (auth.uid() = created_by);

-- Fix role_research RLS: DELETE should be scoped to owner, add UPDATE policy
DROP POLICY IF EXISTS "Authenticated users can delete research" ON public.role_research;
CREATE POLICY "Users can delete own research"
ON public.role_research FOR DELETE
USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Authenticated users can view research" ON public.role_research;
CREATE POLICY "Users can view own research"
ON public.role_research FOR SELECT
USING (auth.uid() = created_by);

CREATE POLICY "Users can update own research"
ON public.role_research FOR UPDATE
USING (auth.uid() = created_by);

-- Create watchlist table
CREATE TABLE IF NOT EXISTS public.watchlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  role TEXT,
  url TEXT,
  enrichment_data JSONB,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own watchlist"
ON public.watchlist FOR SELECT
USING (auth.uid() = created_by);

CREATE POLICY "Users can insert own watchlist"
ON public.watchlist FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own watchlist"
ON public.watchlist FOR UPDATE
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own watchlist"
ON public.watchlist FOR DELETE
USING (auth.uid() = created_by);

CREATE INDEX idx_watchlist_created_by ON public.watchlist(created_by);
CREATE INDEX idx_watchlist_created_at ON public.watchlist(created_at DESC);

-- Fix search_history RLS: scope SELECT and DELETE to owner
DROP POLICY IF EXISTS "Authenticated users can view search history" ON public.search_history;
CREATE POLICY "Users can view own search history"
ON public.search_history FOR SELECT
USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Authenticated users can delete search history" ON public.search_history;
CREATE POLICY "Users can delete own search history"
ON public.search_history FOR DELETE
USING (auth.uid() = created_by);
