import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export function AuthShell({
  title,
  description,
  children,
  footer
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div className="premium-grid absolute inset-0 opacity-50" />
      <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.18),transparent_45%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-6xl grid-cols-1 lg:grid-cols-[1fr_440px]">
        <section className="hidden flex-col justify-between px-8 py-8 lg:flex">
          <Link href="/" className="flex items-center gap-3 text-sm font-semibold">
            <span className="flex size-9 items-center justify-center rounded-md border bg-card shadow-soft-border">
              <ShieldCheck data-icon="inline-start" />
            </span>
            VotoPR
          </Link>
          <div className="max-w-xl pb-14">
            <h1 className="text-5xl font-semibold leading-tight tracking-normal">
              Inteligência eleitoral regional para campanhas reais do Paraná.
            </h1>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              Base profissional para organizar campanhas, importar CSVs do TSE e preparar análises territoriais precisas em Curitiba, São José dos Pinhais e Região Metropolitana.
            </p>
          </div>
        </section>
        <section className="flex items-center justify-center px-5 py-10">
          <div className="w-full max-w-md rounded-lg border bg-card/95 p-6 shadow-soft-border backdrop-blur">
            <div className="mb-7 flex flex-col gap-2">
              <h2 className="text-2xl font-semibold tracking-normal">{title}</h2>
              <p className="text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
            {children}
            <div className="mt-6 text-sm text-muted-foreground">{footer}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
