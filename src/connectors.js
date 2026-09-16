import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { info, warn } from './core/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(__dirname, '..', '.env');

/**
 * Connector Catalog — what each platform connector does, the credentials it
 * needs, and how to obtain them. Drives the sidebar UI ("Connectors" tab).
 *
 * Each connector exposes:
 *   - task:     the specific job this connector performs on the agent's behalf
 *   - function: how messages/posts flow through it
 *   - creds:    ordered field list the UI renders as inputs
 *   - link:     where to get the credentials from (dev portal)
 */

export const CONNECTOR_DEFS = {
  x: {
    task: 'Post threads, reply to replies & DMs, track mentions',
    function: 'Pushes daily posts and replies to your X account; monitors mentions and DMs for inbound messages.',
    creds: [
      { key: 'xBearer', label: 'X Bearer Token', placeholder: 'Bearer token (OAuth2 App) for API v2' },
      { key: 'xKey', label: 'API Key', placeholder: 'Consumer API Key' },
      { key: 'xSecret', label: 'API Secret', placeholder: 'Consumer API Secret' },
      { key: 'xAToken', label: 'Access Token', placeholder: 'Access Token' },
      { key: 'xASecret', label: 'Access Secret', placeholder: 'Access Token Secret' },
    ],
    link: 'https://developer.x.com/en/docs/twitter-api/getting-started/getting-access-to-the-twitter-api',
  },
  telegram: {
    task: 'Broadcast to channel + auto-reply to user messages',
    function: 'Sends posts to your channel and replies to followers who message the bot.',
    creds: [
      { key: 'telegramBot', label: 'Bot Token', placeholder: 'From @BotFather → /newbot' },
      { key: 'telegramChannel', label: 'Channel ID', placeholder: 'e.g. -1001234567890' },
    ],
    link: 'https://core.telegram.org/bots#6-botfather',
  },
  discord: {
    task: 'Post to channels + human-like replies in communities',
    function: 'Pushes content to your server and answers community messages with humanized replies.',
    creds: [
      { key: 'discordBot', label: 'Bot Token', placeholder: 'From Discord Developer Portal → Bot' },
      { key: 'discordChannel', label: 'Channel ID', placeholder: 'e.g. 123456789012345678' },
    ],
    link: 'https://discord.com/developers/applications',
  },
  whatsapp: {
    task: 'Broadcast updates + private 1:1 reply conversations',
    function: 'Sends updates to your WhatsApp phone number and replies to incoming chats.',
    creds: [
      { key: 'whatsappToken', label: 'WhatsApp Access Token', placeholder: 'From Meta for Developers' },
      { key: 'whatsappPhone', label: 'Phone Number ID', placeholder: 'e.g. 15551234567' },
    ],
    link: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
  },
  reddit: {
    task: 'Post to subreddits + reply to comments and chat',
    function: 'Posts content to your subreddits and replies to comments and DMs with native voice.',
    creds: [
      { key: 'redditId', label: 'Client ID', placeholder: 'From Reddit App → "personal use script"' },
      { key: 'redditSecret', label: 'Client Secret', placeholder: 'Secret shown when app created' },
      { key: 'redditUser', label: 'Username', placeholder: 'Your Reddit username' },
      { key: 'redditPass', label: 'Password', placeholder: 'Your Reddit password (OAuth app-only)' },
    ],
    link: 'https://www.reddit.com/prefs/apps',
  },
  instagram: {
    task: 'Share visual posts + reply to comments on your posts',
    function: 'Publishes captions to your Instagram business account and answers commenters.',
    creds: [
      { key: 'instagram', label: 'Instagram Access Token', placeholder: 'Long-lived token from Meta Graph API' },
      { key: 'instagramBusiness', label: 'Instagram Business ID', placeholder: 'IG Business Account ID' },
    ],
    link: 'https://developers.facebook.com/docs/instagram-api/getting-started',
  },
  linkedin: {
    task: 'Post thought-leadership updates + reply to comments',
    function: 'Shares professional posts on your LinkedIn profile/company page and replies to comments.',
    creds: [
      { key: 'linkedin', label: 'Access Token', placeholder: 'LinkedIn API access token' },
    ],
    link: 'https://www.linkedin.com/developers/',
  },
  youtube: {
    task: 'Upload/announce videos + reply to comments',
    function: 'Posts community updates and replies to viewers on your channel.',
    creds: [
      { key: 'youtube', label: 'API Key', placeholder: 'Google Cloud API key' },
      { key: 'youtubeChannel', label: 'Channel ID', placeholder: 'Your YouTube channel ID' },
    ],
    link: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
  },
  tiktok: {
    task: 'Post short-form content + reply to comments',
    function: 'Publishes trending short-form posts and replies to your comment threads.',
    creds: [
      { key: 'tiktok', label: 'Access Token', placeholder: 'TikTok for Developers access token' },
    ],
    link: 'https://developers.tiktok.com/',
  },
  patreon: {
    task: 'Exclusive patron posts + supporter replies',
    function: 'Shares patron-only updates and replies to your supporters with insider tone.',
    creds: [
      { key: 'patreon', label: 'Access Token', placeholder: 'Patreon API access token' },
    ],
    link: 'https://www.patreon.com/portal/registration/register-clients',
  },
  snapchat: {
    task: 'Story captions + chat auto-replies',
    function: 'Posts short story captions and replies to snapchat chat messages.',
    creds: [
      { key: 'snapchat', label: 'Access Token', placeholder: 'Snap Kit access token' },
    ],
    link: 'https://kit.snapchat.com/portal',
  },
};

export function feed(map) {
  const out = {};
  for (const [key, def] of Object.entries(CONNECTOR_DEFS)) {
    const p = map[key];
    if (!p) continue;
    const fields = def.creds.map((c) => ({
      ...c,
      set: !!(config.creds[c.key] && config.creds[c.key].length > 5),
    }));
    out[key] = {
      name: key,
      label: p.label,
      handle: p.handle,
      mode: p.mode(),
      connected: p.mode() === 'sim' ? true : !!p.hasCredentials(),
      task: def.task,
      function: def.function,
      link: def.link,
      creds: fields,
      tools: p.mcpTools().map((t) => t.name),
    };
  }
  return out;
}

/** Persist one credential field into .env (masks what's already set). */
export function saveCredential(key, value) {
  if (!CONNECTOR_DEFS && !value) return { ok: false, error: 'invalid input' };
  // find which connector owns this key for validation
  let owner = null;
  for (const [name, def] of Object.entries(CONNECTOR_DEFS)) {
    if (def.creds.some((c) => c.key === key)) { owner = name; break; }
  }
  if (!owner) return { ok: false, error: `unknown credential field "${key}"` };
  if (!fs.existsSync(ENV_FILE)) fs.writeFileSync(ENV_FILE, '');
  let content = fs.readFileSync(ENV_FILE, 'utf8');
  const safe = String(value ?? '').trim();
  const line = `${key}=${safe}`;
  if (new RegExp(`^${key}=.*$`, 'm').test(content)) {
    content = content.replace(new RegExp(`^${key}=.*$`, 'm'), line);
  } else {
    content += (content.endsWith('\n') ? '' : '\n') + line + '\n';
  }
  fs.writeFileSync(ENV_FILE, content);
  config.creds[key] = safe;
  info('connectors', `saved credential ${key} (${owner})`);
  return { ok: true, key, owner };
}

export function mask(value) {
  if (!value) return '';
  return value.slice(0, 4) + '••••••••';
}