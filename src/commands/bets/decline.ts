import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('decline')
  .setDescription('Decline a direct bet invitation.')
  .addStringOption((opt) =>
    opt.setName('bet-id').setDescription('The bet ID to decline.').setRequired(true).setAutocomplete(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ content: 'Decline command not yet implemented.', ephemeral: true });
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await interaction.respond([]);
}
