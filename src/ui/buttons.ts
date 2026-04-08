import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Shared button builder helpers.
 */

/**
 * Creates Confirm / Dispute buttons for resolution proposals.
 * @param betId - The bet ID, used as part of the custom_id for routing.
 */
export function resolutionButtons(betId: string): ActionRowBuilder<ButtonBuilder> {
  const confirmBtn = new ButtonBuilder()
    .setCustomId(`resolution:confirm:${betId}`)
    .setLabel('Confirm')
    .setStyle(ButtonStyle.Success)
    .setEmoji('✅');

  const disputeBtn = new ButtonBuilder()
    .setCustomId(`resolution:dispute:${betId}`)
    .setLabel('Dispute')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('❌');

  return new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, disputeBtn);
}

/**
 * Creates Previous / Next pagination buttons for history embeds.
 * @param page - Current page (0-indexed)
 * @param totalPages - Total number of pages
 * @param prefix - Custom ID prefix for routing (e.g., 'history:userId')
 */
export function paginationButtons(
  page: number,
  totalPages: number,
  prefix: string
): ActionRowBuilder<ButtonBuilder> {
  const prevBtn = new ButtonBuilder()
    .setCustomId(`${prefix}:prev:${page}`)
    .setLabel('◀ Previous')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page === 0);

  const nextBtn = new ButtonBuilder()
    .setCustomId(`${prefix}:next:${page}`)
    .setLabel('Next ▶')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= totalPages - 1);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, nextBtn);
}
