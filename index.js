const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = "EAAKTFQ7iZBlMBQJ9b0z8e12eCq6QDkGZC2w2c9KjNoaCIgMhZA9VrngcaNEgEeIS91yk3WwFcZC7mXWzf54PWWlnwdbO1ZAxHgmRcM9ZAXlrR8A2ilYIK6AC3LXVAeeOQdf6AMa7Tmok4ceI9i0ZAT7nzX1iuf9hjivZCsoeIEMg2T6VysNMb31Ycp5UxzMxuONMxdUPV2zDdgVW0Uk7UDWAQeJZBBwZDZD"; // Facebook Page Token
const VERIFY_TOKEN = "my_verify_token_59287624";           // Custom string for webhook verification
const WIT_TOKEN = "XMD57BD7SK3JRUYITGL66OZJFXBMIGFC";      // Wit.ai Server Access Token

// Verification webhook (Facebook calls this)
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

// Receive messages
app.post("/webhook", async (req, res) => {
  let body = req.body;

  if (body.object === "page") {
    body.entry.forEach(async function(entry) {
      let webhook_event = entry.messaging[0];
      let sender_psid = webhook_event.sender.id;

      if (webhook_event.message && webhook_event.message.text) {
        let message_text = webhook_event.message.text;
        try {
          let wit_response = await axios.get(
            `https://api.wit.ai/message?v=20251125&q=${encodeURIComponent(message_text)}`,
            { headers: { Authorization: `Bearer ${WIT_TOKEN}` } }
          );

          let intent = wit_response.data.intents[0]?.name || "default";
          let reply = "";

          // Simple intent → response mapping
          if (intent === "greeting") reply = "হ্যালো! আমি কীভাবে সাহায্য করতে পারি?";
          else if (intent === "price_inquiry") reply = "আমাদের প্রোডাক্টের দাম জানতে লিঙ্ক/প্রোডাক্ট বলুন।";
          else if (intent === "order_status") reply = "অর্ডার স্ট্যাটাস জানতে অর্ডার নম্বর দিন।";
          else reply = "দুঃখিত, আমি বুঝতে পারিনি। আবার চেষ্টা করুন।";

          // Send reply to Messenger
          await axios.post(
            `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
            {
              recipient: { id: sender_psid },
              message: { text: reply }
            }
          );
        } catch (err) {
          console.error(err.response?.data || err.message);
        }
      }
    });
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

app.listen(process.env.PORT || 3000, () => console.log("Server is running"));
