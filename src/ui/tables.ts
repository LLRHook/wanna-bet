import { formatCents } from '../services/BalanceService';

/**
 * Box-drawing table formatter for Discord leaderboard.
 * Output is wrapped in triple backtick code blocks for monospace rendering.
 *
 * Example output:
 * ```
 * ╔═══╦════════════════════╦══════════╦══════╗
 * ║ # ║ Player             ║  Balance ║  W/L ║
 * ╠═══╬════════════════════╬══════════╬══════╣
 * ║ 1 ║ Username           ║  $250.00 ║ 12/3 ║
 * ╚═══╩════════════════════╩══════════╩══════╝
 * ```
 */

export interface LeaderboardRow {
  rank: number;
  username: string;
  balanceCents: number;
  wins: number;
  losses: number;
}

const COL_RANK = 3;
const COL_PLAYER = 20;
const COL_BALANCE = 10;
const COL_WL = 8;

function pad(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return str + ' '.repeat(width - str.length);
}

function padLeft(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return ' '.repeat(width - str.length) + str;
}

/**
 * Builds a box-drawing leaderboard table wrapped in a Discord code block.
 */
export function buildLeaderboardTable(rows: LeaderboardRow[]): string {
  const top    = `╔${'═'.repeat(COL_RANK + 2)}╦${'═'.repeat(COL_PLAYER + 2)}╦${'═'.repeat(COL_BALANCE + 2)}╦${'═'.repeat(COL_WL + 2)}╗`;
  const header = `║ ${pad('#', COL_RANK)} ║ ${pad('Player', COL_PLAYER)} ║ ${padLeft('Balance', COL_BALANCE)} ║ ${padLeft('W/L', COL_WL)} ║`;
  const divider= `╠${'═'.repeat(COL_RANK + 2)}╬${'═'.repeat(COL_PLAYER + 2)}╬${'═'.repeat(COL_BALANCE + 2)}╬${'═'.repeat(COL_WL + 2)}╣`;
  const bottom = `╚${'═'.repeat(COL_RANK + 2)}╩${'═'.repeat(COL_PLAYER + 2)}╩${'═'.repeat(COL_BALANCE + 2)}╩${'═'.repeat(COL_WL + 2)}╝`;

  const dataRows = rows.map((r) => {
    const rankStr = String(r.rank);
    const nameStr = r.username;
    const balStr = formatCents(r.balanceCents);
    const wlStr = `${r.wins}/${r.losses}`;

    return `║ ${pad(rankStr, COL_RANK)} ║ ${pad(nameStr, COL_PLAYER)} ║ ${padLeft(balStr, COL_BALANCE)} ║ ${padLeft(wlStr, COL_WL)} ║`;
  });

  const tableLines = [top, header, divider, ...dataRows, bottom];
  return '```\n' + tableLines.join('\n') + '\n```';
}
