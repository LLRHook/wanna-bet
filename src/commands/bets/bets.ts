import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('bets')
  .setDescription('View bets.')
  .addSubcommand((sub) =>
    sub.setName('active').setDescription('View all active bets in this guild.')
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ content: 'Bets command not yet implemented.', ephemeral: true });
}
