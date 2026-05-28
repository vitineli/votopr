import Link from "next/link";
import { signInAction } from "@/lib/auth/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <AuthShell
      title="Entrar"
      description="Acesse o ambiente de inteligência eleitoral da sua organização."
      footer={
        <div className="flex items-center justify-between gap-4">
          <Link className="hover:text-foreground" href="/register">Criar conta</Link>
          <Link className="hover:text-foreground" href="/reset-password">Recuperar senha</Link>
        </div>
      }
    >
      <LoginForm searchParams={searchParams} />
    </AuthShell>
  );
}

async function LoginForm({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;

  return (
    <form action={signInAction} className="flex flex-col gap-4">
      {params.error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {params.error}
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Senha</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <Button type="submit" className="mt-2">Entrar no VotoPR</Button>
    </form>
  );
}
