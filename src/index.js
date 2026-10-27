async function getProducts(env) {
  const result = await env.DB.prepare(
    "SELECT id, name, price, currency FROM products WHERE active = 1 ORDER BY id"
  ).all();

  return result.results || [];
}

const WALLET = "TNgd2kFgpTmytrovEoBAZfxZQFxrZUEjuF";
const USDT_CONTRACT = "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";

async function tg(token, method, data) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return r.json();
}

async function send(token, chatId, text, keyboard) {
  return tg(token, "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: keyboard
  });
}

async function edit(token, chatId, messageId, text, keyboard) {
  return tg(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: keyboard
  });
}

async function productKeyboard(env) {
  const products = await getProducts(env);

  return {
    inline_keyboard: products.map(p => [{
      text: p.name,
      callback_data: `product_${p.id}`
    }])
  };
}

async function verifyPayment(txid, amount, env) {
  const url = new URL(
    `https://api.trongrid.io/v1/accounts/${WALLET}/transactions/trc20`
  );

  url.searchParams.set("only_confirmed", "true");
  url.searchParams.set("only_to", "true");
  url.searchParams.set("contract_address", USDT_CONTRACT);
  url.searchParams.set("limit", "200");

  const response = await fetch(url, {
    headers: {
      "TRON-PRO-API-KEY": env.TRONGRID_API_KEY
    }
  });

  if (!response.ok) throw new Error("TronGrid API error");

  const result = await response.json();
  const transfer = (result.data || []).find(item =>
    (item.transaction_id || "").toLowerCase() === txid.toLowerCase()
  );

  if (!transfer) return false;
  if (transfer.to !== WALLET) return false;
  if (transfer.token_info?.address !== USDT_CONTRACT) return false;

  const decimals = Number(transfer.token_info.decimals);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    return false;
  }

  const expected = BigInt(amount) * (10n ** BigInt(decimals));
  return BigInt(transfer.value) === expected;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, service: "PENGUEN STORE" });
    }

    if (url.pathname !== "/webhook") {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (!env.TELEGRAM_TOKEN || !env.DB || !env.TRONGRID_API_KEY) {
      return new Response("Missing required configuration", { status: 500 });
    }

    try {
      const update = await request.json();

      if (update.callback_query) {
        const cb = update.callback_query;
        const chatId = cb.message.chat.id;
        const messageId = cb.message.message_id;
        const data = cb.data;
const products = await getProducts(env);
        if (data === "show_products") {
          await edit(
            env.TELEGRAM_TOKEN, chatId, messageId,
            "🐧 اختر المنتج:",
            await productKeyboard(env)
          );
        }
else if (data === "admin_orders") {
  const result = await env.DB.prepare(
    "SELECT * FROM orders ORDER BY created_at DESC LIMIT 10"
  ).all();

  const orders = result.results || [];

  if (orders.length === 0) {
    await edit(
      env.TELEGRAM_TOKEN, chatId, messageId,
      "📦 لا توجد طلبات حتى الآن.",
      backKeyboard()
    );
  } else {
    const list = orders.map(o =>
      `🐧 ${o.product_name}\n💰 ${o.amount} USDT\n📌 الحالة: ${o.status}\n🧾 الطلب: ${o.id}`
    ).join("\n\n");

    await edit(
      env.TELEGRAM_TOKEN, chatId, messageId,
      `📦 آخر الطلبات:\n\n${list}`,
      backKeyboard()
    );
  }
}
      else if (data === "admin_add_product") {
  if (String(cb.from.id) !== "1167796022") {
    await tg(env.TELEGRAM_TOKEN, "answerCallbackQuery", {
      callback_query_id: cb.id,
      text: "غير مسموح لك"
    });
    return new Response("OK");
  }

  await env.DB.prepare(`
    INSERT INTO admin_sessions (chat_id, action)
    VALUES (?, 'add_product_name')
    ON CONFLICT(chat_id) DO UPDATE SET
      action = 'add_product_name',
      product_id = NULL,
      created_at = CURRENT_TIMESTAMP
  `).bind(String(chatId)).run();

  await edit(
    env.TELEGRAM_TOKEN, chatId, messageId,
    "➕ أرسل اسم المنتج الجديد:",
    backKeyboard()
  );
}
else if (data.startsWith("product_")) {
          const id = Number(data.slice(8));
          const p = products.find(x => x.id === id);

          if (p) {
            await edit(
              env.TELEGRAM_TOKEN, chatId, messageId,
              `🐧 ${p.name}\n\n💰 السعر: ${p.price} USDT`,
              {
                inline_keyboard: [
                  [{ text: "🛒 شراء الآن | Buy Now", callback_data: `buy_${p.id}` }],
                  [{ text: "🔙 رجوع للمنتجات | Back to Products", callback_data: "show_products" }]
                ]
              }
            );
          }
        }

        else if (data.startsWith("buy_")) {
          const id = Number(data.slice(4));
          const p = products.find(x => x.id === id);

          if (p) {
            const orderId = crypto.randomUUID();

            await env.DB.prepare(`
              INSERT INTO orders
              (id, chat_id, product_id, product_name, amount, status)
              VALUES (?, ?, ?, ?, ?, 'awaiting_txid')
            `).bind(
              orderId, String(chatId), p.id, p.name, p.price
            ).run();

            await edit(
              env.TELEGRAM_TOKEN, chatId, messageId,
              `🐧 المنتج: ${p.name}\n💰 المبلغ: ${p.price} USDT\n\n` +
              `🌐 الشبكة: TRON (TRC20)\n\n` +
              `💳 عنوان المحفظة:\n${WALLET}\n\n` +
              `بعد التحويل اضغط الزر بالأسفل وأرسل TXID.`,
              {
                inline_keyboard: [
                  [{ text: "✅ أرسلت الدفع | Submit TXID", callback_data: `submit_${orderId}` }],
                  [{ text: "🔙 رجوع للمنتجات | Back to Products", callback_data: "show_products" }]
                ]
              }
            );
          }
        }

        else if (data.startsWith("submit_")) {
          const orderId = data.slice(7);
          const order = await env.DB.prepare(
            "SELECT * FROM orders WHERE id = ? AND chat_id = ? AND status = 'awaiting_txid'"
          ).bind(orderId, String(chatId)).first();

          if (order) {
            await edit(
              env.TELEGRAM_TOKEN, chatId, messageId,
              `🐧 طلبك: ${order.product_name}\n💰 المبلغ: ${order.amount} USDT\n\n` +
              "أرسل الآن TXID الخاص بالتحويل برسالة واحدة.",
              backKeyboard()
            );
          }
        }

        await tg(env.TELEGRAM_TOKEN, "answerCallbackQuery", {
          callback_query_id: cb.id
        });

        return new Response("OK");
      }

      const message = update.message;
      if (!message?.chat) return new Response("OK");

      const chatId = message.chat.id;
      const text = (message.text || "").trim();
if (text === "/admin") {
  if (String(chatId) !== "1167796022") {
    await send(env.TELEGRAM_TOKEN, chatId, "⛔ غير مسموح لك.");
    return new Response("OK");
  }

  await send(env.TELEGRAM_TOKEN, chatId, "🐧 لوحة تحكم PENGUEN\n\nاختر العملية:", {
    inline_keyboard: [
      [{ text: "📦 الطلبات", callback_data: "admin_orders" }],
      [{ text: "💰 تعديل الأسعار", callback_data: "admin_prices" }],
      [{ text: "➕ إضافة منتج", callback_data: "admin_add_product" }]
    ]
  });
  return new Response("OK");
}
      if (text === "/start") {
        const welcome =
          "🐧 أهلاً بك في PENGUEN STORE!\n\n" +
          "وجهتك لشراء المنتجات.\n\n" +
          "💰 الدفع باستخدام USDT عبر شبكة TRC20.\n" +
          "📦 التسليم بعد تأكيد الدفع.\n\n" +
          "━━━━━━━━━━━━━━\n\n" +
          "🐧 Welcome to PENGUEN STORE!\n\n" +
          "💰 Pay with USDT via TRC20.\n" +
          "📦 Delivery after payment confirmation.\n\n" +
          "استخدم الزر بالأسفل للبدء.";

        await send(env.TELEGRAM_TOKEN, chatId, welcome, {
          inline_keyboard: [[{
            text: "🛍️ عرض المنتجات | View Products",
            callback_data: "show_products"
          }]]
        });

        return new Response("OK");
      }

      if (text === "/wallet") {
        await send(
          env.TELEGRAM_TOKEN, chatId,
          `💰 عنوان محفظة USDT TRC20:\n\n${WALLET}`
        );
        return new Response("OK");
      }
const adminSession = await env.DB.prepare(
  "SELECT * FROM admin_sessions WHERE chat_id = ?"
).bind(String(chatId)).first();

if (String(chatId) === "1167796022" && adminSession) {
  if (adminSession.action === "add_product_name") {
    await env.DB.prepare(
      "UPDATE admin_sessions SET product_name = ?, action = 'add_product_price' WHERE chat_id = ?"
    ).bind(text, String(chatId)).run();

    await send(
      env.TELEGRAM_TOKEN,
      chatId,
      "💰 أرسل سعر المنتج الجديد بالدولار USDT:"
    );
    return new Response("OK");
  }

  if (adminSession.action === "add_product_price") {
    const price = Number(text);

    if (!Number.isFinite(price) || price <= 0 || price > 1000000) {
      await send(env.TELEGRAM_TOKEN, chatId, "❌ أرسل سعراً صحيحاً.");
      return new Response("OK");
    }

    await env.DB.prepare(
      "INSERT INTO products (name, price) VALUES (?, ?)"
    ).bind(adminSession.product_name, price).run();

    await env.DB.prepare(
      "DELETE FROM admin_sessions WHERE chat_id = ?"
    ).bind(String(chatId)).run();

    await send(
      env.TELEGRAM_TOKEN,
      chatId,
      `✅ تمت إضافة المنتج بنجاح!\n\n🐧 ${adminSession.product_name}\n💰 ${price} USDT`
    );
    return new Response("OK");
  }
}
      if (/^[a-fA-F0-9]{64}$/.test(text)) {
        const order = await env.DB.prepare(`
          SELECT * FROM orders
          WHERE chat_id = ? AND status = 'awaiting_txid'
          ORDER BY created_at DESC LIMIT 1
        `).bind(String(chatId)).first();

        if (!order) {
          await send(env.TELEGRAM_TOKEN, chatId, "لا يوجد طلب ينتظر TXID.");
          return new Response("OK");
        }

        try {
          const valid = await verifyPayment(text, order.amount, env);

          if (!valid) {
            await send(
              env.TELEGRAM_TOKEN, chatId,
              "❌ لم يتم العثور على تحويل مؤكد مطابق.\nتأكد من TXID والمبلغ والشبكة ثم أعد المحاولة."
            );
            return new Response("OK");
          }

          const result = await env.DB.prepare(`
  UPDATE orders
  SET txid = ?, status = 'paid', paid_at = CURRENT_TIMESTAMP
  WHERE id = ?
    AND chat_id = ?
    AND status = 'awaiting_txid'
    AND txid IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM orders WHERE txid = ?
    )
`).bind(
  text.toLowerCase(),
  order.id,
  String(chatId),
  text.toLowerCase()
).run();

if (result.meta.changes !== 1) {
  await send(
    env.TELEGRAM_TOKEN,
    chatId,
    "⚠️ هذه المعاملة مستخدمة مسبقاً أو تم تسجيل الطلب. لن يتم تأكيد الدفع مرة ثانية."
  );
  return new Response("OK");
}

          await send(
            env.TELEGRAM_TOKEN, chatId,
            `✅ تم التحقق من الدفع بنجاح!\n\n🐧 المنتج: ${order.product_name}\n💰 المبلغ: ${order.amount} USDT\n\nسيتم تجهيز طلبك.`
          );
          await send(
  env.TELEGRAM_TOKEN,
  "1167796022",
  `🔔 دفعة جديدة مؤكدة!\n\n🐧 المنتج: ${order.product_name}\n💰 المبلغ: ${order.amount} USDT\n🧾 TXID:\n${text}`
);
          return new Response("OK");

        } catch (error) {
          console.log("Payment verification error:", error);
          await send(
            env.TELEGRAM_TOKEN, chatId,
            "تعذر التحقق حالياً من الشبكة. حاول مرة أخرى بعد قليل."
          );
          return new Response("OK");
        }
      }

      await send(
        env.TELEGRAM_TOKEN, chatId,
        "🐧 استخدم /start للبدء أو /wallet لعرض المحفظة."
      );

      return new Response("OK");

    } catch (error) {
      console.log("Webhook error:", error);
      return new Response("Webhook error", { status: 500 });
    }
  }
};
