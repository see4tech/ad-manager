/** Interfaces globales de TypeScript — alineadas con el esquema de Supabase. */

export type AssetType = 'image' | 'video' | 'audio' | 'text';
export type AssetStatus = 'processing' | 'ready' | 'failed';
export type PostStatus = 'pending' | 'published' | 'failed';
export type SocialPlatform = 'instagram' | 'facebook' | 'linkedin';

export interface Profile {
  id: string;
  updated_at: string | null;
  company_name: string | null;
}

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  user_id: string;
}

export interface Asset {
  id: string;
  user_id: string;
  folder_id: string | null;
  name: string;
  type: AssetType;
  content_url: string | null;
  status: AssetStatus;
  provider_job_id?: string | null;
  is_draft?: boolean;
  created_at?: string;
}

export interface ScheduledPost {
  id: string;
  user_id: string;
  asset_id: string | null;
  platforms: SocialPlatform[];
  caption: string | null;
  status: PostStatus;
  scheduled_at: string;
  error?: string | null;
  created_at?: string;
}
