const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const router = express.Router();
const Session = require("./models/Session");

// Diagnostic: show whether SDK key/secret are present
const sdkKeyPresent = !!process.env.SDK_KEY || !!process.env.ZOOM_SDK_KEY;
const sdkSecretPresent = !!process.env.SDK_SECRET || !!process.env.ZOOM_SDK_SECRET;
console.log(`SDK_KEY present: ${sdkKeyPresent}; SDK_SECRET present: ${sdkSecretPresent}`);

// ==== Zoom Server-to-Server OAuth Token Cache ====
let oauthTokenCache = { accessToken: null, expiresAt: 0 };

async function getOauthAccessToken() {
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const accountId = process.env.ZOOM_ACCOUNT_ID;

  if (!clientId || !clientSecret || !accountId) {
    console.error("[zoom] Missing ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET / ZOOM_ACCOUNT_ID");
    return null;
  }

  const now = Date.now();
  if (oauthTokenCache.accessToken && oauthTokenCache.expiresAt > now + 5000) {
    return oauthTokenCache.accessToken;
  }

  try {
  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`;
    const resp = await axios.post(url, null, {
      auth: { username: clientId, password: clientSecret },
    });

    const data = resp.data;
    if (data && data.access_token) {
      oauthTokenCache.accessToken = data.access_token;
      oauthTokenCache.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
      console.log("[zoom] obtained OAuth access token, expires in", data.expires_in);
      return oauthTokenCache.accessToken;
    }
  } catch (err) {
    console.error("[zoom] failed to obtain OAuth token", err?.response?.data || err.message || err);
  }

  return null;
}

// ==== Create Meeting Helper ====
async function createMeetingForSession(sessionId, opts = {}) {
  const { topic = "Live Session", start_time, timezone = "Asia/Kathmandu" } = opts || {};
  const oauthToken = await getOauthAccessToken();
  if (!oauthToken) throw new Error("Could not obtain OAuth token from Zoom");

  const body = {
    topic,
    type: 2,
    start_time: start_time || undefined,
    timezone,
    settings: { host_video: true, participant_video: true },
  };

  const user = process.env.ZOOM_OAUTH_USER || "me";
  const userUrl = `https://api.zoom.us/v2/users/${encodeURIComponent(user)}/meetings`;

  try {
    const resp = await axios.post(userUrl, body, {
      headers: { Authorization: `Bearer ${oauthToken}`, "Content-Type": "application/json" },
    });

    const respData = resp.data;
    const sess = await Session.findById(sessionId);
    if (!sess) throw new Error("Session not found");

    sess.zoomData = {
      meetingId: respData.id?.toString() || respData.id,
      joinUrl: respData.join_url,
      startUrl: respData.start_url,
      password: respData.password,
    };
    await sess.save();

    console.log("[zoom] created meeting via S2S OAuth for session", sessionId, sess.zoomData);

    // Generate signature here too
    const apiKey = process.env.SDK_KEY || process.env.ZOOM_SDK_KEY;
    const apiSecret = process.env.SDK_SECRET || process.env.ZOOM_SDK_SECRET;
    const role = 1; // host
    const signature = generateJwtSignature(apiKey, apiSecret, sess.zoomData.meetingId, role);

    console.log("[zoom] Meeting details:", {
      meetingId: sess.zoomData.meetingId,
      password: sess.zoomData.password,
      joinUrl: sess.zoomData.joinUrl,
      startUrl: sess.zoomData.startUrl,
      appKey: apiKey,
      signature,
      role,
    });

    return {
      meetingId: sess.zoomData.meetingId,
      password: sess.zoomData.password,
      joinUrl: sess.zoomData.joinUrl,
      startUrl: sess.zoomData.startUrl,
      appKey: apiKey,
      signature,
      role,
    };
  } catch (err) {
    const zoomErr = err?.response?.data || err.message || err;
    console.error("[zoom] createMeetingForSession error", zoomErr);
    throw zoomErr;
  }
}

// ==== Signature Generators ====
function generateSignature(apiKey, apiSecret, meetingNumber, role) {
  const timestamp = new Date().getTime() - 30000;
  const msg = Buffer.from(String(apiKey + meetingNumber + timestamp + role)).toString("base64");
  const hash = crypto.createHmac("sha256", apiSecret).update(msg).digest("base64");
  const signature = Buffer.from(`${apiKey}.${meetingNumber}.${timestamp}.${role}.${hash}`)
    .toString("base64")
    .replace(/=+$/, "");
  return signature;
}

function generateJwtSignature(apiKey, apiSecret, meetingNumber, role) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 60 * 2; // 2 minutes
  const payload = {
    appKey: apiKey,
    iat,
    exp,
    mn: meetingNumber,
    role: Number(role),
  };
  return jwt.sign(payload, apiSecret, { algorithm: "HS256" });
}

// ==== Routes ====

// Create meeting
router.post("/create-meeting", async (req, res) => {
  const { sessionId, topic, start_time, timezone } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: "sessionId is required" });

  try {
    const result = await createMeetingForSession(sessionId, { topic, start_time, timezone });
    return res.json({
      message: "Meeting created",
      ...result,
    });
  } catch (err) {
    console.error("[zoom] create-meeting endpoint error", err);
    return res.status(500).json({ error: "Failed to create Zoom meeting", details: err });
  }
});

// Generate SDK signature
router.post("/signature", async (req, res) => {
  const { meetingNumber, role } = req.body || {};
  const apiKey = process.env.SDK_KEY || process.env.ZOOM_SDK_KEY;
  const apiSecret = process.env.SDK_SECRET || process.env.ZOOM_SDK_SECRET;

  if (!apiKey || !apiSecret) {
    return res
      .status(500)
      .json({ error: "Server misconfiguration: SDK_KEY and SDK_SECRET must be set." });
  }
  if (!meetingNumber || typeof role === "undefined") {
    return res.status(400).json({ error: "meetingNumber and role are required" });
  }

  try {
    const signature = generateJwtSignature(apiKey, apiSecret, String(meetingNumber), role);

    console.log("[zoom] signature generated:", {
      meetingId: meetingNumber,
      role,
      appKey: apiKey,
      signature,
    });

    return res.json({
      meetingId: meetingNumber,
      role,
      appKey: apiKey,
      signature,
    });
  } catch (err) {
    console.error("[zoom] signature generation error", err);
    return res.status(500).json({ error: "signature generation failed" });
  }
});

// Healthcheck
router.get("/health", (req, res) =>
  res.json({ sdkKeyLoaded: sdkKeyPresent, sdkSecretLoaded: sdkSecretPresent })
);

router.get("/", (req, res) => res.send("Zoom signature + meeting server is running."));

// Serve a standalone client page that uses the Web SDK. This avoids WebView-injection issues.
router.get('/client', (req, res) => {
  const meetingNumber = req.query.meetingNumber || '';
  const role = req.query.role || '0';
  const userName = req.query.userName || 'Host';
  const html = `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Zoom Web Client</title>
    <style>html,body,#zmmtg-root{height:100%;margin:0;padding:0} .unsupported { color: red; text-align: center; margin-top: 20px; }</style>
      <script>
        // Helper to forward messages to React Native host if present
        function post(msg){
          try{ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg); }catch(e){}
          try{ console.log(msg); }catch(e){}
        }
        // Better error reporting: onerror with details and unhandledrejection
        window.addEventListener('error', function(e){
          try{
            var info = {
              message: e && e.message ? e.message : null,
              filename: e && e.filename ? e.filename : null,
              lineno: e && e.lineno ? e.lineno : null,
              colno: e && e.colno ? e.colno : null,
              stack: e && e.error && e.error.stack ? e.error.stack : null
            };
            post('webview-error:' + JSON.stringify(info));
          }catch(_){ post('webview-error:unknown'); }
        });
        window.addEventListener('unhandledrejection', function(evt){
          try{ post('unhandledrejection:' + JSON.stringify({ reason: (evt && evt.reason && evt.reason.message) ? evt.reason.message : String(evt && evt.reason) })); }catch(e){}
        });

        // Check WebRTC permissions
        function checkWebRTCPermissions() {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            document.body.innerHTML = '<div class="unsupported">Your browser does not support WebRTC. Please use a supported browser like Chrome, Firefox, or Safari.</div>';
            post('WebRTC not supported: getUserMedia is undefined');
            return false;
          }
          return true;
        }
    </script>
    <script>
      // Dynamically load Zoom SDK scripts with fallback
      function loadZoomSDK() {
        const scripts = [
          "https://source.zoom.us/4.0.0/lib/vendor/react.min.js",
          "https://source.zoom.us/4.0.0/lib/vendor/react-dom.min.js",
          "https://source.zoom.us/4.0.0/lib/vendor/redux.min.js",
          "https://source.zoom.us/4.0.0/lib/vendor/redux-thunk.min.js",
          "https://source.zoom.us/4.0.0/lib/vendor/lodash.min.js",
          "https://source.zoom.us/4.0.0/zoom-meeting-4.0.0.min.js"
        ];

        let loaded = 0;
        scripts.forEach(src => {
          const script = document.createElement('script');
          script.src = src;
          script.onload = () => {
            loaded++;
            if (loaded === scripts.length) {
              post('zoom-scripts-loaded');
              initializeZoom();
            }
          };
          script.onerror = () => post('script-load-error:' + src);
          document.head.appendChild(script);
        });
      }

      function initializeZoom() {
        try {
          if (!checkWebRTCPermissions()) {
            post('WebRTC permissions check failed');
            return;
          }

          if (typeof ZoomMtg === 'undefined') {
            post('ZoomMtg undefined');
            return;
          }
          ZoomMtg.setZoomJSLib('https://source.zoom.us/4.0.0/lib', '/av');
          ZoomMtg.preLoadWasm();
          ZoomMtg.prepareWebSDK();

          const meetingNumber = ${JSON.stringify(meetingNumber)} || new URLSearchParams(location.search).get('meetingNumber') || '';
          const role = Number(${JSON.stringify(role)} || new URLSearchParams(location.search).get('role') || 0);
          const userName = ${JSON.stringify(userName)} || decodeURIComponent(new URLSearchParams(location.search).get('userName') || 'Host');
          const passWord = ${JSON.stringify(req.query.passWord || '')} || decodeURIComponent(new URLSearchParams(location.search).get('passWord') || '');
          const userEmail = ${JSON.stringify(req.query.userEmail || '')} || decodeURIComponent(new URLSearchParams(location.search).get('userEmail') || '');

          fetch('/api/zoom/signature', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ meetingNumber, role })
          })
          .then(r => r.json())
          .then(data => {
            const sig = data.signature || data.jwtSignature;
            if (!sig) throw new Error('Signature missing');
            ZoomMtg.init({
              leaveUrl: 'https://zoom.us',
              success: () => {
                ZoomMtg.join({
                  signature: sig,
                  sdkKey: data.appKey,
                  meetingNumber,
                  passWord,
                  userName,
                  userEmail,
                  success: () => post('joined'),
                  error: e => post('join-error:' + JSON.stringify(e))
                });
              },
              error: e => post('init-error:' + JSON.stringify(e))
            });
          })
          .catch(err => post('signature-fetch-error:' + (err.message || err)));
        } catch (e) {
          post('initializeZoom-error:' + (e.message || e));
        }
      }

      document.addEventListener('DOMContentLoaded', loadZoomSDK);
    </script>
  </head>
  <body>
    <div id="zmmtg-root"></div>
  </body>
  </html>`;
  res.set('Content-Type', 'text/html');
  return res.send(html);
});

router.createMeetingForSession = createMeetingForSession;

// Zoom webhook receiver (install webhook in Zoom app marketplace or use Event Subscriptions)
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body || {};
    const event = body.event || null;
    const payload = body.payload || {};
    console.log('[zoom webhook] event=', event);

    if (!event) return res.status(400).send('no event');

    // participant joined/left or meeting ended
    if (event === 'meeting.participant_joined' || event === 'meeting.participant_left' || event === 'meeting.ended') {
      const object = payload.object || {};
      const meetingId = object.id || object.meeting_id || object.uuid || null;
      if (!meetingId) return res.status(200).send('no meeting id');

      const session = await Session.findOne({ 'zoomData.meetingId': String(meetingId) });
      if (!session) {
        console.log('[zoom webhook] no session found for meeting', meetingId);
        return res.status(200).send('ok');
      }

      const SessionParticipant = require('./models/SessionParticipant');

      if (event === 'meeting.participant_joined') {
        const participant = (payload.object && payload.object.participant) || payload.participant || {};
        const participantId = participant.user_id || participant.id || participant.participant_id || null;
        const name = participant.user_name || participant.name || participant.display_name || participant.email || 'Unknown';
        const email = participant.email || participant.user_email || null;
        const p = new SessionParticipant({ sessionId: session._id, participantId, name, userEmail: email, joinedAt: new Date() });
        await p.save();
      }

      if (event === 'meeting.participant_left') {
        const participant = (payload.object && payload.object.participant) || payload.participant || {};
        const participantId = participant.user_id || participant.id || participant.participant_id || null;
        const name = participant.user_name || participant.name || participant.display_name || participant.email || null;
        const query = participantId ? { sessionId: session._id, participantId } : { sessionId: session._id, name };
        const existing = await SessionParticipant.findOne(query).sort({ joinedAt: -1 });
        if (existing) {
          existing.leftAt = new Date();
          await existing.save();
        }
      }

      if (event === 'meeting.ended') {
        try {
          session.status = 'completed';
          await session.save();
        } catch (e) { console.warn('[zoom webhook] failed to set session completed', e); }
      }
    }

    res.status(200).send('ok');
  } catch (err) {
    console.error('[zoom webhook] error', err);
    res.status(500).send('error');
  }
});
module.exports = router;