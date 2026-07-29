import webpush from "web-push";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POSTのみ受け付けます" });
    return;
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:pickup@omiya-sogo.example";

  if (!publicKey || !privateKey) {
    res.status(500).json({ error: "VAPIDキーが未設定です" });
    return;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const { targets, title, body, url } = req.body || {};

    if (!Array.isArray(targets) || targets.length === 0) {
      res.status(200).json({ sent: 0, expired: [] });
      return;
    }

    const payload = JSON.stringify({
      title: title || "📦 新着の集荷",
      body: body || "",
      url: url || "/",
      tag: "pickup-" + Date.now(),
    });

    const results = await Promise.allSettled(
      targets.map((t) => webpush.sendNotification(t.subscription, payload))
    );

    const expired = [];
    let sent = 0;

    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        sent += 1;
      } else {
        const code = r.reason && r.reason.statusCode;
        if (code === 404 || code === 410) {
          expired.push(targets[i].id);
        } else {
          console.error("送信失敗", code);
        }
      }
    });

    res.status(200).json({ sent, expired });
  } catch (e) {
    console.error("通知送信でエラー", e);
    res.status(500).json({ error: "送信処理でエラーが発生しました" });
  }
}
