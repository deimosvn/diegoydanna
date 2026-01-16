const webpush = require("web-push");
const admin = require("firebase-admin");

function initAdmin() {
  if (admin.apps.length) return;
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountRaw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT env var");
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(serviceAccountRaw))
  });
}

function initWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:example@example.com";
  if (!publicKey || !privateKey) throw new Error("Missing VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY env vars");
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

async function sendToAllSubscriptions(payloadObj) {
  const db = admin.firestore();
  const snap = await db.collection("pushSubscriptions").limit(200).get();
  if (snap.empty) return { sent: 0 };

  const payload = JSON.stringify(payloadObj);
  let sent = 0;

  for (const doc of snap.docs) {
    const sub = doc.data() && doc.data().subscription;
    if (!sub || !sub.endpoint || !sub.keys) continue;

    try {
      await webpush.sendNotification(sub, payload);
      sent++;
    } catch (err) {
      const statusCode = err && err.statusCode ? err.statusCode : 0;
      if (statusCode === 404 || statusCode === 410) {
        try { await doc.ref.delete(); } catch (_) {}
      }
    }
  }

  return { sent };
}

exports.handler = async () => {
  try {
    initAdmin();
    initWebPush();

    // Netlify schedules run in UTC.
    const now = new Date();
    const day = now.getUTCDate();
    const month = now.getUTCMonth(); // 0-based

    const isMonthly = day === 5;
    const isYearly = day === 5 && month === 7; // Aug 5

    if (!isMonthly && !isYearly) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true, skipped: true })
      };
    }

    const title = isYearly ? "¡Feliz aniversario!" : "¡Hoy es especial!";
    const body = isYearly ? "Hoy es 5 de agosto ❤️" : "Es el día 5, nuestro aniversario mensual ❤️";

    const result = await sendToAllSubscriptions({
      title,
      body,
      data: { url: "/" }
    });

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, ...result, isMonthly, isYearly })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: String(err && err.message ? err.message : err) })
    };
  }
};

exports.config = {
  schedule: "0 14 * * *" 
};
