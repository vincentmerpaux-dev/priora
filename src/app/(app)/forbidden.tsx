import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <div className="flex max-w-md flex-col items-start gap-3 py-16">
      <p className="num text-sm text-warn">403</p>
      <h1 className="text-2xl font-semibold tracking-tight">Accès réservé</h1>
      <p className="text-muted">Votre rôle ne donne pas accès à cette page. Si vous en avez besoin, demandez à un administrateur de votre organisation.</p>
      <Button asChild variant="primary"><Link href="/leads">Retour à la file de leads</Link></Button>
    </div>
  );
}
