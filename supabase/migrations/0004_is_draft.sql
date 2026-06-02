-- Activo en borrador: generado pero aún no guardado por el usuario en Archivos.
-- Los borradores no aparecen en la librería ni en los selectores hasta guardarse.
alter table public.assets
  add column if not exists is_draft boolean not null default false;

create index if not exists assets_is_draft_idx on public.assets (is_draft);
