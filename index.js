const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const winston = require("winston");
const morgan = require("morgan");

const app = express();
app.use(bodyParser.json());
app.use(morgan("combined")); // Morgan লগিং চালু করা হলো

// Winston Logger সেটিংস
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WIT_TOKEN = process.env.WIT_TOKEN;

// ইউজার স্টেট ডাটাবেস (মেমোরি ভিত্তিক, Vercel-এর জন্য উপযুক্ত)
let userStates = {}; 

async function sendReply(psid, text) {
  try {
    await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      recipient: { id: psid },
      message: { text }
    });
    logger.info(`Reply sent to ${psid}`);
  } catch (e) { 
    logger.error("Error sending message: " + e.message); 
  }
}

// ফেসবুক ভেরিফিকেশন
app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  let body = req.body;
  if (body.object === "page") {
    body.entry.forEach(async (entry) => {
      if (!entry.messaging) return;
      let webhook_event = entry.messaging[0];
      let sender_psid = webhook_event.sender.id;

      if (webhook_event.message && webhook_event.message.text) {
        let message_text = webhook_event.message.text;
        
        // ইউজার স্টেট চেক
        if (!userStates[sender_psid]) {
          userStates[sender_psid] = { startTime: Date.now(), repliedByAdmin: false, lateReplySent: false };
          
          // ১ ঘণ্টা পর চেক (নতুন কাস্টমারদের জন্য)
          setTimeout(async () => {
            if (!userStates[sender_psid].repliedByAdmin && !userStates[sender_psid].lateReplySent) {
              await sendReply(sender_psid, "Sorry for late reply. Our team at ANONNA FLAIR is busy. Please send your choice screenshot or question, our team replying as soon as possible. Call: +8801781755955");
              userStates[sender_psid].lateReplySent = true;
            }
          }, 3600000); 
        }

        try {
          // Wit.ai থেকে ডাটা নেওয়া
          let wit_res = await axios.get(
            `https://api.wit.ai/message?v=20251125&q=${encodeURIComponent(message_text)}`,
            { headers: { Authorization: `Bearer ${WIT_TOKEN}` } }
          );

          let firstIntent = wit_res.data.intents[0];
          
          // ৮৫% কনফিডেন্স স্কোর লজিক
          if (firstIntent && firstIntent.confidence > 0.85) {
            let intentName = firstIntent.name;
            let reply = "";

            if (intentName === "greeting") reply = "আসসালামু আলাইকুম! ANONNA FLAIR-এ আপনাকে স্বাগতম। আমি কীভাবে সাহায্য করতে পারি?";
            else if (intentName === "price") reply = "আমাদের এই কালেকশনটির দাম জানতে দয়া করে স্ক্রিনশট দিন বা কল করুন: +8801781755955";
            
            if (reply) await sendReply(sender_psid, reply);
          } else {
            // উত্তর না মিললে চুপ থাকবে (অ্যাডমিন হ্যান্ডওভার)
            logger.info("Wit.ai confidence low. Staying silent for Admin.");
          }
        } catch (err) { 
          logger.error("Wit processing error: " + err.message); 
        }
      }
    });
    res.status(200).send("EVENT_RECEIVED");
  }
});

app.listen(process.env.PORT || 3000, () => logger.info("Advanced Bot is running..."));
