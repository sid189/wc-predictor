import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DataManager } from "@/components/DataManager";
import type { Player, Team } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminDataPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user!.id)
    .single();
  if (!profile?.is_admin) redirect("/matches");

  const [{ data: teams }, { data: players }, { data: allowed }] = await Promise.all([
    supabase.from("teams").select("id, name, group_label").order("group_label").order("name"),
    supabase.from("players").select("id, name, team_id").order("name"),
    supabase.from("allowed_emails").select("email").order("email"),
  ]);

  return (
    <DataManager
      teams={(teams ?? []) as Pick<Team, "id" | "name" | "group_label">[]}
      players={(players ?? []) as Pick<Player, "id" | "name" | "team_id">[]}
      allowedEmails={(allowed ?? []).map((a) => a.email)}
    />
  );
}
