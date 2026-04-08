import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('vote-admin')
  .setDescription('Manage admin elections.')
  .addSubcommand((sub) =>
    sub.setName('start').setDescription('Start an admin election (1 hour window).')
  )
  .addSubcommand((sub) =>
    sub.setName('nominate').setDescription('Nominate yourself as a candidate.')
  )
  .addSubcommand((sub) =>
    sub
      .setName('cast')
      .setDescription('Cast your vote for a candidate.')
      .addUserOption((opt) =>
        opt.setName('candidate').setDescription('The player to vote for.').setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName('status').setDescription('View the current election status.')
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ content: 'Vote-admin command not yet implemented.', ephemeral: true });
}
