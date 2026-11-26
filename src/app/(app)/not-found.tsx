import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex max-w-md flex-col items-start gap-3 py-16">
      <p className="num text-sm text-warn">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Page introuvable</h1>
      <p className="text-muted">Ce lead ou cette page n&apos;existe pas, ou vous n&apos;y avez pas accès.</p>
      <Button asChild variant="primary"><Link href="/leads">Retour à la file de leads</Link></Button>
    </div>
  );
}
