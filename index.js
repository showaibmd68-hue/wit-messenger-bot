// ==========================
// Old GitHub Main Server Code
// ==========================
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WIT_TOKEN = process.env.WIT_TOKEN;

// ✅ Old: Verification webhook (Facebook calls this)
app.get("/webhook", (req, res) => {
  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];
  if (mode && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ==========================
// New Intelligent Logic Additions
// ==========================

// 👉 প্রতি ইউজারের জন্য আলাদা state রাখবো
let userStates = {}; 
// { psid: { isHandover: true/false, lastActive: timestamp, history: [] } }

// ✅ Helper function (New)
async function sendReply(psid, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      recipient: { id: psid },
      message: { text }
    }
  );
}

// ==========================
// Unified Webhook (Old + New merged)
// ==========================
app.post("/webhook", async (req, res) => {
  let body = req.body;

  if (body.object === "page") {
    body.entry.forEach(async function(entry) {
      let webhook_event = entry.messaging[0];
      console.log("📨 Incoming webhook payload:", JSON.stringify(webhook_event, null, 2));
      let sender_psid = webhook_event.sender.id;

      if (webhook_event.message && webhook_event.message.text) {
        let message_text = webhook_event.message.text;

        // ✅ New: ইউজারের state বের করো
        let state = userStates[sender_psid] || { isHandover: false, lastActive: Date.now(), history: [] };

        // ✅ New: history তে মেসেজ যোগ করো
        state.history.push({ text: message_text, time: Date.now() });

        // ✅ New: ২৪ ঘন্টা পরে আবার greetings + নাম ধরে জিজ্ঞাসা
        if (Date.now() - state.lastActive > 24 * 60 * 60 * 1000) {
          state.isHandover = false;

          try {
            let userProfile = await axios.get(
              `https://graph.facebook.com/${sender_psid}?fields=first_name&access_token=${PAGE_ACCESS_TOKEN}`
            );
            let name = userProfile.data.first_name;

            let greeting = /[\u0980-\u09FF]/.test(message_text)
              ? `আবার স্বাগতম ${name}! কেমন আছেন?`
              : `Welcome back ${name}! How are you?`;

            await sendReply(sender_psid, greeting);
          } catch (err) {
            console.error("Greeting error:", err.message);
          }
        }

        // ✅ New: যদি handover active থাকে → bot silent
        if (state.isHandover) {
          console.log("Conversation handed over to admin. Bot silent.");
          return;
        }

        try {
          // ✅ Old: Wit.ai intent detect
          let wit_response = await axios.get(
            `https://api.wit.ai/message?v=20251125&q=${encodeURIComponent(message_text)}`,
            { headers: { Authorization: `Bearer ${WIT_TOKEN}` } }
          );

          let intent = wit_response.data.intents[0]?.name || "default";
          let reply = "";

          // ✅ New: Language detection (Bangla, English, Banglish)
          let isBangla = /[\u0980-\u09FF]/.test(message_text);
          let isEnglish = /^[A-Za-z\s?]+$/.test(message_text);
          let isBanglish = !isBangla && !isEnglish;

          // ✅ Unified Intent → Response mapping
          if (intent === "greeting") {
            if (isBangla) reply = "হ্যালো! আমি SISTER AI। আমি কীভাবে সাহায্য করতে পারি?";
            else if (isEnglish) reply = "Hello! I am SISTER AI. How can I help you?";
            else if (isBanglish) reply = "Hi! Ami SISTER AI, ki help korte pari?";
          } else if (intent === "price_inquiry") {
            if (isBangla) reply = "আমাদের প্রোডাক্টের দাম জানতে লিঙ্ক/প্রোডাক্ট বলুন।";
            else if (isEnglish) reply = "Please share the product/link to know the price.";
            else if (isBanglish) reply = "Dress er price জানতে লিঙ্ক/প্রোডাক্ট দিন।";
          } else if (intent === "order_status") {
            if (isBangla) reply = "অর্ডার স্ট্যাটাস জানতে অর্ডার নম্বর দিন।";
            else if (isEnglish) reply = "To check order status, please provide your order number.";
            else if (isBanglish) reply = "Order status jante order number din.";
          } else if (/আপনি কে/i.test(message_text) || /who are you/i.test(message_text)) {
            reply = isBangla 
              ? "আমি SISTER AI, একজন কৃত্তিম বুদ্ধিমত্তা।" 
              : "I am SISTER AI, an artificial intelligence.";
          } else {
            // ✅ Old fallback + New handover
            reply = isBangla
              ? "এই বিষয়ে এখনি আমাদের admin এর কাছে ট্রান্সফার করা হয়েছে। এডমিন ফ্রি হয়েই আপনার রিপ্লাই দিবে দ্রুত, প্লিজ ওয়েট করুন।"
              : "This issue has been transferred to our admin. Please wait, the admin will reply soon.";
            state.isHandover = true;
          }

          // ✅ Unified: Messenger API দিয়ে reply পাঠানো হচ্ছে
          await sendReply(sender_psid, reply);

        } catch (err) {
          console.error(err.response?.data || err.message);
        }

        // ✅ New: state update করো
        state.lastActive = Date.now();
        userStates[sender_psid] = state;
      }
    });
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

// ✅ Old: Server listen
app.listen(process.env.PORT || 3000, () => console.log("Server is running"));
