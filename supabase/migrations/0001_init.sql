-- ─────────────────────────────────────────────────────────────
-- Migración inicial: esquema relacional + Row Level Security.
-- Plataforma de generación de contenido publicitario.
-- ─────────────────────────────────────────────────────────────

-- ── profiles ────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  updated_at   timestamptz,
  company_name text
);

-- ── folders (jerarquía anidada) ─────────────────────────────
create table if not exists public.folders (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  parent_id uuid references public.folders (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists folders_user_id_idx on public.folders (user_id);
create index if not exists folders_parent_id_idx on public.folders (parent_id);

-- ── assets ──────────────────────────────────────────────────
create table if not exists public.assets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  folder_id   uuid references public.folders (id) on delete set null,
  name        text not null,
  type        text not null check (type in ('image', 'video', 'audio', 'text')),
  content_url text,
  -- Estado para generaciones asíncronas (video/audio) que exceden el timeout.
  status      text not null default 'ready' check (status in ('processing', 'ready', 'failed')),
  created_at  timestamptz not null default now()
);
create index if not exists assets_user_id_idx on public.assets (user_id);
create index if not exists assets_folder_id_idx on public.assets (folder_id);

-- ── scheduled_posts ─────────────────────────────────────────
create table if not exists public.scheduled_posts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  asset_id     uuid references public.assets (id) on delete set null,
  platforms    text[] not null default '{}',
  caption      text,
  scheduled_at timestamptz not null,
  status       text not null default 'pending' check (status in ('pending', 'published', 'failed')),
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists scheduled_posts_status_idx on public.scheduled_posts (status, scheduled_at);
create index if not exists scheduled_posts_user_id_idx on public.scheduled_posts (user_id);

-- ── social_connections (tokens OAuth cifrados) ──────────────
create table if not exists public.social_connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  platform      text not null check (platform in ('instagram', 'facebook', 'linkedin')),
  access_token  text not null,        -- cifrado en el servidor antes de insertar
  refresh_token text,
  expires_at    timestamptz,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  unique (user_id, platform)
);

-- ─────────────────────────────────────────────────────────────
-- Row Level Security: cada usuario solo accede a sus propias filas.
-- ─────────────────────────────────────────────────────────────
alter table public.profiles            enable row level security;
alter table public.folders             enable row level security;
alter table public.assets              enable row level security;
alter table public.scheduled_posts     enable row level security;
alter table public.social_connections  enable row level security;

-- profiles: el usuario gestiona su propio perfil.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- Helper macro replicado por tabla: owner == auth.uid().
create policy "folders_all_own" on public.folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "assets_all_own" on public.assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "scheduled_posts_all_own" on public.scheduled_posts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "social_connections_all_own" on public.social_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Trigger: crear profile automáticamente al registrar un usuario.
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, updated_at)
  values (new.id, now())
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- Storage: bucket privado para activos digitales (DAM).
-- El acceso de lectura se hace vía Signed URLs (1h) generadas en el server.
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('assets', 'assets', false)
on conflict (id) do nothing;

-- El usuario solo opera sobre objetos bajo su prefijo: assets/<uid>/...
create policy "assets_storage_select_own" on storage.objects
  for select using (
    bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "assets_storage_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "assets_storage_delete_own" on storage.objects
  for delete using (
    bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text
  );
