import Link from "next/link";
import {
  BarChart3,
  BrainCircuit,
  Building2,
  Database,
  FileUp,
  LayoutDashboard,
  LogOut,
  Map,
  Settings,
  ShieldCheck,
  UsersRound
} from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import { requireWorkspaceContext } from "@/lib/auth/workspace";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";

const navigation = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/maps", label: "Mapas eleitorais", icon: Map },
  { href: "/intelligence", label: "Inteligencia politica", icon: BrainCircuit },
  { href: "/uploads", label: "Importações TSE", icon: FileUp },
  { href: "/campaigns", label: "Campanhas", icon: Building2 },
  { href: "/dashboard#territorio", label: "Território PR", icon: Database },
  { href: "/dashboard#analises", label: "Análises base", icon: BarChart3 },
  { href: "/settings", label: "Equipe e acesso", icon: UsersRound }
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const workspace = await requireWorkspaceContext();
  const initials = workspace.user.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-y-0 left-0 hidden w-72 border-r bg-card/70 backdrop-blur xl:block">
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center gap-3 px-5">
            <span className="flex size-9 items-center justify-center rounded-md border bg-background shadow-sm">
              <ShieldCheck data-icon="inline-start" />
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">VotoPR</span>
              <span className="text-xs text-muted-foreground">Inteligência Paraná</span>
            </div>
          </div>
          <div className="px-3">
            <div className="rounded-lg border bg-background/70 p-3">
              <div className="text-xs text-muted-foreground">Organização</div>
              <div className="mt-1 truncate text-sm font-medium">{workspace.organization.name}</div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="success">PR-first</Badge>
                <Badge variant="secondary">{workspace.role}</Badge>
              </div>
            </div>
          </div>
          <nav className="mt-5 flex flex-1 flex-col gap-1 px-3">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Icon />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="p-3">
            <div className="rounded-lg border bg-background/70 p-3 text-xs leading-5 text-muted-foreground">
              Escopo inicial travado em Paraná, com prioridade para Curitiba, São José dos Pinhais e Região Metropolitana.
            </div>
          </div>
        </div>
      </div>

      <div className="xl:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/85 px-4 backdrop-blur md:px-6">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{workspace.campaign.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {workspace.campaign.state} · {workspace.campaign.electionYear} · Curitiba / SJP / RMC
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <Link href="/uploads">
                <FileUp data-icon="inline-start" />
                Importar CSV
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Abrir menu do usuário">
                  <Avatar>
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col gap-1">
                    <span>{workspace.user.name}</span>
                    <span className="truncate text-xs font-normal text-muted-foreground">{workspace.user.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings data-icon="inline-start" />
                    Configurações
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <form action={signOutAction}>
                  <DropdownMenuItem asChild>
                    <button className="w-full">
                      <LogOut data-icon="inline-start" />
                      Sair
                    </button>
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <nav className="no-scrollbar overflow-x-auto border-b bg-background/72 px-4 py-2 backdrop-blur xl:hidden">
          <div className="flex w-max gap-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <Button key={item.href} variant="outline" size="sm" asChild className="shrink-0">
                  <Link href={item.href}>
                    <Icon data-icon="inline-start" />
                    {item.label}
                  </Link>
                </Button>
              );
            })}
          </div>
        </nav>
        <main className="px-4 py-6 md:px-6">
          {children}
        </main>
        <Separator />
      </div>
    </div>
  );
}
