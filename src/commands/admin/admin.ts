import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Admin-only commands for managing the economy.')
  .addSubcommand((sub) =>
    sub
      .setName('grant')
      .setDescription('Grant funds from the bank to a player.')
      .addUserOption((opt) => opt.setName('user').setDescription('The player to grant funds to.').setRequired(true))
      .addNumberOption((opt) => opt.setName('amount').setDescription('Amount in dollars.').setRequired(true).setMinValue(0.01))
  )
  .addSubcommand((sub) =>
    sub
      .setName('seize')
      .setDescription('Seize funds from a player to the bank.')
      .addUserOption((opt) => opt.setName('user').setDescription('The player to seize from.').setRequired(true))
      .addNumberOption((opt) => opt.setName('amount').setDescription('Amount in dollars.').setRequired(true).setMinValue(0.01))
  )
  .addSubcommand((sub) =>
    sub
      .setName('resolve')
      .setDescription('Force-resolve a bet.')
      .addStringOption((opt) => opt.setName('bet-id').setDescription('The bet ID.').setRequired(true).setAutocomplete(true))
      .addStringOption((opt) =>
        opt
          .setName('outcome')
          .setDescription('The outcome.')
          .setRequired(true)
          .addChoices(
            { name: 'Side A wins', value: 'A' },
            { name: 'Side B wins', value: 'B' },
            { name: 'Neither (push)', value: 'neither' }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('cancel')
      .setDescription('Cancel a bet and refund stakes (fees retained).')
      .addStringOption((opt) => opt.setName('bet-id').setDescription('The bet ID.').setRequired(true).setAutocomplete(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('ban')
      .setDescription('Ban a player from the economy.')
      .addUserOption((opt) => opt.setName('user').setDescription('The player to ban.').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('unban')
      .setDescription('Unban a player.')
      .addUserOption((opt) => opt.setName('user').setDescription('The player to unban.').setRequired(true))
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ content: 'Admin command not yet implemented.', ephemeral: true });
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await interaction.respond([]);
}
