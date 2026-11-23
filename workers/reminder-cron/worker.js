// workers/reminder-cron/src/index.ts
function base64UrlEncode(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function importPrivateKey(pem) {
  const cleaned = pem.trim().replace(/^["']|["']$/g, "");
  const normalized = cleaned.replace(/\\n/g, "\n");
  const body = normalized.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/[^A-Za-z0-9+/=]/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}
async function getGoogleAccessToken(env) {
  const now = Math.floor(Date.now() / 1e3);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: env.FIREBASE_CLIENT_EMAIL,
      scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    })
  );
  const unsigned = `${header}.${claim}`;
  const key = await importPrivateKey(env.FIREBASE_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${base64UrlEncode(signature)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  if (!res.ok) {
    throw new Error(`OAuth token error: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}
async function processDueReminders(env) {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    throw new Error(
      "Missing required secrets: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY"
    );
  }
  const accessToken = await getGoogleAccessToken(env);
  const projectId = env.FIREBASE_PROJECT_ID;
  const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const nowMs = Date.now();
  const queryRes = await fetch(`${firestoreBase}:runQuery`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "items", allDescendants: true }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: "done" },
                  op: "EQUAL",
                  value: { booleanValue: false }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: "reminderNotified" },
                  op: "EQUAL",
                  value: { booleanValue: false }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: "reminderAtMs" },
                  op: "LESS_THAN_OR_EQUAL",
                  value: { integerValue: String(nowMs) }
                }
              }
            ]
          }
        },
        limit: 100
      }
    })
  });
  if (!queryRes.ok) {
    throw new Error(`Firestore runQuery failed: ${queryRes.status} ${await queryRes.text()}`);
  }
  const rows = await queryRes.json();
  const docs = rows.filter((r) => r.document);
  let sentCount = 0;
  for (const row of docs) {
    const doc = row.document;
    const fields = doc.fields ?? {};
    if (fields.deletedAtMs?.integerValue || fields.deletedAtMs?.doubleValue) {
      continue;
    }
    const ownerUid = fields.ownerUid?.stringValue;
    const text = fields.text?.stringValue || "You have a scheduled task reminder.";
    const listId = fields.listId?.stringValue || "";
    const taskId = doc.name.split("/").pop() || "";
    if (!ownerUid) continue;
    const tokensRes = await fetch(`${firestoreBase}/users/${ownerUid}/fcmTokens`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!tokensRes.ok) continue;
    const tokensData = await tokensRes.json();
    for (const tokenDoc of tokensData.documents ?? []) {
      const fcmToken = tokenDoc.fields?.token?.stringValue;
      if (!fcmToken) continue;
      const fcmRes = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message: {
              token: fcmToken,
              data: {
                title: "Task Reminder",
                body: text,
                taskId,
                listId,
                url: "/"
              },
              webpush: {
                headers: { Urgency: "high" }
              }
            }
          })
        }
      );
      if (fcmRes.ok) {
        sentCount++;
      } else if (fcmRes.status === 404 || fcmRes.status === 400) {
        await fetch(`https://firestore.googleapis.com/v1/${tokenDoc.name}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` }
        });
      }
    }
    await fetch(
      `https://firestore.googleapis.com/v1/${doc.name}?updateMask.fieldPaths=reminderNotified`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fields: {
            reminderNotified: { booleanValue: true }
          }
        })
      }
    );
  }
  return { checked: docs.length, sent: sentCount };
}
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};
function base64UrlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
async function verifyFirebaseIdToken(idToken, projectId) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid ID token format");
  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  const now = Math.floor(Date.now() / 1e3);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported token algorithm");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error("Invalid token issuer");
  }
  if (payload.aud !== projectId) throw new Error("Invalid token audience");
  if (!payload.sub) throw new Error("Missing token subject");
  if (!payload.exp || payload.exp <= now) throw new Error("Token expired");
  const jwksRes = await fetch(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  );
  if (!jwksRes.ok) throw new Error("Failed to fetch Google JWKs");
  const jwks = await jwksRes.json();
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Matching JWK not found");
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigBytes = base64UrlDecode(parts[2]);
  const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, sigBytes, signedData);
  if (!valid) throw new Error("Invalid token signature");
  return {
    uid: payload.sub,
    name: payload.name || payload.email?.split("@")[0] || "A collaborator"
  };
}
async function sendFcmToUser(accessToken, projectId, uid, dataPayload) {
  const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const tokensRes = await fetch(`${firestoreBase}/users/${uid}/fcmTokens`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!tokensRes.ok) return 0;
  const tokensData = await tokensRes.json();
  let sent = 0;
  for (const tokenDoc of tokensData.documents ?? []) {
    const fcmToken = tokenDoc.fields?.token?.stringValue;
    if (!fcmToken) continue;
    const fcmRes = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            data: dataPayload,
            webpush: {
              headers: { Urgency: "high" }
            }
          }
        })
      }
    );
    if (fcmRes.ok) {
      sent++;
    } else if (fcmRes.status === 404 || fcmRes.status === 400) {
      await fetch(`https://firestore.googleapis.com/v1/${tokenDoc.name}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    }
  }
  return sent;
}
async function notifyShareActivity(env, actorUid, actorName, body) {
  const { listId, itemId = "", action = "updated", text = "a task" } = body;
  if (!listId) throw new Error("Missing listId");
  const accessToken = await getGoogleAccessToken(env);
  const projectId = env.FIREBASE_PROJECT_ID;
  const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const listRes = await fetch(`${firestoreBase}/lists/${listId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!listRes.ok) throw new Error("List not found");
  const listDoc = await listRes.json();
  const listTitle = listDoc.fields?.title?.stringValue || "Shared List";
  const ownerUid = listDoc.fields?.ownerUid?.stringValue;
  const memberUids = (listDoc.fields?.memberUids?.arrayValue?.values ?? []).map((v) => v.stringValue).filter((v) => Boolean(v));
  const allMembers = Array.from(new Set([ownerUid, ...memberUids].filter((v) => Boolean(v))));
  if (!allMembers.includes(actorUid)) {
    throw new Error("Forbidden: not a member of this list");
  }
  const recipients = allMembers.filter((uid) => uid !== actorUid);
  if (recipients.length === 0) return { sent: 0 };
  const verb = action === "completed" ? "completed" : action === "reopened" ? "reopened" : action === "added" ? "added" : "updated";
  let sent = 0;
  for (const uid of recipients) {
    sent += await sendFcmToUser(accessToken, projectId, uid, {
      title: listTitle,
      body: `${actorName} ${verb}: ${text}`,
      taskId: itemId,
      listId,
      url: "/"
    });
  }
  return { sent };
}
var index_default = {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(processDueReminders(env));
  },
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    if (url.pathname === "/run") {
      try {
        const result = await processDueReminders(env);
        return Response.json(result, { headers: CORS_HEADERS });
      } catch (err) {
        return Response.json(
          { error: err instanceof Error ? err.message : String(err) },
          { status: 500, headers: CORS_HEADERS }
        );
      }
    }
    if (url.pathname === "/notify-share" && request.method === "POST") {
      try {
        const authHeader = request.headers.get("Authorization") || "";
        const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
        if (!idToken) {
          return Response.json({ error: "Missing Bearer token" }, { status: 401, headers: CORS_HEADERS });
        }
        const actor = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID);
        const body = await request.json();
        const result = await notifyShareActivity(env, actor.uid, actor.name, body);
        return Response.json(result, { headers: CORS_HEADERS });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const status = msg.startsWith("Forbidden") ? 403 : 400;
        return Response.json({ error: msg }, { status, headers: CORS_HEADERS });
      }
    }
    return new Response("todo-reminder-cron worker is running", { headers: CORS_HEADERS });
  }
};
export {
  index_default as default
};
