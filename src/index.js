import { products } from "./products.js";

async function telegram(token, method, data) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }
  );

  return response.json();
}

async function sendMessage(token, chatId, text, keyboard) {
  return telegram(token, "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: keyboard
  });
}

function productsKeyboard() {
  return {
    inline_keyboard: products.map(product => [{
      text: `${product.name} — ${product.price} USDT`,
      callback_data: `product_${product.id}`
    }])
  };
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
        return new Response("Method not allowed", { status: 405 });
      }

      if (!env.TELEGRAM_TOKEN) {
        return new Response("Missing TELEGRAM_TOKEN", { status: 500 });
      }

      try {
        const update = await request.json();

        if (update.callback_query) {
          const callback = update.callback_query;
          const chatId = callback.message.chat.id;
          const data = callback.data;

          if (data === "show_products") {
            await sendMessage(
              env.TELEGRAM_TOKEN,
              chatId,
              "🐧 اختر المنتج:",
              productsKeyboard()
            );
          } else if (data.startsWith("product_")) {
            const id = Number(data.replace("product_", ""));
            const product = products.find(item => item.id === id);

            if (product) {
              await sendMessage(
                env.TELEGRAM_TOKEN,
                chatId,
                `🐧 ${product.name}\n\n💰 السعر: ${product.price} USDT`,
                {
                  inline_keyboard: [[
                    {
                      text: "🔙 العودة للمنتجات",
                      callback_data: "show_products"
                    }
                  ]]
                }
              );
            }
          }

          await telegram(env.TELEGRAM_TOKEN, "answerCallbackQuery", {
            callback_query_id: callback.id
          });

          return new Response("OK");
        }

        const message = update.message;

        if (!message || !message.chat) {
          return new Response("OK");
        }

        const chatId = message.chat.id;
        const text = (message.text || "").trim();

        let reply;
        let keyboard;

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

          keyboard = {
            inline_keyboard: [[
              {
                text: "🛍️ عرض المنتجات | View Products",
                callback_data: "show_products"
              }
            ]]
          };
        } else if (text === "/wallet") {
          reply = env.WALLET_ADDRESS
            ? "💰 عنوان محفظة USDT TRC20:\n\n" + env.WALLET_ADDRESS
            : "المحفظة غير مضبوطة حالياً.";
        } else {
          reply = "🐧 استخدم /start للبدء أو /wallet لعرض المحفظة.";
        }

        await sendMessage(
          env.TELEGRAM_TOKEN,
          chatId,
          reply,
          keyboard
        );

        return new Response("OK");
      } catch (error) {
        console.log("Webhook error:", error);
        return new Response("Webhook error", { status: 500 });
      }
    }

    return env.ASSETS.fetch(request);
  }
};
