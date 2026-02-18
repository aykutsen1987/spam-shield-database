const express = require('express');
const axios = require('axios');
const app = express();

// --- AYARLAR ---
const SOURCE_URL = "https://raw.githubusercontent.com/symbuzzer/Turkish-Spam-Numbers/main/SpamBlocker.csv";
const MY_REPO_OWNER = "aykutsen1987"; 
const MY_REPO_NAME = "spam-shield-database";
const GITHUB_TOKEN = process.env.GH_TOKEN; // Render'daki kasanızdan alacak

let cachedData = [];

// Senin GitHub depona (backup.json) veriyi yazan fonksiyon
async function updateMyBackup(data) {
    const url = `https://api.github.com/repos/${MY_REPO_OWNER}/${MY_REPO_NAME}/contents/backup.json`;
    const contentBase64 = Buffer.from(JSON.stringify(data)).toString('base64');

    try {
        // Önce mevcut dosyanın SHA kodunu al (GitHub güncelleme için bunu şart koşar)
        let sha = "";
        try {
            const res = await axios.get(url, { 
                headers: { Authorization: `token ${GITHUB_TOKEN}` } 
            });
            sha = res.data.sha;
        } catch (e) { console.log("İlk yedek oluşturuluyor..."); }

        // Şimdi dosyayı güncelle/yükle
        await axios.put(url, {
            message: "Sistem Otomatik Yedekleme: " + new Date().toLocaleString(),
            content: contentBase64,
            sha: sha
        }, {
            headers: { Authorization: `token ${GITHUB_TOKEN}` }
        });
        console.log("✅ Kendi GitHub depona yedeklendi!");
    } catch (error) {
        console.error("❌ Yedekleme hatası:", error.response ? error.response.data : error.message);
    }
}

// Ana veri çekme fonksiyonu
async function syncData() {
    try {
        console.log("🔄 Veri kaynaktan çekiliyor...");
        const response = await axios.get(SOURCE_URL);
        
        // CSV verisini satırlara böl ve temizle
        const numbers = response.data.split('\n')
            .map(n => n.trim())
            .filter(n => n.length > 5);
        
        cachedData = numbers;
        console.log(`📊 ${numbers.length} numara yüklendi.`);
        
        // Kendi depona yedekle
        await updateMyBackup(numbers);
    } catch (error) {
        console.error("⚠️ Kaynak hatası! Yedek devreye alınabilir.");
    }
}

// Android Uygulamasının bağlanacağı kapı (Endpoint)
app.get('/api/check', (req, res) => {
    res.json({
        success: true,
        count: cachedData.length,
        last_sync: new Date().toISOString(),
        numbers: cachedData
    });
});

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Sunucu ${PORT} portunda aktif.`);
    syncData(); // Açılışta hemen veriyi çek
    setInterval(syncData, 24 * 60 * 60 * 1000); // Her 24 saatte bir tazele
});
