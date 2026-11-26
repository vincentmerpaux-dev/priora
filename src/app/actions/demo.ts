"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sandboxes } from "@/lib/demo/sandbox";
import { enforceDemoActionLimit, getDemoSid } from "@/lib/demo/visitor";
import { isPublicDemo } from "@/lib/supabase/env";

/** "Réinitialiser la démo" : le bac à sable du visiteur repart des données de départ. Démo publique uniquement. */
export async function resetDemoAction(): Promise<void> {
  if (isPublicDemo()) {
    await enforceDemoActionLimit();
    const sid = await getDemoSid();
    if (sid) sandboxes().reset(sid);
  }
  revalidatePath("/", "layout");
  redirect("/leads");
}
