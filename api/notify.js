import webpush from "web-push";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POSTのみ受け付けます" });
    return;
  }

  const publicKey = (process.env.VAPID_PUBLIC_KEY || "").trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = (process.env.VAPID_SUBJECT || "mailto:pickup@example.com").trim();

  const info = {
    subject,
    publicKeyChars: publicKey.length,
    privateKeyChars: privateKey.length,
    publicKeyBytes: publicKey ? Buffer.from(publicKey, "base64url").length : 0,
    privateKeyBytes: privateKey ? Buffer.from(privateKey, "base64url").length : 0,
  };

  if (!publicKey || !privateKey) {
    res.status(500).json({ error: "VAPIDキーが未設定です", info });
    return;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch (e) {
    res.status(500).json({ error: "鍵の設定に失敗", detail: String(e && e.message), info });
    return;
  }

  try {
    const { targets, title, body, url } = req.body || {};

    if (!Array.isArray(targets) || targets.length === 0) {
      res.status(200).json({ sent: 0, expired: [], info });
      return;
    }

    const payload = JSON.stringify({
      title: title || "📦 新着の集荷",
      body: body || "",
      url: url || "/",
      tag: "pickup-" + Date.now(),
    });

    const results = await Promise.allSettled(
      targets.map(async (t) => {
        return webpush.sendNotification(t.subscription, payload);
      })
    );

    const expired = [];
    const errors = [];
    let sent = 0;

    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        sent += 1;
      } else {
        const code = r.reason && r.reason.statusCode;
        if (code === 404 || code === 410) {
          expired.push(targets[i].id);
        } else {
          errors.push({
            code: code || null,
            message: String(r.reason && r.reason.message).slice(0, 200),
          });
        }
      }
    });

    res.status(200).json({ sent, expired, errors, info });
  } catch (e) {
    res.status(500).json({
      error: "送信処理でエラー",
      detail: String(e && e.message).slice(0, 300),
      info,
    });
  }
}
