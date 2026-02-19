const express = require("express");
const axios = require("axios");

const app = express();

const SOURCE_URL =
  "https://raw.githubusercontent.com/symbuzzer/Turkish-Spam-Numbers/main/SpamBlocker.csv";

const MY_REPO_OWNER = "aykutsen1987";
const MY_REPO_NAME = "spam-shield-database";
const GITHUB_TOKEN = process.env.GH_TOKEN;

let cachedData = [];
let lastSyncTime = null;

/**
 * GitHub backup güncelleme
 */
async function updateMyBackup(data) {
  if (!GITHUB_TOKEN) {
    console.log("⚠️ GH_TOKEN tanımlı değil, yedekleme atlandı.");
    return;
  }

  const url = `https://api.github.com/repos/${MY_REPO_OWNER}/${MY_REPO_NAME}/contents/backup.json`;
  const contentBase64 = Buffer.from(JSON.stringify(data, null, 2)).toString(
    "base64"
  );

  try {
    let sha = "";
    let oldContent = "";

    // 1️⃣ Mevcut dosyayı kontrol et
    try {
      const res = await axios.get(url, {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
        },
      });

      sha = res.data.sha;
      oldContent = res.data.content.replace(/\n/g, "");
    } catch (e) {
      console.log("📁 İlk kez backup.json oluşturulacak.");
    }

    // 2️⃣ Veri aynıysa tekrar yazma
    if (contentBase64 === oldContent) {
      console.log("✅ Veri aynı, GitHub’a tekrar yazılmadı.");
      return;
    }

    // 3️⃣ GitHub’a gönder
    await axios.put(
      url,
      {
        message: `[skip ci] Veri Güncelleme: ${new Date().toLocaleString(
          "tr-TR"
        )}`,
        content: contentBase64,
        sha: sha || undefined,
      },
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
        },
      }
    );

    console.log("🚀 Yeni veriler GitHub’a yedeklendi!");
  } catch (error) {
    console.error("❌ Yedekleme hatası:", error.message);
  }
}

/**
 * Kaynaktan spam numaraları çek
 */
async function syncData() {
  try {
    console.log("🔄 Veri senkronizasyonu başlatıldı...");

    const response = await axios.get(SOURCE_URL, {
      timeout: 30000,
    });

    const numbers = response.data
      .split(/\r?\n/)
      .map((n) => n.trim())
      .filter((n) => /^\+?\d{6,}$/.test(n));

    if (numbers.length > 0) {
      cachedData = [...new Set(numbers)];
      lastSyncTime = new Date().toISOString();

      console.log(`✅ ${cachedData.length} numara yüklendi.`);

      await updateMyBackup(cachedData);
    } else {
      console.log("⚠️ Kaynaktan veri alınamadı.");
    }
  } catch (error) {
    console.error("❌ Kaynak hatası:", error.message);
  }
}

/**
 * API endpoint
 */
app.get("/api/check", async (req, res) => {
  try {
    // Eğer ilk açılışta boşsa senkron başlat
    if (cachedData.length === 0) {
      await syncData();
    }

    res.json({
      success: true,
      count: cachedData.length,
      last_sync: lastSyncTime,
      numbers: cachedData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Sunucu hatası",
    });
  }
});

/**
 * Health endpoint
 */
app.get("/", (req, res) => {
  res.send("🚀 CallMeta Backend Aktif.");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 CallMeta Backend ${PORT} portunda çalışıyor.`);
  syncData();
  setInterval(syncData, 8 * 60 * 60 * 1000);
});
