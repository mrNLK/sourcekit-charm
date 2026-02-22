
-- Add webhook tracking columns to candidates
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS webhook_status text;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS webhook_error text;
