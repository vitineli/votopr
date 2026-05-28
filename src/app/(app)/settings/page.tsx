import { Mail, ShieldCheck, UsersRound } from "lucide-react";
import { requireWorkspaceContext } from "@/lib/auth/workspace";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const workspace = await requireWorkspaceContext();
  const initials = workspace.user.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
      <Card>
        <CardHeader>
          <CardTitle>Equipe e acesso</CardTitle>
          <CardDescription>Controle inicial de identidade ligado ao Supabase Auth e às organizações.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-background/60 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar>
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{workspace.user.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{workspace.user.email}</div>
                </div>
              </div>
              <Badge variant="success">{workspace.role}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Segurança base</CardTitle>
          <CardDescription>Configuração mínima para produção.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SecurityItem icon={ShieldCheck} title="RLS por organização" detail="Políticas Supabase isolam campanhas e uploads por membership." />
          <SecurityItem icon={Mail} title="Auth gerenciado" detail="Login, cadastro e recuperação passam pelo Supabase Auth." />
          <SecurityItem icon={UsersRound} title="Papéis" detail="OWNER, ADMIN, ANALYST e VIEWER já modelados no banco." />
        </CardContent>
      </Card>
    </div>
  );
}

function SecurityItem({ icon: Icon, title, detail }: { icon: React.ElementType; title: string; detail: string }) {
  return (
    <div className="flex gap-3 rounded-md border bg-background/60 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border text-primary">
        <Icon />
      </span>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}
