// index.js - VPN Destekli (Bilgisayar İçin)
require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');

// --- VPN / Proxy Ayarı (Hotspot Shield İçin) ---
const { setGlobalDispatcher, EnvHttpProxyAgent } = require('undici');
setGlobalDispatcher(new EnvHttpProxyAgent());

// --- Web Sunucusu (Render İçin, Bilgisayarda Çalışmasına Engel Değil) ---
const app = express();
app.get('/', (req, res) => res.send('Bot Aktif!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Web sunucusu ${PORT} portunda çalışıyor.`));

// ==========================================
// VERİTABANI MODELLERİ
// ==========================================
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    totalStudyTime: { type: Number, default: 0 },
    dailyStudyTime: { type: Number, default: 0 },
    lastStudyDate: { type: String, default: '' },
    balance: { type: Number, default: 0 },
    pomodoroCount: { type: Number, default: 0 }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

const taskSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    description: { type: String, required: true },
    completed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Task = mongoose.model('Task', taskSchema);

// --- MongoDB Bağlantısı ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB bağlantısı başarılı.'))
    .catch(err => console.error('❌ MongoDB bağlantı hatası:', err));

// --- Bot İstemcisi ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});

// ==========================================
// SLASH KOMUTLARI TANIMLAMA
// ==========================================
const commandsData = [
    new SlashCommandBuilder()
        .setName('pomodoro')
        .setDescription('Pomodoro zamanlayıcısını başlatır.')
        .addIntegerOption(opt => opt.setName('sure').setDescription('Süre (dakika)').setRequired(true)),
    new SlashCommandBuilder()
        .setName('gorev')
        .setDescription('Yapılacaklar listenizi yönetin.')
        .addSubcommand(sub => sub.setName('ekle').setDescription('Yeni görev ekleyin.').addStringOption(opt => opt.setName('gorev').setDescription('Görev').setRequired(true)))
        .addSubcommand(sub => sub.setName('liste').setDescription('Görevleri listeleyin.'))
        .addSubcommand(sub => sub.setName('tamamla').setDescription('Görevi tamamla.').addStringOption(opt => opt.setName('id').setDescription('Görev ID').setRequired(true)))
        .addSubcommand(sub => sub.setName('sil').setDescription('Görevi sil.').addStringOption(opt => opt.setName('id').setDescription('Görev ID').setRequired(true))),
    new SlashCommandBuilder().setName('bakiye').setDescription('Para bakiyenizi gösterir.'),
    new SlashCommandBuilder().setName('istatistik').setDescription('Çalışma istatistiklerinizi gösterir.')
].map(cmd => cmd.toJSON());

// --- Komutları Discord'a Kaydetme ---
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
    try {
        console.log('🔄 Slash komutları kaydediliyor...');
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandsData });
        console.log('✅ Slash komutları başarıyla kaydedildi.');
    } catch (error) {
        console.error('❌ Komut kaydetme hatası:', error);
    }
})();

// --- Bot Hazır Olduğunda ---
client.once('ready', () => {
    console.log(`🤖 ${client.user.tag} olarak giriş yapıldı!`);
    client.user.setActivity('🦁 Çalışma modu', { type: 3 });
});

// ==========================================
// KOMUT DİNLEYİCİSİ
// ==========================================
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, user } = interaction;

    try {
        // --- POMODORO ---
        if (commandName === 'pomodoro') {
            await interaction.deferReply();
            const sure = interaction.options.getInteger('sure');
            let userData = await User.findOne({ userId: user.id }) || await User.create({ userId: user.id, username: user.username });
            
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('⏱️ Pomodoro Başladı!').setDescription(`**${sure} dakika** odaklan!`)] });
            
            setTimeout(async () => {
                let updatedUser = await User.findOne({ userId: user.id });
                if (!updatedUser) return;
                
                const today = new Date().toISOString().split('T')[0];
                if (updatedUser.lastStudyDate !== today) {
                    updatedUser.dailyStudyTime = 0;
                    updatedUser.lastStudyDate = today;
                }
                updatedUser.totalStudyTime += sure;
                updatedUser.dailyStudyTime += sure;
                updatedUser.pomodoroCount += 1;
                updatedUser.balance += sure * 2;
                await updatedUser.save();
                interaction.channel.send(`🔔 <@${user.id}> **${sure} dakika** bitti! Mola zamanı.`);
            }, sure * 60 * 1000);
        }

        // --- GÖREVLER ---
        if (commandName === 'gorev') {
            await interaction.deferReply({ ephemeral: true });
            const sub = interaction.options.getSubcommand();
            if (sub === 'ekle') {
                const gorev = interaction.options.getString('gorev');
                const newTask = await Task.create({ userId: user.id, description: gorev });
                await interaction.editReply(`✅ Görev eklendi: **${gorev}** (ID: \`${newTask._id}\`)`);
            } else if (sub === 'liste') {
                const tasks = await Task.find({ userId: user.id });
                if (!tasks.length) return interaction.editReply('📭 Görevin yok.');
                await interaction.editReply(tasks.map(t => `${t.completed ? '✅' : '⏳'} ${t.description} (ID: \`${t._id}\`)`).join('\n'));
            } else if (sub === 'tamamla') {
                await Task.findOneAndUpdate({ _id: interaction.options.getString('id'), userId: user.id }, { completed: true });
                await interaction.editReply('✅ Görev tamamlandı.');
            } else if (sub === 'sil') {
                await Task.findOneAndDelete({ _id: interaction.options.getString('id'), userId: user.id });
                await interaction.editReply('🗑️ Görev silindi.');
            }
        }

        // --- BAKİYE VE İSTATİSTİK ---
        if (commandName === 'bakiye' || commandName === 'istatistik') {
            await interaction.deferReply();
            const u = await User.findOne({ userId: user.id });
            if (!u) return interaction.editReply('❌ Henüz verin yok.');
            if (commandName === 'bakiye') {
                await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFD700).setTitle('💰 Bakiye').setDescription(`**${u.balance}** coin\n🎯 Pomodoro: ${u.pomodoroCount}`)] });
            } else {
                await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x9B59B6).setTitle('📊 İstatistik').setDescription(`⏱️ Toplam: **${u.totalStudyTime}** dk\n💰 Bakiye: **${u.balance}** coin`)] });
            }
        }
    } catch (error) {
        console.error(error);
    }
});

// --- Cam-Only Ses Kanalı Kontrolü ---
client.on('voiceStateUpdate', async (oldState, newState) => {
    if (!oldState.channelId && newState.channelId && newState.channel.name === 'cam-only') {
        setTimeout(async () => {
            if (newState.member.voice.channelId === newState.channel.id && !newState.member.voice.selfVideo) {
                try {
                    await newState.member.voice.setChannel(null);
                    const logChannel = newState.guild.channels.cache.find(c => c.name === 'bildirim');
                    if (logChannel) logChannel.send(`⚠️ <@${newState.member.id}> kamera açmadığı için atıldı.`);
                } catch (e) { console.log("Yetki hatası:", e); }
            }
        }, 5000);
    }
});

// --- Giriş/Çıkış Karşılama ---
client.on('guildMemberAdd', member => {
    const ch = member.guild.channels.cache.find(c => c.name === 'welcome-bye');
    if (ch) ch.send(`👋 <@${member.id}> hoş geldin!`);
});
client.on('guildMemberRemove', member => {
    const ch = member.guild.channels.cache.find(c => c.name === 'welcome-bye');
    if (ch) ch.send(`😢 <@${member.id}> ayrıldı.`);
});

// --- Botu Başlat ---
client.login(process.env.DISCORD_TOKEN);