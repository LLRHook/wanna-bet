import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  Interaction,
} from 'discord.js';
import { config } from './config';
import { getDb, closeDb } from './db/connection';
import { logger } from './logger';
import { commandMap } from './commands/index';
import { ensureGuild, getGuild } from './services/PlayerService';
import { revokeAdmin, getOpenElection, scheduleElectionFinalization } from './services/ElectionService';
import { auditSync } from './services/AuditService';
import { startBankSeedingCron } from './cron/bankSeeding';
import { startInactivitySweepCron } from './cron/inactivitySweep';
import { reattachResolutionCollectors } from './commands/bets/resolve';
import { errorEmbed } from './ui/embeds';

// ─── Discord Client ────────────────────────────────────────────────────────────

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // Privileged — must be enabled in dev portal
  ],
  partials: [Partials.GuildMember],
});

// ─── Interaction Dispatcher ────────────────────────────────────────────────────

async function handleChatInputCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  logger.info(
    {
      interactionId: interaction.id,
      commandName: interaction.commandName,
      userId: interaction.user.id,
    },
    'handling command'
  );

  const cmd = commandMap.get(interaction.commandName);
  if (!cmd) {
    await interaction.reply({
      embeds: [errorEmbed('Unknown command.')],
      ephemeral: true,
    });
    return;
  }
  // Defer immediately so we have 15 minutes to respond instead of 3 seconds.
  // Every command body must use interaction.editReply (not reply) for its primary response.
  // If the interaction is already expired by the time we try to defer (gateway latency
  // ate the 3-second window), Discord returns 10062. Catch it cleanly so we don't try
  // to followUp on a dead interaction.
  if (!interaction.deferred && !interaction.replied) {
    try {
      await interaction.deferReply();
    } catch (err) {
      logger.warn(
        { err, interactionId: interaction.id, commandName: interaction.commandName },
        'failed to defer interaction (likely expired); aborting'
      );
      return;
    }
  }
  await cmd.execute(interaction);
}

async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const cmd = commandMap.get(interaction.commandName);
  if (!cmd?.autocomplete) return;
  await cmd.autocomplete(interaction);
}

client.on('interactionCreate', async (interaction: Interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleChatInputCommand(interaction);
      return;
    }
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
      return;
    }
  } catch (err) {
    logger.error({ err, commandName: interaction.isCommand() ? interaction.commandName : 'N/A' }, 'Error handling interaction');

    if (interaction.isChatInputCommand()) {
      try {
        const errorReply = {
          embeds: [errorEmbed('An unexpected error occurred. Please try again.')],
          ephemeral: true,
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorReply);
        } else {
          await interaction.reply(errorReply);
        }
      } catch {
        // Ignore reply errors
      }
    }
  }
});

// ─── guildMemberRemove — Admin auto-revoke ─────────────────────────────────────

client.on('guildMemberRemove', async (member) => {
  try {
    const db = getDb();
    const guildId = member.guild.id;
    const userId = member.id;

    const guild = getGuild(db, guildId);
    if (!guild) return;

    if (guild.current_admin_id === userId) {
      revokeAdmin(db, guildId, userId);
      auditSync(db, {
        guildId,
        actorId: userId,
        actionType: 'ADMIN_REVOKED',
        payload: { reason: 'member_left_server' },
      });
      logger.info({ guildId, userId }, 'Admin auto-revoked on member leave');
    }
  } catch (err) {
    logger.error({ err }, 'Error in guildMemberRemove handler');
  }
});

// ─── Startup ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Open database (runs migration pragmas, validates connection)
  const db = getDb();
  logger.info('Database connection established.');

  // Login to Discord
  await client.login(config.discordToken);

  // After ready: start crons, re-attach collectors, re-schedule elections
  client.once('ready', async () => {
    logger.info(`Logged in as ${client.user?.tag ?? 'unknown'}`);
    logger.info(`Serving ${client.guilds.cache.size} guild(s).`);

    // Ensure guild rows exist for all cached guilds
    for (const guild of client.guilds.cache.values()) {
      ensureGuild(db, guild.id);
    }

    // Re-attach button collectors for proposed bets (restart recovery)
    try {
      await reattachResolutionCollectors();
      logger.info('Resolution collectors re-attached.');
    } catch (err) {
      logger.error({ err }, 'Failed to re-attach resolution collectors');
    }

    // Re-schedule election finalization timers for any open elections
    for (const guild of client.guilds.cache.values()) {
      const openElection = getOpenElection(db, guild.id);
      if (openElection) {
        if (openElection.ends_at <= Date.now()) {
          // Already expired — finalize immediately
          const { finalizeElection } = await import('./services/ElectionService');
          const result = await finalizeElection(db, client, guild.id, openElection.id);
          logger.info({ guildId: guild.id, result }, 'Finalized expired election on startup');
        } else {
          scheduleElectionFinalization(db, client, guild.id, openElection);
          logger.info({ guildId: guild.id, electionId: openElection.id }, 'Re-scheduled election timer');
        }
      }
    }

    // Start cron jobs
    startBankSeedingCron();
    startInactivitySweepCron();
    logger.info('Cron jobs started: bank seeding (Sunday 00:00 UTC), inactivity sweep (daily 00:05 UTC).');
  });
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
