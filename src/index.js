
async function sendTelegramMessage(token, chatId, text) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text
      })
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    console.log("Telegram API error:", result);
  }

  return result;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        service: "PENGUEN STORE"
      });
    }

    if (url.pathname === "/webhook") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", {
          status: 405
        });
      }

      try {
        const update = await request.json();
        const message = update.message;

        if (!message || !message.chat) {
          return new Response("OK");
        }

        if (!env.TELEGRAM_TOKEN) {
          console.log("Missing TELEGRAM_TOKEN");
          return new Response("Configuration error", {
            status: 500
          });
        }

        const chatId = message.chat.id;
        const text = (message.text || "").trim();

        let reply;

        if (text === "/start") {
  reply =
    "🐧 أهلاً بك في PENGUEN STORE!\n\n" +
    "وجهتك لشراء المحتوى الحصري.\n\n" +
    "💰 الدفع متاح باستخدام USDT عبر شبكة TRC20.\n" +
    "📦 التسليم متاح تلقائياً أو يدوياً.\n\n" +
    "━━━━━━━━━━━━━━\n\n" +
    "🐧 Welcome to PENGUEN STORE!\n\n" +
    "Your destination for exclusive content.\n\n" +
    "💰 Pay with USDT via the TRC20 network.\n" +
    "📦 Automatic and manual delivery available.\n\n" +
    "━━━━━━━━━━━━━━\n\n" +
    "استخدم الأزرار بالأسفل للبدء بالتسوق.\n" +
    "Use the buttons below to start shopping.";
        } else if (text === "/wallet") {
          reply = env.WALLET_ADDRESS
            ? "💰 عنوان محفظة USDT TRC20:\n\n" +
              env.WALLET_ADDRESS
            : "المحفظة غير مضبوطة حالياً.";
        } else {
          reply =
            "🐧 أهلاً بك في PENGUEN!\n\n" +
            "استخدم /start للبدء أو /wallet لعرض المحفظة.";
        }

        await sendTelegramMessage(
          env.TELEGRAM_TOKEN,
          chatId,
          reply
        );

        return new Response("OK");

      } catch (error) {
        console.log("Webhook error:", error);

        return new Response("Webhook error", {
          status: 500
        });
      }
    }

    return env.ASSETS.fetch(request);
  }
};
