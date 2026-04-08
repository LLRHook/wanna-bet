import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { getDb } from '../../db/connection';
import { ensureGuild } from '../../services/PlayerService';
import { COLORS, errorEmbed } from '../../ui/embeds';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Server setup commands (requires Manage Guild permission).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName('role')
      .setDescription('Set the gambler role required to join lobby bets.')
      .addRoleOption((opt) =>
        opt.setName('role').setDescription('The role to set.').setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const db = getDb();
  const guildId = interaction.guildId!;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply({
      embeds: [errorEmbed('You need the Manage Guild permission to use setup commands.')],
    });
    return;
  }

  ensureGuild(db, guildId);

  const role = interaction.options.getRole('role', true);

  db.prepare<[string, string]>(
    'UPDATE guilds SET gambler_role_id=? WHERE guild_id=?'
  ).run(role.id, guildId);

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.BLUE)
        .setTitle('Gambler Role Set')
        .addFields({ name: 'Role', value: `<@&${role.id}>`, inline: true })
        .setDescription('Players need this role to join lobby bets.')
        .setTimestamp(),
    ],
  });
}
