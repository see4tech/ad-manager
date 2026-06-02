import Link from 'next/link';
import { signUp } from '../actions';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';

export default function RegisterPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Crear cuenta</CardTitle>
        </CardHeader>
        <CardContent>
          {searchParams.error && (
            <p className="mb-4 text-sm text-destructive">{searchParams.error}</p>
          )}
          <form action={signUp} className="space-y-4">
            <Input
              name="company_name"
              placeholder="Nombre de la marca"
              required
            />
            <Input name="email" type="email" placeholder="Correo" required />
            <Input
              name="password"
              type="password"
              placeholder="Contraseña"
              minLength={6}
              required
            />
            <Button type="submit" className="w-full">
              Registrarme
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="underline">
              Inicia sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
