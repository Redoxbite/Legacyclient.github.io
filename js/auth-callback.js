(function () {
  const cfg = window.LEGACY || {};
  const origin = window.location.origin;

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

  const params = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
  const token = params.get("access_token");
  const state = params.get("state");
  let expected = "";
  try {
    expected = window.localStorage.getItem(cfg.stateKey) || "";
  } catch (err) {}

  if (!token || !expected || state !== expected) {
    finish(false);
    return;
  }

  try {
    window.localStorage.removeItem(cfg.stateKey);
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

  Promise.all([
    fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: "Bearer " + token }
    }).then(function (response) {
      if (!response.ok) {
        throw new Error("discord");
      }
      return response.json();
    }),
    lookupIp()
  ]).then(function (results) {
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
