import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from 'discord.js';
import { getDb } from '../../db/connection';
import { getPlayer, getGuild, touchPlayer } from '../../services/PlayerService';
import { joinBet, getBet } from '../../services/BetService';
import { audit } from '../../services/AuditService';
import { client } from '../../index';
import { errorEmbed } from '../../ui/embeds';
import { COLORS } from '../../ui/colors';
import { formatCents, dollarsToCents } from '../../services/BalanceService';

export const data = new SlashCommandBuilder()
  .setName('accept')
  .setDescription('Accept an open bet.')
  .addStringOption((opt) =>
    opt
      .setName('bet-id')
      .setDescription('The bet ID to accept.')
      .setRequired(true)
      .setAutocomplete(true)
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
      .setName('side')
      .setDescription('Which side to bet on.')
      .setRequired(false)
      .addChoices({ name: 'Side A', value: 'A' }, { name: 'Side B', value: 'B' })
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const db = getDb();
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  const player = getPlayer(db, guildId, userId);
  if (!player || player.status !== 'active') {
    await interaction.reply({
      embeds: [errorEmbed('You must be registered and active to join a bet.')],
      ephemeral: true,
    });
    return;
  }

  const betId = interaction.options.getString('bet-id', true).toUpperCase().trim();
  const amountDollars = interaction.options.getNumber('amount', true);
  const sideOption = interaction.options.getString('side') as 'A' | 'B' | null;

  const bet = getBet(db, guildId, betId);
  if (!bet) {
    await interaction.reply({ embeds: [errorEmbed(`Bet #${betId} not found.`)], ephemeral: true });
    return;
  }

  if (bet.status !== 'open') {
    await interaction.reply({
      embeds: [errorEmbed(`Bet #${betId} is not open (status: ${bet.status}).`)],
      ephemeral: true,
    });
    return;
  }

  if (Date.now() > bet.window_closes_at) {
    await interaction.reply({
      embeds: [errorEmbed(`The betting window for #${betId} has closed.`)],
      ephemeral: true,
    });
    return;
  }

  // Eligibility check
  if (bet.direct_opponent_id && bet.direct_opponent_id !== userId) {
    await interaction.reply({
      embeds: [errorEmbed('This is a direct bet — only the invited opponent can accept it.')],
      ephemeral: true,
    });
    return;
  }

  if (bet.is_lobby === 1) {
    const guild = getGuild(db, guildId);
    if (guild?.gambler_role_id) {
      const member = interaction.guild?.members.cache.get(userId)
        ?? await interaction.guild?.members.fetch(userId).catch(() => null);
      if (!member?.roles.cache.has(guild.gambler_role_id)) {
        await interaction.reply({
          embeds: [errorEmbed('You need the gambler role to join this lobby bet.')],
          ephemeral: true,
        });
        return;
      }
    }
  }

  // Determine side
  let side: 'A' | 'B';
  if (sideOption) {
    side = sideOption;
  } else if (bet.direct_opponent_id === userId) {
    // Default to opposite of initiator's side
    side = bet.initiator_side === 'A' ? 'B' : 'A';
  } else {
    await interaction.reply({
      embeds: [errorEmbed('Please specify which side (A or B) you want to bet on.')],
      ephemeral: true,
    });
    return;
  }

  const wagerCents = dollarsToCents(amountDollars);
  if (player.balance < wagerCents) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          `Insufficient balance. You need ${formatCents(wagerCents)} but have ${formatCents(player.balance)}.`
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  const result = joinBet(db, {
    guildId,
    betId,
    userId,
    side,
    wagerDollars: amountDollars,
  });

  if (!result.success) {
    await interaction.reply({ embeds: [errorEmbed(result.error!)], ephemeral: true });
    return;
  }

  const totals = result.poolTotals!;
  const windowTs = Math.floor(bet.window_closes_at / 1000);

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`Bet Joined — #${betId}`)
    .addFields(
      { name: 'Side Joined', value: `${side} (${side === 'A' ? bet.side_a_label : bet.side_b_label})`, inline: true },
      { name: 'Wager', value: formatCents(wagerCents), inline: true },
      { name: 'Fee', value: formatCents(result.fee!), inline: true },
      { name: 'Net Stake', value: formatCents(result.netStake!), inline: true },
      { name: 'Pool A Total', value: formatCents(totals.poolA), inline: true },
      { name: 'Pool B Total', value: formatCents(totals.poolB), inline: true },
      { name: 'Window Closes', value: `<t:${windowTs}:R>`, inline: true }
    )
    .setFooter({ text: `Bet #${betId} • ${new Date().toISOString()}` });

  await interaction.reply({ embeds: [embed] });

  touchPlayer(db, guildId, userId);

  await audit(db, client, {
    guildId,
    actorId: userId,
    actionType: 'BET_JOINED',
    payload: { betId, side, wagerCents: wagerCents, fee: result.fee },
  });
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const db = getDb();
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const focused = interaction.options.getFocused().toUpperCase();

  interface OpenBetRow {
    bet_id: string;
    description: string;
    side_a_label: string;
    side_b_label: string;
    direct_opponent_id: string | null;
    is_lobby: number;
  }

  const now = Date.now();
  const openBets = db
    .prepare<[string, number, string, string], OpenBetRow>(
      `SELECT bet_id, description, side_a_label, side_b_label, direct_opponent_id, is_lobby
       FROM bets
       WHERE guild_id=? AND status='open' AND window_closes_at > ?
         AND bet_id NOT IN (
           SELECT bet_id FROM bet_participants WHERE guild_id=? AND user_id=?
         )
       LIMIT 25`
    )
    .all(guildId, now, guildId, userId);

  const filtered = openBets
    .filter((b) => b.bet_id.startsWith(focused))
    .slice(0, 25);

  await interaction.respond(
    filtered.map((b) => ({
      name: `#${b.bet_id} — ${b.description.slice(0, 60)} (${b.side_a_label} vs ${b.side_b_label})`,
      value: b.bet_id,
    }))
  );
}
