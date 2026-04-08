import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('accept')
  .setDescription('Accept an open bet.')
  .addStringOption((opt) =>
    opt.setName('bet-id').setDescription('The bet ID to accept.').setRequired(true).setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName('side')
      .setDescription('Which side to bet on.')
      .setRequired(false)
      .addChoices({ name: 'Side A', value: 'A' }, { name: 'Side B', value: 'B' })
  )
  .addNumberOption((opt) =>
    opt
      .setName('amount')
      .setDescription('Your wager in dollars (min $5).')
      .setRequired(true)
      .setMinValue(5)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ content: 'Accept command not yet implemented.', ephemeral: true });
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await interaction.respond([]);
}
