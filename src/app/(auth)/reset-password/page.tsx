import Link from "next/link";
import { resetPasswordAction } from "@/lib/auth/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  return (
    <AuthShell
      title="Recuperar senha"
      description="Enviaremos um link seguro para redefinir o acesso."
      footer={<Link className="hover:text-foreground" href="/login">Voltar para login</Link>}
    >
      <ResetForm searchParams={searchParams} />
    </AuthShell>
  );
}

async function ResetForm({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const params = await searchParams;

  return (
    <form action={resetPasswordAction} className="flex flex-col gap-4">
      {params.error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {params.error}
        </div>
      ) : null}
      {params.sent ? (
        <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
          Link de recuperação solicitado. Verifique seu e-mail.
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <Button type="submit" className="mt-2">Enviar link</Button>
    </form>
  );
}
