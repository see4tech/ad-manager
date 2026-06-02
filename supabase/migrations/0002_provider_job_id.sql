-- Job id del proveedor de generación asíncrona (ej: OpenRouter /videos).
-- Permite al webhook consultar el estado y descargar el resultado.
alter table public.assets
  add column if not exists provider_job_id text;

create index if not exists assets_provider_job_id_idx
  on public.assets (provider_job_id);
