import { TelegramPlatform } from './telegram.js';
import { WhatsAppPlatform } from './whatsapp.js';
import { InstagramPlatform } from './instagram.js';
import { LinkedInPlatform } from './linkedin.js';
import { XPlatform } from './x.js';
import { DiscordPlatform } from './discord.js';
import { YouTubePlatform } from './youtube.js';
import { TikTokPlatform } from './tiktok.js';
import { RedditPlatform } from './reddit.js';
import { PatreonPlatform } from './patreon.js';
import { SnapchatPlatform } from './snapchat.js';

export function createPlatforms(mcpManager) {
  const platforms = {};
  const defs = [
    new TelegramPlatform(mcpManager),
    new WhatsAppPlatform(mcpManager),
    new InstagramPlatform(mcpManager),
    new LinkedInPlatform(mcpManager),
    new XPlatform(mcpManager),
    new DiscordPlatform(mcpManager),
    new YouTubePlatform(mcpManager),
    new TikTokPlatform(mcpManager),
    new RedditPlatform(mcpManager),
    new PatreonPlatform(mcpManager),
    new SnapchatPlatform(mcpManager),
  ];
  for (const p of defs) platforms[p.name] = p;
  return platforms;
}