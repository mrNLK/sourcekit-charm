
-- Add new columns to candidates table
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'sourced';
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS score integer;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS tags text[];

-- Create search_history table
CREATE TABLE public.search_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  query_params jsonb NOT NULL,
  result_count integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view search history"
  ON public.search_history FOR SELECT
  USING (is_authenticated());

CREATE POLICY "Authenticated users can insert search history"
  ON public.search_history FOR INSERT
  WITH CHECK (is_authenticated() AND (auth.uid() = created_by));

CREATE POLICY "Authenticated users can delete search history"
  ON public.search_history FOR DELETE
  USING (is_authenticated());

-- Create settings table (key-value per user)
CREATE TABLE public.settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  key text NOT NULL,
  value text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
  ON public.settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON public.settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON public.settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings"
  ON public.settings FOR DELETE
  USING (auth.uid() = user_id);
