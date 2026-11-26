import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/env";

/** Échange le code du lien magique / de confirmation contre une session. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (isDemoMode() || !code) return NextResponse.redirect(`${origin}/login`);
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=lien`);
  // Pas de redirection vers une URL fournie par l'appelant (open redirect) : destination fixe.
  return NextResponse.redirect(`${origin}/leads`);
}
