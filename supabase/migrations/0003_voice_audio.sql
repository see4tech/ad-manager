-- Ruta del activo de audio (voz) a sincronizar con el video generado.
-- El webhook de video, al completar OpenRouter, dispara el lip-sync (Sync.so).
alter table public.assets
  add column if not exists voice_audio_path text;
