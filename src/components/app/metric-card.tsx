import { type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = "primary"
}: {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: "primary" | "accent";
}) {
  return (
    <Card className="bg-card/80">
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-md border",
            tone === "primary" ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"
          )}
        >
          <Icon />
        </span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-normal">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
