const express = require('express');
const axios = require('axios');
const app = express();

const SOURCE_URL = "https://raw.githubusercontent.com/symbuzzer/Turkish-Spam-Numbers/main/SpamBlocker.csv";
const MY_REPO_OWNER = "aykutsen1987"; 
const MY_REPO_NAME = "spam-shield-database";
const GITHUB_TOKEN = process.env.GH_TOKEN;

let cachedData = [];
let lastSyncTime = null;

async function updateMyBackup(data) {
    if (!GITHUB_TOKEN) return;

    const url = `https://api.github.com/repos/${MY_REPO_OWNER}/${MY_REPO_NAME}/contents/backup.json`;
    const contentBase64 = Buffer.from(JSON.stringify(data)).toString('base64');

    try {
        let sha = "";
        let oldContent = "";
        
        // 1. Mevcut dosyayı kontrol et
        try {
            const res = await axios.get(url, { 
                headers: { Authorization: `token ${GITHUB_TOKEN}` } 
            });
            sha = res.data.sha;
            oldContent = res.data.content.replace(/\n/g, ''); // Mevcut base64 verisi
        } catch (e) { console.log("İlk dosya oluşturulacak."); }

        // 2. ZEKA KONTROLÜ: Eğer yeni veri eskisinin aynısıysa GitHub'a yazma (Sonsuz döngü engeli)
        if (contentBase64 === oldContent) {
            console.log("✅ Veri aynı, GitHub üzerine tekrar yazılmadı (Döngü kırıldı).");
            return;
        }

        // 3. GitHub'a Gönder (Mesaja [skip ci] ekledik ki Render tetiklenmesin)
        await axios.put(url, {
            message: `[skip ci] Veri Güncelleme: ${new Date().toLocaleString('tr-TR')}`,
            content: contentBase64,
            sha: sha
        }, {
            headers: { Authorization: `token ${GITHUB_TOKEN}` }
        });
        console.log("🚀 Yeni veriler GitHub'a yedeklendi!");
    } catch (error) {
        console.error("❌ Yedekleme hatası:", error.message);
    }
}

async function syncData() {
    try {
        const response = await axios.get(SOURCE_URL);
        const numbers = response.data.split('\n')
            .map(n => n.trim())
            .filter(n => n.length > 5);
        
        if (numbers.length > 0) {
            cachedData = [...new Set(numbers)];
            lastSyncTime = new Date().toISOString();
            await updateMyBackup(cachedData);
        }
    } catch (error) {
        console.error("⚠️ Kaynak hatası.");
    }
}

app.get('/api/check', (req, res) => {
    res.json({
        success: true,
        count: cachedData.length,
        last_sync: lastSyncTime,
        numbers: cachedData
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 CallMeta Backend Aktif.`);
    syncData();
    // 8 saatte bir kontrol et
    setInterval(syncData, 8 * 60 * 60 * 1000);
});
