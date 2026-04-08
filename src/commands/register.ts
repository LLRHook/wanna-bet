/**
 * Standalone command registration script.
 * Registers all slash commands to the configured guild (instant propagation).
 *
 * Run via: npm run register-commands
 *
 * Requires: DISCORD_TOKEN and GUILD_ID in .env
 *
 * Uses guild-scoped registration (guild.commands.set) NOT global registration,
 * because global commands take up to 1 hour to propagate.
 */
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { config } from '../config';
import { commands } from './index';

async function registerCommands(): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.discordToken);

  const commandData = commands.map((cmd) => cmd.data.toJSON());

  console.log(`Registering ${commandData.length} slash commands to guild ${config.guildId}...`);
  console.log('Commands:', commandData.map((c) => c.name).join(', '));

  try {
    const result = await rest.put(
      Routes.applicationGuildCommands(
        // Extract application ID from token (first segment before the first dot)
        Buffer.from(config.discordToken.split('.')[0]!, 'base64').toString('utf-8'),
        config.guildId
      ),
      { body: commandData }
    );

    const registered = result as unknown[];
    console.log(`Successfully registered ${registered.length} slash commands to guild ${config.guildId}.`);
  } catch (err) {
    console.error('Failed to register commands:', err);
    process.exit(1);
  }
}

registerCommands().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
