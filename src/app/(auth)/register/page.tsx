import Link from "next/link";
import { signUpAction } from "@/lib/auth/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <AuthShell
      title="Criar organização"
      description="Configure o primeiro workspace multi-tenant da campanha no Paraná."
      footer={
        <span>
          Já tem conta? <Link className="text-foreground hover:underline" href="/login">Entrar</Link>
        </span>
      }
    >
      <RegisterForm searchParams={searchParams} />
    </AuthShell>
  );
}

async function RegisterForm({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;

  return (
    <form action={signUpAction} className="flex flex-col gap-4">
      {params.error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {params.error}
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" name="name" autoComplete="name" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="organization">Organização ou campanha</Label>
        <Input id="organization" name="organization" placeholder="Ex: Comitê Curitiba 2026" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Senha</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <Button type="submit" className="mt-2">Criar base da campanha</Button>
    </form>
  );
}
