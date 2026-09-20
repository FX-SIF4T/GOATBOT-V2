const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const supportedDomains = [
  "facebook.com", "fb.watch",
  "youtube.com", "youtu.be",
  "tiktok.com",
  "instagram.com", "instagr.am",
  "likee.com", "likee.video",
  "capcut.com",
  "spotify.com",
  "terabox.com",
  "twitter.com", "x.com",
  "drive.google.com",
  "soundcloud.com",
  "ndown.app",
  "pinterest.com", "pin.it"
];

module.exports = {
  config: {
    name: "alldl",
    version: "2.0",
    author: "SiFu",
    role: 0,
    shortDescription: "All-in-one video/media downloader",
    longDescription:
      "Automatically downloads videos or media from Facebook, YouTube, TikTok, Instagram, Likee, CapCut, Spotify, Terabox, Twitter, Google Drive, SoundCloud, NDown, Pinterest, and more.",
    category: "utility",
    guide: { en: "Just send any supported media link (https://) to auto-download." }
  },

  onStart: async function({ api, event }) {
    api.sendMessage(
      "📥 Send a video/media link (https://) from any supported site (YouTube, Facebook, TikTok, Instagram, Likee, CapCut, Spotify, Terabox, Twitter, Google Drive, SoundCloud, NDown, Pinterest, etc.) to auto-download.",
      event.threadID,
      event.messageID
    );
  },

  onChat: async function({ api, event }) {
    const content = event.body ? event.body.trim() : "";
    if (content.toLowerCase().startsWith("auto")) return;
    if (!content.startsWith("https://")) return;
    if (!supportedDomains.some(domain => content.includes(domain))) return;

    api.setMessageReaction("⌛️🫦🫶🦖⚡✨🧑‍🍼", event.messageID, () => {}, true);

    try {
      const GITHUB_RAW = "https://raw.githubusercontent.com/FX-SIF4T/API-STORE/refs/heads/main/FXS_APIS/apis.json";
      const rawRes = await axios.get(GITHUB_RAW);
      
      const apiBase = rawRes.data.downloadere || rawRes.data.downloader;

      const API = `${apiBase}/alldl?url=${encodeURIComponent(content)}`;
      const res = await axios.get(API);

      if (!res.data) throw new Error("No response from API");

      const mediaURL = res.data.high_quality || res.data.low_quality || res.data.url || res.data.downloadUrl;
      const mediaTitle = res.data.title || "Unknown Title";
      if (!mediaURL) throw new Error("Media not found");

      const extension = mediaURL.includes(".mp3") ? "mp3" : "mp4";
      const buffer = (await axios.get(mediaURL, { responseType: "arraybuffer" })).data;
      const cacheDir = path.join(__dirname, "cache");
      await fs.ensureDir(cacheDir);
      const filePath = path.join(cacheDir, `auto_media_${Date.now()}.${extension}`);
      fs.writeFileSync(filePath, Buffer.from(buffer));

      api.setMessageReaction("🐳🫦😹⚡✨❤️🎊🔥", event.messageID, () => {}, true);
      
      const domain = supportedDomains.find(d => content.includes(d)) || "Unknown Platform";
      const platformName = domain.replace(/(\.com|\.app|\.video|\.net)/, "").toUpperCase();

      const infoCard = 
`╭────────🎀────────╮
      𝐀𝐔𝐓𝐎 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐑
╰────────🎀────────╯

      ❒  ᴅʟ ᴄᴏᴍᴘʟᴇᴛᴇ
      ❒  ᴘʟαᴛꜰᴏʀᴍ: ${platformName}
      ❒   sᴛᴀᴛᴜs : sᴜᴄᴄᴇss
      ❒  ᴏᴡɴᴇʀ: ꜱɪꜰᴜ

       ✨ 𝐄𝐧𝐣𝐨𝐲 𝐲𝐨𝐮𝐫 𝐦𝐞𝐝𝐢𝐚!
━━━━━━━━━━━━━━━━━━━━
 
`;

      api.sendMessage(
        { body: infoCard, attachment: fs.createReadStream(filePath) },
        event.threadID,
        () => fs.unlinkSync(filePath),
        event.messageID
      );
    } catch (e) {
      api.setMessageReaction("❌️", event.messageID, () => {}, true);
    }
  }
};
