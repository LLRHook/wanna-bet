import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Server setup commands (requires Manage Guild permission).')
  .addSubcommand((sub) =>
    sub
      .setName('role')
      .setDescription('Set the gambler role required to join lobby bets.')
      .addRoleOption((opt) => opt.setName('role').setDescription('The role to set.').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('audit-channel')
      .setDescription('Set the channel for audit log messages.')
      .addChannelOption((opt) => opt.setName('channel').setDescription('The channel to use.').setRequired(true))
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ content: 'Setup command not yet implemented.', ephemeral: true });
}
