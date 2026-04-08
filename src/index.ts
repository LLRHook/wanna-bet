/**
 * Wanna Bet Bot — entry point
 *
 * Boots the Discord client, opens the database, registers event handlers,
 * starts cron jobs, and handles graceful shutdown on SIGINT/SIGTERM.
 */
import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
} from 'discord.js';
import { config } from './config';
import { getDb, closeDb } from './db/connection';
import { logger } from './logger';

// ─── Discord Client ────────────────────────────────────────────────────────────

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // Privileged — must be enabled in dev portal
  ],
  partials: [Partials.GuildMember],
});

// ─── Startup ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Open database (runs migration pragmas, validates connection)
  getDb();
  logger.info('Database connection established.');

  // Wire event handlers (filled in Commit 13)
  client.once('ready', () => {
    logger.info(`Logged in as ${client.user?.tag ?? 'unknown'}`);
    logger.info(`Serving ${client.guilds.cache.size} guild(s).`);
  });

  // Login
  await client.login(config.discordToken);
}

// ─── Graceful Shutdown ─────────────────────────────────────────────────────────

function shutdown(signal: string): void {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  closeDb();
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Unhandled errors — log and exit so pm2 can restart
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  process.exit(1);
});

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
