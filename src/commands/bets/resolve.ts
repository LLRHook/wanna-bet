import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  ComponentType,
  ButtonInteraction,
  ChannelType,
  TextChannel,
} from 'discord.js';
import { getDb } from '../../db/connection';
import { getPlayer, touchPlayer } from '../../services/PlayerService';
import {
  getBet,
  getParticipants,
  isParticipant,
  proposeResolution,
  recordResolutionResponse,
  settleBet,
  BetRow,
} from '../../services/BetService';
import { audit } from '../../services/AuditService';
import { client } from '../../index';
import { errorEmbed } from '../../ui/embeds';
import { resolutionButtons } from '../../ui/buttons';
import { COLORS } from '../../ui/colors';
import { formatCents } from '../../services/BalanceService';
import { logger } from '../../logger';

export const data = new SlashCommandBuilder()
  .setName('resolve')
  .setDescription('Propose a resolution outcome for a bet you are in.')
  .addStringOption((opt) =>
    opt
      .setName('bet-id')
      .setDescription('The bet ID to resolve.')
      .setRequired(true)
      .setAutocomplete(true)
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

/**
 * Sends DMs (or channel fallback) to all non-proposer participants with Confirm/Dispute buttons.
 * Stores the per-participant message location in bet_proposal_messages so restart recovery
 * can re-attach a collector to each individual proposal message.
 */
export async function sendResolutionDMs(
  betId: string,
  guildId: string,
  proposerId: string,
  outcome: 'A' | 'B' | 'neither',
  bet: BetRow
): Promise<void> {
  const db = getDb();
  const participants = getParticipants(db, betId, guildId);
  const others = participants.filter((p) => p.user_id !== proposerId);

  const outcomeLabel =
    outcome === 'A'
      ? `Side A (${bet.side_a_label})`
      : outcome === 'B'
      ? `Side B (${bet.side_b_label})`
      : 'Neither (push)';

  const proposalEmbed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`Resolution Proposed — #${betId}`)
    .setDescription(
      `<@${proposerId}> has proposed the outcome for bet #${betId}.\n\n` +
      `Please confirm or dispute this outcome.`
    )
    .addFields(
      { name: 'Bet', value: bet.description },
      { name: 'Proposed Outcome', value: outcomeLabel },
      { name: 'Proposed By', value: `<@${proposerId}>` }
    )
    .setFooter({ text: `Bet #${betId} • ${new Date().toISOString()}` });

  const buttons = resolutionButtons(betId);

  const insertProposalMessage = db.prepare<[string, string, string, string, string, number]>(
    `INSERT OR REPLACE INTO bet_proposal_messages
     (bet_id, guild_id, user_id, channel_id, message_id, is_dm)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  for (const participant of others) {
    let sentMessage = null;
    let isDM = true;

    try {
      const user = await client.users.fetch(participant.user_id);
      sentMessage = await user.send({
        embeds: [proposalEmbed],
        components: [buttons],
      });
    } catch {
      // DMs closed — fallback to channel
      isDM = false;
      try {
        const channel = client.channels.cache.get(bet.channel_id) as TextChannel | undefined;
        if (channel) {
          sentMessage = await channel.send({
            content: `<@${participant.user_id}>`,
            embeds: [proposalEmbed],
            components: [buttons],
          });
        }
      } catch (err) {
        logger.error({ err, betId, userId: participant.user_id }, 'Failed to send resolution DM or channel fallback');
      }
    }

    if (sentMessage) {
      insertProposalMessage.run(
        betId,
        guildId,
        participant.user_id,
        sentMessage.channel.id,
        sentMessage.id,
        isDM ? 1 : 0
      );
      attachButtonCollector(sentMessage, betId, guildId, participant.user_id, bet);
    }
  }
}

/**
 * Attaches a button collector to a resolution proposal message.
 * Handles confirm/dispute responses.
 * Timeout: 48 hours (contact admin after timeout).
 */
export function attachButtonCollector(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any,
  betId: string,
  guildId: string,
  participantId: string,
  bet: BetRow
): void {
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 48 * 60 * 60 * 1000, // 48 hours
    max: 1,
    filter: (i: ButtonInteraction) => i.user.id === participantId,
  });

  collector.on('collect', async (btnInteraction: ButtonInteraction) => {
    const [, action, id] = btnInteraction.customId.split(':');
    if (id !== betId) return;

    const response = action as 'confirm' | 'dispute';
    const db = getDb();

    // Check bet is still proposed
    const currentBet = getBet(db, guildId, betId);
    if (!currentBet || currentBet.status !== 'proposed') {
      await btnInteraction.update({ components: [] });
      return;
    }

    const result = recordResolutionResponse(db, guildId, betId, participantId, response);

    if (!result.success) {
      await btnInteraction.reply({ embeds: [errorEmbed(result.error!)], ephemeral: true });
      return;
    }

    if (result.hasDispute) {
      await btnInteraction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.RED)
            .setTitle('Disputed!')
            .setDescription('You disputed the resolution. The bet is now in disputed state. An admin can force-resolve it.')
            .setTimestamp(),
        ],
        components: [],
      });

      // Notify the bet channel
      try {
        const channel = client.channels.cache.get(bet.channel_id) as TextChannel | undefined;
        if (channel) {
          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor(COLORS.RED)
                .setTitle(`Bet Disputed — #${betId}`)
                .setDescription(`<@${participantId}> disputed the resolution of bet #${betId}. An admin must force-resolve this.`)
                .setTimestamp(),
            ],
          });
        }
      } catch (err) {
        logger.error({ err, betId }, 'Failed to notify channel of dispute');
      }

      await audit(db, client, {
        guildId,
        actorId: participantId,
        actionType: 'RESOLUTION_DISPUTED',
        payload: { betId },
      });
    } else if (result.allConfirmed) {
      // All confirmed — settle the bet
      const updatedBet = getBet(db, guildId, betId);
      if (!updatedBet?.proposed_outcome) return;

      const settleResult = settleBet(
        db,
        guildId,
        betId,
        updatedBet.proposed_outcome as 'A' | 'B' | 'neither',
        updatedBet.proposer_id!
      );

      await btnInteraction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.GREEN)
            .setTitle('Confirmed!')
            .setDescription('You confirmed the resolution. All participants agreed — the bet has been settled!')
            .setTimestamp(),
        ],
        components: [],
      });

      if (settleResult.success) {
        // Notify bet channel with payouts
        try {
          const channel = client.channels.cache.get(bet.channel_id) as TextChannel | undefined;
          if (channel) {
            const outcomeLabel =
              updatedBet.proposed_outcome === 'neither'
                ? 'Neither (push)'
                : updatedBet.proposed_outcome === 'A'
                ? `Side A (${bet.side_a_label})`
                : `Side B (${bet.side_b_label})`;

            const payoutLines = (settleResult.payouts ?? [])
              .map((p) => `<@${p.userId}>: +${formatCents(p.payout)}`)
              .join('\n');

            await channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(COLORS.GREEN)
                  .setTitle(`Bet Settled — #${betId}`)
                  .addFields(
                    { name: 'Outcome', value: outcomeLabel, inline: true },
                    { name: 'Payouts', value: payoutLines || 'None', inline: false }
                  )
                  .setTimestamp(),
              ],
            });
          }
        } catch (err) {
          logger.error({ err, betId }, 'Failed to notify channel of settlement');
        }

        await audit(db, client, {
          guildId,
          actorId: participantId,
          actionType: 'BET_RESOLVED',
          payload: { betId, outcome: updatedBet.proposed_outcome, payouts: settleResult.payouts },
        });
      }
    } else {
      // Just confirmed — waiting for others
      await btnInteraction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.GREEN)
            .setTitle('Confirmed!')
            .setDescription('Your confirmation has been recorded. Waiting for other participants.')
            .setTimestamp(),
        ],
        components: [],
      });

      await audit(db, client, {
        guildId,
        actorId: participantId,
        actionType: 'RESOLUTION_CONFIRMED',
        payload: { betId },
      });
    }
  });

  collector.on('end', async (collected: Map<string, ButtonInteraction>) => {
    if (collected.size === 0) {
      // Timed out — remove buttons and notify
      try {
        await message.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.GRAY)
              .setTitle('Resolution Timed Out')
              .setDescription('The resolution vote timed out. No action was taken. Please contact the admin.')
              .setTimestamp(),
          ],
          components: [],
        });
      } catch {
        // Message may have been deleted
      }
    }
  });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const db = getDb();
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  const player = getPlayer(db, guildId, userId);
  if (!player || player.status !== 'active') {
    await interaction.reply({
      embeds: [errorEmbed('You must be registered and active to propose a resolution.')],
      ephemeral: true,
    });
    return;
  }

  const betId = interaction.options.getString('bet-id', true).toUpperCase().trim();
  const outcome = interaction.options.getString('outcome', true) as 'A' | 'B' | 'neither';

  const bet = getBet(db, guildId, betId);
  if (!bet) {
    await interaction.reply({ embeds: [errorEmbed(`Bet #${betId} not found.`)], ephemeral: true });
    return;
  }

  if (!['open', 'locked'].includes(bet.status)) {
    await interaction.reply({
      embeds: [errorEmbed(`Bet #${betId} cannot be proposed (status: ${bet.status}).`)],
      ephemeral: true,
    });
    return;
  }

  if (!isParticipant(db, betId, guildId, userId)) {
    await interaction.reply({
      embeds: [errorEmbed('You must be a participant in this bet to propose a resolution.')],
      ephemeral: true,
    });
    return;
  }

  const result = proposeResolution(db, guildId, betId, userId, outcome);
  if (!result.success) {
    await interaction.reply({ embeds: [errorEmbed(result.error!)], ephemeral: true });
    return;
  }

  const participants = getParticipants(db, betId, guildId);
  const others = participants.filter((p) => p.user_id !== userId);
  const outcomeLabel =
    outcome === 'A'
      ? `Side A (${bet.side_a_label})`
      : outcome === 'B'
      ? `Side B (${bet.side_b_label})`
      : 'Neither (push)';

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`Resolution Proposed — #${betId}`)
    .addFields(
      { name: 'Proposed Outcome', value: outcomeLabel, inline: true },
      { name: 'Proposed By', value: `<@${userId}>`, inline: true },
      {
        name: 'Awaiting Confirmation',
        value: others.length === 0 ? 'None (auto-settling)' : `${others.length} participant(s)`,
        inline: true,
      }
    )
    .setFooter({ text: `Bet #${betId} • ${new Date().toISOString()}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  // If no other participants (only proposer), auto-settle immediately
  if (others.length === 0) {
    const settleResult = settleBet(db, guildId, betId, outcome, userId);
    if (settleResult.success) {
      await interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.GREEN)
            .setTitle(`Bet Settled — #${betId}`)
            .setDescription('Auto-settled (only one participant).')
            .setTimestamp(),
        ],
      });
    }
    return;
  }

  // Send DMs to other participants
  await sendResolutionDMs(betId, guildId, userId, outcome, bet);

  touchPlayer(db, guildId, userId);

  await audit(db, client, {
    guildId,
    actorId: userId,
    actionType: 'RESOLUTION_PROPOSED',
    payload: { betId, outcome },
  });
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const db = getDb();
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const focused = interaction.options.getFocused().toUpperCase();

  interface BetOptionRow { bet_id: string; description: string }

  const bets = db
    .prepare<[string, string], BetOptionRow>(
      `SELECT DISTINCT b.bet_id, b.description
       FROM bets b
       JOIN bet_participants bp ON bp.bet_id = b.bet_id AND bp.guild_id = b.guild_id
       WHERE b.guild_id=? AND b.status IN ('open','locked') AND bp.user_id=?
       LIMIT 25`
    )
    .all(guildId, userId);

  await interaction.respond(
    bets
      .filter((b) => b.bet_id.startsWith(focused))
      .map((b) => ({
        name: `#${b.bet_id} — ${b.description.slice(0, 80)}`,
        value: b.bet_id,
      }))
  );
}

/**
 * Re-attaches button collectors for all 'proposed' bets on startup.
 * Iterates bet_proposal_messages so every per-participant message gets its own
 * collector restored, even for 3+ participant lobby bets.
 */
export async function reattachResolutionCollectors(): Promise<void> {
  const db = getDb();

  interface PendingProposalMessage {
    bet_id: string;
    guild_id: string;
    user_id: string;
    channel_id: string;
    message_id: string;
    is_dm: number;
  }

  const pending = db
    .prepare<[], PendingProposalMessage>(
      `SELECT bpm.bet_id, bpm.guild_id, bpm.user_id, bpm.channel_id, bpm.message_id, bpm.is_dm
       FROM bet_proposal_messages bpm
       JOIN bets b ON b.bet_id = bpm.bet_id AND b.guild_id = bpm.guild_id
       WHERE b.status = 'proposed'`
    )
    .all();

  for (const pm of pending) {
    const bet = getBet(db, pm.guild_id, pm.bet_id);
    if (!bet) continue;

    try {
      let message;
      if (pm.is_dm) {
        const user = await client.users.fetch(pm.user_id);
        const dmChannel = await user.createDM();
        message = await dmChannel.messages.fetch(pm.message_id);
      } else {
        const channel = await client.channels.fetch(pm.channel_id);
        if (channel?.type === ChannelType.GuildText) {
          message = await channel.messages.fetch(pm.message_id);
        }
      }
      if (message) {
        attachButtonCollector(message, pm.bet_id, pm.guild_id, pm.user_id, bet);
        logger.info({ betId: pm.bet_id, userId: pm.user_id }, 'Re-attached resolution collector');
      }
    } catch (err) {
      logger.warn({ err, betId: pm.bet_id, userId: pm.user_id }, 'Could not re-attach resolution collector');
    }
  }
}
