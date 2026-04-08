import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('wanna-bet')
  .setDescription('Create a new bet.')
  .addStringOption((opt) =>
    opt.setName('description').setDescription('What the bet is about.').setRequired(true)
  )
  .addNumberOption((opt) =>
    opt
      .setName('amount')
      .setDescription('Your wager in dollars (min $5).')
      .setRequired(true)
      .setMinValue(5)
  )
  .addStringOption((opt) =>
    opt
      .setName('my-side')
      .setDescription('Which side are you betting on?')
      .setRequired(true)
      .addChoices({ name: 'Side A', value: 'A' }, { name: 'Side B', value: 'B' })
  )
  .addStringOption((opt) =>
    opt.setName('side-a-label').setDescription('Label for Side A.').setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName('side-b-label').setDescription('Label for Side B.').setRequired(true)
  )
  .addUserOption((opt) =>
    opt.setName('opponent').setDescription('Direct 1v1 opponent (leave blank for open/lobby).').setRequired(false)
  )
  .addIntegerOption((opt) =>
    opt
      .setName('window-minutes')
      .setDescription('Minutes to accept the bet (default 10, max 1440).')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(1440)
  )
  .addBooleanOption((opt) =>
    opt.setName('lobby').setDescription('Open to all registered players with the gambler role.').setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  // Implemented in Commit 7
  await interaction.reply({ content: 'Bet commands not yet implemented.', ephemeral: true });
}
