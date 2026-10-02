import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    firstName: text('first_name').notNull(),
    username: text('username').notNull(),
    pinHash: text('pin_hash').notNull(),
    isAdmin: boolean('is_admin').notNull().default(false),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    /** Soft delete: set when an admin removes the player. Entries/picks are kept; login must be refused. */
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_username_lower_idx').on(sql`lower(${t.username})`)],
);

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const weeks = pgTable(
  'weeks',
  {
    id: serial('id').primaryKey(),
    season: integer('season').notNull(),
    weekNumber: integer('week_number').notNull(),
    unlockAt: timestamp('unlock_at', { withTimezone: true }).notNull(),
    lockAt: timestamp('lock_at', { withTimezone: true }).notNull(),
    lockOverrideAt: timestamp('lock_override_at', { withTimezone: true }),
    /** Tiebreaker game, frozen the first time the week is viewed/saved at or after its lock. */
    tiebreakerGameId: integer('tiebreaker_game_id'),
  },
  (t) => [uniqueIndex('weeks_season_week_idx').on(t.season, t.weekNumber)],
);

export const games = pgTable(
  'games',
  {
    id: serial('id').primaryKey(),
    weekId: integer('week_id')
      .notNull()
      .references(() => weeks.id, { onDelete: 'cascade' }),
    espnId: text('espn_id').notNull().unique(),
    kickoffAt: timestamp('kickoff_at', { withTimezone: true }).notNull(),
    homeTeam: text('home_team').notNull(),
    awayTeam: text('away_team').notNull(),
    homeScore: integer('home_score'),
    awayScore: integer('away_score'),
    status: text('status', { enum: ['scheduled', 'final', 'postponed', 'void'] })
      .notNull()
      .default('scheduled'),
    winner: text('winner', { enum: ['home', 'away', 'tie'] }),
    manualOverride: boolean('manual_override').notNull().default(false),
  },
  (t) => [index('games_week_idx').on(t.weekId)],
);

export const entries = pgTable(
  'entries',
  {
    id: serial('id').primaryKey(),
    weekId: integer('week_id')
      .notNull()
      .references(() => weeks.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tiebreaker: integer('tiebreaker').notNull(),
    paid: boolean('paid').notNull().default(false),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Audit: the admin who last edited this entry on the player's behalf, and when. */
    editedByAdminId: integer('edited_by_admin_id').references(() => users.id, { onDelete: 'set null' }),
    adminEditedAt: timestamp('admin_edited_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('entries_week_user_idx').on(t.weekId, t.userId)],
);

export const picks = pgTable(
  'picks',
  {
    entryId: integer('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    gameId: integer('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    pick: text('pick', { enum: ['home', 'away'] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.gameId] })],
);

export const syncState = pgTable('sync_state', {
  key: text('key').primaryKey(),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull(),
});
