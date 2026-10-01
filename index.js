const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  Client,
  GatewayIntentBits,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
} = require('discord.js');
const { google } = require('googleapis');
 
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
 
const {
  discordToken,
  guildId,
  googleKeyFile = './service-account.json',
  syncIntervalMinutes = 5,
  lookaheadDays = 30,
  maxEvents = 80, 
  calendars = [],
} = config;
 
if (!discordToken || !guildId || calendars.length === 0) {
  console.error('config.json needs discordToken, guildId and at least one calendar.');
  process.exit(1);
}

const ZW = ['\u200B', '\u200C', '\u200D', '\u2060'];
const ZW_RE = /[\u200B\u200C\u200D\u2060]{48}/;
const LEGACY_TAG_RE = /\[gcal:([^\]|]+)\|([^\]]+)\]/; 
const FOOTER_TEXT = 'Synced from Google Calendar';
 
function hashHex(s, len) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, len);
}
 
function tagHex(calendarId, eventKey) {
  return hashHex(calendarId, 8) + hashHex(eventKey, 16);
}
 
function encodeHidden(hex) {
  let out = '';
  for (const c of hex) {
    const n = parseInt(c, 16);
    out += ZW[(n >> 2) & 3] + ZW[n & 3];
  }
  return out;
}
 
function decodeHidden(str) {
  const m = str.match(ZW_RE);
  if (!m) return null;
  let hex = '';
  for (let i = 0; i < m[0].length; i += 2) {
    const n = (ZW.indexOf(m[0][i]) << 2) | ZW.indexOf(m[0][i + 1]);
    hex += n.toString(16);
  }
  return hex;
}
 
function readTag(description) {
  if (!description) return null;
  const hidden = decodeHidden(description);
  if (hidden) return hidden;
  const legacy = description.match(LEGACY_TAG_RE);
  if (legacy) return tagHex(legacy[1], `${legacy[1]}|${legacy[2]}`);
  return null;
}
 
function htmlToDiscord(html = '') {
  return html
    .replace(/\r/g, '')
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, text) => {
      const t = text.replace(/<[^>]+>/g, '').trim();
      return !t || t === url ? url : `${t} (${url})`;
    })
    .replace(/<(b|strong)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(i|em)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<u(?:\s[^>]*)?>([\s\S]*?)<\/u>/gi, '__$1__')
    .replace(/<(s|strike|del)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi, '~~$2~~')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<li(?:\s[^>]*)?>/gi, '\n• ')
    .replace(/<\/li>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
 
function buildDescription(googleDescription, hex) {
  const footer = `📅${encodeHidden(hex)} ${FOOTER_TEXT}`;
  const budget = 1000 - footer.length - 10;
  let body = htmlToDiscord(googleDescription);
  if (body.length > budget) body = body.slice(0, budget - 1).trimEnd() + '…';
  return body ? `${body}\n\n${footer}` : footer;
}
 
const auth = new google.auth.GoogleAuth({
  keyFile: googleKeyFile,
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
});
const calendar = google.calendar({ version: 'v3', auth });
 
async function fetchCalendarEvents(cal) {
  const now = new Date();
  const max = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000);
 
  const res = await calendar.events.list({
    calendarId: cal.id,
    timeMin: now.toISOString(),
    timeMax: max.toISOString(),
    singleEvents: true, // expands recurring events into individual instances
    orderBy: 'startTime',
    maxResults: 100,
  });
 
  return (res.data.items || []).map((g) => ({
    hex: tagHex(cal.id, `${cal.id}|${g.id}`),
    label: cal.label,
    g,
  }));
}
 
async function fetchAllEvents() {
  const results = await Promise.allSettled(calendars.map(fetchCalendarEvents));
  const events = [];
  const failedCalendars = new Set(); // 8-char calendar hashes
 
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      events.push(...r.value);
    } else {
      failedCalendars.add(hashHex(calendars[i].id, 8));
      console.error(`Failed to fetch calendar ${calendars[i].id}:`, r.reason?.message);
    }
  });
 
  const startOf = (e) => new Date(e.g.start.dateTime || e.g.start.date).getTime();
  events.sort((a, b) => startOf(a) - startOf(b));
 
  return { events: events.slice(0, maxEvents), failedCalendars };
}
 
function toDiscordPayload({ hex, label, g }) {
  const start = new Date(g.start.dateTime || g.start.date);
  let end = new Date(g.end.dateTime || g.end.date);
  if (end <= start) end = new Date(start.getTime() + 60 * 60 * 1000);
 
  const summary = g.summary || 'Untitled event';
  const title = label ? `[${label}] ${summary}` : summary;
 
  return {
    name: title.slice(0, 100),
    description: buildDescription(g.description, hex),
    scheduledStartTime: start,
    scheduledEndTime: end,
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType: GuildScheduledEventEntityType.External,
    entityMetadata: { location: (g.location || 'See description').slice(0, 100) },
  };
}
 
function hasChanged(existing, payload) {
  return (
    existing.name !== payload.name ||
    existing.scheduledStartTimestamp !== payload.scheduledStartTime.getTime() ||
    existing.scheduledEndTimestamp !== payload.scheduledEndTime.getTime() ||
    existing.entityMetadata?.location !== payload.entityMetadata.location ||
    existing.description !== payload.description
  );
}
 
async function sync(guild) {
  const { events, failedCalendars } = await fetchAllEvents();
  const discordEvents = await guild.scheduledEvents.fetch();
 
  const managed = new Map();
  for (const d of discordEvents.values()) {
    const tag = readTag(d.description);
    if (tag) managed.set(tag, d);
  }
 
  const seen = new Set();
 
  for (const ev of events) {
    seen.add(ev.hex);
    const payload = toDiscordPayload(ev);
    const existing = managed.get(ev.hex);
 
    try {
      if (!existing) {
        if (payload.scheduledStartTime > new Date()) {
          await guild.scheduledEvents.create(payload);
          console.log(`Created: ${payload.name}`);
        }
      } else if (existing.isScheduled() && hasChanged(existing, payload)) {
        await existing.edit(payload);
        console.log(`Updated: ${payload.name}`);
      }
    } catch (err) {
      console.error(`Failed on "${payload.name}":`, err.message);
    }
  }
 
  for (const [tag, d] of managed) {
    if (seen.has(tag) || !d.isScheduled()) continue;
 
    if (failedCalendars.has(tag.slice(0, 8))) continue;
 
    try {
      await d.delete();
      console.log(`Deleted: ${d.name}`);
    } catch (err) {
      console.error(`Failed to delete "${d.name}":`, err.message);
    }
  }
}
 
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
 
client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const guild = await client.guilds.fetch(guildId);
 
  const run = () => sync(guild).catch((err) => console.error('Sync error:', err));
  run();
  setInterval(run, syncIntervalMinutes * 60 * 1000);
});
 
client.login(discordToken);
