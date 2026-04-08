import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { getDb } from '../../db/connection';
import { ensureGuild } from '../../services/PlayerService';
import { formatCents } from '../../services/BalanceService';
import { COLORS } from '../../ui/embeds';

interface ActiveBetRow {
  bet_id: string;
  description: string;
  side_a_label: string;
  side_b_label: string;
  status: string;
  window_closes_at: number;
  participant_count: number;
  pool_a: number;
  pool_b: number;
  creator_id: string;
}

export const data = new SlashCommandBuilder()
  .setName('bets')
  .setDescription('View bets.')
  .addSubcommand((sub) =>
    sub.setName('active').setDescription('View all active bets in this guild.')
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const db = getDb();
  const guildId = interaction.guildId!;
  const sub = interaction.options.getSubcommand(true);

  ensureGuild(db, guildId);

  if (sub === 'active') {
    const rows = db
      .prepare<[string], ActiveBetRow>(
        `SELECT b.bet_id, b.description, b.side_a_label, b.side_b_label,
                b.status, b.window_closes_at, b.creator_id,
                COUNT(bp.user_id) AS participant_count,
                SUM(CASE WHEN bp.side='A' THEN bp.stake ELSE 0 END) AS pool_a,
                SUM(CASE WHEN bp.side='B' THEN bp.stake ELSE 0 END) AS pool_b
         FROM bets b
         LEFT JOIN bet_participants bp ON bp.bet_id = b.bet_id AND bp.guild_id = b.guild_id
         WHERE b.guild_id = ? AND b.status IN ('open','locked','proposed','disputed')
         GROUP BY b.bet_id
         ORDER BY b.created_at DESC`
      )
      .all(guildId);

    if (rows.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.BLUE)
            .setTitle('Active Bets')
            .setDescription('No active bets right now. Use `/wanna-bet` to create one!')
            .setTimestamp(),
        ],
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.BLUE)
      .setTitle(`Active Bets (${rows.length})`)
      .setTimestamp();

    const now = Date.now();
    for (const bet of rows.slice(0, 10)) {
      const timeLeft =
        bet.status === 'open' && bet.window_closes_at > now
          ? `<t:${Math.floor(bet.window_closes_at / 1000)}:R>`
          : bet.status === 'open'
          ? 'Window closed (awaiting resolution)'
          : '';

      embed.addFields({
        name: `#${bet.bet_id} — ${bet.description.slice(0, 60)}`,
        value: [
          `**${bet.side_a_label}** vs **${bet.side_b_label}**`,
          `Pool A: ${formatCents(bet.pool_a || 0)} | Pool B: ${formatCents(bet.pool_b || 0)}`,
          `Participants: ${bet.participant_count} | Status: **${bet.status.toUpperCase()}**`,
          timeLeft ? `Window: ${timeLeft}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        inline: false,
      });
    }

    if (rows.length > 10) {
      embed.setFooter({ text: `Showing 10 of ${rows.length} active bets.` });
    }

    await interaction.editReply({ embeds: [embed] });
  }
}
