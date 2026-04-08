import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { getDb } from '../../db/connection';
import { ensureGuild, getGuild } from '../../services/PlayerService';
import { formatCents } from '../../services/BalanceService';
import { COLORS } from '../../ui/colors';

export const data = new SlashCommandBuilder()
  .setName('bank')
  .setDescription('View the guild bank balance and admin info.');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const db = getDb();
  const guildId = interaction.guildId!;

  ensureGuild(db, guildId);

  const bankRow = db
    .prepare<[string], { balance: number }>('SELECT balance FROM bank WHERE guild_id = ?')
    .get(guildId);

  const activeCount = db
    .prepare<[string], { count: number }>(
      `SELECT COUNT(*) as count FROM players WHERE guild_id=? AND status='active'`
    )
    .get(guildId);

  const guild = getGuild(db, guildId);
  const bankBalance = bankRow?.balance ?? 0;
  const playerCount = activeCount?.count ?? 0;
  const cap = playerCount * 10000; // $100 per active player

  // Next Sunday at 00:00 UTC
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday
  const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
  const nextSunday = new Date(now);
  nextSunday.setUTCDate(nextSunday.getUTCDate() + daysUntilSunday);
  nextSunday.setUTCHours(0, 0, 0, 0);
  const nextSeedingTs = Math.floor(nextSunday.getTime() / 1000);

  const adminMention = guild?.current_admin_id
    ? `<@${guild.current_admin_id}>`
    : 'None elected';

  const embed = new EmbedBuilder()
    .setColor(COLORS.BLUE)
    .setTitle('Guild Bank')
    .addFields(
      { name: 'Current Balance', value: formatCents(bankBalance), inline: true },
      { name: 'Seeding Cap', value: `${formatCents(cap)} (${playerCount} players × $100)`, inline: true },
      { name: 'Current Admin', value: adminMention, inline: true },
      {
        name: 'Next Sunday Seeding',
        value: `<t:${nextSeedingTs}:R> (<t:${nextSeedingTs}:f>)`,
        inline: false,
      }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
