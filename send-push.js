const webpush = require("web-push");
const admin = require("firebase-admin");

function initAdmin() {
  if (admin.apps.length) return;
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountRaw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT env var");

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountRaw);
  } catch (e) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT must be valid JSON string");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

function initWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:example@example.com";
  if (!publicKey || !privateKey) throw new Error("Missing VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY env vars");
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

exports.handler = async (event) => {
  try {
    initAdmin();
    initWebPush();

    const body = event.body ? JSON.parse(event.body) : {};
    const targetUser = String(body.targetUser || "").toLowerCase();
    const title = String(body.title || "Diego Y Danna");
    const message = String(body.body || "");
    const data = body.data && typeof body.data === "object" ? body.data : {};

    if (!targetUser || (targetUser !== "diego" && targetUser !== "danna")) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "targetUser must be 'diego' or 'danna'" })
      };
    }

    const db = admin.firestore();
    const snap = await db
      .collection("pushSubscriptions")
      .where("user", "==", targetUser)
      .limit(50)
      .get();

    if (snap.empty) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true, sent: 0, info: "No subscriptions for target user" })
      };
    }

    const payload = JSON.stringify({
      title,
      body: message,
      data
    });

    const results = [];
    for (const doc of snap.docs) {
      const sub = doc.data() && doc.data().subscription;
      if (!sub || !sub.endpoint || !sub.keys) {
        results.push({ id: doc.id, ok: false, error: "Invalid subscription" });
        continue;
      }

      try {
        await webpush.sendNotification(sub, payload);
        results.push({ id: doc.id, ok: true });
      } catch (err) {
        const statusCode = err && err.statusCode ? err.statusCode : 0;
        results.push({ id: doc.id, ok: false, statusCode, error: String(err && err.body ? err.body : err && err.message ? err.message : err) });

        // 404/410 = subscription expired → cleanup
        if (statusCode === 404 || statusCode === 410) {
          try { await doc.ref.delete(); } catch (_) {}
        }
      }
    }

    const sent = results.filter(r => r.ok).length;
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, sent, results })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: String(err && err.message ? err.message : err) })
    };
  }
};
