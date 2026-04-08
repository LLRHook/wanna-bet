import 'dotenv/config';

/**
 * Typed configuration object loaded from environment variables.
 * Throws at startup if required variables are missing.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface Config {
  /** Discord bot token */
  discordToken: string;
  /** Node environment */
  nodeEnv: string;
}

export const config: Config = {
  discordToken: requireEnv('DISCORD_TOKEN'),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
};
