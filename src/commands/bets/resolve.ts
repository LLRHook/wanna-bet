import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('resolve')
  .setDescription('Propose a resolution outcome for a bet you are in.')
  .addStringOption((opt) =>
    opt.setName('bet-id').setDescription('The bet ID to resolve.').setRequired(true).setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName('outcome')
      .setDescription('The outcome to propose.')
      .setRequired(true)
      .addChoices(
        { name: 'Side A wins', value: 'A' },
        { name: 'Side B wins', value: 'B' },
        { name: 'Neither (push)', value: 'neither' }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ content: 'Resolve command not yet implemented.', ephemeral: true });
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await interaction.respond([]);
}
