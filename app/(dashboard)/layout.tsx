import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  MessageSquare,
  FolderOpen,
  Sparkles,
  Calendar,
  Settings,
  LogOut,
} from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase';
import { signOut } from '../(auth)/actions';
import { Button } from '@/app/components/ui/button';

const NAV = [
  { href: '/chat', label: 'Chat IA', icon: MessageSquare },
  { href: '/media', label: 'Activos', icon: FolderOpen },
  { href: '/generate', label: 'Generar', icon: Sparkles },
  { href: '/calendar', label: 'Calendario', icon: Calendar },
  { href: '/settings', label: 'Conexiones', icon: Settings },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r bg-card p-3">
        <div className="px-2 py-3 text-lg font-semibold">Ad Manager</div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-secondary"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <form action={signOut}>
          <Button variant="ghost" size="sm" className="w-full justify-start">
            <LogOut className="h-4 w-4" />
            Salir
          </Button>
        </form>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
