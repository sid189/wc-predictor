// Domain types mirroring the database schema (supabase/migrations/0001_init.sql).

export type MatchStage =
  | "group"
  | "round_of_32"
  | "round_of_16"
  | "quarter_final"
  | "semi_final"
  | "third_place"
  | "final"
  | "friendly"
  | "ucl";

export type SpecialKind = "winner" | "golden_boot";

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: boolean;
}

export interface Team {
  id: string;
  name: string;
  code: string | null;
  group_label: string | null;
}

export interface Player {
  id: string;
  name: string;
  team_id: string | null;
}

export interface Match {
  id: string;
  stage: MatchStage;
  group_label: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  kickoff_at: string; // ISO timestamp
  match_order: number;
  is_knockout: boolean;
  fifa_match_number: number | null;
  placeholder_a: string | null; // bracket slot when team is TBD, e.g. "2A", "W101"
  placeholder_b: string | null;
  stadium: string | null;
  city: string | null;
}

export interface MatchResult {
  match_id: string;
  ft_a: number;
  ft_b: number;
  et_a: number | null;
  et_b: number | null;
  pen_a: number | null;
  pen_b: number | null;
  winner_team_id: string | null;
}

export interface Prediction {
  id: string;
  user_id: string;
  match_id: string;
  ft_a: number;
  ft_b: number;
  et_a: number | null;
  et_b: number | null;
  pen_a: number | null;
  pen_b: number | null;
  pen_winner_team_id: string | null;
  points: number;
  scored: boolean;
}

export interface SpecialPrediction {
  id: string;
  user_id: string;
  kind: SpecialKind;
  team_id: string | null;
  player_id: string | null;
  golden_boot_name: string | null;
  is_initial: boolean;
  post_group_change_used: boolean;
  points: number;
  scored: boolean;
}

export interface TournamentConfig {
  id: number;
  name: string;
  starts_at: string | null;
  group_stage_ends_at: string | null;
  special_reopen_until: string | null;
  actual_winner_team_id: string | null;
  actual_golden_boot_player_id: string | null; // legacy, kept nullable
  actual_golden_boot_name: string | null;
}
