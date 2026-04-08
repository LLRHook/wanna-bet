/**
 * Discord embed color constants.
 * Values are integers (hex literals) as expected by EmbedBuilder.setColor().
 */
export const COLORS = {
  /** Pending bets, notifications */
  GOLD: 0xffd700,
  /** Win / success */
  GREEN: 0x57f287,
  /** Loss / error */
  RED: 0xed4245,
  /** Cancelled / neither / inactive */
  GRAY: 0x95a5a6,
  /** Admin actions / elections */
  PURPLE: 0x9b59b6,
  /** Info / balance / stats */
  BLUE: 0x3498db,
} as const;

export type ColorKey = keyof typeof COLORS;
