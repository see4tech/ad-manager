import { redirect } from 'next/navigation';

export default function HomePage() {
  // El dashboard está protegido; el middleware redirige a /login si no hay sesión.
  redirect('/media');
}
