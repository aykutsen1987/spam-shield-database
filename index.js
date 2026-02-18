const express = require('express');
const axios = require('axios');
const app = express();

// --- AYARLAR ---
const SOURCE_URL = "https://raw.githubusercontent.com/symbuzzer/Turkish-Spam-Numbers/main/SpamBlocker.csv";
const MY_REPO_OWNER = "aykutsen1987"; 
const MY_REPO_NAME = "spam-shield-database";
const GITHUB_TOKEN = process.env.GH_TOKEN; // Render'daki kasanızdan alacak

let cachedData = [];
let lastSyncTime = null;

/**
 * Kendi GitHub depona (backup.json) veriyi yazan fonksiyon
 */
async function updateMyBackup(data) {
    if (!GITHUB_TOKEN) {
        console.error("❌ HATA: GH_TOKEN bulunamadı. Yedekleme yapılamıyor.");
        return;
    }

    const url = `https://api.github.com/repos/${MY_REPO_OWNER}/${MY_REPO_NAME}/contents/backup.json`;
    const contentBase64 = Buffer.from(JSON.stringify(data)).toString('base64');

    try {
        // 1. Mevcut dosyanın SHA kodunu al (GitHub güncelleme için şart koşar)
        let sha = "";
        try {
            const res = await axios.get(url, { 
                headers: { Authorization: `token ${GITHUB_TOKEN}` } 
            });
            sha = res.data.sha;
        } catch (e) { 
            console.log("ℹ️ İlk yedek dosyası oluşturulacak..."); 
        }

        // 2. Dosyayı GitHub'a yükle/güncelle
        await axios.put(url, {
            message: "CallMeta Sistem Yedekleme: " + new Date().toLocaleString('tr-TR'),
            content: contentBase64,
            sha: sha
        }, {
            headers: { Authorization: `token ${GITHUB_TOKEN}` }
        });
        console.log("✅ Kendi GitHub depona (backup.json) başarıyla yedeklendi!");
    } catch (error) {
        console.error("❌ Yedekleme hatası:", error.response ? error.response.data : error.message);
    }
}

/**
 * Ana veri çekme ve senkronizasyon fonksiyonu
 */
async function syncData() {
    try {
        console.log(`🔄 [${new Date().toLocaleTimeString('tr-TR')}] Veri kaynaktan çekiliyor...`);
        const response = await axios.get(SOURCE_URL);
        
        // CSV verisini satırlara böl, temizle ve 5 karakterden kısa olanları (boşluk vb) ele
        const numbers = response.data.split('\n')
            .map(n => n.trim())
            .filter(n => n.length > 5);
        
        // Sadece veri varsa güncelleme yap (kaynak boş gelirse mevcut veriyi korumak için)
        if (numbers.length > 0) {
            cachedData = [...new Set(numbers)]; // Tekrar eden numaraları temizle
            lastSyncTime = new Date().toISOString();
            console.log(`📊 Başarılı: ${cachedData.length} benzersiz numara yüklendi.`);
            
            // Kendi depona yedekle
            await updateMyBackup(cachedData);
        }
    } catch (error) {
        console.error("⚠️ Kaynak hatası! Mevcut cache korunuyor.");
    }
}

// --- API ENDPOINT (Android Uygulamasının Bağlanacağı Yer) ---
app.get('/api/check', (req, res) => {
    res.json({
        success: true,
        project: "CallMeta",
        count: cachedData.length,
        last_sync: lastSyncTime,
        numbers: cachedData
    });
});

// --- SUNUCU BAŞLATMA ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 CallMeta Backend ${PORT} portunda aktif.`);
    
    // Uygulama başlar başlamaz ilk çekimi yap
    syncData();

    // Günde 3 defa yenileme (8 saatte bir)
    // 8 saat = 28,800,000 milisaniye
    setInterval(syncData, 8 * 60 * 60 * 1000);
});
