import { EmbedBuilder, type User } from 'discord.js';
import { COLORS } from './colors';
import { formatCents } from '../services/BalanceService';

/**
 * Shared embed builder helpers.
 * All responses use rich embeds — no plain text strings.
 */

/**
 * Creates a standard error embed (red).
 */
export function errorEmbed(description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.RED)
    .setTitle('Error')
    .setDescription(description)
    .setTimestamp();
}

/**
 * Creates a standard success embed (green).
 */
export function successEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.GREEN)
    .setTitle(title)
    .setTimestamp();
  if (description) embed.setDescription(description);
  return embed;
}

/**
 * Creates an info embed (blue).
 */
export function infoEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.BLUE)
    .setTitle(title)
    .setTimestamp();
  if (description) embed.setDescription(description);
  return embed;
}

/**
 * Creates a balance embed for a player.
 */
export function balanceEmbed(user: User, balanceCents: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.BLUE)
    .setTitle(`${user.displayName}'s Balance`)
    .setThumbnail(user.displayAvatarURL())
    .addFields({ name: 'Wallet Balance', value: formatCents(balanceCents), inline: true })
    .setTimestamp();
}

/**
 * Creates a registration embed.
 */
export function registerEmbed(
  user: User,
  balanceCents: number,
  isReactivation: boolean
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.BLUE)
    .setTitle(isReactivation ? 'Welcome Back!' : 'Welcome to the Economy!')
    .setThumbnail(user.displayAvatarURL())
    .setDescription(
      isReactivation
        ? 'Your account has been reactivated. Your balance has been restored.'
        : 'You have been registered! You start with $100.00.'
    )
    .addFields(
      { name: 'Current Balance', value: formatCents(balanceCents), inline: true },
      { name: 'Status', value: 'Active', inline: true }
    )
    .setTimestamp();
}

/**
 * Creates a daily claim embed.
 */
export function dailyEmbed(user: User, newBalanceCents: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.GREEN)
    .setTitle('Daily Claimed!')
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: 'Reward', value: '+$5.00', inline: true },
      { name: 'New Balance', value: formatCents(newBalanceCents), inline: true }
    )
    .setFooter({ text: 'Resets at UTC midnight' })
    .setTimestamp();
}

/**
 * Creates an unregister embed.
 */
export function unregisterEmbed(user: User, finalBalanceCents: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.GRAY)
    .setTitle('Unregistered')
    .setThumbnail(user.displayAvatarURL())
    .setDescription(
      'Your account has been deactivated. Re-register at any time to restore your balance.'
    )
    .addFields(
      { name: 'Final Balance (preserved)', value: formatCents(finalBalanceCents), inline: true }
    )
    .setTimestamp();
}
