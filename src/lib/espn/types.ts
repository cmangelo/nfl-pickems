/** 'postponed' = ESPN reports postponed/canceled/suspended. ('void' is admin-only, never from ESPN.) */
export type GameStatus = 'scheduled' | 'final' | 'postponed';
export type Winner = 'home' | 'away' | 'tie';

export interface ScoreboardGame {
  espnId: string;
  kickoffAt: Date;
  homeTeam: string; // abbreviation, e.g. "KC"
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: GameStatus;
  winner: Winner | null;
  /** Present only while ESPN reports the game in progress (state "in"); display only, never scored. */
  live: LiveState | null;
}

export interface LiveState {
  homeScore: number | null;
  awayScore: number | null;
  period: number | null;
  /** ESPN displayClock, e.g. "4:12". */
  clock: string | null;
  /** ESPN status name, e.g. STATUS_IN_PROGRESS, STATUS_HALFTIME, STATUS_END_PERIOD. */
  status: string;
}

export interface ScoreboardParams {
  season: number;
  week: number;
  /** 1 preseason, 2 regular season, 3 postseason. Defaults to 2. */
  seasonType?: number;
}

export interface EspnClient {
  getScoreboard(params: ScoreboardParams): Promise<ScoreboardGame[]>;
}
