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
// 1) ORTAM DEĞİŞKENLERİ KONTROLÜ
// ==========================================
const GEREKLI_ENV = ['DISCORD_TOKEN', 'CLIENT_ID', 'MONGO_URI'];
const eksikEnv = GEREKLI_ENV.filter(k => !process.env[k]);
if (eksikEnv.length) {
    console.error(`❌ Eksik ortam değişkenleri: ${eksikEnv.join(', ')}`);
    console.error('   Render → Environment sekmesinden ekleyip Manual Deploy yap.');
    process.exit(1);
}

// ==========================================
// 2) WEB SUNUCUSU (Render PORT'u zorunlu tutar)
// ==========================================
const app = express();
app.get('/', (req, res) => res.send('Bot Aktif!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Web sunucusu ${PORT} portunda çalışıyor.`));

process.on('unhandledRejection', err => console.error('❌ Yakalanmamış hata:', err));
process.on('uncaughtException', err => console.error('❌ Yakalanmamış istisna:', err));

// ==========================================
// 3) AYARLAR
// ==========================================
const AYAR = {
    BILDIRIM_ADI: 'bildirim',
    KAYIT_ADI: 'calisma-kayit',
    KARSILAMA_ADI: 'welcome-bye',
    GENEL_ADI: 'genel',
    CAM_ONLY: 'cam-only',
    UYE_ROL: 'Üye',
    KAMERA_BEKLEME_MS: 5000,
    SAAT_DILIMI: 'Europe/Istanbul',
    POMODORO_COIN_DK: 2,
    SESLI_COIN_DK: 1,
    HEDEF_BONUS: 50,
    HAFTA_SAMPIYON_BONUS: 200,
    LIDERLIK_LIMIT: 30,
    UYARI_LIMITI: 3,
    UYARI_CEZA_MS: 60 * 60 * 1000,
    SPAM_LIMIT: 5,
    SPAM_SURE_MS: 5000,
    SPAM_CEZA_MS: 5 * 60 * 1000,
};

// Küçük harfle yaz. Kendi kelimelerini ekle.
const KUFUR_LISTESI = ['ornekkufur1', 'ornekkufur2'];

const MARKET = [
    { key: 'bronz', ad: 'Bronz Çalışkan', fiyat: 300, rol: '🥉 Bronz Çalışkan', renk: 0xCD7F32 },
    { key: 'gumus', ad: 'Gümüş Çalışkan', fiyat: 1000, rol: '🥈 Gümüş Çalışkan', renk: 0xC0C0C0 },
    { key: 'altin', ad: 'Altın Çalışkan', fiyat: 3000, rol: '🥇 Altın Çalışkan', renk: 0xFFD700 },
];

const MOTIVASYON = [
    '🌱 Küçük adımlar da büyük yolculukların başlangıcıdır. Bugün bir pomodoro dene!',
    '🔥 Disiplin, istediğin şeyle yaptığın şey arasındaki köprüdür.',
    '📚 Bir sayfa, bir konu, bir soru. Bugün ne kadar ilerlersen o kadar kazanırsın.',
    '🦁 Odaya gir, kamerayı aç, işine odaklan!',
    '⏳ Telefonu uzaklaştır, 25 dakika yeter.',
];

// ==========================================
// 4) VERİTABANI MODELLERİ
// ==========================================
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: { type: String, default: 'Bilinmeyen' },
    totalSec: { type: Number, default: 0 },
    dailySec: { type: Number, default: 0 },
    weeklySec: { type: Number, default: 0 },
    lastStudyDate: { type: String, default: '' },
    weekKey: { type: String, default: '' },
    streak: { type: Number, default: 0 },
    lastActiveDate: { type: String, default: '' },
    dailyGoal: { type: Number, default: 0 },
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
    username: { type: String, default: 'Bilinmeyen' },
    channelId: { type: String, required: true },
    minutes: { type: Number, required: true },
    endsAt: { type: Date, required: true },
    done: { type: Boolean, default: false },
});
const Pomodoro = mongoose.model('Pomodoro', pomodoroSchema);

const warningSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    reason: { type: String, default: 'Belirtilmedi' },
    byName: { type: String, default: 'Bilinmeyen' },
    createdAt: { type: Date, default: Date.now },
});
const Warning = mongoose.model('Warning', warningSchema);

// ==========================================
// 5) MONGODB BAĞLANTISI (ayrı loglu)
// ==========================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB bağlantısı başarılı.'))
    .catch(err => console.error('❌ MongoDB bağlantı hatası:', err.message));

// ==========================================
// 6) DISCORD İSTEMCİSİ
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

// ==========================================
// 7) YARDIMCI FONKSİYONLAR
// ==========================================
const normalize = s => s.normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

function gunAnahtari(tarih = new Date(), gunFarki = 0) {
    const t = new Date(tarih.getTime() + gunFarki * 86400000);
    return t.toLocaleDateString('en-CA', { timeZone: AYAR.SAAT_DILIMI });
}

function haftaAnahtari() {
    const [y, m, d] = gunAnahtari().split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const gecen = (dt.getUTCDay() + 6) % 7;
    dt.setUTCDate(dt.getUTCDate() - gecen);
    return dt.toISOString().slice(0, 10);
}

function formatSure(saniye) {
    const s = Math.max(0, Math.floor(saniye));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sn = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(sn).padStart(2, '0')}`;
}

async function kanalBul(guild, ad, tip = ChannelType.GuildText) {
    const liste = await guild.channels.fetch();
    const hedef = normalize(ad);
    return liste.find(c => c && c.type === tip && normalize(c.name) === hedef) ?? null;
}

async function kanalGarantile(guild, ad, tip = ChannelType.GuildText) {
    const mevcut = await kanalBul(guild, ad, tip);
    if (mevcut) return mevcut;
    console.log(`🛠️ "${ad}" kanalı oluşturuluyor...`);
    return guild.channels.create({ name: ad, type: tip, reason: 'Bot otomatik kurulum' });
}

async function rolGarantile(guild, ad, renk) {
    await guild.roles.fetch();
    const mevcut = guild.roles.cache.find(r => r.name === ad);
    if (mevcut) return mevcut;
    console.log(`🛠️ "${ad}" rolü oluşturuluyor...`);
    return guild.roles.create({ name: ad, color: renk, reason: 'Bot otomatik rol' });
}

async function gonder(guild, ad, payload) {
    try {
        const kanal = await kanalBul(guild, ad);
        if (!kanal) return false;
        await kanal.send(payload);
        return true;
    } catch (err) {
        console.error(`❌ "${ad}" kanalına gönderilemedi:`, err.code, err.message);
        return false;
    }
}

async function ozelGonder(guild, userId, payload) {
    try {
        const uye = await guild.members.fetch(userId);
        await uye.send(payload);
        return true;
    } catch (err) {
        console.error(`❌ Özel mesaj gönderilemedi (${userId}):`, err.message);
        return false;
    }
}

function bildirimEmbed(baslik, aciklama, renk = 0xE74C3C) {
    return new EmbedBuilder()
        .setColor(renk)
        .setTitle(baslik)
        .setDescription(aciklama)
        .setTimestamp();
}

async function calismaEkle(userId, ad, saniye, coin) {
    const bugun = gunAnahtari();
    const hafta = haftaAnahtari();
    const dun = gunAnahtari(new Date(), -1);

    let u = await User.findOne({ userId });
    if (!u) u = new User({ userId, username: ad });

    if (u.lastStudyDate !== bugun) { u.dailySec = 0; u.lastStudyDate = bugun; }
    if (u.weekKey !== hafta) { u.weeklySec = 0; u.weekKey = hafta; }
    u.username = ad;

    u.dailySec += saniye;
    u.weeklySec += saniye;
    u.totalSec += saniye;
    u.balance += coin;

    if (u.lastActiveDate !== bugun) {
        u.streak = u.lastActiveDate === dun ? u.streak + 1 : 1;
        u.lastActiveDate = bugun;
    }

    let bonus = false;
    if (u.dailyGoal > 0 && u.dailySec >= u.dailyGoal * 60 && u.goalRewardDate !== bugun) {
        u.balance += AYAR.HEDEF_BONUS;
        u.goalRewardDate = bugun;
        bonus = true;
    }

    await u.save();
    return { u, bonus };
}

// ==========================================
// 8) LİDERLİK TABLOSU (resim)
// ==========================================
function siralamaSorgusu(tur) {
    if (tur === 'haftalik') {
        return { alan: 'weeklySec', filtre: { weekKey: haftaAnahtari(), weeklySec: { $gt: 0 } } };
    }
    if (tur === 'toplam') {
        return { alan: 'totalSec', filtre: { totalSec: { $gt: 0 } } };
    }
    return { alan: 'dailySec', filtre: { lastStudyDate: gunAnahtari(), dailySec: { $gt: 0 } } };
}

async function avatarYukle(url) {
    try {
        const cevap = await fetch(url);
        const buf = Buffer.from(await cevap.arrayBuffer());
        return await loadImage(buf);
    } catch {
        return null;
    }
}

function yuvarlakAvatar(ctx, img, x, y, r, harf) {
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
        ctx.fillText((harf || '?').charAt(0).toUpperCase(), x, y + 2);
    }
    ctx.restore();
}

function yuvarlakDikdortgen(ctx, x, y, w, h, r, renk) {
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
    ctx.fillStyle = renk;
    ctx.fill();
}

function tacCiz(ctx, x, yMerkez, r, renk) {
    const g = r * 1.2;
    const taban = yMerkez - r + 4;
    const tepe = yMerkez - r - 30;
    ctx.beginPath();
    ctx.moveTo(x - g / 2, taban);
    ctx.lineTo(x - g / 2, tepe + 12);
    ctx.lineTo(x - g / 4, tepe + 24);
    ctx.lineTo(x, tepe);
    ctx.lineTo(x + g / 4, tepe + 24);
    ctx.lineTo(x + g / 2, tepe + 12);
    ctx.lineTo(x + g / 2, taban);
    ctx.closePath();
    ctx.fillStyle = renk;
    ctx.fill();
}

async function liderlikGorseli(tur, guild) {
    const s = siralamaSorgusu(tur);
    const liste = await User.find(s.filtre).sort({ [s.alan]: -1 }).limit(AYAR.LIDERLIK_LIMIT);
    if (!liste.length) return null;

    const veri = await Promise.all(liste.map(async u => {
        const uye = await guild.members.fetch(u.userId).catch(() => null);
        const img = uye
            ? await avatarYukle(uye.user.displayAvatarURL({ extension: 'png', size: 128 }))
            : null;
        return { ad: uye?.displayName ?? u.username, img, sure: u[s.alan] };
    }));

    const W = 800;
    const satirBaslangic = 360;
    const satirAralik = 60;
    const satirSayisi = Math.max(0, veri.length - 3);
    const H = satirBaslangic + satirSayisi * satirAralik + 20;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#10202C';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#F1C40F';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText('PRODUCTIVITY LEADERBOARD', W / 2, 62);

    ctx.fillStyle = '#DDDDDD';
    ctx.font = '18px sans-serif';
    ctx.fillText(`SERVEUR : ${guild.name}`, W / 2, 94);

    const podyum = [
        { idx: 1, x: W * 0.22, y: 215, r: 58, renk: '#C0C0C0', etiket: '2ND' },
        { idx: 0, x: W / 2,    y: 200, r: 74, renk: '#F1C40F', etiket: '1ST' },
        { idx: 2, x: W * 0.78, y: 215, r: 58, renk: '#CD7F32', etiket: '3RD' },
    ];

    for (const p of podyum) {
        const kisi = veri[p.idx];
        if (!kisi) continue;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2);
        ctx.fillStyle = p.renk;
        ctx.fill();

        yuvarlakAvatar(ctx, kisi.img, p.x, p.y, p.r, kisi.ad);
        tacCiz(ctx, p.x, p.y, p.r + 5, p.renk);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText(p.etiket, p.x, p.y + p.r + 32);

        ctx.fillStyle = '#F1C40F';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(kisi.ad.slice(0, 18), p.x, p.y + p.r + 56);

        ctx.fillStyle = '#DDDDDD';
        ctx.font = '16px sans-serif';
        ctx.fillText(`${Math.floor(kisi.sure / 3600)} saat`, p.x, p.y + p.r + 78);
    }

    for (let i = 3; i < veri.length; i++) {
        const kisi = veri[i];
        const y = satirBaslangic + (i - 3) * satirAralik;

        yuvarlakDikdortgen(ctx, 20, y, W - 40, 50, 12, '#1A2E3D');

        const orta = y + 25;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '20px sans-serif';
        ctx.fillText(String(i + 1), 60, orta);

        yuvarlakAvatar(ctx, kisi.img, 110, orta, 20, kisi.ad);

        ctx.textAlign = 'left';
        ctx.fillText(kisi.ad.slice(0, 32), 150, orta);

        ctx.textAlign = 'right';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(formatSure(kisi.sure), W - 45, orta);
    }

    return canvas.toBuffer('image/png');
}

// ==========================================
// 9) SUNUCU KURULUMU VE SLASH KOMUTLARI
// ==========================================
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const commandsData = [
    new SlashCommandBuilder()
        .setName('pomodoro')
        .setDescription('Pomodoro zamanlayıcısını başlatır.')
        .addIntegerOption(o => o.setName('sure').setDescription('Süre (dakika, 1-180)')
            .setRequired(true).setMinValue(1).setMaxValue(180)),

    new SlashCommandBuilder()
        .setName('gorev')
        .setDescription('Yapılacaklar listenizi yönetin.')
        .addSubcommand(s => s.setName('ekle').setDescription('Yeni görev ekleyin.')
            .addStringOption(o => o.setName('gorev').setDescription('Görev').setRequired(true)))
        .addSubcommand(s => s.setName('liste').setDescription('Görevleri listeleyin.'))
        .addSubcommand(s => s.setName('tamamla').setDescription('Görevi tamamla.')
            .addStringOption(o => o.setName('id').setDescription('Görev ID').setRequired(true)))
        .addSubcommand(s => s.setName('sil').setDescription('Görevi sil.')
            .addStringOption(o => o.setName('id').setDescription('Görev ID').setRequired(true))),

    new SlashCommandBuilder().setName('bakiye').setDescription('Coin bakiyenizi gösterir.'),
    new SlashCommandBuilder().setName('istatistik').setDescription('Çalışma istatistiklerinizi gösterir.'),

    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Çalışma liderlik tablosunu gösterir.')
        .addStringOption(o => o.setName('tur').setDescription('Hangi tablo?')
            .addChoices(
                { name: 'Günlük', value: 'gunluk' },
                { name: 'Haftalık', value: 'haftalik' },
                { name: 'Tüm zamanlar', value: 'toplam' },
            )),

    new SlashCommandBuilder()
        .setName('hedef')
        .setDescription('Günlük çalışma hedefi belirle (0 = kaldır).')
        .addIntegerOption(o => o.setName('dakika').setDescription('Günlük hedef (dakika)')
            .setRequired(true).setMinValue(0).setMaxValue(720)),

    new SlashCommandBuilder().setName('market').setDescription('Coin ile satın alınabilecek rolleri gösterir.'),

    new SlashCommandBuilder()
        .setName('satinal')
        .setDescription('Marketten rol satın al.')
        .addStringOption(o => o.setName('urun').setDescription('Ürün').setRequired(true)
            .addChoices(...MARKET.map(m => ({ name: `${m.ad} (${m.fiyat} coin)`, value: m.key })))),

    new SlashCommandBuilder().setName('yardim').setDescription('Tüm komutları listeler.'),

    new SlashCommandBuilder()
        .setName('uyar')
        .setDescription('Bir kullanıcıya uyarı verir.')
        .addUserOption(o => o.setName('kullanici').setDescription('Kullanıcı').setRequired(true))
        .addStringOption(o => o.setName('sebep').setDescription('Uyarı sebebi'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('uyarilar')
        .setDescription('Kullanıcının uyarılarını gösterir.')
        .addUserOption(o => o.setName('kullanici').setDescription('Kullanıcı').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('kuralpanel')
        .setDescription('Kuralları ve onay butonunu bu kanala gönderir.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map(c => c.toJSON());

async function komutlariKaydet(guildId) {
    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
            { body: commandsData }
        );
        console.log(`✅ Slash komutları kaydedildi (sunucu: ${guildId}).`);
    } catch (err) {
        console.error(`❌ Komut kaydetme hatası (sunucu: ${guildId}):`, err.message);
    }
}

async function sunucuyuKur(guild) {
    console.log(`\n🏠 Sunucu kuruluyor: ${guild.name} (${guild.id})`);
    await komutlariKaydet(guild.id);

    try {
        // calisma-kayit bilerek burada yok. Kullanıcı elle oluşturur.
        await kanalGarantile(guild, AYAR.BILDIRIM_ADI);
        await kanalGarantile(guild, AYAR.KARSILAMA_ADI);
        await kanalGarantile(guild, AYAR.GENEL_ADI);
        await kanalGarantile(guild, AYAR.CAM_ONLY, ChannelType.GuildVoice);

        await rolGarantile(guild, AYAR.UYE_ROL, 0x57F287);
        for (const m of MARKET) await rolGarantile(guild, m.rol, m.renk);

        await ActiveSession.deleteMany({ guildId: guild.id });
        const sesteki = [...guild.voiceStates.cache.values()]
            .filter(vs => vs.channelId && vs.member && !vs.member.user.bot);
        for (const vs of sesteki) {
            await ActiveSession.findOneAndUpdate(
                { userId: vs.id },
                { userId: vs.id, guildId: guild.id, channelId: vs.channelId, joinedAt: new Date() },
                { upsert: true }
            );
        }

        console.log(`✅ ${guild.name}: kurulum tamam. Sesteki ${sesteki.length} kişi kaydedildi.`);
    } catch (err) {
        console.error(`❌ ${guild.name} kurulum hatası:`, err.code, err.message);
    }
}

// ==========================================
// 10) DISCORD OLAYLARI
// ==========================================
client.once('clientReady', async () => {
    console.log(`🤖 ${client.user.tag} olarak giriş yapıldı! Bot artık online.`);
    client.user.setActivity('🦁 Çalışma modu', { type: 3 });
    for (const guild of client.guilds.cache.values()) {
        await sunucuyuKur(guild);
    }
});

client.on('guildCreate', async guild => {
    await sunucuyuKur(guild);
});

client.on('error', err => console.error('❌ Discord istemci hatası:', err.message));
client.on('shardError', err => console.error('❌ Discord bağlantı hatası:', err.message));

// ==========================================
// 11) ETKİLEŞİM İŞLEYİCİSİ
// ==========================================
client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isButton()) return await butonIsle(interaction);
        if (!interaction.isChatInputCommand()) return;
        return await komutIsle(interaction);
    } catch (err) {
        console.error('❌ Etkileşim hatası:', err);
        const cevap = { content: '❌ Bir hata oluştu, konsola bakın.', flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) await interaction.editReply(cevap).catch(() => {});
        else await interaction.reply(cevap).catch(() => {});
    }
});

function kuralButonu() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('kural_kabul')
            .setLabel('✅ Kuralları Kabul Ediyorum')
            .setStyle(ButtonStyle.Success)
    );
}

async function butonIsle(i) {
    if (i.customId !== 'kural_kabul') return;
    const rol = await rolGarantile(i.guild, AYAR.UYE_ROL, 0x57F287);
    if (!i.member.roles.cache.has(rol.id)) {
        await i.member.roles.add(rol, 'Kuralları kabul etti');
    }
    return i.reply({
        content: '✅ Kuralları kabul ettin, sunucunun tamamına hoş geldin!',
        flags: MessageFlags.Ephemeral,
    });
}

async function komutIsle(i) {
    const { commandName: c, user } = i;

    switch (c) {
        case 'pomodoro': {
            const dk = i.options.getInteger('sure');
            await Pomodoro.create({
                userId: user.id,
                username: user.username,
                channelId: i.channelId,
                minutes: dk,
                endsAt: new Date(Date.now() + dk * 60000),
            });
            return i.reply({
                embeds: [bildirimEmbed('⏱️ Pomodoro Başladı!',
                    `**${dk} dakika** odaklan! Bitince bu kanalda haber vereceğim.`, 0xFFA500)],
            });
        }

        case 'gorev': {
            await i.deferReply({ flags: MessageFlags.Ephemeral });
            const sub = i.options.getSubcommand();

            if (sub === 'ekle') {
                const gorev = i.options.getString('gorev');
                const yeni = await Task.create({ userId: user.id, description: gorev });
                return i.editReply(`✅ Görev eklendi: **${gorev}** (ID: \`${yeni._id}\`)`);
            }
            if (sub === 'liste') {
                const tasks = await Task.find({ userId: user.id });
                if (!tasks.length) return i.editReply('📭 Görevin yok.');
                const metin = tasks
                    .map(t => `${t.completed ? '✅' : '⏳'} ${t.description} (ID: \`${t._id}\`)`)
                    .join('\n');
                return i.editReply(metin);
            }

            const id = i.options.getString('id');
            if (!mongoose.isValidObjectId(id)) return i.editReply('❌ Geçersiz görev ID.');

            if (sub === 'tamamla') {
                const g = await Task.findOneAndUpdate({ _id: id, userId: user.id }, { completed: true });
                return i.editReply(g ? '✅ Görev tamamlandı.' : '❌ Bu ID ile görev bulunamadı.');
            }
            if (sub === 'sil') {
                const g = await Task.findOneAndDelete({ _id: id, userId: user.id });
                return i.editReply(g ? '🗑️ Görev silindi.' : '❌ Bu ID ile görev bulunamadı.');
            }
            return;
        }

        case 'bakiye':
        case 'istatistik': {
            const u = await User.findOne({ userId: user.id });
            if (!u) return i.reply('❌ Henüz veriniz yok. Bir pomodoro ya da sesli çalışma ile başlayın.');

            if (c === 'bakiye') {
                return i.reply({
                    embeds: [bildirimEmbed('💰 Bakiye',
                        `**${u.balance}** coin\n🎯 Pomodoro: ${u.pomodoroCount}`, 0xFFD700)],
                });
            }

            const hedefSatiri = u.dailyGoal > 0
                ? `🎯 Günlük hedef: **${formatSure(u.dailySec)} / ${u.dailyGoal}:00:00**`
                : '🎯 Günlük hedef: belirlenmedi (`/hedef`)';

            return i.reply({
                embeds: [bildirimEmbed('📊 İstatistik',
                    `⏱️ Toplam: **${formatSure(u.totalSec)}**\n` +
                    `📅 Bugün: **${formatSure(u.dailySec)}**\n` +
                    `📆 Bu hafta: **${formatSure(u.weeklySec)}**\n` +
                    `🔥 Seri: **${u.streak} gün**\n` +
                    `${hedefSatiri}\n` +
                    `💰 Bakiye: **${u.balance}** coin`, 0x9B59B6)],
            });
        }

        case 'leaderboard': {
            await i.deferReply();
            const tur = i.options.getString('tur') ?? 'gunluk';
            const buf = await liderlikGorseli(tur, i.guild);
            if (!buf) return i.editReply('📭 Bu tabloda henüz kayıt yok.');
            return i.editReply({
                files: [new AttachmentBuilder(buf, { name: 'leaderboard.png' })],
            });
        }

        case 'hedef': {
            const dk = i.options.getInteger('dakika');
            await User.findOneAndUpdate(
                { userId: user.id },
                { $set: { dailyGoal: dk }, $setOnInsert: { username: user.username } },
                { upsert: true }
            );
            return i.reply({
                content: dk === 0
                    ? '🗑️ Günlük hedefin kaldırıldı.'
                    : `🎯 Günlük hedefin **${dk} dakika** olarak ayarlandı. Hedefe ulaşınca **+${AYAR.HEDEF_BONUS} coin** kazanırsın!`,
                flags: MessageFlags.Ephemeral,
            });
        }

        case 'market': {
            const embed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('🛒 Çalışma Marketi')
                .setDescription(
                    MARKET.map(m => `${m.rol} — **${m.fiyat} coin**`).join('\n') +
                    '\n\nSatın almak için `/satinal` komutunu kullan.'
                );
            return i.reply({ embeds: [embed] });
        }

        case 'satinal': {
            const key = i.options.getString('urun');
            const urun = MARKET.find(m => m.key === key);
            if (!urun) return i.reply({ content: '❌ Ürün bulunamadı.', flags: MessageFlags.Ephemeral });

            const u = await User.findOne({ userId: user.id });
            const bakiye = u?.balance ?? 0;
            if (bakiye < urun.fiyat) {
                return i.reply({
                    content: `❌ Yetersiz coin. Gereken: **${urun.fiyat}**, mevcut: **${bakiye}**.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const rol = await rolGarantile(i.guild, urun.rol, urun.renk);
            if (i.member.roles.cache.has(rol.id)) {
                return i.reply({ content: `ℹ️ Zaten **${urun.rol}** rolüne sahipsin.`, flags: MessageFlags.Ephemeral });
            }

            await i.member.roles.add(rol, 'Marketten satın alındı');
            await User.updateOne({ userId: user.id }, { $inc: { balance: -urun.fiyat } });
            return i.reply(`🎉 <@${user.id}> **${urun.rol}** rolünü satın aldı! (-${urun.fiyat} coin)`);
        }

        case 'yardim': {
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('📖 Komutlar')
                .addFields(
                    { name: '⏱️ Çalışma', value: '`/pomodoro` `/hedef` `/istatistik` `/leaderboard`' },
                    { name: '📝 Görevler', value: '`/gorev ekle` `/gorev liste` `/gorev tamamla` `/gorev sil`' },
                    { name: '💰 Ekonomi', value: '`/bakiye` `/market` `/satinal`' },
                    { name: '🛡️ Moderasyon (yetkili)', value: '`/uyar` `/uyarilar` `/kuralpanel`' },
                )
                .setFooter({ text: 'Sesli odalarda çalıştıkça süre ve coin kazanırsın.' });
            return i.reply({ embeds: [embed] });
        }

        case 'uyar': {
            const hedef = i.options.getUser('kullanici');
            const sebep = i.options.getString('sebep') ?? 'Belirtilmedi';
            const uye = await i.guild.members.fetch(hedef.id).catch(() => null);
            if (!uye) return i.reply({ content: '❌ Kullanıcı sunucuda bulunamadı.', flags: MessageFlags.Ephemeral });

            const sayi = await uyariVer(i.guild, uye, sebep, user.username);
            return i.reply({
                content: `✅ <@${hedef.id}> uyarıldı. Toplam uyarı: **${sayi}**`,
                flags: MessageFlags.Ephemeral,
            });
        }

        case 'uyarilar': {
            const hedef = i.options.getUser('kullanici');
            const liste = await Warning.find({ guildId: i.guild.id, userId: hedef.id })
                .sort({ createdAt: -1 }).limit(10);
            if (!liste.length) return i.reply({ content: '✅ Bu kullanıcının uyarısı yok.', flags: MessageFlags.Ephemeral });

            const satirlar = liste.map(w =>
                `• ${w.createdAt.toLocaleDateString('tr-TR')} — ${w.reason} (${w.byName})`);
            return i.reply({
                embeds: [bildirimEmbed(`⚠️ ${hedef.username} uyarıları`, satirlar.join('\n'), 0xE74C3C)],
                flags: MessageFlags.Ephemeral,
            });
        }

        case 'kuralpanel': {
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('📜 Sunucu Kuralları')
                .setDescription(
                    '1. Saygılı ol, küfür ve hakaret yok.\n' +
                    '2. Reklam ve davet linki paylaşma.\n' +
                    '3. Cam-only odasında kameranı aç.\n' +
                    '4. Spam yapma.\n' +
                    '5. Çalışma odalarında başkalarını rahatsız etme.\n\n' +
                    'Kuralları okuduysan aşağıdaki butona bas.'
                );
            await i.channel.send({ embeds: [embed], components: [kuralButonu()] });
            return i.reply({ content: '✅ Kural paneli gönderildi.', flags: MessageFlags.Ephemeral });
        }
    }
}

// ==========================================
// 12) UYARI SİSTEMİ
// ==========================================
async function uyariVer(guild, uye, sebep, yetkili) {
    await Warning.create({ guildId: guild.id, userId: uye.id, reason: sebep, byName: yetkili });
    const sayi = await Warning.countDocuments({ guildId: guild.id, userId: uye.id });

    await gonder(guild, AYAR.BILDIRIM_ADI, {
        embeds: [bildirimEmbed('⚠️ Uyarı', `<@${uye.id}> uyarıldı.`, 0xE67E22)
            .addFields(
                { name: 'Sebep', value: sebep },
                { name: 'Toplam uyarı', value: `${sayi}/${AYAR.UYARI_LIMITI}` },
                { name: 'Veren', value: yetkili },
            )],
    });

    if (sayi >= AYAR.UYARI_LIMITI) {
        await uye.timeout(AYAR.UYARI_CEZA_MS, 'Uyarı limiti doldu')
            .catch(e => console.error('❌ Susturma hatası:', e.message));
        await gonder(guild, AYAR.BILDIRIM_ADI, {
            embeds: [bildirimEmbed('🔇 Otomatik Susturma',
                `<@${uye.id}> ${sayi} uyarıya ulaştığı için **1 saat** susturuldu.`, 0x992D22)],
        });
    }
    return sayi;
}

// ==========================================
// 13) SESLİ ÇALIŞMA VE CAM-ONLY
// ==========================================
const bekleyenKamera = new Map();

function kameraPlaniIptal(userId) {
    const t = bekleyenKamera.get(userId);
    if (t) {
        clearTimeout(t);
        bekleyenKamera.delete(userId);
    }
}

async function oturumBaslat(guild, uye, kanalId) {
    await ActiveSession.findOneAndUpdate(
        { userId: uye.id },
        { userId: uye.id, guildId: guild.id, channelId: kanalId, joinedAt: new Date() },
        { upsert: true }
    );
}

async function oturumBitir(guild, userId, ad) {
    const oturum = await ActiveSession.findOneAndDelete({ userId });
    if (!oturum) return;

    const saniye = Math.floor((Date.now() - oturum.joinedAt.getTime()) / 1000);
    let bugunSec = 0;
    let bonus = false;

    if (saniye > 0) {
        const coin = Math.floor(saniye / 60) * AYAR.SESLI_COIN_DK;
        const sonuc = await calismaEkle(userId, ad, saniye, coin);
        bugunSec = sonuc.u.dailySec;
        bonus = sonuc.bonus;
    } else {
        bugunSec = (await User.findOne({ userId }))?.dailySec ?? 0;
    }

    const ozet = saniye > 0
        ? `Bu oturumda **${formatSure(saniye)}** çalıştın`
        : 'Bu oturum 1 saniyeden kısa sürdü';

    await ozelGonder(guild, userId, {
        embeds: [bildirimEmbed('🔴 Odadan Çıktın',
            `${ozet}.\n📚 Bugün toplam **${formatSure(bugunSec)}** çalıştın.`, 0xE74C3C)],
    });

    if (bonus) {
        await ozelGonder(guild, userId, {
            embeds: [bildirimEmbed('🎯 Hedef Tamamlandı',
                `Günlük hedefini tamamladın! **+${AYAR.HEDEF_BONUS} coin** kazandın.`, 0xF1C40F)],
        });
    }
}

async function sesKanalAdi(state) {
    if (!state.channelId) return null;
    if (state.channel?.name) return state.channel.name;
    const k = await state.guild.channels.fetch(state.channelId).catch(() => null);
    return k?.name ?? null;
}

async function kameraKontrol(guild, userId, kanalId) {
    bekleyenKamera.delete(userId);
    try {
        const uye = await guild.members.fetch(userId);
        if (uye.voice.channelId !== kanalId || uye.voice.selfVideo) return;

        await uye.voice.setChannel(null, 'Kamerası kapalı');

        const embed = bildirimEmbed('⚠️ Kamera Uyarısı',
            `<@${userId}> **${AYAR.CAM_ONLY}** kanalına kamerası kapalı girdiği için odadan çıkarıldı.`, 0xE74C3C)
            .addFields({ name: 'Ne yapmalısın?', value: 'Kanala tekrar girmek için **kameranı açman** gerekiyor.' });

        const basarili = await gonder(guild, AYAR.BILDIRIM_ADI, { embeds: [embed] });
        if (!basarili) await ozelGonder(guild, userId, { embeds: [embed] });
    } catch (err) {
        console.error('❌ Cam-only kontrol hatası:', err.code, err.message);
    }
}

client.on('voiceStateUpdate', async (eski, yeni) => {
    const uye = yeni.member ?? eski.member;
    if (!uye || uye.user.bot) return;

    const userId = uye.id;
    const eskiKanal = eski.channelId;
    const yeniKanal = yeni.channelId;
    if (eskiKanal === yeniKanal) return;

    try {
        if (!eskiKanal && yeniKanal) {
            await oturumBaslat(yeni.guild, uye, yeniKanal);
        } else if (eskiKanal && !yeniKanal) {
            await oturumBitir(eski.guild, userId, uye.displayName);
        } else if (eskiKanal && yeniKanal) {
            await ActiveSession.updateOne({ userId }, { channelId: yeniKanal });
        }

        if (eskiKanal) kameraPlaniIptal(userId);

        if (yeniKanal) {
            const ad = await sesKanalAdi(yeni);
            if (ad && normalize(ad) === normalize(AYAR.CAM_ONLY)) {
                console.log(`⏳ ${uye.user.tag} cam-only'e girdi, ${AYAR.KAMERA_BEKLEME_MS / 1000} sn içinde kamera kontrolü yapılacak.`);
                const timer = setTimeout(
                    () => kameraKontrol(yeni.guild, userId, yeniKanal),
                    AYAR.KAMERA_BEKLEME_MS
                );
                bekleyenKamera.set(userId, timer);
            }
        }
    } catch (err) {
        console.error('❌ Ses olayı hatası:', err);
    }
});

// ==========================================
// 14) MESAJ FİLTRELERİ
// ==========================================
const spamTakip = new Map();

client.on('messageCreate', async message => {
    if (!message.guild || message.author.bot || !message.member) return;
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

    const icerik = message.content.toLocaleLowerCase('tr');
    const guild = message.guild;

    try {
        if (/(discord\.gg\/|discord\.com\/invite\/)/i.test(icerik)) {
            await message.delete().catch(() => {});
            await uyariVer(guild, message.member, 'Yetkisiz davet linki paylaşımı', 'Otomatik sistem');
            return;
        }

        if (KUFUR_LISTESI.some(k => icerik.includes(k))) {
            await message.delete().catch(() => {});
            await uyariVer(guild, message.member, 'Küfür/hakaret', 'Otomatik sistem');
            return;
        }

        const simdi = Date.now();
        const son = (spamTakip.get(message.author.id) ?? []).filter(t => simdi - t < AYAR.SPAM_SURE_MS);
        son.push(simdi);
        spamTakip.set(message.author.id, son);

        if (son.length >= AYAR.SPAM_LIMIT) {
            spamTakip.delete(message.author.id);
            await message.member.timeout(AYAR.SPAM_CEZA_MS, 'Spam')
                .catch(e => console.error('❌ Spam susturma hatası:', e.message));
            await gonder(guild, AYAR.BILDIRIM_ADI, {
                embeds: [bildirimEmbed('🚫 Spam Engellendi',
                    `<@${message.author.id}> spam yaptığı için **5 dakika** susturuldu.`, 0xE74C3C)],
            });
        }
    } catch (err) {
        console.error('❌ Mesaj filtresi hatası:', err);
    }
});

// ==========================================
// 15) KARŞILAMA / AYRILMA
// ==========================================
client.on('guildMemberAdd', async member => {
    try {
        const kanal = await kanalBul(member.guild, AYAR.KARSILAMA_ADI);
        if (!kanal) return;
        await kanal.send({
            content: `👋 <@${member.id}> hoş geldin! Kuralları okuyup aşağıdaki butona basarak onay ver.`,
            components: [kuralButonu()],
        });
    } catch (err) {
        console.error('❌ Karşılama mesajı hatası:', err);
    }
});

client.on('guildMemberRemove', async member => {
    try {
        const kanal = await kanalBul(member.guild, AYAR.KARSILAMA_ADI);
        if (kanal) await kanal.send(`😢 <@${member.id}> ayrıldı.`);
    } catch (err) {
        console.error('❌ Ayrılma mesajı hatası:', err);
    }
});

// ==========================================
// 16) POMODORO ZAMANLAYICISI
// ==========================================
setInterval(async () => {
    try {
        const bitenler = await Pomodoro.find({ done: false, endsAt: { $lte: new Date() } });
        for (const p of bitenler) {
            const sonuc = await Pomodoro.updateOne({ _id: p._id, done: false }, { done: true });
            if (sonuc.modifiedCount === 0) continue;

            const coin = p.minutes * AYAR.POMODORO_COIN_DK;
            const { bonus } = await calismaEkle(p.userId, p.username, p.minutes * 60, coin);
            await User.updateOne({ userId: p.userId }, { $inc: { pomodoroCount: 1 } });

            const kanal = await client.channels.fetch(p.channelId).catch(() => null);
            if (kanal) {
                await kanal.send({
                    embeds: [bildirimEmbed('🔔 Pomodoro Bitti!',
                        `<@${p.userId}> **${p.minutes} dakika** çalıştı. Mola zamanı!\n**+${coin} coin** kazandın.`, 0x2ECC71)],
                });
                if (bonus) {
                    await kanal.send({
                        embeds: [bildirimEmbed('🎯 Hedef Tamamlandı',
                            `<@${p.userId}> günlük hedefini tamamladı! **+${AYAR.HEDEF_BONUS} coin** kazandı.`, 0xF1C40F)],
                    });
                }
            }
        }
    } catch (err) {
        console.error('❌ Pomodoro kontrol hatası:', err);
    }
}, 15000);

// ==========================================
// 17) ZAMANLANMIŞ GÖREVLER
// ==========================================
const zaman = { timezone: AYAR.SAAT_DILIMI };

cron.schedule('0 9 * * *', async () => {
    const mesaj = MOTIVASYON[Math.floor(Math.random() * MOTIVASYON.length)];
    for (const guild of client.guilds.cache.values()) {
        await gonder(guild, AYAR.GENEL_ADI, {
            embeds: [bildirimEmbed('🕘 Çalışma Saati Başladı!',
                `Ses kanallarına geçip odaklanmayı unutma.\n\n${mesaj}`, 0x3498DB)],
        });
    }
}, zaman);

cron.schedule('55 23 * * *', async () => {
    for (const guild of client.guilds.cache.values()) {
        const buf = await liderlikGorseli('gunluk', guild);
        if (buf) {
            await gonder(guild, AYAR.KAYIT_ADI, {
                files: [new AttachmentBuilder(buf, { name: 'leaderboard.png' })],
            });
        }
    }
}, zaman);

cron.schedule('0 22 * * 0', async () => {
    for (const guild of client.guilds.cache.values()) {
        const tumu = await User.find({ weekKey: haftaAnahtari(), weeklySec: { $gt: 0 } })
            .sort({ weeklySec: -1 }).limit(1);
        if (!tumu.length) continue;

        const sampiyon = tumu[0];
        await User.updateOne({ userId: sampiyon.userId }, { $inc: { balance: AYAR.HAFTA_SAMPIYON_BONUS } });

        await gonder(guild, AYAR.GENEL_ADI, {
            embeds: [bildirimEmbed('🏆 Haftanın Şampiyonu',
                `<@${sampiyon.userId}> bu haftanın çalışma şampiyonu!\n` +
                `⏱️ **${formatSure(sampiyon.weeklySec)}** çalıştı ve **+${AYAR.HAFTA_SAMPIYON_BONUS} coin** kazandı.`, 0xF1C40F)],
        });
    }
}, zaman);

// ==========================================
// 18) BAŞLAT
// ==========================================
client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('❌ Discord girişi başarısız:', err.message);
    console.error('   Token yanlış olabilir veya Developer Portal\'da Privileged Intents kapalı olabilir.');
    process.exit(1);
});
