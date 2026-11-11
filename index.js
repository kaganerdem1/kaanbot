// index.js
require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder,
    ChannelType,
    PermissionFlagsBits,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    MessageFlags,
    AttachmentBuilder,
} = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');
const cron = require('node-cron');
const { createCanvas, loadImage } = require('canvas');

// ==========================================
// 1) ENVIRONMENT VARIABLES
// ==========================================
const REQUIRED_ENV = ['DISCORD_TOKEN', 'CLIENT_ID', 'MONGO_URI'];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length) {
    console.error(`❌ Missing environment variables: ${missingEnv.join(', ')}`);
    process.exit(1);
}

process.on('unhandledRejection', err => console.error('❌ Unhandled rejection:', err));
process.on('uncaughtException', err => console.error('❌ Uncaught exception:', err));

// ==========================================
// 2) WEB SERVER (required by Render)
// ==========================================
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Web server listening on port ${PORT}.`));

// ==========================================
// 3) SETTINGS
// ==========================================
const SETTINGS = {
    NOTIFY_CHANNEL: 'notifications',   // warnings and camera alerts
    LOG_CHANNEL: 'study-log',          // daily leaderboard (create manually)
    WELCOME_CHANNEL: 'welcome-bye',    // join/leave and rules acceptance
    GENERAL_CHANNEL: 'general',        // daily reminders and announcements
    CAM_ONLY_CHANNEL: 'cam-only',      // voice channel that requires camera
    MEMBER_ROLE: 'Member',
    CAMERA_CHECK_MS: 5000,
    TIMEZONE: 'Europe/Istanbul',
    POMODORO_COIN_PER_MIN: 2,
    VOICE_COIN_PER_MIN: 1,
    GOAL_BONUS: 50,
    WEEKLY_CHAMPION_BONUS: 200,
    LEADERBOARD_LIMIT: 30,
    WARN_LIMIT: 3,
    WARN_TIMEOUT_MS: 60 * 60 * 1000,
    SPAM_LIMIT: 5,
    SPAM_WINDOW_MS: 5000,
    SPAM_TIMEOUT_MS: 5 * 60 * 1000,
    IMPORT_KEY: 'old-hours-import-v2', // do not change, prevents re-importing old data
};

// Lowercase words to filter. Add your own.
const BAD_WORDS = ['badword1', 'badword2'];

const SHOP = [
    { key: 'bronze', name: 'Bronze Hardworker', price: 300, role: '🥉 Bronze Hardworker', color: 0xCD7F32 },
    { key: 'silver', name: 'Silver Hardworker', price: 1000, role: '🥈 Silver Hardworker', color: 0xC0C0C0 },
    { key: 'gold', name: 'Gold Hardworker', price: 3000, role: '🥇 Gold Hardworker', color: 0xFFD700 },
];

const MOTIVATION = [
    '🌱 Small steps are the beginning of great journeys. Try a pomodoro today!',
    '🔥 Discipline is the bridge between what you want and what you do.',
    '📚 One page, one topic, one question. The more you move forward today, the more you gain.',
    '🦁 Join a room, turn on your camera, and focus!',
    '⏳ Put your phone away. 25 minutes is enough.',
];

// ==========================================
// 4) DATABASE MODELS (times stored in seconds)
// ==========================================
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: { type: String, default: 'Unknown' },
    totalSec: { type: Number, default: 0 },
    dailySec: { type: Number, default: 0 },
    weeklySec: { type: Number, default: 0 },
    lastStudyDate: { type: String, default: '' },
    weekKey: { type: String, default: '' },
    streak: { type: Number, default: 0 },
    lastActiveDate: { type: String, default: '' },
    dailyGoal: { type: Number, default: 0 },          // in minutes
    goalRewardDate: { type: String, default: '' },
    balance: { type: Number, default: 0 },
    pomodoroCount: { type: Number, default: 0 },
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

const taskSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    description: { type: String, required: true },
    completed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});
const Task = mongoose.model('Task', taskSchema);

const activeSessionSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now },
});
const ActiveSession = mongoose.model('ActiveSession', activeSessionSchema);

const pomodoroSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    username: { type: String, default: 'Unknown' },
    channelId: { type: String, required: true },
    minutes: { type: Number, required: true },
    endsAt: { type: Date, required: true },
    done: { type: Boolean, default: false },
});
const Pomodoro = mongoose.model('Pomodoro', pomodoroSchema);

const warningSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    reason: { type: String, default: 'Not specified' },
    byName: { type: String, default: 'Unknown' },
    createdAt: { type: Date, default: Date.now },
});
const Warning = mongoose.model('Warning', warningSchema);

const importLogSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    count: { type: Number, default: 0 },
    at: { type: Date, default: Date.now },
});
const ImportLog = mongoose.model('ImportLog', importLogSchema);

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB connected.'))
    .catch(err => console.error('❌ MongoDB connection error:', err.message));

// ==========================================
// 5) DISCORD CLIENT
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

client.on('error', err => console.error('❌ Discord client error:', err.message));
client.on('shardDisconnect', (e, id) => console.error(`❌ Shard ${id} disconnected, code: ${e?.code}`));

// ==========================================
// 6) HELPERS
// ==========================================
const normalize = s => s.normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

function dayKey(date = new Date(), dayOffset = 0) {
    const t = new Date(date.getTime() + dayOffset * 86400000);
    return t.toLocaleDateString('en-CA', { timeZone: SETTINGS.TIMEZONE });
}

function weekKey() {
    const [y, m, d] = dayKey().split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const sinceMonday = (dt.getUTCDay() + 6) % 7;
    dt.setUTCDate(dt.getUTCDate() - sinceMonday);
    return dt.toISOString().slice(0, 10);
}

// Seconds → H:MM:SS (e.g. 3072:12:00)
function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

async function findChannel(guild, name, type = ChannelType.GuildText) {
    const list = await guild.channels.fetch();
    const target = normalize(name);
    return list.find(c => c && c.type === type && normalize(c.name) === target) ?? null;
}

async function ensureChannel(guild, name, type = ChannelType.GuildText) {
    const existing = await findChannel(guild, name, type);
    if (existing) return existing;
    console.log(`🛠️ Creating channel "${name}"...`);
    return guild.channels.create({ name, type, reason: 'Bot setup' });
}

async function ensureRole(guild, name, color) {
    await guild.roles.fetch();
    const existing = guild.roles.cache.find(r => r.name === name);
    if (existing) return existing;
    console.log(`🛠️ Creating role "${name}"...`);
    return guild.roles.create({ name, color, reason: 'Bot setup' });
}

async function send(guild, channelName, payload) {
    try {
        const channel = await findChannel(guild, channelName);
        if (!channel) return false;
        await channel.send(payload);
        return true;
    } catch (err) {
        console.error(`❌ Could not send to "${channelName}":`, err.code, err.message);
        return false;
    }
}

async function sendDM(guild, userId, payload) {
    try {
        const member = await guild.members.fetch(userId);
        await member.send(payload);
        return true;
    } catch (err) {
        console.error(`❌ Could not DM ${userId}:`, err.message);
        return false;
    }
}

function embed(title, description, color = 0xE74C3C) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
}

async function addStudyTime(userId, name, seconds, coins) {
    const today = dayKey();
    const thisWeek = weekKey();
    const yesterday = dayKey(new Date(), -1);

    let u = await User.findOne({ userId });
    if (!u) u = new User({ userId, username: name });

    if (u.lastStudyDate !== today) { u.dailySec = 0; u.lastStudyDate = today; }
    if (u.weekKey !== thisWeek) { u.weeklySec = 0; u.weekKey = thisWeek; }
    u.username = name;

    u.dailySec += seconds;
    u.weeklySec += seconds;
    u.totalSec += seconds;
    u.balance += coins;

    if (u.lastActiveDate !== today) {
        u.streak = u.lastActiveDate === yesterday ? u.streak + 1 : 1;
        u.lastActiveDate = today;
    }

    let bonus = false;
    if (u.dailyGoal > 0 && u.dailySec >= u.dailyGoal * 60 && u.goalRewardDate !== today) {
        u.balance += SETTINGS.GOAL_BONUS;
        u.goalRewardDate = today;
        bonus = true;
    }

    await u.save();
    return { u, bonus };
}

// ==========================================
// 7) LEADERBOARD IMAGE
// Names are read from Discord (current server display name).
// ==========================================

// Keeps only characters the canvas can draw. Fancy Unicode letters become plain ASCII.
function cleanName(s) {
    if (!s) return '';
    return String(s)
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .replace(/[^\p{L}\p{N} ._\-|'()\[\]]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Current server display name first, then Discord username, then a fallback
function displayNameOf(member, stored) {
    return cleanName(member?.displayName)
        || cleanName(member?.user?.username)
        || cleanName(stored?.username)
        || `User ${String(stored?.userId ?? '').slice(-4)}`;
}

function rankingQuery(type) {
    if (type === 'weekly') {
        return { field: 'weeklySec', filter: { weekKey: weekKey(), weeklySec: { $gt: 0 } } };
    }
    if (type === 'alltime') {
        return { field: 'totalSec', filter: { totalSec: { $gt: 0 } } };
    }
    return { field: 'dailySec', filter: { lastStudyDate: dayKey(), dailySec: { $gt: 0 } } };
}

const LABELS = {
    daily: 'DAILY LEADERBOARD',
    weekly: 'WEEKLY LEADERBOARD',
    alltime: 'ALL-TIME LEADERBOARD',
};

async function loadAvatar(url) {
    try {
        const res = await fetch(url);
        const buf = Buffer.from(await res.arrayBuffer());
        return await loadImage(buf);
    } catch {
        return null;
    }
}

function drawAvatar(ctx, img, x, y, r, letter) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (img) {
        ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    } else {
        ctx.fillStyle = '#3A4B5C';
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${Math.round(r)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((letter || '?').charAt(0).toUpperCase(), x, y + 2);
    }
    ctx.restore();
}

function roundRect(ctx, x, y, w, h, r, color) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}

function drawCrown(ctx, x, yCenter, r, color) {
    const g = r * 1.2;
    const base = yCenter - r + 4;
    const top = yCenter - r - 30;
    ctx.beginPath();
    ctx.moveTo(x - g / 2, base);
    ctx.lineTo(x - g / 2, top + 12);
    ctx.lineTo(x - g / 4, top + 24);
    ctx.lineTo(x, top);
    ctx.lineTo(x + g / 4, top + 24);
    ctx.lineTo(x + g / 2, top + 12);
    ctx.lineTo(x + g / 2, base);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}

async function buildLeaderboardImage(type, guild) {
    const q = rankingQuery(type);
    const rows = await User.find(q.filter).sort({ [q.field]: -1 }).limit(SETTINGS.LEADERBOARD_LIMIT);
    if (!rows.length) return null;

    // Read each user's current name and avatar from Discord
    const entries = await Promise.all(rows.map(async row => {
        const member = await guild.members.fetch(row.userId).catch(() => null);
        const img = member
            ? await loadAvatar(member.user.displayAvatarURL({ extension: 'png', size: 128 }))
            : null;
        return {
            name: displayNameOf(member, row),
            img,
            seconds: row[q.field],
        };
    }));

    const W = 800;
    const listStart = 360;
    const rowGap = 60;
    const listCount = Math.max(0, entries.length - 3);
    const H = listStart + listCount * rowGap + 20;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#10202C';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#F1C40F';
    ctx.font = 'bold 46px sans-serif';
    ctx.fillText(`PRODUCTIVITY ${LABELS[type] ? '' : ''}LEADERBOARD`.replace('  ', ' '), W / 2, 62);

    ctx.fillStyle = '#DDDDDD';
    ctx.font = '18px sans-serif';
    ctx.fillText(`SERVER : ${cleanName(guild.name) || 'Server'} · ${LABELS[type]}`, W / 2, 94);

    // Podium: 2nd left, 1st center, 3rd right
    const podium = [
        { idx: 1, x: W * 0.22, y: 215, r: 58, color: '#C0C0C0', label: '2ND' },
        { idx: 0, x: W / 2,    y: 200, r: 74, color: '#F1C40F', label: '1ST' },
        { idx: 2, x: W * 0.78, y: 215, r: 58, color: '#CD7F32', label: '3RD' },
    ];

    for (const p of podium) {
        const e = entries[p.idx];
        if (!e) continue;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();

        drawAvatar(ctx, e.img, p.x, p.y, p.r, e.name);
        drawCrown(ctx, p.x, p.y, p.r + 5, p.color);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText(p.label, p.x, p.y + p.r + 32);

        ctx.fillStyle = '#F1C40F';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(e.name, p.x, p.y + p.r + 56);

        ctx.fillStyle = '#DDDDDD';
        ctx.font = '16px sans-serif';
        ctx.fillText(`${Math.floor(e.seconds / 3600)} hours`, p.x, p.y + p.r + 78);
    }

    // Rows 4 and below
    for (let i = 3; i < entries.length; i++) {
        const e = entries[i];
        const y = listStart + (i - 3) * rowGap;

        roundRect(ctx, 20, y, W - 40, 50, 12, '#1A2E3D');

        const mid = y + 25;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '20px sans-serif';
        ctx.fillText(String(i + 1), 60, mid);

        drawAvatar(ctx, e.img, 110, mid, 20, e.name);

        ctx.textAlign = 'left';
        ctx.fillText(e.name, 150, mid);

        ctx.textAlign = 'right';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(formatTime(e.seconds), W - 45, mid);
    }

    return canvas.toBuffer('image/png');
}

// ==========================================
// 8) SLASH COMMANDS AND SERVER SETUP
// ==========================================
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const commandsData = [
    new SlashCommandBuilder()
        .setName('pomodoro')
        .setDescription('Start a pomodoro timer.')
        .addIntegerOption(o => o.setName('minutes').setDescription('Length in minutes (1-180)')
            .setRequired(true).setMinValue(1).setMaxValue(180)),

    new SlashCommandBuilder()
        .setName('task')
        .setDescription('Manage your to-do list.')
        .addSubcommand(s => s.setName('add').setDescription('Add a new task.')
            .addStringOption(o => o.setName('text').setDescription('Task').setRequired(true)))
        .addSubcommand(s => s.setName('list').setDescription('List your tasks.'))
        .addSubcommand(s => s.setName('complete').setDescription('Mark a task as complete.')
            .addStringOption(o => o.setName('id').setDescription('Task ID').setRequired(true)))
        .addSubcommand(s => s.setName('delete').setDescription('Delete a task.')
            .addStringOption(o => o.setName('id').setDescription('Task ID').setRequired(true))),

    new SlashCommandBuilder().setName('balance').setDescription('Show your coin balance.'),
    new SlashCommandBuilder().setName('stats').setDescription('Show your study statistics.'),

    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Show the study leaderboard.')
        .addStringOption(o => o.setName('type').setDescription('Which leaderboard?')
            .addChoices(
                { name: 'All-time', value: 'alltime' },
                { name: 'Daily', value: 'daily' },
                { name: 'Weekly', value: 'weekly' },
            )),

    new SlashCommandBuilder()
        .setName('goal')
        .setDescription('Set a daily study goal (0 = remove).')
        .addIntegerOption(o => o.setName('minutes').setDescription('Daily goal in minutes')
            .setRequired(true).setMinValue(0).setMaxValue(720)),

    new SlashCommandBuilder().setName('shop').setDescription('Show roles you can buy with coins.'),

    new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Buy a role from the shop.')
        .addStringOption(o => o.setName('item').setDescription('Item').setRequired(true)
            .addChoices(...SHOP.map(m => ({ name: `${m.name} (${m.price} coins)`, value: m.key })))),

    new SlashCommandBuilder().setName('help').setDescription('List all commands.'),

    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user.')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('Show a user\'s warnings.')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('rulespanel')
        .setDescription('Post the rules and accept button in this channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map(c => c.toJSON());

async function registerCommands(guildId) {
    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
            { body: commandsData }
        );
        console.log(`✅ Slash commands registered (guild: ${guildId}).`);
    } catch (err) {
        console.error(`❌ Command registration error (guild: ${guildId}):`, err.message);
    }
}

async function setupGuild(guild) {
    console.log(`\n🏠 Setting up guild: ${guild.name} (${guild.id})`);
    await registerCommands(guild.id);

    try {
        await ensureChannel(guild, SETTINGS.NOTIFY_CHANNEL);
        await ensureChannel(guild, SETTINGS.WELCOME_CHANNEL);
        await ensureChannel(guild, SETTINGS.GENERAL_CHANNEL);
        await ensureChannel(guild, SETTINGS.CAM_ONLY_CHANNEL, ChannelType.GuildVoice);

        await ensureRole(guild, SETTINGS.MEMBER_ROLE, 0x57F287);
        for (const m of SHOP) await ensureRole(guild, m.role, m.color);

        await ActiveSession.deleteMany({ guildId: guild.id });
        const inVoice = [...guild.voiceStates.cache.values()]
            .filter(vs => vs.channelId && vs.member && !vs.member.user.bot);
        for (const vs of inVoice) {
            await ActiveSession.findOneAndUpdate(
                { userId: vs.id },
                { userId: vs.id, guildId: guild.id, channelId: vs.channelId, joinedAt: new Date() },
                { upsert: true }
            );
        }

        console.log(`✅ ${guild.name}: setup complete. ${inVoice.length} users in voice restored.`);
    } catch (err) {
        console.error(`❌ ${guild.name} setup error:`, err.code, err.message);
    }
}

// ==========================================
// 9) ONE-TIME IMPORT (already run, kept as a guard)
// ==========================================
async function runOneTimeImport() {
    if (await ImportLog.exists({ key: SETTINGS.IMPORT_KEY })) {
        console.log('ℹ️ Old data already imported. Skipping.');
    }
}

// ==========================================
// 10) DISCORD EVENTS
// ==========================================
client.once('clientReady', async () => {
    console.log(`🤖 ${client.user.tag} is online!`);
    client.user.setActivity('🦁 Study mode', { type: 3 });

    try {
        await runOneTimeImport();
    } catch (err) {
        console.error('❌ Import check error:', err);
    }

    for (const guild of client.guilds.cache.values()) {
        await setupGuild(guild);
    }
});

client.on('guildCreate', async guild => {
    await setupGuild(guild);
});

// ==========================================
// 11) INTERACTION HANDLER
// ==========================================
client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isButton()) return await handleButton(interaction);
        if (!interaction.isChatInputCommand()) return;
        return await handleCommand(interaction);
    } catch (err) {
        console.error('❌ Interaction error:', err);
        const reply = { content: '❌ Something went wrong. Check the console.', flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) await interaction.editReply(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
    }
});

function rulesButton() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('accept_rules')
            .setLabel('✅ I Accept the Rules')
            .setStyle(ButtonStyle.Success)
    );
}

async function handleButton(i) {
    if (i.customId !== 'accept_rules') return;
    const role = await ensureRole(i.guild, SETTINGS.MEMBER_ROLE, 0x57F287);
    if (!i.member.roles.cache.has(role.id)) {
        await i.member.roles.add(role, 'Accepted the rules');
    }
    return i.reply({
        content: '✅ You accepted the rules. Welcome to the server!',
        flags: MessageFlags.Ephemeral,
    });
}

async function handleCommand(i) {
    const { commandName: c, user } = i;

    switch (c) {
        case 'pomodoro': {
            const minutes = i.options.getInteger('minutes');
            await Pomodoro.create({
                userId: user.id,
                username: user.username,
                channelId: i.channelId,
                minutes,
                endsAt: new Date(Date.now() + minutes * 60000),
            });
            return i.reply({
                embeds: [embed('⏱️ Pomodoro Started!',
                    `**${minutes} minutes** of focus! I'll let you know in this channel when it's done.`, 0xFFA500)],
            });
        }

        case 'task': {
            await i.deferReply({ flags: MessageFlags.Ephemeral });
            const sub = i.options.getSubcommand();

            if (sub === 'add') {
                const text = i.options.getString('text');
                const task = await Task.create({ userId: user.id, description: text });
                return i.editReply(`✅ Task added: **${text}** (ID: \`${task._id}\`)`);
            }
            if (sub === 'list') {
                const tasks = await Task.find({ userId: user.id });
                if (!tasks.length) return i.editReply('📭 You have no tasks.');
                const text = tasks
                    .map(t => `${t.completed ? '✅' : '⏳'} ${t.description} (ID: \`${t._id}\`)`)
                    .join('\n');
                return i.editReply(text);
            }

            const id = i.options.getString('id');
            if (!mongoose.isValidObjectId(id)) return i.editReply('❌ Invalid task ID.');

            if (sub === 'complete') {
                const t = await Task.findOneAndUpdate({ _id: id, userId: user.id }, { completed: true });
                return i.editReply(t ? '✅ Task completed.' : '❌ No task found with that ID.');
            }
            if (sub === 'delete') {
                const t = await Task.findOneAndDelete({ _id: id, userId: user.id });
                return i.editReply(t ? '🗑️ Task deleted.' : '❌ No task found with that ID.');
            }
            return;
        }

        case 'balance':
        case 'stats': {
            const u = await User.findOne({ userId: user.id });
            if (!u) return i.reply('❌ No data yet. Start with a pomodoro or a voice study session.');

            if (c === 'balance') {
                return i.reply({
                    embeds: [embed('💰 Balance',
                        `**${u.balance}** coins\n🎯 Pomodoros: ${u.pomodoroCount}`, 0xFFD700)],
                });
            }

            const goalLine = u.dailyGoal > 0
                ? `🎯 Daily goal: **${formatTime(u.dailySec)} / ${u.dailyGoal}:00:00**`
                : '🎯 Daily goal: not set (`/goal`)';

            return i.reply({
                embeds: [embed('📊 Stats',
                    `⏱️ Total: **${formatTime(u.totalSec)}**\n` +
                    `📅 Today: **${formatTime(u.dailySec)}**\n` +
                    `📆 This week: **${formatTime(u.weeklySec)}**\n` +
                    `🔥 Streak: **${u.streak} days**\n` +
                    `${goalLine}\n` +
                    `💰 Balance: **${u.balance}** coins`, 0x9B59B6)],
            });
        }

        case 'leaderboard': {
            await i.deferReply();
            const type = i.options.getString('type') ?? 'alltime';
            const buf = await buildLeaderboardImage(type, i.guild);
            if (!buf) return i.editReply('📭 No data for this leaderboard yet.');
            return i.editReply({
                files: [new AttachmentBuilder(buf, { name: 'leaderboard.png' })],
            });
        }

        case 'goal': {
            const minutes = i.options.getInteger('minutes');
            await User.findOneAndUpdate(
                { userId: user.id },
                { $set: { dailyGoal: minutes }, $setOnInsert: { username: user.username } },
                { upsert: true }
            );
            return i.reply({
                content: minutes === 0
                    ? '🗑️ Your daily goal has been removed.'
                    : `🎯 Your daily goal is set to **${minutes} minutes**. Reach it to earn **+${SETTINGS.GOAL_BONUS} coins**!`,
                flags: MessageFlags.Ephemeral,
            });
        }

        case 'shop': {
            const shopEmbed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('🛒 Study Shop')
                .setDescription(
                    SHOP.map(m => `${m.role} — **${m.price} coins**`).join('\n') +
                    '\n\nUse `/buy` to purchase a role.'
                );
            return i.reply({ embeds: [shopEmbed] });
        }

        case 'buy': {
            const key = i.options.getString('item');
            const item = SHOP.find(m => m.key === key);
            if (!item) return i.reply({ content: '❌ Item not found.', flags: MessageFlags.Ephemeral });

            const u = await User.findOne({ userId: user.id });
            const balance = u?.balance ?? 0;
            if (balance < item.price) {
                return i.reply({
                    content: `❌ Not enough coins. Needed: **${item.price}**, you have: **${balance}**.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const role = await ensureRole(i.guild, item.role, item.color);
            if (i.member.roles.cache.has(role.id)) {
                return i.reply({ content: `ℹ️ You already have the **${item.role}** role.`, flags: MessageFlags.Ephemeral });
            }

            await i.member.roles.add(role, 'Purchased from shop');
            await User.updateOne({ userId: user.id }, { $inc: { balance: -item.price } });
            return i.reply(`🎉 <@${user.id}> bought the **${item.role}** role! (-${item.price} coins)`);
        }

        case 'help': {
            const helpEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('📖 Commands')
                .addFields(
                    { name: '⏱️ Study', value: '`/pomodoro` `/goal` `/stats` `/leaderboard`' },
                    { name: '📝 Tasks', value: '`/task add` `/task list` `/task complete` `/task delete`' },
                    { name: '💰 Economy', value: '`/balance` `/shop` `/buy`' },
                    { name: '🛡️ Moderation (staff)', value: '`/warn` `/warnings` `/rulespanel`' },
                )
                .setFooter({ text: 'You earn time and coins by studying in voice channels.' });
            return i.reply({ embeds: [helpEmbed] });
        }

        case 'warn': {
            const target = i.options.getUser('user');
            const reason = i.options.getString('reason') ?? 'Not specified';
            const member = await i.guild.members.fetch(target.id).catch(() => null);
            if (!member) return i.reply({ content: '❌ User not found in this server.', flags: MessageFlags.Ephemeral });

            const count = await warnUser(i.guild, member, reason, user.username);
            return i.reply({
                content: `✅ <@${target.id}> has been warned. Total warnings: **${count}**`,
                flags: MessageFlags.Ephemeral,
            });
        }

        case 'warnings': {
            const target = i.options.getUser('user');
            const list = await Warning.find({ guildId: i.guild.id, userId: target.id })
                .sort({ createdAt: -1 }).limit(10);
            if (!list.length) return i.reply({ content: '✅ This user has no warnings.', flags: MessageFlags.Ephemeral });

            const lines = list.map(w =>
                `• ${w.createdAt.toLocaleDateString('en-GB')} — ${w.reason} (by ${w.byName})`);
            return i.reply({
                embeds: [embed(`⚠️ Warnings for ${target.username}`, lines.join('\n'), 0xE74C3C)],
                flags: MessageFlags.Ephemeral,
            });
        }

        case 'rulespanel': {
            const rulesEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('📜 Server Rules')
                .setDescription(
                    '1. Be respectful. No insults or harassment.\n' +
                    '2. No ads or invite links.\n' +
                    '3. Turn on your camera in the cam-only room.\n' +
                    '4. No spam.\n' +
                    '5. Do not disturb others in study rooms.\n\n' +
                    'After reading the rules, press the button below.'
                );
            await i.channel.send({ embeds: [rulesEmbed], components: [rulesButton()] });
            return i.reply({ content: '✅ Rules panel posted.', flags: MessageFlags.Ephemeral });
        }
    }
}

// ==========================================
// 12) WARNINGS
// ==========================================
async function warnUser(guild, member, reason, byName) {
    await Warning.create({ guildId: guild.id, userId: member.id, reason, byName });
    const count = await Warning.countDocuments({ guildId: guild.id, userId: member.id });

    await send(guild, SETTINGS.NOTIFY_CHANNEL, {
        embeds: [embed('⚠️ Warning', `<@${member.id}> has been warned.`, 0xE67E22)
            .addFields(
                { name: 'Reason', value: reason },
                { name: 'Total warnings', value: `${count}/${SETTINGS.WARN_LIMIT}` },
                { name: 'Issued by', value: byName },
            )],
    });

    if (count >= SETTINGS.WARN_LIMIT) {
        await member.timeout(SETTINGS.WARN_TIMEOUT_MS, 'Warning limit reached')
            .catch(e => console.error('❌ Timeout error:', e.message));
        await send(guild, SETTINGS.NOTIFY_CHANNEL, {
            embeds: [embed('🔇 Automatic Timeout',
                `<@${member.id}> reached ${count} warnings and was timed out for **1 hour**.`, 0x992D22)],
        });
    }
    return count;
}

// ==========================================
// 13) VOICE STUDY AND CAM-ONLY
// ==========================================
const pendingCameraChecks = new Map();

function cancelCameraCheck(userId) {
    const t = pendingCameraChecks.get(userId);
    if (t) {
        clearTimeout(t);
        pendingCameraChecks.delete(userId);
    }
}

async function startSession(guild, member, channelId) {
    await ActiveSession.findOneAndUpdate(
        { userId: member.id },
        { userId: member.id, guildId: guild.id, channelId, joinedAt: new Date() },
        { upsert: true }
    );
}

async function endSession(guild, userId, name) {
    const session = await ActiveSession.findOneAndDelete({ userId });
    if (!session) return;

    const seconds = Math.floor((Date.now() - session.joinedAt.getTime()) / 1000);
    let todaySec = 0;
    let bonus = false;

    if (seconds > 0) {
        const coins = Math.floor(seconds / 60) * SETTINGS.VOICE_COIN_PER_MIN;
        const result = await addStudyTime(userId, name, seconds, coins);
        todaySec = result.u.dailySec;
        bonus = result.bonus;
    } else {
        todaySec = (await User.findOne({ userId }))?.dailySec ?? 0;
    }

    const summary = seconds > 0
        ? `This session: **${formatTime(seconds)}**`
        : 'This session was under 1 second';

    await sendDM(guild, userId, {
        embeds: [embed('🔴 You left the room',
            `${summary}.\n📚 Total today: **${formatTime(todaySec)}**.`, 0xE74C3C)],
    });

    if (bonus) {
        await sendDM(guild, userId, {
            embeds: [embed('🎯 Goal Reached',
                `You reached your daily goal! **+${SETTINGS.GOAL_BONUS} coins** earned.`, 0xF1C40F)],
        });
    }
}

async function voiceChannelName(state) {
    if (!state.channelId) return null;
    if (state.channel?.name) return state.channel.name;
    const ch = await state.guild.channels.fetch(state.channelId).catch(() => null);
    return ch?.name ?? null;
}

async function cameraCheck(guild, userId, channelId) {
    pendingCameraChecks.delete(userId);
    try {
        const member = await guild.members.fetch(userId);
        if (member.voice.channelId !== channelId || member.voice.selfVideo) return;

        await member.voice.setChannel(null, 'Camera off in cam-only room');

        const alert = embed('⚠️ Camera Alert',
            `<@${userId}> joined **${SETTINGS.CAM_ONLY_CHANNEL}** with the camera off and was removed.`, 0xE74C3C)
            .addFields({ name: 'What to do', value: 'Turn on your camera before joining this room again.' });

        const sent = await send(guild, SETTINGS.NOTIFY_CHANNEL, { embeds: [alert] });
        if (!sent) await sendDM(guild, userId, { embeds: [alert] });
    } catch (err) {
        console.error('❌ Cam-only check error:', err.code, err.message);
    }
}

client.on('voiceStateUpdate', async (oldState, newState) => {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;

    const userId = member.id;
    const oldChannel = oldState.channelId;
    const newChannel = newState.channelId;
    if (oldChannel === newChannel) return;

    try {
        if (!oldChannel && newChannel) {
            await startSession(newState.guild, member, newChannel);
        } else if (oldChannel && !newChannel) {
            await endSession(oldState.guild, userId, member.displayName);
        } else if (oldChannel && newChannel) {
            await ActiveSession.updateOne({ userId }, { channelId: newChannel });
        }

        if (oldChannel) cancelCameraCheck(userId);

        if (newChannel) {
            const name = await voiceChannelName(newState);
            if (name && normalize(name) === normalize(SETTINGS.CAM_ONLY_CHANNEL)) {
                const timer = setTimeout(
                    () => cameraCheck(newState.guild, userId, newChannel),
                    SETTINGS.CAMERA_CHECK_MS
                );
                pendingCameraChecks.set(userId, timer);
            }
        }
    } catch (err) {
        console.error('❌ Voice event error:', err);
    }
});

// ==========================================
// 14) MESSAGE FILTERS (invites, bad words, spam)
// ==========================================
const spamTracker = new Map();

client.on('messageCreate', async message => {
    if (!message.guild || message.author.bot || !message.member) return;
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

    const content = message.content.toLowerCase();
    const guild = message.guild;

    try {
        if (/(discord\.gg\/|discord\.com\/invite\/)/i.test(content)) {
            await message.delete().catch(() => {});
            await warnUser(guild, message.member, 'Unauthorized invite link', 'Auto moderation');
            return;
        }

        if (BAD_WORDS.some(w => content.includes(w))) {
            await message.delete().catch(() => {});
            await warnUser(guild, message.member, 'Offensive language', 'Auto moderation');
            return;
        }

        const now = Date.now();
        const recent = (spamTracker.get(message.author.id) ?? []).filter(t => now - t < SETTINGS.SPAM_WINDOW_MS);
        recent.push(now);
        spamTracker.set(message.author.id, recent);

        if (recent.length >= SETTINGS.SPAM_LIMIT) {
            spamTracker.delete(message.author.id);
            await message.member.timeout(SETTINGS.SPAM_TIMEOUT_MS, 'Spam')
                .catch(e => console.error('❌ Spam timeout error:', e.message));
            await send(guild, SETTINGS.NOTIFY_CHANNEL, {
                embeds: [embed('🚫 Spam Blocked',
                    `<@${message.author.id}> was timed out for **5 minutes** for spamming.`, 0xE74C3C)],
            });
        }
    } catch (err) {
        console.error('❌ Message filter error:', err);
    }
});

// ==========================================
// 15) WELCOME / GOODBYE
// ==========================================
client.on('guildMemberAdd', async member => {
    try {
        const channel = await findChannel(member.guild, SETTINGS.WELCOME_CHANNEL);
        if (!channel) return;
        await channel.send({
            content: `👋 Welcome <@${member.id}>! Read the rules and press the button below to accept them.`,
            components: [rulesButton()],
        });
    } catch (err) {
        console.error('❌ Welcome message error:', err);
    }
});

client.on('guildMemberRemove', async member => {
    try {
        const channel = await findChannel(member.guild, SETTINGS.WELCOME_CHANNEL);
        if (channel) await channel.send(`😢 <@${member.id}> has left the server.`);
    } catch (err) {
        console.error('❌ Goodbye message error:', err);
    }
});

// ==========================================
// 16) POMODORO TIMER (checked every 15 seconds)
// ==========================================
setInterval(async () => {
    try {
        const finished = await Pomodoro.find({ done: false, endsAt: { $lte: new Date() } });
        for (const p of finished) {
            const result = await Pomodoro.updateOne({ _id: p._id, done: false }, { done: true });
            if (result.modifiedCount === 0) continue;

            const coins = p.minutes * SETTINGS.POMODORO_COIN_PER_MIN;
            const { bonus } = await addStudyTime(p.userId, p.username, p.minutes * 60, coins);
            await User.updateOne({ userId: p.userId }, { $inc: { pomodoroCount: 1 } });

            const channel = await client.channels.fetch(p.channelId).catch(() => null);
            if (channel) {
                await channel.send({
                    embeds: [embed('🔔 Pomodoro Done!',
                        `<@${p.userId}> finished **${p.minutes} minutes** of focus. Time for a break!\n**+${coins} coins** earned.`, 0x2ECC71)],
                });
                if (bonus) {
                    await channel.send({
                        embeds: [embed('🎯 Goal Reached',
                            `<@${p.userId}> reached their daily goal! **+${SETTINGS.GOAL_BONUS} coins** earned.`, 0xF1C40F)],
                    });
                }
            }
        }
    } catch (err) {
        console.error('❌ Pomodoro check error:', err);
    }
}, 15000);

// ==========================================
// 17) SCHEDULED JOBS (Istanbul time)
// ==========================================
const schedule = { timezone: SETTINGS.TIMEZONE };

// Every day 09:00: reminder in #general
cron.schedule('0 9 * * *', async () => {
    const message = MOTIVATION[Math.floor(Math.random() * MOTIVATION.length)];
    for (const guild of client.guilds.cache.values()) {
        await send(guild, SETTINGS.GENERAL_CHANNEL, {
            embeds: [embed('🕘 Study Time!',
                `Jump into a voice channel and focus.\n\n${message}`, 0x3498DB)],
        });
    }
}, schedule);

// Every day 23:55: daily leaderboard in #study-log
cron.schedule('55 23 * * *', async () => {
    for (const guild of client.guilds.cache.values()) {
        const buf = await buildLeaderboardImage('daily', guild);
        if (buf) {
            await send(guild, SETTINGS.LOG_CHANNEL, {
                files: [new AttachmentBuilder(buf, { name: 'leaderboard.png' })],
            });
        }
    }
}, schedule);

// Every Sunday 22:00: weekly champion bonus
cron.schedule('0 22 * * 0', async () => {
    for (const guild of client.guilds.cache.values()) {
        const top = await User.find({ weekKey: weekKey(), weeklySec: { $gt: 0 } })
            .sort({ weeklySec: -1 }).limit(1);
        if (!top.length) continue;

        const champion = top[0];
        await User.updateOne({ userId: champion.userId }, { $inc: { balance: SETTINGS.WEEKLY_CHAMPION_BONUS } });

        await send(guild, SETTINGS.GENERAL_CHANNEL, {
            embeds: [embed('🏆 Weekly Champion',
                `<@${champion.userId}> is this week's top studier!\n` +
                `⏱️ **${formatTime(champion.weeklySec)}** studied and **+${SETTINGS.WEEKLY_CHAMPION_BONUS} coins** earned.`, 0xF1C40F)],
        });
    }
}, schedule);

// ==========================================
// 18) START
// ==========================================
client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('❌ Discord login failed:', err.message);
    process.exit(1);
});
