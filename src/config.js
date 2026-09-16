import 'dotenv/config';

const env = (k, d) => process.env[k] ?? d;
const num = (k, d) => {
  const v = Number(process.env[k]);
  return Number.isFinite(v) && v > 0 ? v : d;
};

export const config = {
  port: num('PORT', 3000),
  openrouter: {
    apiKey: env('OPENROUTER_API_KEY', ''),
    model: env('AI_MODEL', 'openai/gpt-4o'),
    modelFast: env('AI_MODEL_FAST', 'openai/gpt-4o-mini'),
    url: 'https://openrouter.ai/api/v1/chat/completions',
  },
  gemini: {
    apiKey: env('GEMINI_API_KEY', ''),
    model: env('GEMINI_MODEL', 'gemini-3.6-flash'),
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
  },
  agent: {
    cadence: num('AGENT_CADENCE', 45),
    maxActions: num('MAX_ACTIONS_PER_CYCLE', 4),
  },
  sim: {
    startFollowers: num('SIM_START_FOLLOWERS', 1500),
    growthPerPost: num('SIM_GROWTH_PER_POST', 12),
    chanceInbound: num('SIM_CHANCE_INBOUND', 0.55),
  },
  creds: {
    telegramBot: env('TELEGRAM_BOT_TOKEN', ''),
    telegramChannel: env('TELEGRAM_CHANNEL_ID', ''),
    discordBot: env('DISCORD_BOT_TOKEN', ''),
    discordChannel: env('DISCORD_CHANNEL_ID', ''),
    whatsappToken: env('WHATSAPP_TOKEN', ''),
    whatsappPhone: env('WHATSAPP_PHONE_ID', ''),
    redditId: env('REDDIT_CLIENT_ID', ''),
    redditSecret: env('REDDIT_CLIENT_SECRET', ''),
    redditUser: env('REDDIT_USERNAME', ''),
    redditPass: env('REDDIT_PASSWORD', ''),
    xBearer: env('X_BEARER', ''),
    xKey: env('X_API_KEY', ''),
    xSecret: env('X_API_SECRET', ''),
    xAToken: env('X_ACCESS_TOKEN', ''),
    xASecret: env('X_ACCESS_SECRET', ''),
    linkedin: env('LINKEDIN_ACCESS_TOKEN', ''),
    instagram: env('INSTAGRAM_ACCESS_TOKEN', ''),
    instagramBusiness: env('INSTAGRAM_BUSINESS_ID', ''),
    youtube: env('YOUTUBE_API_KEY', ''),
    youtubeChannel: env('YOUTUBE_CHANNEL_ID', ''),
    tiktok: env('TIKTOK_ACCESS_TOKEN', ''),
    patreon: env('PATREON_ACCESS_TOKEN', ''),
    snapchat: env('SNAPCHAT_ACCESS_TOKEN', ''),
  },
};