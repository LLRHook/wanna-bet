import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { helpEmbed } from '../ui/embeds';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show all Wanna Bet Bot commands and how to get started.');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.editReply({ embeds: [helpEmbed()] });
}
