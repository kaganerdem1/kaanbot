// index.js - Sadece Cam-Only Kontrolü (Render Uyumlu)
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// --- Web Sunucusu (Render uyku modunu engellemek için) ---
const app = express();
app.get('/', (req, res) => res.send('Bot Aktif!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Web sunucusu ${PORT} portunda çalışıyor.`));

// --- Bot İstemcisi ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates // Ses kanalı olayları için gerekli
    ]
});

// --- Bot Hazır Olduğunda ---
client.once('ready', () => {
    console.log(`🤖 ${client.user.tag} olarak giriş yapıldı!`);
    client.user.setActivity('🦁 Kamera Kontrol', { type: 3 });
});

// --- Cam-Only Kontrolü ---
client.on('voiceStateUpdate', async (oldState, newState) => {
    // Kullanıcı yeni bir ses kanalına girdiyse
    if (!oldState.channelId && newState.channelId) {
        const channel = newState.channel;
        const member = newState.member;

        // Kanalın adı tam olarak "cam-only" ise (büyük/küçük harf duyarsız)
        if (channel.name.toLowerCase() === 'cam-only') {
            
            // 5 saniye bekle
            setTimeout(async () => {
                try {
                    // Kullanıcının o anki güncel ses durumunu çek
                    const currentState = member.voice;
                    
                    // Eğer hala o kanaldaysa ve kamera KAPALIYSA (selfVideo = false)
                    if (currentState.channelId === channel.id && !currentState.selfVideo) {
                        
                        // 1. Kullanıcıyı odadan at
                        await member.voice.setChannel(null);
                        
                        // 2. Sunucudaki "bildirim" adlı metin kanalını bul ve mesaj at
                        const logChannel = channel.guild.channels.cache.find(c => c.name === 'bildirim');
                        if (logChannel) {
                            await logChannel.send(`⚠️ <@${member.id}> **cam-only** kanalına girdi ancak 5 saniye içinde kamerasını açmadığı için odadan atıldı.`);
                        }
                        
                    }
                } catch (error) {
                    console.error('Kullanıcı odadan atılamadı (Yetki eksik olabilir):', error);
                }
            }, 5000); // 5000 ms = 5 saniye
        }
    }
});

// --- Botu Başlat ---
client.login(process.env.DISCORD_TOKEN);
