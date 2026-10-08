/** Raw counting stats one ESPN team produced in one week. Percentages are derived, never stored. */
export type StatField =
  | "fgm"
  | "fga"
  | "ftm"
  | "fta"
  | "tpm"
  | "reb"
  | "ast"
  | "stl"
  | "blk"
  | "to"
  | "pts";

export type StatLine = Record<StatField, number>;

/** A member key is the duo id plus "a" or "b", e.g. "d1a". */
export type MemberKey = string;

export type Duo = {
  id: string;
  name: string;
  /** Manager names. */
  a: string;
  b: string;
  /** ESPN team ids, null until the draft is done and mapped in admin. */
  espnA: number | null;
  espnB: number | null;
};

export type Punishment = { title: string; text: string; level: 1 | 2 | 3 };

/** Everything the commissioner edits by hand. Stored as one JSON row. */
export type LeagueConfig = {
  name: string;
  buyIn: number;
  weeks: number;
  /** Null means follow the calendar (or ESPN, when connected). */
  currentWeekOverride: number | null;
  duos: Duo[];
  punishments: Record<"4" | "5" | "6", Punishment>;
  /** Week number to three [duoId, duoId] pairs. Missing weeks use the round robin. */
  schedule: Record<string, [string, string][]>;
  /** Manual rosters by member key, used when ESPN rosters are unavailable. */
  manualRosters: Record<MemberKey, string[]>;
};

/** One stored row of weekly stats. */
export type WeekStats = {
  week: number;
  member: MemberKey;
  stats: StatLine;
  source: "espn" | "manual";
};

/** The full picture the public site renders. */
export type LeagueState = {
  config: LeagueConfig;
  currentWeek: number;
  /** week -> member -> stats */
  scores: Record<number, Record<MemberKey, StatLine>>;
  /** week -> final? */
  final: Record<number, boolean>;
  /** member -> player names */
  rosters: Record<MemberKey, string[]>;
  /** ESPN teams for the admin mapping dropdown. */
  espnTeams: { id: number; name: string; owner: string }[];
  espnStatus: "ok" | "private" | "error" | "off";
  lastSynced: string | null;
  hasDatabase: boolean;
  /** member -> buy-in paid */
  paid: Record<MemberKey, boolean>;
  /** Team-weeks the commissioner corrected by hand. */
  manual: { week: number; member: MemberKey }[];
  /** Undismissed teammate-to-teammate player moves. */
  tradeAlerts: TradeAlert[];
};

export type TradeAlert = {
  id: string;
  playerName: string;
  fromMember: MemberKey;
  toMember: MemberKey;
  detectedAt: string;
};

export type ScoreEdit = {
  id: number;
  week: number;
  member: MemberKey;
  action: "set" | "revert";
  oldStats: StatLine | null;
  newStats: StatLine | null;
  createdAt: string;
};

/** One player's totals for one week, counting only days he was in the active lineup. */
export type PlayerWeek = StatLine & {
  playerId: number;
  name: string;
  member: MemberKey;
  /** Game days played while in the active lineup. */
  games: number;
};
