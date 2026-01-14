const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const winston = require("winston");
const morgan = require("morgan");

const app = express();
app.use(bodyParser.json());
app.use(morgan("dev"));

// ১. প্রফেশনাল লগিং সিস্টেম
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()]
});

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WIT_TOKEN = process.env.WIT_TOKEN;

let userStates = {};

// ২. ডাইনামিক রিপ্লাই লিস্ট (আপডেট করা হয়েছে)
const dynamicReplies = {
  greeting: [
    "Assalamu Alaikum! Welcome to ANONNA FLAIR. You can visit our website: https://anonnaflair.com",
    "Hi! Welcome to ANONNA FLAIR. Explore our collection here: https://anonnaflair.com",
    "Hello! Welcome to ANONNA FLAIR. Check out our latest designs at: https://anonnaflair.com"
  ],
  // Price ইনটেন্ট এখানে রাখা হয়নি যাতে ভুল করেও অটো-রিপ্লাই না যায়
  delivery_process: [
    "Delivery Update: For luxury items under 10K, we require a 510 BDT advance. For premium sets above 10K, it's 2040 BDT. Secure your order now! Call: +8801781755955",
    "Our delivery is seamless! Since these are high-value imported suits, we take a small commitment advance (510/2040 BDT). Rest is Cash on Delivery. Questions? Call +8801781755955",
    "Standard procedure: 510 BDT advance for orders below 10K, and 2040 BDT for 10K+. We ensure the safest delivery for your luxury choice. Helpline: +8801781755955"
  ],
  authenticity: [
    "Rest assured, ANONNA FLAIR only deals in 100% original Pakistani brands. No copies, no replicas—only authenticity.",
    "Every piece in our collection is sourced directly from original brands. We guarantee 100% authenticity or your money back!",
    "Quality is our priority. We sell only authentic, imported Pakistani designer wear. Shop with confidence!"
  ],
  location: [
    "We are based in Gazipur, Bangladesh. For our exact address or a visit, feel free to call us at +8801781755955.",
    "ANONNA FLAIR is located in Gazipur. You can find our premium collection right here! Need directions? Call +8801781755955"
  ]
};

function getSmartReply(intent) {
  const list = dynamicReplies[intent];
  if (!list) return null;
  return list[Math.floor(Math.random() * list.length)];
}

async function sendReply(psid, text) {
  if (!text) return;
  try {
    await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      recipient: { id: psid },
      message: { text }
    });
    logger.info(`Response sent to ${psid}`);
  } catch (e) { logger.error(`Error sending message: ${e.message}`); }
}

app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.status(200).send(req.query["hub.challenge"]);
  } else { res.sendStatus(403); }
});

app.post("/webhook", async (req, res) => {
  if (req.body.object === "page") {
    req.body.entry.forEach(async (entry) => {
      if (!entry.messaging) return;
      let webhook_event = entry.messaging[0];
      let sender_psid = webhook_event.sender.id;

      if (webhook_event.message && webhook_event.message.text) {
        let message_text = webhook_event.message.text;
        logger.info(`New Message from ${sender_psid}: ${message_text}`);

        if (!userStates[sender_psid]) {
          userStates[sender_psid] = { startTime: Date.now(), repliedByAdmin: false };
          setTimeout(async () => {
            if (userStates[sender_psid] && !userStates[sender_psid].repliedByAdmin) {
              await sendReply(sender_psid, "We apologize for the wait! Our luxury consultants at ANONNA FLAIR are currently busy. We'll be with you shortly. For urgent queries: +8801781755955");
            }
          }, 3600000);
        }

        try {
          let wit_res = await axios.get(
            `https://api.wit.ai/message?v=20251125&q=${encodeURIComponent(message_text)}`,
            { headers: { Authorization: `Bearer ${WIT_TOKEN}` } }
          );

          let firstIntent = wit_res.data.intents[0];

          if (firstIntent && firstIntent.confidence > 0.80) {
            let intentName = firstIntent.name;

            // ৩. প্রাইস সাইলেন্স লজিক (দাম জানতে চাইলে বট চুপ থাকবে)
            if (intentName === "price") {
              logger.info(`Price inquiry ('${message_text}') detected. Bot is staying silent for Admin.`);
              return; 
            }

            let reply = getSmartReply(intentName);

            // গ্রিটিং ট্রেইট ব্যাকআপ
            if (!reply && wit_res.data.traits && wit_res.data.traits['wit$greetings']) {
                reply = getSmartReply('greeting');
            }

            if (reply) {
              await sendReply(sender_psid, reply);
            }
          } else {
            logger.info("Confidence low. Bot is staying silent for Admin.");
          }
        } catch (err) { logger.error("Wit processing failed"); }
      }
    });
    res.status(200).send("EVENT_RECEIVED");
  }
});

app.listen(process.env.PORT || 3000);
