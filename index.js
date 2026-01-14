const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const WIT_TOKEN = process.env.WIT_TOKEN;

// ইউজারের তথ্য মনে রাখার জন্য (Database হিসেবে সাময়িক কাজ করবে)
let userStates = {}; 

async function sendReply(psid, text) {
  try {
    await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      recipient: { id: psid },
      message: { text }
    });
  } catch (e) { console.error("Error sending message"); }
}

app.post("/webhook", async (req, res) => {
  let body = req.body;
  if (body.object === "page") {
    body.entry.forEach(async (entry) => {
      let webhook_event = entry.messaging[0];
      let sender_psid = webhook_event.sender.id;

      if (webhook_event.message && webhook_event.message.text) {
        let message_text = webhook_event.message.text;
        
        // ১. ইউজার স্টেট চেক বা তৈরি
        if (!userStates[sender_psid]) {
          userStates[sender_psid] = { 
            startTime: Date.now(), 
            repliedByAdmin: false, 
            botActive: true,
            lateReplySent: false
          };
          
          // ২. ১ ঘণ্টা পর "Late Reply" চেক করার টাইমার
          setTimeout(async () => {
            let currentState = userStates[sender_psid];
            if (!currentState.repliedByAdmin && !currentState.lateReplySent) {
              await sendReply(sender_psid, "Sorry for late reply. Our team is busy. Please send your choice screenshot or question, our team replying as soon as possible. Please wait...");
              userStates[sender_psid].lateReplySent = true;
            }
          }, 3600000); // ৩৬০০০০০ মিলি-সেকেন্ড = ১ ঘণ্টা
        }

        let state = userStates[sender_psid];

        // যদি বট ইন-অ্যাক্টিভ থাকে (অ্যাডমিন কথা বলছে), তবে চুপ থাকবে
        if (!state.botActive) return;

        try {
          // ৩. Wit.ai চেক
          let wit_res = await axios.get(
            `https://api.wit.ai/message?v=20251125&q=${encodeURIComponent(message_text)}`,
            { headers: { Authorization: `Bearer ${WIT_TOKEN}` } }
          );

          let firstIntent = wit_res.data.intents[0];
          
          // ৪. ম্যাচিং লজিক
          if (firstIntent && firstIntent.confidence > 0.85) {
            // যদি Wit.ai নিশ্চিত হয়, তবেই উত্তর দিবে
            let intentName = firstIntent.name;
            let reply = "";

            if (intentName === "greeting") reply = "হ্যালো! আমি SISTER AI। আপনাকে কীভাবে সাহায্য করতে পারি?";
            else if (intentName === "price") reply = "আমাদের এই কালেকশনটির দাম জানতে দয়া করে স্ক্রিনশট দিন।";
            
            if (reply) await sendReply(sender_psid, reply);

          } else {
            // ৫. যদি উত্তর না মেলে → একদম চুপ থাকবে (আগের মতো অটো মেসেজ দিবে না)
            console.log("No match found, bot stays silent.");
            
            // যদি ইউজার এমন কিছু বলে যা বট আগে পারতো কিন্তু এখন পারছে না
            // তবেই কেবল অ্যাডমিন ট্রান্সফার মেসেজ দিবে (ঐচ্ছিক)
          }

        } catch (err) {
          console.error("Wit error");
        }
      }
    });
    res.status(200).send("EVENT_RECEIVED");
  }
});

app.listen(process.env.PORT || 3000);
