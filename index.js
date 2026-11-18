const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const SOURCE_URL =
  "https://raw.githubusercontent.com/symbuzzer/Turkish-Spam-Numbers/main/SpamBlocker.csv";

const MY_REPO_OWNER = "aykutsen1987";
const MY_REPO_NAME = "spam-shield-database";

const GITHUB_TOKEN = process.env.GH_TOKEN;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const CUSTOM_FILE = path.join(__dirname, "custom_numbers.json");

let cachedData = [];
let lastSyncTime = null;

/* -------------------------------------------------- */
/* CUSTOM NUMARA DOSYA İŞLEMLERİ */
/* -------------------------------------------------- */

function loadCustomNumbers() {
  try {
    if (!fs.existsSync(CUSTOM_FILE)) {
      fs.writeFileSync(CUSTOM_FILE, JSON.stringify([], null, 2));
      return [];
    }

    const data = fs.readFileSync(CUSTOM_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("❌ Custom numara okuma hatası:", err.message);
    return [];
  }
}

function saveCustomNumbers(numbers) {
  fs.writeFileSync(CUSTOM_FILE, JSON.stringify(numbers, null, 2));
}

/* -------------------------------------------------- */
/* GITHUB BACKUP */
/* -------------------------------------------------- */

async function updateMyBackup(data) {
  if (!GITHUB_TOKEN) {
    console.log("⚠️ GH_TOKEN yok, yedekleme atlandı.");
    return;
  }

  const url = `https://api.github.com/repos/${MY_REPO_OWNER}/${MY_REPO_NAME}/contents/backup.json`;
  // Android uygulaması (BackupResponse) bu biçimi bekler.
  const backupObject = {
    version: "1",
    updatedAt: lastSyncTime,
    numbers: data.map((n) => ({ number: n, riskLevel: "HIGH", category: "Spam" })),
  };
  const contentBase64 = Buffer.from(
    JSON.stringify(backupObject, null, 2)
  ).toString("base64");

  try {
    let sha = "";
    let oldContent = "";

    try {
      const res = await axios.get(url, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` },
      });

      sha = res.data.sha;
      oldContent = res.data.content.replace(/\n/g, "");
    } catch (e) {
      console.log("📁 İlk backup oluşturuluyor...");
    }

    if (contentBase64 === oldContent) {
      console.log("✅ Veri aynı, tekrar yazılmadı.");
      return;
    }

    await axios.put(
      url,
      {
        message: `[skip ci] [skip render] Veri Güncelleme: ${new Date().toLocaleString(
          "tr-TR"
        )}`,
        content: contentBase64,
        sha: sha || undefined,
      },
      {
        headers: { Authorization: `token ${GITHUB_TOKEN}` },
      }
    );

    console.log("🚀 GitHub yedek güncellendi.");
  } catch (error) {
    console.error("❌ GitHub yedek hatası:", error.message);
  }
}

/* -------------------------------------------------- */
/* VERİ SENKRON */
/* -------------------------------------------------- */

async function syncData() {
  try {
    console.log("🔄 Senkron başlatıldı...");

    const response = await axios.get(SOURCE_URL, { timeout: 30000 });

    const remoteNumbers = response.data
      .split(/\r?\n/)
      .map((n) => n.trim())
      .filter((n) => /^\+?\d{6,}$/.test(n));

    const customNumbers = loadCustomNumbers();

    const merged = [...new Set([...remoteNumbers, ...customNumbers])];

    cachedData = merged;
    lastSyncTime = new Date().toISOString();

    console.log(`✅ Toplam ${cachedData.length} numara aktif.`);

    await updateMyBackup(cachedData);
  } catch (error) {
    console.error("❌ Kaynak hatası:", error.message);
  }
}

/* -------------------------------------------------- */
/* PUBLIC API */
/* -------------------------------------------------- */

app.get("/api/check", async (req, res) => {
  try {
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

/* -------------------------------------------------- */
/* ADMIN API */
/* -------------------------------------------------- */

app.post("/api/admin/add", async (req, res) => {
  try {
    const token = req.headers["x-admin-token"];
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return res.status(403).json({ success: false, message: "Yetkisiz" });
    }

    const { number } = req.body;

    if (!number || !/^\+?\d{6,}$/.test(number)) {
      return res
        .status(400)
        .json({ success: false, message: "Geçersiz numara" });
    }

    let customNumbers = loadCustomNumbers();

    if (customNumbers.includes(number)) {
      return res.json({ success: true, message: "Numara zaten mevcut" });
    }

    customNumbers.push(number);
    saveCustomNumbers(customNumbers);

    await syncData();

    res.json({ success: true, message: "Numara eklendi" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

/* -------------------------------------------------- */
/* HEALTH */
/* -------------------------------------------------- */

app.get("/", (req, res) => {
  res.send("🚀 NumaraKalkan Spam Shield Backend Aktif.");
});

/* -------------------------------------------------- */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Backend ${PORT} portunda çalışıyor.`);
  syncData();
  setInterval(syncData, 8 * 60 * 60 * 1000);
});
