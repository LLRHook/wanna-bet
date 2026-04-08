import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { getDb } from '../../db/connection';
import { getPlayer } from '../../services/PlayerService';
import { formatCents } from '../../services/BalanceService';
import { errorEmbed } from '../../ui/embeds';
import { COLORS } from '../../ui/colors';

interface BetHistoryRow {
  bet_id: string;
  resolved_outcome: string | null;
  status: string;
  side: string;
  stake: number;
  fee_paid: number;
  resolved_at: number | null;
}

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription("View betting statistics for yourself or another player.")
  .addUserOption((opt) =>
    opt
      .setName('user')
      .setDescription('The player to view stats for (defaults to yourself).')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const db = getDb();
  const guildId = interaction.guildId!;
  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const targetId = targetUser.id;

  const player = getPlayer(db, guildId, targetId);
  if (!player) {
    await interaction.reply({
      embeds: [errorEmbed(`<@${targetId}> is not registered in this guild's economy.`)],
      ephemeral: true,
    });
    return;
  }

  const betRows = db
    .prepare<[string, string], BetHistoryRow>(
      `SELECT b.bet_id, b.resolved_outcome, b.status, bp.side, bp.stake, bp.fee_paid, b.resolved_at
       FROM bet_participants bp
       JOIN bets b ON b.bet_id = bp.bet_id AND b.guild_id = bp.guild_id
       WHERE bp.guild_id = ? AND bp.user_id = ?
       ORDER BY b.resolved_at DESC`
    )
    .all(guildId, targetId);

  const resolvedBets = betRows.filter((b) => b.status === 'resolved' && b.resolved_outcome != null);

  let wins = 0;
  let losses = 0;
  let neithers = 0;
  let totalWagered = 0;
  let totalPayout = 0;
  let biggestWin = 0;
  let biggestLoss = 0;

  for (const bet of resolvedBets) {
    const wager = bet.stake + bet.fee_paid;
    totalWagered += wager;

    if (bet.resolved_outcome === 'neither') {
      neithers++;
      // Get back stake only; net = -fee_paid
      totalPayout += bet.stake;
    } else if (bet.side === bet.resolved_outcome) {
      wins++;
      // Need payout info — we approximate from stake (exact payout stored in balance changes)
      // For stats, track net gain roughly
      const netGain = bet.stake; // at minimum they got stake back (net gain tracked roughly)
      if (netGain > biggestWin) biggestWin = netGain;
      totalPayout += bet.stake; // at minimum
    } else {
      losses++;
      if (wager > biggestLoss) biggestLoss = wager;
    }
  }

  // Current streak
  let streak = 0;
  let streakType = '';
  for (const bet of resolvedBets) {
    if (bet.resolved_outcome === null) break;
    if (bet.resolved_outcome === 'neither') break;
    const outcome = bet.side === bet.resolved_outcome ? 'W' : 'L';
    if (streak === 0) {
      streakType = outcome;
      streak = 1;
    } else if (outcome === streakType) {
      streak++;
    } else {
      break;
    }
  }

  const netPL = totalPayout - totalWagered;

  const embed = new EmbedBuilder()
    .setColor(COLORS.BLUE)
    .setTitle(`${targetUser.displayName}'s Stats`)
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: 'W / L / Neither', value: `${wins} / ${losses} / ${neithers}`, inline: true },
      { name: 'Total Wagered', value: formatCents(totalWagered), inline: true },
      { name: 'Net P/L', value: `${netPL >= 0 ? '+' : ''}${formatCents(netPL)}`, inline: true },
      { name: 'Biggest Win (approx.)', value: formatCents(biggestWin), inline: true },
      { name: 'Biggest Loss', value: formatCents(biggestLoss), inline: true },
      {
        name: 'Current Streak',
        value: streak === 0 ? 'None' : `${streak} ${streakType === 'W' ? 'Win(s)' : 'Loss(es)'}`,
        inline: true,
      },
      { name: 'Current Balance', value: formatCents(player.balance), inline: true }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
