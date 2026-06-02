import Link from 'next/link';
import { signIn } from '../actions';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; registered?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Iniciar sesión</CardTitle>
        </CardHeader>
        <CardContent>
          {searchParams.registered && (
            <p className="mb-4 text-sm text-muted-foreground">
              Cuenta creada. Revisa tu correo y luego inicia sesión.
            </p>
          )}
          {searchParams.error && (
            <p className="mb-4 text-sm text-destructive">{searchParams.error}</p>
          )}
          <form action={signIn} className="space-y-4">
            <Input name="email" type="email" placeholder="Correo" required />
            <Input
              name="password"
              type="password"
              placeholder="Contraseña"
              required
            />
            <Button type="submit" className="w-full">
              Entrar
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            ¿No tienes cuenta?{' '}
            <Link href="/register" className="underline">
              Regístrate
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
