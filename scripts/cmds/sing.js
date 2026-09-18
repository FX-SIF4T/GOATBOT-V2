"use strict";

const path  = require("path");
const fs    = require("fs-extra");
const axios = require("axios");

const SIFAT_CDTESE = "https://raw.githubusercontent.com/FX-SIF4T/API-STORE/refs/heads/main/FXS_APIS/apis.json";
const SIFAT_SXY    = "";

let SIFAT = process.env.SIFU_API_BASE ? process.env.SIFU_API_BASE.replace(/\/+$/, "") : null;
const DHON = (async () => {
    if (SIFAT) return;
    try {
        const r = await axios.get(SIFAT_CDTESE, { timeout: 6000 });
        const u = r.data?.music_api;
        if (u && u.startsWith("http")) SIFAT = u.replace(/\/+$/, "");
    } catch {}
    if (!SIFAT) SIFAT = SIFAT_SXY;
})();
const getSIFAT = async () => { await DHON; return SIFAT; };

const TMO   = parseInt(process.env.SIFU_TIMEOUT_MS || "180000", 10);
const MAXMB = parseFloat(process.env.SIFU_MAX_MB   || "25");
const TTL   = parseInt(process.env.SIFU_CACHE_TTL  || String(3600_000), 10);
const DIR   = path.join(__dirname, "cache");

const QUALITIES = ["128", "192", "320"];
const DEF_Q     = "320";

const RETRY_CODES = new Set(["ECONNRESET","ETIMEDOUT","ECONNABORTED","EAI_AGAIN","ENETUNREACH","EPIPE"]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(p, params) {
    const api = await getSIFAT();
    for (let i = 0; i < 3; i++) {
        try { return (await axios.get(api + p, { params, timeout: TMO, validateStatus: s => s < 300 })).data; }
        catch (e) {
            if (!RETRY_CODES.has(e.code) && !(e.response?.status >= 502)) throw e;
            if (i === 2) throw e;
            await sleep(600 * 2 ** i);
        }
    }
}

async function stream(p, params) {
    const api = await getSIFAT();
    for (let i = 0; i < 3; i++) {
        try { return await axios.get(api + p, { params, timeout: TMO, responseType: "stream", validateStatus: s => s < 300 }); }
        catch (e) {
            if (!RETRY_CODES.has(e.code) && !(e.response?.status >= 502)) throw e;
            if (i === 2) throw e;
            await sleep(600 * 2 ** i);
        }
    }
}

const safeId = s => String(s).replace(/[^A-Za-z0-9_-]/g, "");

async function cached(id, tag, ext) {
    if (!id) return null;
    const p = path.join(DIR, `${safeId(id)}_${tag}.${ext}`);
    try {
        const st = await fs.stat(p);
        if (Date.now() - st.mtimeMs > TTL || st.size < 1024) { fs.unlink(p).catch(() => {}); return null; }
        fs.utimes(p, new Date(), new Date()).catch(() => {});
        return { path: p, size: st.size };
    } catch { return null; }
}

async function prune() {
    try {
        await fs.ensureDir(DIR);
        const now = Date.now(), stats = [], files = await fs.readdir(DIR);
        let total = 0;
        for (const f of files) {
            const fp = path.join(DIR, f);
            try {
                const st = await fs.stat(fp);
                if (!st.isFile()) continue;
                if (now - st.mtimeMs > TTL) { fs.unlink(fp).catch(() => {}); continue; }
                stats.push({ fp, size: st.size, mtime: st.mtimeMs }); total += st.size;
            } catch {}
        }
        if (total <= 500 * 1024 * 1024) return;
        stats.sort((a, b) => a.mtime - b.mtime);
        for (const s of stats) { if (total <= 500 * 1024 * 1024) break; fs.unlink(s.fp).catch(() => {}); total -= s.size; }
    } catch {}
}

async function saveToDisk(apiPath, params, dest) {
    await fs.ensureDir(DIR);
    const res = await stream(apiPath, params), tmp = dest + ".part";
    try {
        await new Promise((ok, fail) => {
            const w = fs.createWriteStream(tmp);
            res.data.pipe(w); w.on("finish", ok); w.on("error", fail); res.data.on("error", fail);
        });
        await fs.move(tmp, dest, { overwrite: true });
        return { path: dest, size: (await fs.stat(dest)).size, headers: res.headers };
    } catch (e) { fs.unlink(tmp).catch(() => {}); throw e; }
}

const YT_RX  = /^(https?:\/\/)?(www\.|music\.|m\.)?(youtube\.com|youtu\.be)\//i;
const YT_ID  = /(?:v=|\/shorts\/|\/embed\/|youtu\.be\/|\/v\/)([A-Za-z0-9_-]{11})/;
const isYT   = s => YT_RX.test(String(s).trim());
const ytId   = u => (u?.match(YT_ID) || [])[1] || null;
const normYT = u => { const id = ytId(u); return id ? `https://www.youtube.com/watch?v=${id}` : u?.split("?si=")[0]; };

const react = (ctx, e) => { try { ctx.api?.setMessageReaction?.(e, ctx.event.messageID, () => {}, true); } catch {} };
const reply = (ctx, m) => ctx.reply(m).catch(() => null);

module.exports = {
    config: {
        name: "sing", aliases: ["mp3", "song", "music", "audio"],
        version: "4.1.0", author: "SIFAT", category: "media", role: 0, countDown: 0,
        description: { en: "Download MP3 from YouTube. Unlimited concurrent requests." },
        guide: { en: "{pn} <song | URL> [-q 128|192|320] [-list] [pick <n>]" },
    },

    onStart({ args, event, message, api }) {
        return module.exports._run({ args, ctx: { reply: message.reply.bind(message), event, api } });
    },

    onReply({ event, Reply, message, api }) {
        if (event.senderID !== Reply.author) return;
        const n = parseInt(event.body?.trim());
        if (isNaN(n) || n < 1 || n > Reply.results.length) return;
        const ctx = { reply: message.reply.bind(message), event, api };
        try { api.unsendMessage(Reply.messageID); } catch {}
        global.GoatBot.onReply.delete(Reply.messageID);
        react(ctx, "📥");
        return module.exports._run({ args: [], ctx, _pick: Reply.results[n - 1], _quality: Reply.quality });
    },

    async _run({ args, ctx, _pick, _quality }) {
        const uid = ctx.event?.senderID;
        try {
            let quality = _quality || DEF_Q, mode = "dl", query = "", rest = [];
            if (!_pick) {
                for (let i = 0; i < args.length; i++) {
                    const a = args[i].toLowerCase();
                    if (a === "-list" || a === "--list") { mode = "list"; continue; }
                    if ((a === "-q" || a === "--quality") && QUALITIES.includes(args[i + 1])) { quality = args[++i]; continue; }
                    rest.push(args[i]);
                }
                query = rest.join(" ").trim();
            }

            prune().catch(() => {});

            if (mode === "list") {
                if (!query) return;
                react(ctx, "🔍");
                try {
                    await fs.ensureDir(DIR);
                    const searchData = await get("/api/music/search", { q: query, limit: 6 });
                    const results = searchData?.results || [];
                    if (!results.length) { react(ctx, "❌"); return; }

                    const imgPath = path.join(DIR, `sing_${uid}_${Date.now()}.png`);
                    const res = await stream("/api/video/search-image", { q: query, limit: 6, cmd: "Reply 1-6" });
                    await new Promise((ok, fail) => {
                        const w = fs.createWriteStream(imgPath);
                        res.data.pipe(w); w.on("finish", ok); w.on("error", fail); res.data.on("error", fail);
                    });

                    react(ctx, "✅");
                    const sent = await reply(ctx, { body: "", attachment: fs.createReadStream(imgPath) });
                    setTimeout(() => fs.unlink(imgPath).catch(() => {}), 15_000);
                    if (sent?.messageID) global.GoatBot.onReply.set(sent.messageID, {
                        commandName: "sing", messageID: sent.messageID, author: uid, results, quality,
                    });
                } catch (e) { react(ctx, "❌"); console.error("[sing] list:", e.message); }
                return;
            }

            let url;
            if (_pick) {
                url = normYT(_pick.url);
            } else {
                if (!query) { react(ctx, "❌"); return; }
                if (isYT(query)) { url = normYT(query); react(ctx, "📥"); }
                else {
                    react(ctx, "🔍");
                    const d = await get("/api/music/search", { q: query, limit: 1 });
                    const top = d?.results?.[0];
                    if (!top?.url) { react(ctx, "❌"); return; }
                    url = normYT(top.url); react(ctx, "📥");
                }
            }

            const vid = ytId(url);
            const tag = `mp3_${quality}`;
            const hit = await cached(vid, tag, "mp3");
            let fp, sz;

            if (hit) { fp = hit.path; sz = hit.size; }
            else {
                const dest = vid ? path.join(DIR, `${safeId(vid)}_${tag}.mp3`) : path.join(DIR, `tmp_${uid}_${Date.now()}.mp3`);
                const dl = await saveToDisk("/api/music/download", { url, quality, fast: "1" }, dest);
                fp = dl.path; sz = dl.size;
            }

            if (sz < 1024 || sz / 1048576 > MAXMB) { fs.unlink(fp).catch(() => {}); react(ctx, "❌"); return; }
            react(ctx, "✅");
            await reply(ctx, { body: "", attachment: fs.createReadStream(fp) });

        } catch (e) { react(ctx, "❌"); console.error("[sing]", e.message); }
    },
};
