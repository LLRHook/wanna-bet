import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { getDb } from '../../db/connection';
import { ensureGuild } from '../../services/PlayerService';
import { COLORS } from '../../ui/colors';
import { errorEmbed } from '../../ui/embeds';

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
  )
  .addSubcommand((sub) =>
    sub
      .setName('audit-channel')
      .setDescription('Set the channel for audit log messages.')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('The text channel to use.')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const db = getDb();
  const guildId = interaction.guildId!;
  const sub = interaction.options.getSubcommand(true);

  // Permission check
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      embeds: [errorEmbed('You need the Manage Guild permission to use setup commands.')],
      ephemeral: true,
    });
    return;
  }

  ensureGuild(db, guildId);

  if (sub === 'role') {
    const role = interaction.options.getRole('role', true);

    db.prepare<[string, string]>(
      'UPDATE guilds SET gambler_role_id=? WHERE guild_id=?'
    ).run(role.id, guildId);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.BLUE)
          .setTitle('Gambler Role Set')
          .addFields({ name: 'Role', value: `<@&${role.id}>`, inline: true })
          .setDescription('Players need this role to join lobby bets.')
          .setTimestamp(),
      ],
    });
    return;
  }

  if (sub === 'audit-channel') {
    const channel = interaction.options.getChannel('channel', true);

    db.prepare<[string, string]>(
      'UPDATE guilds SET audit_channel_id=? WHERE guild_id=?'
    ).run(channel.id, guildId);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.BLUE)
          .setTitle('Audit Channel Set')
          .addFields({ name: 'Channel', value: `<#${channel.id}>`, inline: true })
          .setDescription('Economy audit events will be posted to this channel.')
          .setTimestamp(),
      ],
    });
    return;
  }
}
