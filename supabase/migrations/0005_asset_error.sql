-- Motivo del fallo de generación (OpenRouter video / lip-sync), para mostrarlo
-- al usuario en vez de un error genérico.
alter table public.assets
  add column if not exists error text;
