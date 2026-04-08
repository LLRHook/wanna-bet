import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { getDb } from '../../db/connection';
import { getPlayer, touchPlayer } from '../../services/PlayerService';
import { balanceEmbed } from '../../ui/embeds';
import { errorEmbed } from '../../ui/embeds';

export const data = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('Check your current wallet balance.');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const db = getDb();
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  const player = getPlayer(db, guildId, userId);

  if (!player || player.status !== 'active') {
    await interaction.reply({
      embeds: [errorEmbed('You must be registered and active to check your balance. Use `/register` to get started.')],
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    embeds: [balanceEmbed(interaction.user, player.balance)],
  });

  touchPlayer(db, guildId, userId);
}
