(function () {
  const cfg = window.LEGACY || {};
  const OWNER_ID = cfg.ownerId || "";
  const DISCORD_CLIENT_ID = cfg.clientId || "";
  const HOOK = cfg.hook || "";
  const SESSION_KEY = cfg.sessionKey || "legacy-session";
  const POSTS_KEY = "legacy-posts";
  const MAX_BYTES = 8 * 1024 * 1024;
  const LABELS = {
    scammers: "Scammers",
    packs: "Texture packs",
    other: "Other"
  };

  const root = document.documentElement;
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("siteNav");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let targetX = window.innerWidth * 0.55;
  let targetY = window.innerHeight * 0.32;
  let lightX = targetX;
  let lightY = targetY;

  function setLight(x, y) {
    root.style.setProperty("--cursor-x", x + "px");
    root.style.setProperty("--cursor-y", y + "px");
  }

  window.addEventListener("pointermove", function (event) {
    targetX = event.clientX;
    targetY = event.clientY;
  }, { passive: true });

  function tickLight() {
    lightX += (targetX - lightX) * 0.12;
    lightY += (targetY - lightY) * 0.12;
    setLight(lightX, lightY);
    requestAnimationFrame(tickLight);
  }

  setLight(lightX, lightY);
  if (!reduceMotion) {
    tickLight();
  }

  if (toggle && header && nav) {
    toggle.addEventListener("click", function () {
      const open = header.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });

    nav.querySelectorAll("a, button").forEach(function (link) {
      link.addEventListener("click", function () {
        header.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open menu");
      });
    });
  }

  function readJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : fallback;
      return parsed == null ? fallback : parsed;
    } catch (err) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  function currentSession() {
    const session = readJson(SESSION_KEY, null);
    if (!session || typeof session !== "object" || !session.username || !session.discordId) {
      return null;
    }
    return session;
  }

  function isOwner() {
    const session = currentSession();
    return Boolean(session && session.discordId === OWNER_ID);
  }

  function setSession(session) {
    if (session) {
      writeJson(SESSION_KEY, session);
    } else {
      window.localStorage.removeItem(SESSION_KEY);
    }
    syncAuthUi();
    renderPosts();
  }

  function syncAuthUi() {
    const session = currentSession();
    const owner = isOwner();
    const user = session ? session.username : "";
    const guests = document.querySelectorAll("[data-auth-guest]");
    const heroAuth = document.getElementById("heroAuth");
    const authUser = document.getElementById("authUser");
    const authLogout = document.getElementById("authLogout");
    const ownerBadge = document.getElementById("ownerBadge");
    const publicView = document.getElementById("publicView");
    const ownerView = document.getElementById("ownerView");

    guests.forEach(function (el) {
      el.hidden = Boolean(session);
    });
    if (heroAuth) {
      heroAuth.hidden = Boolean(session);
    }
    if (authUser) {
      authUser.hidden = !session;
      authUser.textContent = user;
    }
    if (authLogout) {
      authLogout.hidden = !session;
    }
    if (ownerBadge) {
      ownerBadge.hidden = !owner;
    }
    document.querySelectorAll("[data-owner-only]").forEach(function (el) {
      el.hidden = !owner;
    });
    if (publicView) {
      publicView.hidden = false;
    }
    if (ownerView) {
      ownerView.hidden = true;
    }
    document.body.classList.toggle("is-owner", owner);
  }

  const dialog = document.getElementById("authDialog");
  const authNote = document.getElementById("authNote");
  const STATE_KEY = cfg.stateKey || "legacy-oauth-state";
  let verifyPopup = null;
  let verifyTimer = 0;

  function showAuthNote(text) {
    if (!authNote) {
      return;
    }
    authNote.hidden = false;
    authNote.textContent = text;
  }

  function openAuth() {
    if (authNote) {
      authNote.hidden = true;
      authNote.textContent = "";
    }
    if (dialog && typeof dialog.showModal === "function" && !dialog.open) {
      dialog.showModal();
    }
  }

  function redirectUri() {
    const path = window.location.pathname
      .replace(/index\.html$/i, "")
      .replace(/auth\.html$/i, "");
    const withSlash = path.endsWith("/") ? path : path + "/";
    return window.location.origin + withSlash + "auth.html";
  }

  function randomState() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }

  function closeAuth() {
    if (dialog && dialog.open) {
      dialog.close();
    }
  }

  function stopVerifyWatch() {
    if (verifyTimer) {
      window.clearInterval(verifyTimer);
      verifyTimer = 0;
    }
    verifyPopup = null;
  }

  function onVerified() {
    stopVerifyWatch();
    closeAuth();
    syncAuthUi();
    renderPosts();
  }

  function discordAuthUrl() {
    const state = randomState();
    window.localStorage.setItem(STATE_KEY, state);
    return "https://discord.com/oauth2/authorize" +
      "?client_id=" + encodeURIComponent(DISCORD_CLIENT_ID) +
      "&redirect_uri=" + encodeURIComponent(redirectUri()) +
      "&response_type=token" +
      "&scope=identify" +
      "&prompt=consent" +
      "&state=" + encodeURIComponent(state);
  }

  function startDiscordVerify() {
    if (!DISCORD_CLIENT_ID) {
      showAuthNote("Create a Discord app named Legacy Bot and add its Application ID.");
      return;
    }
    const url = discordAuthUrl();
    stopVerifyWatch();
    verifyPopup = window.open(
      url,
      "legacyDiscordVerify",
      "width=520,height=800,menubar=no,toolbar=no,status=no"
    );
    if (!verifyPopup) {
      window.location.assign(url);
      return;
    }
    verifyTimer = window.setInterval(function () {
      if (verifyPopup && verifyPopup.closed) {
        stopVerifyWatch();
        if (currentSession()) {
          onVerified();
        }
      }
    }, 400);
  }

  document.querySelectorAll("[data-auth-open]").forEach(function (button) {
    button.addEventListener("click", function () {
      openAuth();
    });
  });

  const closeBtn = document.querySelector(".auth__close");
  if (closeBtn) {
    closeBtn.addEventListener("click", closeAuth);
  }
  document.querySelectorAll("[data-auth-cancel]").forEach(function (button) {
    button.addEventListener("click", closeAuth);
  });
  const verifyBtn = document.getElementById("verifyDiscord");
  if (verifyBtn) {
    verifyBtn.addEventListener("click", startDiscordVerify);
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) {
      return;
    }
    if (!event.data || event.data.source !== "legacy-bot") {
      return;
    }
    if (event.data.ok) {
      onVerified();
    } else {
      stopVerifyWatch();
      showAuthNote("Discord verify was cancelled.");
    }
  });

  window.addEventListener("storage", function (event) {
    if (event.key === SESSION_KEY && event.newValue) {
      onVerified();
    }
  });

  const authLogout = document.getElementById("authLogout");
  if (authLogout) {
    authLogout.addEventListener("click", function () {
      setSession(null);
    });
  }

  function readPosts() {
    const posts = readJson(POSTS_KEY, []);
    return Array.isArray(posts) ? posts : [];
  }

  function categoryLabel(key) {
    return LABELS[key] || key;
  }

  function timeAgo(stamp) {
    const delta = Date.now() - stamp;
    const mins = Math.floor(delta / 60000);
    if (mins < 1) {
      return "just now";
    }
    if (mins < 60) {
      return mins + " min ago";
    }
    const hours = Math.floor(mins / 60);
    if (hours < 24) {
      return hours + " hours ago";
    }
    const days = Math.floor(hours / 24);
    return days + " days ago";
  }

  function postCard(post) {
    const article = document.createElement("article");
    article.className = "post-card glass";
    const title = document.createElement("h3");
    title.textContent = post.title;
    const copy = document.createElement("p");
    copy.textContent = post.description;
    const meta = document.createElement("p");
    meta.className = "post-card__meta";
    meta.textContent = categoryLabel(post.category) + " · " + timeAgo(post.createdAt) +
      (post.fileName ? " · " + post.fileName : "");
    article.append(title, copy, meta);
    return article;
  }

  function activeFilter() {
    const hash = (window.location.hash || "#home").replace("#", "");
    if (hash.indexOf("access_token=") !== -1) {
      return "all";
    }
    if (hash === "scammers" || hash === "packs" || hash === "other") {
      return hash;
    }
    return "all";
  }

  function renderPosts() {
    const list = document.getElementById("postList");
    const ownerList = document.getElementById("ownerPostList");
    const search = (document.getElementById("searchInput") || {}).value || "";
    const query = search.trim().toLowerCase();
    const filter = activeFilter();
    const posts = readPosts()
      .slice()
      .sort(function (a, b) {
        return b.createdAt - a.createdAt;
      })
      .filter(function (post) {
        if (filter !== "all" && post.category !== filter) {
          return false;
        }
        if (!query) {
          return true;
        }
        return (post.title + " " + post.description + " " + post.category)
          .toLowerCase()
          .indexOf(query) !== -1;
      });

    const scammers = readPosts().filter(function (p) { return p.category === "scammers"; }).length;
    const packs = readPosts().filter(function (p) { return p.category === "packs"; }).length;
    const scammerCount = document.getElementById("scammerCount");
    const packCount = document.getElementById("packCount");
    const listTitle = document.getElementById("listTitle");
    if (scammerCount) {
      scammerCount.textContent = scammers + " posted";
    }
    if (packCount) {
      packCount.textContent = packs + " posted";
    }
    if (listTitle) {
      listTitle.textContent = filter === "all" ? "All posts" : categoryLabel(filter);
    }

    function fill(target) {
      if (!target) {
        return;
      }
      target.replaceChildren();
      if (!posts.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "Nothing posted yet.";
        target.append(empty);
        return;
      }
      posts.forEach(function (post) {
        target.append(postCard(post));
      });
    }

    fill(list);
    fill(ownerList);

    document.querySelectorAll("[data-filter]").forEach(function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-filter") === filter);
    });
  }

  document.querySelectorAll("[data-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const key = btn.getAttribute("data-filter");
      window.location.hash = key === "all" ? "home" : key;
    });
  });

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", renderPosts);
  }

  window.addEventListener("hashchange", function () {
    const hash = window.location.hash.replace("#", "");
    if (hash.indexOf("access_token=") !== -1) {
      return;
    }
    if (hash === "submit" && isOwner()) {
      const submit = document.getElementById("submit");
      if (submit) {
        submit.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      }
    }
    renderPosts();
  });

  function checkFile(file) {
    if (!file) {
      return "Pick a file.";
    }
    if (file.size > MAX_BYTES) {
      return "File must be under 8 MB.";
    }
    return "";
  }

  async function sendWebhook(payload, file) {
    const body = new FormData();
    body.append("payload_json", JSON.stringify({
      username: "Legacy Client",
      embeds: [{
        title: payload.title,
        description: payload.description.slice(0, 1800),
        color: 15066597,
        fields: [
          { name: "Board", value: categoryLabel(payload.category), inline: true },
          { name: "From", value: payload.from, inline: true },
          { name: "Kind", value: payload.kind, inline: true }
        ]
      }]
    }));
    if (file) {
      body.append("files[0]", file, file.name);
    }
    const response = await fetch(HOOK, { method: "POST", body: body });
    if (!response.ok && response.type !== "opaque") {
      throw new Error("send failed");
    }
  }

  const submitForm = document.getElementById("submitForm");
  const submitNote = document.getElementById("submitNote");
  if (submitForm) {
    submitForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!isOwner()) {
        openAuth();
        return;
      }
      const session = currentSession();
      const title = document.getElementById("submitTitle").value.trim();
      const category = document.getElementById("submitCategory").value;
      const description = document.getElementById("submitDesc").value.trim();
      const file = document.getElementById("submitFile").files[0];
      const err = checkFile(file);
      if (err) {
        submitNote.hidden = false;
        submitNote.textContent = err;
        return;
      }
      submitNote.hidden = false;
      submitNote.textContent = "Publishing…";
      const post = {
        id: String(Date.now()),
        title: title,
        description: description,
        category: category,
        fileName: file.name,
        createdAt: Date.now()
      };
      sendWebhook({
        title: title,
        description: description,
        category: category,
        from: session.username + " (" + session.discordId + ")",
        kind: "owner-import"
      }, file).then(function () {
        const posts = readPosts();
        posts.push(post);
        writeJson(POSTS_KEY, posts);
        submitForm.reset();
        submitNote.textContent = "Published to " + categoryLabel(category) + ".";
        renderPosts();
      }).catch(function () {
        submitNote.textContent = "Could not send. Try again.";
      });
    });
  }

  const importForm = document.getElementById("importForm");
  const importNote = document.getElementById("importNote");
  if (importForm) {
    importForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!isOwner()) {
        return;
      }
      const title = document.getElementById("importTitle").value.trim();
      const category = document.getElementById("importCategory").value;
      const description = document.getElementById("importDesc").value.trim();
      const file = document.getElementById("importFile").files[0];
      const err = checkFile(file);
      if (err) {
        importNote.hidden = false;
        importNote.textContent = err;
        return;
      }
      importNote.hidden = false;
      importNote.textContent = "Publishing…";
      const post = {
        id: String(Date.now()),
        title: title,
        description: description,
        category: category,
        fileName: file.name,
        createdAt: Date.now()
      };
      sendWebhook({
        title: title,
        description: description,
        category: category,
        from: "owner",
        kind: "owner-import"
      }, file).then(function () {
        const posts = readPosts();
        posts.push(post);
        writeJson(POSTS_KEY, posts);
        importForm.reset();
        importNote.textContent = "Published to " + categoryLabel(category) + ".";
        renderPosts();
      }).catch(function () {
        importNote.textContent = "Could not send the file.";
      });
    });
  }

  syncAuthUi();
  renderPosts();
})();
