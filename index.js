cd ~/wa-bot-v2
cat << 'EOF' > index.js
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason
} from "@whiskeysockets/baileys";
import pino from "pino";
import {
  BOT_OWNER,
  ROAST_LINES,
  BAD_WORDS,
  state,
  getMutedSet,
  nextRoastLine
} from "./state.js";

const SIGNATURE = "✨『𝓐𝓱𝓶𝓮𝓭』✨";

function withSig(text) {
  return `${text}\n\n${SIGNATURE}`;
}

function cleanDigits(jid = "") {
  return String(jid).split("@")[0].split(":")[0].replace(/\D/g, "");
}

function sameUser(a = "", b = "") {
  const da = cleanDigits(a);
  const db = cleanDigits(b);
  return Boolean(da && db && da === db);
}

function toJid(phoneOrJid = "") {
  const digits = cleanDigits(phoneOrJid);
  return digits ? `${digits}@s.whatsapp.net` : null;
}

function normalizeArabic(str = "") {
  return String(str)
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractText(msg) {
  const m = msg?.message;
  if (!m) return "";
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ""
  ).trim();
}

function hasLink(text = "") {
  return /(https?:\/\/|www\.|chat\.whatsapp\.com\/|t\.me\/|instagram\.com\/|tiktok\.com\/|youtube\.com\/|youtu\.be\/|facebook\.com\/)/i.test(
    text
  );
}

function hasBadWord(text = "") {
  const norm = normalizeArabic(text);
  if (!norm) return false;
  return BAD_WORDS.some((w) => {
    const nw = normalizeArabic(w);
    return nw && norm.includes(nw);
  });
}

function getTargetJid(msg, body = "") {
  const ext = msg?.message?.extendedTextMessage;
  const mentioned = ext?.contextInfo?.mentionedJid || [];
  if (mentioned.length > 0) return toJid(mentioned[0]);

  const quotedParticipant = ext?.contextInfo?.participant;
  if (quotedParticipant) return toJid(quotedParticipant);

  const args = body.trim().split(/\s+/).slice(1).join(" ");
  if (args) {
    const j = toJid(args);
    if (j && cleanDigits(j).length >= 8) return j;
  }
  return null;
}

async function isGroupAdmin(sock, groupId, senderJid) {
  try {
    const meta = await sock.groupMetadata(groupId);
    const senderDigits = cleanDigits(senderJid);
    const botDigits = cleanDigits(sock.user?.id);

    const participant = meta.participants.find((p) => {
      const pDigits = cleanDigits(p.id);
      const pPhoneDigits = cleanDigits(p.phoneNumber);
      return (
        p.id === senderJid ||
        (senderDigits && (pDigits === senderDigits || pPhoneDigits === senderDigits)) ||
        (senderDigits && botDigits && senderDigits === botDigits && (pDigits === botDigits || pPhoneDigits === botDigits))
      );
    });

    if (!participant) return false;
    return participant.admin === "admin" || participant.admin === "superadmin";
  } catch {
    return false;
  }
}

const JOKES = [
  "مرة واحد كسول جداً، اشترى ساعة عشان يشوف الوقت... كسلت تلف العقارب وقفها 😂",
  "مدرس سأل تلميذ: لو معاك 5 تفاحات وأكلت 2 يتبقى كام؟ قاله: يتبقى وجع بطن يا أستاذ 😅",
  "واحد بيقول لصاحبه: نفسي أبقى غني ومشهور، قاله: بسيطه، افتح لايف وقول إنك هتوزع فلوس 😂"
];

const WISDOMS = [
  "الهدوء وقت الغضب نصف الانتصار.",
  "من لا يتعلم من أخطائه يكررها بصيغة أصعب.",
  "كلمة واحدة في وقتها قد تغنيك عن ألف مبرر."
];

const CHALLENGES = [
  "تحدي: اكتب اسم أكلة بتبدأ بحرف الميم من غير تفكير في 5 ثواني!",
  "تحدي: ابعت إيموجي بيعبر عن مودك دلوقتي من غير ولا كلمة.",
  "تحدي: قول كلمة للي قبلك في الشات بأسلوب محترم أو كوميدي."
];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function startBot() {
  const { state: authState, saveCreds } = await useMultiFileAuthState("./auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: authState,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu("Chrome"),
    markOnlineOnConnect: false
  });

  sock.ev.on("creds.update", saveCreds);

  let pairingRequested = false;

  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "connecting" && !authState.creds.registered && !pairingRequested) {
      pairingRequested = true;
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(BOT_OWNER);
          const formatted = code?.match(/.{1,4}/g)?.join("-") || code;
          console.log("\n====================================");
          console.log("🔑 كود الربط:", formatted);
          console.log("====================================\n");
        } catch (err) {
          console.log("❌ خطأ في طلب كود الربط:", err?.message || err);
        }
      }, 3000);
    }

    if (connection === "open") {
      console.log(`✅ البوت متصل وجاهز | ${SIGNATURE}`);
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`⚠️ انقطع الاتصال (Code: ${code}) | إعادة الاتصال: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(startBot, 2500);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages?.[0];
    if (!msg?.message) return;

    const chatId = msg.key.remoteJid;
    if (!chatId || chatId === "status@broadcast") return;

    const isGroup = chatId.endsWith("@g.us");
    const rawSender = isGroup
      ? (msg.key.participant || (msg.key.fromMe ? sock.user?.id : ""))
      : (msg.key.fromMe ? sock.user?.id || chatId : chatId);

    const senderDigits = cleanDigits(rawSender);
    const senderJid = senderDigits ? `${senderDigits}@s.whatsapp.net` : chatId;
    const body = extractText(msg);
    if (!body) return;

    const isOwner =
      Boolean(msg.key.fromMe) ||
      senderDigits === cleanDigits(BOT_OWNER) ||
      senderDigits === cleanDigits(sock.user?.id);

    // أوامر قفل وفتح البوت
    if (body === ".قفل") {
      state.botEnabled = false;
      await sock.sendMessage(chatId, { text: withSig("🔒 تم قفل البوت بنجاح.") }, { quoted: msg });
      return;
    }

    if (body === ".فتح") {
      state.botEnabled = true;
      await sock.sendMessage(chatId, { text: withSig("🔓 تم فتح البوت بنجاح.") }, { quoted: msg });
      return;
    }

    if (!state.botEnabled) return;

    // أوامر الوضع الخاص والسماح والمنع
    if (body === ".خاص") {
      state.privateMode = true;
      state.allowedUsers.add(cleanDigits(BOT_OWNER));
      if (senderDigits) state.allowedUsers.add(senderDigits);
      await sock.sendMessage(chatId, { text: withSig("🛡️ تم تفعيل الوضع الخاص.") }, { quoted: msg });
      return;
    }

    if (body === ".عام") {
      state.privateMode = false;
      await sock.sendMessage(chatId, { text: withSig("🌐 تم إلغاء الوضع الخاص وجعل البوت عاماً.") }, { quoted: msg });
      return;
    }

    if (body.startsWith(".سماح")) {
      const target = getTargetJid(msg, body);
      const tDigits = cleanDigits(target);
      if (!tDigits) {
        await sock.sendMessage(chatId, { text: withSig("❌ منشن الشخص أو رد على رسالته أو اكتب رقمه بعد `.سماح`.") }, { quoted: msg });
        return;
      }
      state.allowedUsers.add(tDigits);
      state.blockedUsers.delete(tDigits);
      await sock.sendMessage(chatId, { text: withSig(`✅ تم السماح للرقم ${tDigits} باستخدام البوت في الوضع الخاص.`) }, { quoted: msg });
      return;
    }

    if (body.startsWith(".منع") && !body.startsWith(".منع لينكات") && !body.startsWith(".منع الفاظ")) {
      const target = getTargetJid(msg, body);
      const tDigits = cleanDigits(target);
      if (!tDigits) {
        await sock.sendMessage(chatId, { text: withSig("❌ منشن الشخص أو رد على رسالته أو اكتب رقمه بعد `.منع`.") }, { quoted: msg });
        return;
      }
      state.blockedUsers.add(tDigits);
      state.allowedUsers.delete(tDigits);
      await sock.sendMessage(chatId, { text: withSig(`🚫 تم منع الرقم ${tDigits} من استخدام البوت.`) }, { quoted: msg });
      return;
    }

    if (senderDigits && state.blockedUsers.has(senderDigits) && !isOwner) {
      return;
    }

    if (state.privateMode && !isOwner) {
      const isAllowed = senderDigits && state.allowedUsers.has(senderDigits);
      if (!isAllowed) return;
    }

    // حماية الجروب: الكتم ومنع اللينكات ومنع الألفاظ
    if (isGroup) {
      const mutedSet = getMutedSet(chatId);
      if (senderDigits && mutedSet.has(senderDigits) && !isOwner) {
        try {
          await sock.sendMessage(chatId, { delete: msg.key });
        } catch {}
        return;
      }

      if (state.linkGuardGroups.has(chatId) && hasLink(body) && !isOwner) {
        const admin = await isGroupAdmin(sock, chatId, senderJid);
        if (!admin) {
          try {
            await sock.sendMessage(chatId, { delete: msg.key });
          } catch {}
          return;
        }
      }

      if (state.wordGuardGroups.has(chatId) && hasBadWord(body) && !isOwner) {
        const admin = await isGroupAdmin(sock, chatId, senderJid);
        if (!admin) {
          try {
            await sock.sendMessage(chatId, { delete: msg.key });
          } catch {}
          return;
        }
      }
    }

    // أوامر الشتيمة والرد التلقائي واحدة واحدة
    if (body === ".اشتم") {
      state.roastAutoMode = true;
      state.roastChats.add(chatId);
      const line = nextRoastLine();
      await sock.sendMessage(chatId, { text: withSig(line) }, { quoted: msg });
      return;
    }

    if (body === ".اشتم شات" || body === ".اشتم روم") {
      state.roastAutoMode = true;
      state.roastChats.add(chatId);
      await sock.sendMessage(chatId, { text: withSig("🔥 تم تفعيل وضع الشتيمة والرد التلقائي في هذا الشات.") }, { quoted: msg });
      return;
    }

    if (body === ".اسكت") {
      state.roastAutoMode = false;
      state.roastChats.delete(chatId);
      await sock.sendMessage(chatId, { text: withSig("🤐 تم إيقاف وضع الشتيمة والرد التلقائي.") }, { quoted: msg });
      return;
    }

    // إذا كان وضع الشتيمة مفعلاً والطرف الآخر غلط بكلمة شتيمة أو تخص الأم/الأب/الأهل
    if ((state.roastAutoMode || state.roastChats.has(chatId)) && !isOwner && hasBadWord(body)) {
      const line = nextRoastLine();
      await sock.sendMessage(chatId, { text: withSig(line) }, { quoted: msg });
      return;
    }

    // أوامر المشرفين في الجروب
    if (isGroup) {
      const admin = await isGroupAdmin(sock, chatId, senderJid);
      const adminCmds = [
        ".طرد",
        ".كتم",
        ".فك",
        ".منع لينكات",
        ".اسكت لينكات",
        ".منع الفاظ",
        ".اسكت الفاظ",
        ".قفل روم",
        ".فتح روم"
      ];

      if (adminCmds.some((cmd) => body === cmd || body.startsWith(cmd + " ")) && !admin && !isOwner) {
        await sock.sendMessage(chatId, { text: withSig("❌ هذا الأمر متاح لمشرفي الجروب فقط.") }, { quoted: msg });
        return;
      }

      if (body.startsWith(".طرد")) {
        const target = getTargetJid(msg, body);
        if (!target) {
          await sock.sendMessage(chatId, { text: withSig("❌ منشن الشخص أو رد على رسالته أو اكتب رقمه بعد `.طرد`.") }, { quoted: msg });
          return;
        }
        try {
          await sock.groupParticipantsUpdate(chatId, [target], "remove");
          await sock.sendMessage(chatId, { text: withSig(`👢 تم طرد ${cleanDigits(target)} من الجروب.`) }, { quoted: msg });
        } catch {
          await sock.sendMessage(chatId, { text: withSig("❌ تعذر الطرد، تأكد أن البوت مشرف في الجروب.") }, { quoted: msg });
        }
        return;
      }

      if (body.startsWith(".كتم")) {
        const target = getTargetJid(msg, body);
        const tDigits = cleanDigits(target);
        if (!tDigits) {
          await sock.sendMessage(chatId, { text: withSig("❌ منشن الشخص أو رد على رسالته أو اكتب رقمه بعد `.كتم`.") }, { quoted: msg });
          return;
        }
        getMutedSet(chatId).add(tDigits);
        await sock.sendMessage(chatId, { text: withSig(`🔇 تم كتم ${tDigits} في الجروب.`) }, { quoted: msg });
        return;
      }

      if (body.startsWith(".فك")) {
        const target = getTargetJid(msg, body);
        const tDigits = cleanDigits(target);
        if (!tDigits) {
          await sock.sendMessage(chatId, { text: withSig("❌ منشن الشخص أو رد على رسالته أو اكتب رقمه بعد `.فك`.") }, { quoted: msg });
          return;
        }
        getMutedSet(chatId).delete(tDigits);
        await sock.sendMessage(chatId, { text: withSig(`🔊 تم فك الكتم عن ${tDigits}.`) }, { quoted: msg });
        return;
      }

      if (body === ".منع لينكات") {
        state.linkGuardGroups.add(chatId);
        await sock.sendMessage(chatId, { text: withSig("🔗 تم تفعيل منع اللينكات في الجروب.") }, { quoted: msg });
        return;
      }

      if (body === ".اسكت لينكات") {
        state.linkGuardGroups.delete(chatId);
        await sock.sendMessage(chatId, { text: withSig("✅ تم إيقاف منع اللينكات في الجروب.") }, { quoted: msg });
        return;
      }

      if (body === ".منع الفاظ") {
        state.wordGuardGroups.add(chatId);
        await sock.sendMessage(chatId, { text: withSig("🚫 تم تفعيل منع الألفاظ في الجروب.") }, { quoted: msg });
        return;
      }

      if (body === ".اسكت الفاظ") {
        state.wordGuardGroups.delete(chatId);
        await sock.sendMessage(chatId, { text: withSig("✅ تم إيقاف منع الألفاظ في الجروب.") }, { quoted: msg });
        return;
      }

      if (body === ".قفل روم") {
        try {
          await sock.groupSettingUpdate(chatId, "announcement");
          await sock.sendMessage(chatId, { text: withSig("🔒 تم قفل الجروب (الرسائل للمشرفين فقط).") }, { quoted: msg });
        } catch {
          await sock.sendMessage(chatId, { text: withSig("❌ تعذر قفل الجروب، تأكد أن البوت مشرف.") }, { quoted: msg });
        }
        return;
      }

      if (body === ".فتح روم") {
        try {
          await sock.groupSettingUpdate(chatId, "not_announcement");
          await sock.sendMessage(chatId, { text: withSig("🔓 تم فتح الجروب للجميع.") }, { quoted: msg });
        } catch {
          await sock.sendMessage(chatId, { text: withSig("❌ تعذر فتح الجروب، تأكد أن البوت مشرف.") }, { quoted: msg });
        }
        return;
      }

      if (body === ".منشن" || body === ".منشن الكل") {
        try {
          const meta = await sock.groupMetadata(chatId);
          const mentions = meta.participants.map((p) => p.id);
          const listText = mentions.map((id) => `@${cleanDigits(id)}`).join(" ");
          await sock.sendMessage(
            chatId,
            { text: withSig(`📢 منشن للجميع:\n${listText}`), mentions },
            { quoted: msg }
          );
        } catch {
          await sock.sendMessage(chatId, { text: withSig("❌ تعذر عمل المنشن في الجروب.") }, { quoted: msg });
        }
        return;
      }

      if (body === ".معلومات الجروب") {
        try {
          const meta = await sock.groupMetadata(chatId);
          const adminsCount = meta.participants.filter((p) => p.admin).length;
          const info = [
            "📋 *معلومات الجروب*",
            `• الاسم: ${meta.subject}`,
            `• عدد الأعضاء: ${meta.participants.length}`,
            `• عدد المشرفين: ${adminsCount}`,
            `• منع اللينكات: ${state.linkGuardGroups.has(chatId) ? "مفعل" : "متوقف"}`,
            `• منع الألفاظ: ${state.wordGuardGroups.has(chatId) ? "مفعل" : "متوقف"}`
          ].join("\n");
          await sock.sendMessage(chatId, { text: withSig(info) }, { quoted: msg });
        } catch {
          await sock.sendMessage(chatId, { text: withSig("❌ تعذر جلب معلومات الجروب.") }, { quoted: msg });
        }
        return;
      }
    }

    // استرداد صورة البروفايل
    if (body === ".استرداد" || body.startsWith(".استرداد ")) {
      const target = getTargetJid(msg, body) || (!isGroup ? toJid(chatId) : null);
      if (!target) {
        await sock.sendMessage(chatId, { text: withSig("❌ رد على رسالة الشخص أو منشنه أو اكتب رقمه بعد `.استرداد`.") }, { quoted: msg });
        return;
      }
      try {
        const ppUrl = await sock.profilePictureUrl(target, "image");
        await sock.sendMessage(
          chatId,
          { image: { url: ppUrl }, caption: withSig(`🖼️ صورة بروفايل: ${cleanDigits(target)}`) },
          { quoted: msg }
        );
      } catch {
        await sock.sendMessage(chatId, { text: withSig("❌ لا توجد صورة بروفايل متاحة أو خصوصية الحساب تمنع عرضها.") }, { quoted: msg });
      }
      return;
    }

    // أدوات الترفيه والحالة
    if (body === ".بنج" || body === ".تست") {
      await sock.sendMessage(chatId, { text: withSig("⚡ البوت شغال تمام وسريع!") }, { quoted: msg });
      return;
    }

    if (body === ".نكته") {
      await sock.sendMessage(chatId, { text: withSig(randomItem(JOKES)) }, { quoted: msg });
      return;
    }

    if (body === ".حكمه") {
      await sock.sendMessage(chatId, { text: withSig(`💡 ${randomItem(WISDOMS)}`) }, { quoted: msg });
      return;
    }

    if (body === ".تحدي") {
      await sock.sendMessage(chatId, { text: withSig(randomItem(CHALLENGES)) }, { quoted: msg });
      return;
    }

    if (body === ".حظ") {
      const pct = Math.floor(Math.random() * 101);
      await sock.sendMessage(chatId, { text: withSig(`🍀 نسبة حظك اليوم: *${pct}%*`) }, { quoted: msg });
      return;
    }

    if (body === ".روليت") {
      const chambers = ["🔫 طلقة فارغة... نجوت!", "💥 بوووم! طلقة حقيقية!"];
      await sock.sendMessage(chatId, { text: withSig(`🎰 روليت: ${randomItem(chambers)}`) }, { quoted: msg });
      return;
    }
  });
}

startBot();
EOF
echo "✅ تم إنشاء index.js بنجاح"
  
