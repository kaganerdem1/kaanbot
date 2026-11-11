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
// 4) OLD HOURS DATA (one-time import, format: [userId, hours, name])
// ==========================================
const OLD_DATA = [
    ['407985263604662272', 6333.3, '✞⚕MED'],
    ['776755849782624266', 4207.7, 'MEDcram'],
    ['352482828820152321', 3253.5, 'Zaquastix'],
    ['381153228902891520', 3072.2, 'Loister'],
    ['1125719040065814528', 2813.7, 'miri'],
    ['1304483866848792598', 2784.7, 'F'],
    ['234358747865153537', 2714.4, 'Krautroller Ψ'],
    ['586821233153409034', 2527.9, 'Emmergency Doctor'],
    ['454147736963383316', 2472.6, 'アレハンドロ'],
    ['1099423711884488806', 2312.9, 'Chantal | Watch Me Succeed'],
    ['897550814497886279', 2280.2, 'La passion des études'],
    ['911322132951212073', 2229.5, '9raya SFERRRR kbir'],
    ['813363145312829451', 2138.7, 'Tahereh'],
    ['1050372046636449832', 2037.4, 'SENKU'],
    ['716624831910641695', 1836, 'annmurielle | law'],
    ['718462416727572520', 1758.2, 'lim~~'],
    ['383678329112363009', 1625.5, 'Olibo'],
    ['876493596205940786', 1419.6, '𝒥ℴℴ𝒳'],
    ['862268285726097408', 1387.5, 'sapelfoel'],
    ['1045042956450664508', 1380.6, '0.0083'],
    ['515236869156634636', 1255.3, 'MłZØ'],
    ['1167525465150476311', 1205.4, 'Cardiology killed me 💀'],
    ['751301714442846229', 1188.5, 'cxdrn'],
    ['394646928861954048', 1095.8, 'studypassion'],
    ['871840088533893170', 1091, 'Lasss'],
    ['763094794476978216', 842.1, 'Dr. EMMA'],
    ['1451568663474737246', 755.4, 'Malk'],
    ['981975900566487100', 728.1, 'Taif med'],
    ['508602053980061727', 670.7, 'Last survivor.'],
    ['224060219540373505', 662.8, 'Challenger mentalitates'],
    ['523137665718288386', 643.7, 'slider man'],
    ['697281170550816839', 615.7, 'Lau'],
    ['1112390428197666888', 613, 'V'],
    ['975891016139808839', 572.9, 'Tout va bien /Med'],
    ['282639365098700800', 567.1, 'meBrainRot :('],
    ['1340019379689095341', 550.8, 'Aseel'],
    ['1172925890334838839', 540.3, 'Buse'],
    ['774618032697638922', 534.1, 'ARCHOU'],
    ['683776029994778651', 529.1, 'P(aquastix)'],
    ['1077239656460058654', 522.1, 'noor | software_eng'],
    ['818158192466329610', 483.8, null],
    ['800795913467199539', 481.8, '🕊 analysis paralysis'],
    ['726565665074446346', 404.7, null],
    ['793098682593312798', 403.2, 'Aymen'],
    ['1168248570684653642', 381.2, 'väsby'],
    ['421097004463030273', 369.5, 'Stefa / 22th July exam'],
    ['774665669492998144', 363.7, 'Jayzxyk'],
    ['1132039900515020810', 301.6, 'thiziri 🌚'],
    ['1151766417063034890', 301.5, 'ZaZu | Med Lab'],
    ['432826481501274123', 281, 'Nik-IT Guy'],
    ['1124392518973407312', 275.2, 'Dado'],
    ['175957908893335552', 265.3, null],
    ['287330235345666052', 243.3, 'Kin'],
    ['300739581521690625', 238.5, 'Anakinra'],
    ['783450655661490236', 238, 'Hamtaro'],
    ['771820713711632426', 219.9, 'Future Doctor'],
    ['1072165159734349876', 206.7, 'Salsabil 8h/?'],
    ['1170223222864740382', 205.1, 'Mo | med'],
    ['967432034240856085', 204.4, 'Manel RAZALI'],
    ['773161111998300172', 193.1, 'moh'],
    ['872376987690344458', 181.8, 'engi'],
    ['936542368453263382', 166.9, 'Kin'],
    ['700044029697458256', 161, null],
    ['768494868539375656', 160.5, 'sab'],
    ['1185640303210795089', 146.1, 'S'],
    ['746437143873978470', 142.8, 'sheep it!'],
    ['1470587329801359543', 136.7, 'n'],
    ['332482487148216324', 135.1, 'NullPointerException'],
    ['688405021703798847', 128.7, 'nicosantos_'],
    ['781632632558714881', 124, 'solitaireaddicted'],
    ['725681979324104714', 121.6, 'MKH'],
    ['480490969188401153', 118.3, 'Rd'],
    ['866769831885275186', 118.1, 'M/PED'],
    ['819539883454234634', 102.6, 'faty'],
    ['1000033731454713978', 90, 'Almasah'],
    ['1382097104645787720', 89.4, '8o8'],
    ['887459831030624256', 69.9, 'mrkennedi'],
    ['932353443434213396', 66.5, null],
    ['766050769656741888', 65.1, 'imane_ezz'],
    ['1340023711243309106', 61.4, 'Jana'],
    ['740715348831240242', 55.4, null],
    ['692706382830370888', 55, 'Aly | Virologist 🦠🧬🔬'],
    ['1498393795924856884', 54, 'D-56'],
    ['1260742211671166978', 48.3, '!     ℳ'],
    ['406889231504637953', 47.7, 'jusdepomme1'],
    ['1282852018590974044', 44.9, 'Mezi'],
    ['511195089071112203', 44.7, 'Iman'],
    ['1359480216208281613', 44.6, null],
    ['722463670445146122', 44, 'Dr.Ahmed El-beltagy 🇪🇬 🇵🇸'],
    ['694477683177947227', 43.9, 'gali.leonie'],
    ['1161008684101533737', 41.3, 'Study now, be proud later!'],
    ['1233677499905343512', 40.9, 'onlytot'],
    ['983002343006142514', 38.8, 'rokaya5138'],
    ['758651308797460491', 37.8, 'Omar'],
    ['796634545139089439', 36.9, 'clindamycin_.'],
    ['415198418391138307', 35.6, 'Salah akh'],
    ['1034905911430500424', 33.7, 'ahmedabdaleem'],
    ['743218842183925780', 31.8, 'Mehdiiiiiii'],
    ['1036049399597506622', 29.3, 'Portogas D Ace'],
    ['1365026101218246749', 26, 'Ines'],
    ['717563234286043176', 25.7, null],
    ['903064782607892520', 25.7, null],
    ['652119051128143882', 24, 'itznwll'],
    ['1067852753013059584', 23.4, null],
    ['494018881569030154', 23.2, '𝙻𝚎𝚗𝚒 | Telecom'],
    ['1049753004313677874', 23.1, 'far.13'],
    ['711101416206368768', 22.5, null],
    ['928404119469838337', 22.1, 'tranquilxeno'],
    ['972199884730028053', 21.1, 'y8sl3x.p11'],
    ['706474742961668126', 20.2, 'Meynella'],
    ['453578406420938763', 19.1, null],
    ['766638049521172500', 18.6, '_melisa_'],
    ['1187623343722074165', 18.4, 'blue_cheez🍉'],
    ['585452550195773450', 18, 'saynt |'],
    ['773503169509589013', 18, null],
    ['1307107258773143626', 17.9, 'FINALS I محمد'],
    ['1296552578984972340', 17.7, null],
    ['926965669038293062', 16, 'Blessed/ MED Peds'],
    ['786492825490554891', 14, null],
    ['748152510258348085', 13.4, 'm_khxn4'],
    ['262278992596434946', 13.3, null],
    ['1239496877754552411', 13, 'serine0751'],
    ['1518524921800560677', 11.8, 'FF2'],
    ['1241789132523442278', 11.6, 'sherook25'],
    ['1168587533773439107', 11.5, null],
    ['805097559580082186', 11.1, 'aiden__2020'],
    ['843174547683672064', 10.9, '.shinon._.'],
    ['1152478082771468380', 10.8, 'spidfi'],
    ['1512886148194898050', 10.7, 'Sabriiine'],
    ['1115040752825811014', 10.6, 'Jassmine'],
    ['1407087636698497177', 10.5, 'halosha'],
    ['715701620754743367', 10.4, null],
    ['830011356258369578', 10.3, '.A.N.D.R.O.S.K.O.T.S'],
    ['453737913688129536', 9.4, 'Reeck_A49'],
    ['315999773192880130', 8.6, 'sulfl'],
    ['949633712486764565', 8.3, 'Besmala'],
    ['345314408823783426', 7.7, 'lauralbumine'],
    ['704112251660927097', 7.7, null],
    ['886092098233835520', 7.6, 'loudsirens'],
    ['716862856556970065', 6.7, '_.ahmedtsu'],
    ['889953903284723772', 6.7, 'afya7'],
    ['1196614731625136190', 6.6, null],
    ['592340867071606794', 6.5, 'ℝoωαη'],
    ['956441943796236332', 6.5, 'Igni'],
    ['1143563251330850958', 6.2, 'Luffy'],
    ['1204484294182178896', 6, 'Miwa'],
    ['611290385838374987', 5.6, '𝓐𝓱𝓶𝓪𝓭'],
    ['332311757366231042', 5.5, null],
    ['1339663325126201354', 5.5, 'Ismail chakiry'],
    ['720650325354086422', 5.4, 'Swinky'],
    ['1192840845947310200', 5.2, 'ffadoua'],
    ['1261788129652772894', 5.2, 'rymsab'],
    ['1453536808880312335', 4.8, 'Mila'],
    ['695599755606097981', 4.6, null],
    ['541168284217901056', 4.4, 'Denis :)  -  [management exam]'],
    ['1071481833876897885', 4.2, 'nyxrmtascpi'],
    ['1384671644945223711', 4.2, 'Ramaaa'],
    ['1479588320546918573', 3.9, 'Consistentitis'],
    ['709014020073455649', 3.8, 'Assa'],
    ['1458200046213267487', 3.8, 'DUHA'],
    ['922553082024431636', 3.7, '-DNA'],
    ['1526422669489344654', 3.7, '𝗙𝗥𝗢𝗟𝗬 𝘀𝘁𝘂𝗱𝗶𝗼 🐸'],
    ['764603683744645131', 3.6, null],
    ['321829342692900864', 3.5, null],
    ['1090603684993450074', 3.4, 'af.co83'],
    ['764210222155563021', 3.3, null],
    ['1452012431399325859', 3.3, null],
    ['778609496423137320', 3.2, 'Ali7dr.'],
    ['1324490598865961154', 3.2, 'l9q_w'],
    ['1510992841512452311', 3.2, '𝒥ℴℴ𝒳'],
    ['1300813745986994226', 2.8, null],
    ['815154370240577536', 2.4, 'u.l2'],
    ['985068081636315136', 2.3, 'lokiii | exam tom'],
    ['330043632579248129', 1.8, '.ahmed._'],
    ['575339422862671874', 1.7, 'Hashem'],
    ['1056631108919377972', 1.7, null],
    ['1313907308111204492', 1.7, 'shahrzad'],
    ['472396483040116759', 1.6, 'Jad'],
    ['1053748505786720347', 1.6, null],
    ['1225298380834734163', 1.5, null],
    ['1286694887688769566', 1.5, 'yagamii1'],
    ['436912833867939840', 1.4, null],
    ['669981101263159296', 1.4, null],
    ['933001107783942164', 1.4, 'chaymaes'],
    ['1234450023014596678', 1.3, 'Salim Asigma'],
    ['1240475020728209458', 1.3, 'afia220'],
    ['379970762599038978', 1.2, 'Chicken Nuggie'],
    ['949263142154813491', 1.2, 'Lama'],
    ['1049889835122442363', 1.2, 'iftekhar3496'],
    ['829780179022905395', 1.1, '♾️'],
    ['1132435451001700372', 1.1, 'brenokid'],
    ['506508682633412614', 1, 'batoubatou'],
    ['1136250205466021988', 1, null],
    ['1265257909386739777', 1, 'amine'],
    ['1283755210434416696', 1, 'asmaa00956'],
    ['354224531256377344', 0.9, null],
    ['1492965648383610892', 0.8, 'حسن كوبايه 🥃'],
    ['756444615510327306', 0.7, 'Aphrodite'],
    ['829707332006969384', 0.7, 'Fully'],
    ['853025392176660500', 0.7, '☾✰𝕶𝖊𝖙𝖚𝖗𝕾𝖆𝖒☾✰'],
    ['1200413764978225343', 0.7, null],
    ['1279187471225196627', 0.7, 'Vinicius senior'],
    ['564078173709402120', 0.6, 'pollux'],
    ['896741147949531176', 0.6, null],
    ['1372676410140917852', 0.6, 'Khadija_wh'],
    ['397254074883375125', 0.5, null],
    ['688733026175287369', 0.5, 'ZeyaD'],
    ['839847895133323306', 0.5, 'Sarah'],
    ['1054545302490710188', 0.5, 'ANAS AZ'],
    ['1203833794998829056', 0.5, null],
    ['735956640968343553', 0.4, null],
    ['1449676313576210476', 0.4, '𝒮𝒶𝓀𝓊𝓂𝒾'],
    ['266336803366109184', 0.3, null],
    ['1174303727847493688', 0.3, '☆'],
    ['1252633787100041375', 0.3, 'السَّمْهَرِيّ'],
    ['1294352407626645648', 0.3, null],
    ['1423059090791338048', 0.3, '✭'],
    ['352493942417391617', 0.2, null],
    ['434441805413613568', 0.2, 'ellyne'],
    ['670555827735887882', 0.2, 'salsani'],
    ['710686572500090940', 0.2, 'boody0618'],
    ['754660640907591751', 0.2, 'walidthebatata'],
    ['937749939373608971', 0.2, 'aytesnim'],
    ['1250952007846723645', 0.2, 'ammar_81493'],
    ['1419804867307769998', 0.2, null],
    ['358361062581469194', 0.1, null],
    ['360873255898316802', 0.1, 'LeSangDeLaVeine'],
    ['494496640162332672', 0.1, null],
    ['693222497029586985', 0.1, null],
    ['1255947828099022859', 0.1, '_dayoneee'],
    ['1289668236677480571', 0.1, null],
    ['1301907027689472101', 0.1, null],
    ['1525437412875046944', 0.1, 'assilll'],
    ['1556037772048072815', 0.1, 'sandy'],
    ['305095502863794177', 0, null],
    ['701861492093354135', 0, 'ultra_stitious_cinnamus_cookius'],
    ['706048686131773440', 0, 'nattt'],
    ['722010017250934804', 0, 'Moon ♡'],
    ['725544472800264203', 0, 'ahmedsalah0015'],
    ['760595536154984538', 0, 'lateef5371'],
    ['812370055865171968', 0, null],
    ['1065638421512605787', 0, 'Masa miso'],
    ['1232232155724251218', 0, null],
    ['1245662193903599661', 0, null],
    ['1247608688831762604', 0, 'Gurilla'],
    ['1332732027291701313', 0, null],
    ['1369931278366937199', 0, 'abderrahim.sar'],
    ['1405541453530140672', 0, null],
    ['1451197970774229259', 0, null],
    ['1464754208388419664', 0, 'logic'],
];

// ==========================================
// 5) DATABASE MODELS (times stored in seconds)
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
// 6) DISCORD CLIENT
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
// 7) HELPERS
// ==========================================
function dayKey(date = new Date(), dayOffset = 0) {
    const t = new Date(date.getTime() + dayOffset * 86400000);
    return t.toLocaleDateString('en-CA', { timeZone: SETTINGS.TIMEZONE });
}

// Monday-based week key
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

const normalize = s => s.normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

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

// Sends to an existing channel. Does not create it if missing.
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
// 8) ONE-TIME DATA IMPORT
// Adds old hours to totalSec. Runs once, guarded by ImportLog.
// ==========================================
async function runOneTimeImport() {
    if (await ImportLog.exists({ key: SETTINGS.IMPORT_KEY })) {
        console.log('ℹ️ Old data already imported. Skipping.');
        return;
    }

    let written = 0;
    for (const [userId, hours, name] of OLD_DATA) {
        const seconds = Math.round(Number(hours) * 3600);
        if (!Number.isFinite(seconds) || seconds <= 0) continue;

        await User.findOneAndUpdate(
            { userId },
            {
                $inc: { totalSec: seconds },
                $setOnInsert: { username: name || 'Unknown', balance: 0 },
            },
            { upsert: true, setDefaultsOnInsert: true }
        );
        written++;
    }

    await ImportLog.create({ key: SETTINGS.IMPORT_KEY, count: written });
    console.log(`✅ Old data imported: ${written} users.`);
}

// ==========================================
// 9) LEADERBOARD IMAGE
// Names come from Discord (current server display name).
// ==========================================

// Keeps only characters the canvas can draw
function cleanName(s) {
    if (!s) return '';
    return String(s)
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .replace(/[^\p{L}\p{N} ._\-|'()\[\]]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Server display name → Discord username → stored name → fallback
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
    daily: 'DAILY',
    weekly: 'WEEKLY',
    alltime: 'ALL-TIME',
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
    ctx.fillText('PRODUCTIVITY LEADERBOARD', W / 2, 62);

    ctx.fillStyle = '#DDDDDD';
    ctx.font = '18px sans-serif';
    ctx.fillText(`SERVER : ${cleanName(guild.name) || 'Server'} · ${LABELS[type] ?? ''}`, W / 2, 94);

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
// 10) SLASH COMMANDS AND SERVER SETUP
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
        .setDescription("Show a user's warnings.")
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('rulespanel')
        .setDescription('Post the rules and accept button in this channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map(c => c.toJSON());

// Removes old GLOBAL slash commands (e.g. old Turkish ones still shown in Discord)
async function deleteGlobalCommands() {
    try {
        const globalCmds = await rest.get(Routes.applicationCommands(process.env.CLIENT_ID));
        for (const cmd of globalCmds) {
            await rest.delete(Routes.applicationCommand(process.env.CLIENT_ID, cmd.id));
            console.log(`🗑️ Deleted old global command: /${cmd.name}`);
        }
        if (!globalCmds.length) console.log('ℹ️ No old global commands found.');
    } catch (err) {
        console.error('❌ Could not delete global commands:', err.message);
    }
}

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

        // Restore sessions for users currently in voice channels
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
// 11) DISCORD EVENTS
// ==========================================
client.once('clientReady', async () => {
    console.log(`🤖 ${client.user.tag} is online!`);
    client.user.setActivity('🦁 Study mode', { type: 3 });

    try {
        await runOneTimeImport();
    } catch (err) {
        console.error('❌ Import error:', err);
    }

    await deleteGlobalCommands();

    for (const guild of client.guilds.cache.values()) {
        await setupGuild(guild);
    }
});

client.on('guildCreate', async guild => {
    await setupGuild(guild);
});

// ==========================================
// 12) INTERACTION HANDLER
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
// 13) WARNINGS
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
// 14) VOICE STUDY AND CAM-ONLY
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
// 15) MESSAGE FILTERS (invites, bad words, spam)
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
// 16) WELCOME / GOODBYE
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
// 17) POMODORO TIMER (checked every 15 seconds)
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
// 18) SCHEDULED JOBS (Istanbul time)
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
// 19) START
// ==========================================
client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('❌ Discord login failed:', err.message);
    process.exit(1);
});
