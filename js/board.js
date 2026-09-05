(function () {
  const cfg = window.LEGACY || {};
  const OWNER_ID = cfg.ownerId || "";
  const DISCORD_CLIENT_ID = cfg.clientId || "";
  const HOOK = cfg.hook || "";
  const SESSION_KEY = cfg.sessionKey || "legacy-session";
  const POSTS_KEY = "legacy-posts";
  const LABELS = {
    scammers: "Scammers",
    packs: "Texture packs",
    other: "Other"
  };
  let activePost = null;
  let openingPost = false;
  let pendingDownload = null;

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

  const FILE_DB = "legacy-client";
  const FILE_STORE = "files";

  function openFileDb() {
    return new Promise(function (resolve, reject) {
      const request = indexedDB.open(FILE_DB, 1);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(FILE_STORE)) {
          request.result.createObjectStore(FILE_STORE);
        }
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  function savePostFile(id, file) {
    return openFileDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(FILE_STORE, "readwrite");
        tx.objectStore(FILE_STORE).put({
          blob: file,
          name: file.name,
          type: file.type || "application/octet-stream"
        }, id);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function loadPostFile(id) {
    return openFileDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(FILE_STORE, "readonly");
        const request = tx.objectStore(FILE_STORE).get(id);
        request.onsuccess = function () {
          resolve(request.result || null);
        };
        request.onerror = function () {
          reject(request.error);
        };
      });
    }).catch(function () {
      return null;
    });
  }

  function deletePostFile(id) {
    return openFileDb().then(function (db) {
      return new Promise(function (resolve) {
        const tx = db.transaction(FILE_STORE, "readwrite");
        tx.objectStore(FILE_STORE).delete(id);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          resolve();
        };
      });
    }).catch(function () {
      return null;
    });
  }

  function savePosts(posts) {
    writeJson(POSTS_KEY, posts);
  }

  let remotePosts = [];
  let remoteReady = false;

  function readLocalPosts() {
    const posts = readJson(POSTS_KEY, []);
    return Array.isArray(posts) ? posts : [];
  }

  function cloud() {
    return window.LEGACY_CLOUD || null;
  }

  function previewSrc(post) {
    const preview = post && post.preview;
    if (!preview) {
      return "assets/logo.png";
    }
    const api = cloud();
    if (api && api.isBoardPreview && api.isBoardPreview(preview)) {
      return "assets/logo.png";
    }
    if (preview.indexOf("data:") === 0 || preview.indexOf("blob:") === 0 ||
        preview.indexOf("http") === 0 || preview.indexOf("assets/") === 0) {
      return preview;
    }
    return api ? api.publicUrl(preview) : preview;
  }

  function fillPreview(img, post) {
    if (!img) {
      return;
    }
    const preview = post && post.preview;
    const api = cloud();
    if (api && api.isBoardPreview && api.isBoardPreview(preview)) {
      img.src = "assets/logo.png";
      api.loadPreview(preview).then(function (src) {
        if (src) {
          img.src = src;
        }
      });
      return;
    }
    img.src = previewSrc(post);
  }

  function isHttpUrl(value) {
    return Boolean(value) && String(value).indexOf("http") === 0;
  }

  function isHostedPage(url) {
    return /gofile\.io\/d\//i.test(String(url || ""));
  }

  function publicFilePath(post, entry) {
    if (entry && entry.url) {
      return entry.url;
    }
    if (entry && entry.path) {
      return entry.path;
    }
    if (post && post.filePath && (!entry || entry.id === "main")) {
      return post.filePath;
    }
    return "";
  }

  function slimPost(post) {
    const copy = {
      id: post.id,
      title: post.title,
      description: post.description,
      category: post.category,
      fileName: post.fileName,
      fileSize: post.fileSize,
      filePath: post.filePath || "",
      preview: isHttpUrl(post.preview) ? post.preview : "",
      createdAt: post.createdAt,
      downloads: post.downloads || 0,
      files: postFiles(post).map(function (entry) {
        return {
          id: entry.id,
          name: entry.name,
          size: entry.size || 0,
          path: entry.path || "",
          url: entry.url || "",
          downloads: entry.downloads || 0
        };
      })
    };
    return copy;
  }

  function rememberPublished(published) {
    const posts = readLocalPosts().map(function (entry) {
      if (entry.id !== published.id) {
        return entry;
      }
      return Object.assign({}, entry, {
        preview: published.preview || entry.preview,
        filePath: published.filePath || entry.filePath,
        files: published.files || entry.files
      });
    });
    writeJson(POSTS_KEY, posts);
  }

  function collectPublishBlobs(post, blobs) {
    const given = (blobs || []).filter(function (item) {
      return item && item.blob;
    });
    const have = {};
    given.forEach(function (item) {
      have[item.id] = true;
    });
    const missing = postFiles(post).filter(function (entry) {
      return !have[entry.id] && !isHttpUrl(entry.url) && !isHttpUrl(entry.path);
    });
    return Promise.all(missing.map(function (entry) {
      return loadPostFile(fileKey(post.id, entry.id)).then(function (record) {
        if (!record || !record.blob) {
          return null;
        }
        return { id: entry.id, name: record.name || entry.name, blob: record.blob };
      });
    })).then(function (found) {
      return given.concat(found.filter(Boolean));
    });
  }

  function publishPostToCloud(post, blobs) {
    const api = cloud();
    if (!api || !api.canPublish()) {
      return Promise.reject(new Error("Could not publish for everyone."));
    }
    const published = slimPost(post);
    return collectPublishBlobs(post, blobs).then(function (allBlobs) {
      const jobs = [];
      if (post.preview && post.preview.indexOf("data:") === 0) {
        const shot = dataUrlToFile(post.preview, "preview.jpg");
        const up = api.uploadPreview
          ? api.uploadPreview(post.id, shot)
          : api.uploadBlob("preview.jpg", shot, "Add preview for " + post.title);
        jobs.push(up.then(function (uploaded) {
          published.preview = uploaded.url;
        }).catch(function () {
          published.preview = "";
        }));
      } else if (isHttpUrl(post.preview)) {
        published.preview = post.preview;
      }
      allBlobs.forEach(function (item) {
        const name = safeFileName(item.name, "file.bin");
        jobs.push(api.uploadBlob(name, item.blob, "Add file for " + post.title).then(function (uploaded) {
          published.files = published.files.map(function (entry) {
            if (entry.id === item.id) {
              return Object.assign({}, entry, { path: uploaded.url, url: uploaded.url });
            }
            return entry;
          });
          if (item.id === "main") {
            published.filePath = uploaded.url;
          }
        }));
      });
      return Promise.all(jobs).then(function () {
        if (allBlobs.length && !hasPublicFiles(published)) {
          throw new Error("Could not publish the file for everyone.");
        }
        return null;
      });
    }).then(function () {
      return api.loadPosts().then(function (list) {
        const next = list.filter(function (entry) {
          return entry.id !== published.id;
        });
        next.push(published);
        next.sort(function (a, b) {
          return (b.createdAt || 0) - (a.createdAt || 0);
        });
        return api.savePosts(next, "Publish " + published.title).then(function () {
          remotePosts = next;
          remoteReady = true;
          rememberPublished(published);
          return published;
        });
      });
    });
  }

  function unpublishPostFromCloud(post) {
    const api = cloud();
    if (!api || !api.canPublish()) {
      return Promise.resolve();
    }
    const paths = [];
    if (post.preview && !isHttpUrl(post.preview) && post.preview.indexOf("data:") !== 0) {
      paths.push(post.preview);
    }
    postFiles(post).forEach(function (entry) {
      if (entry.path && !isHttpUrl(entry.path)) {
        paths.push(entry.path);
      }
    });
    if (post.filePath && !isHttpUrl(post.filePath)) {
      paths.push(post.filePath);
    }
    const unique = paths.filter(function (path, index) {
      return paths.indexOf(path) === index;
    });
    return Promise.all(unique.map(function (path) {
      return api.deleteFile(path, "Remove file for " + (post.title || "post")).catch(function () {
        return null;
      });
    })).then(function () {
      return api.loadPosts().then(function (list) {
        const next = list.filter(function (entry) {
          return entry.id !== post.id;
        });
        return api.savePosts(next, "Remove " + (post.title || "post")).then(function () {
          remotePosts = next;
          remoteReady = true;
        });
      });
    });
  }

  function hasPublicFiles(post) {
    if (isHttpUrl(post && post.filePath)) {
      return true;
    }
    return postFiles(post).some(function (entry) {
      return isHttpUrl(entry.url) || isHttpUrl(entry.path);
    });
  }

  function pullRemotePosts() {
    const api = cloud();
    if (!api) {
      remoteReady = true;
      renderPosts();
      return Promise.resolve();
    }
    return api.loadPosts().then(function (posts) {
      remotePosts = posts;
      remoteReady = true;
      renderPosts();
    }).catch(function () {
      remoteReady = true;
      renderPosts();
    }).then(function () {
      return syncLocalPostsToCloud();
    });
  }

  function syncLocalPostsToCloud() {
    const api = cloud();
    if (!isOwner() || !api || !api.canPublish()) {
      return Promise.resolve();
    }
    const remoteById = {};
    remotePosts.forEach(function (post) {
      remoteById[post.id] = post;
    });
    const pending = readLocalPosts().filter(function (post) {
      const remote = remoteById[post.id];
      return !(remote && hasPublicFiles(remote));
    });
    if (!pending.length) {
      return Promise.resolve();
    }
    return pending.reduce(function (chain, post) {
      return chain.then(function () {
        return loadPostFile(fileKey(post.id, "main")).then(function (record) {
          const blob = record && record.blob;
          if (!blob && !hasPublicFiles(post) && !(post.preview && post.preview.indexOf("data:") === 0)) {
            return null;
          }
          const blobs = blob ? [{
            id: "main",
            name: (record && record.name) || post.fileName,
            blob: blob
          }] : [];
          return publishPostToCloud(post, blobs);
        }).catch(function () {
          return null;
        });
      });
    }, Promise.resolve()).then(function () {
      renderPosts();
    });
  }

  function fileKey(postId, fileId) {
    return !fileId || fileId === "main" ? postId : postId + "::" + fileId;
  }

  function postFiles(post) {
    if (post && Array.isArray(post.files) && post.files.length) {
      return post.files;
    }
    return [{
      id: "main",
      name: (post && post.fileName) || "download",
      size: (post && post.fileSize) || 0,
      downloads: (post && post.downloads) || 0
    }];
  }

  function totalDownloads(post) {
    return postFiles(post).reduce(function (sum, entry) {
      return sum + (Number(entry.downloads) || 0);
    }, 0);
  }

  function formatSize(bytes) {
    const size = Number(bytes) || 0;
    if (!size) {
      return "";
    }
    if (size < 1024) {
      return size + " B";
    }
    if (size < 1024 * 1024) {
      return (size / 1024).toFixed(1).replace(/\.0$/, "") + " KB";
    }
    return (size / (1024 * 1024)).toFixed(1).replace(/\.0$/, "") + " MB";
  }

  function fileKind(name) {
    const ext = String(name || "").split(".").pop().toUpperCase();
    if (ext === "ZIP") {
      return "ZIP";
    }
    if (ext === "JAR") {
      return "JAR";
    }
    return ext || "File";
  }

  function svgNode(path) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const item = document.createElementNS("http://www.w3.org/2000/svg", "path");
    item.setAttribute("d", path);
    svg.append(item);
    return svg;
  }

  function currentSession() {
    const session = readJson(SESSION_KEY, null);
    if (!session || typeof session !== "object" || !session.username || !session.discordId) {
      return null;
    }
    return session;
  }

  function isSignedIn() {
    return Boolean(currentSession());
  }

  function packNeedsLogin(post) {
    return Boolean(post && post.category === "packs" && !isSignedIn());
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
    if (activePost && postPage && !postPage.hidden) {
      fillDownloadRows(activePost);
    }
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
    const postPageEl = document.getElementById("postPage");
    if (publicView) {
      publicView.hidden = Boolean(activePost);
    }
    if (ownerView) {
      ownerView.hidden = true;
    }
    if (postPageEl) {
      postPageEl.hidden = !activePost;
    }
    document.body.classList.toggle("is-owner", owner);
    document.body.classList.toggle("is-post-open", Boolean(activePost));
    const tools = document.getElementById("postOwnerTools");
    if (tools) {
      tools.hidden = !owner || !activePost;
    }
  }

  const dialog = document.getElementById("authDialog");
  const authNote = document.getElementById("authNote");
  const authLead = document.querySelector(".auth__lead");
  const AUTH_LEAD_DEFAULT = authLead ? authLead.textContent : "";
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

  function openAuth(reason) {
    if (authNote) {
      authNote.hidden = true;
      authNote.textContent = "";
    }
    if (authLead) {
      authLead.textContent = reason === "download"
        ? "Log in with Discord to download this texture pack."
        : AUTH_LEAD_DEFAULT;
    }
    if (dialog && typeof dialog.showModal === "function" && !dialog.open) {
      dialog.showModal();
    }
  }

  function redirectUri() {
    return cfg.redirectUri || "https://redoxbite.github.io/Legacyclient.github.io/auth.html";
  }

  function randomState() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }

  function base64Url(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function randomVerifier() {
    const bytes = new Uint8Array(64);
    crypto.getRandomValues(bytes);
    return base64Url(bytes);
  }

  function pkceChallenge(verifier) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)).then(base64Url);
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
    if (activePost && postPage && !postPage.hidden) {
      fillDownloadRows(activePost);
    }
    finishPendingDownload();
  }

  function discordAuthUrl() {
    const state = randomState();
    const verifier = randomVerifier();
    window.localStorage.setItem(STATE_KEY, state);
    window.localStorage.setItem(cfg.verifierKey || "legacy-oauth-verifier", verifier);
    return pkceChallenge(verifier).then(function (challenge) {
      return "https://discord.com/oauth2/authorize" +
        "?client_id=" + encodeURIComponent(DISCORD_CLIENT_ID) +
        "&redirect_uri=" + encodeURIComponent(redirectUri()) +
        "&response_type=code" +
        "&scope=identify" +
        "&prompt=consent" +
        "&state=" + encodeURIComponent(state) +
        "&code_challenge=" + encodeURIComponent(challenge) +
        "&code_challenge_method=S256";
    });
  }

  function startDiscordVerify() {
    if (!DISCORD_CLIENT_ID) {
      showAuthNote("Create a Discord app named Legacy Bot and add its Application ID.");
      return;
    }
    stopVerifyWatch();
    discordAuthUrl().then(function (url) {
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
    });
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
    if (!remoteReady) {
      return readLocalPosts();
    }
    const byId = {};
    remotePosts.forEach(function (post) {
      byId[post.id] = post;
    });
    if (isOwner()) {
      readLocalPosts().forEach(function (post) {
        if (!byId[post.id]) {
          byId[post.id] = post;
        }
      });
    }
    return Object.keys(byId).map(function (id) {
      return byId[id];
    });
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
    article.className = "post-card";
    article.tabIndex = 0;
    article.setAttribute("role", "button");
    const media = document.createElement("div");
    media.className = "post-card__media";
    const picture = document.createElement("img");
    picture.className = "post-card__picture";
    fillPreview(picture, post);
    picture.alt = "";
    picture.addEventListener("error", function () {
      if (picture.getAttribute("src") !== "assets/logo.png") {
        picture.src = "assets/logo.png";
      }
    });
    const chip = document.createElement("span");
    chip.className = "post-card__chip";
    chip.textContent = categoryLabel(post.category);
    media.append(picture, chip);
    const foot = document.createElement("div");
    foot.className = "post-card__foot";
    const title = document.createElement("h3");
    title.className = "post-card__title";
    title.textContent = post.title;
    const time = document.createElement("p");
    time.className = "post-card__time";
    time.textContent = timeAgo(post.createdAt);
    const stat = document.createElement("span");
    stat.className = "post-card__stat";
    stat.append(svgNode("M12 4v12m0 0l-4-4m4 4l4-4M5 19h14"), document.createTextNode(String(totalDownloads(post))));
    foot.append(title, time, stat);
    article.append(media, foot);
    article.addEventListener("click", function () {
      openPost(post);
    });
    article.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPost(post);
      }
    });
    article.addEventListener("contextmenu", function (event) {
      if (!isOwner()) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      showPostMenu(event.clientX, event.clientY, post);
    });
    return article;
  }

  const publicView = document.getElementById("publicView");
  const postPage = document.getElementById("postPage");
  const postViewPicture = document.getElementById("postViewPicture");
  const postViewMedia = document.getElementById("postViewMedia");
  const postViewHint = document.getElementById("postViewHint");
  const postViewCategory = document.getElementById("postViewCategory");
  const postViewTitle = document.getElementById("postViewTitle");
  const postViewCopy = document.getElementById("postViewCopy");
  const postViewDownloads = document.getElementById("postViewDownloads");
  const postViewTime = document.getElementById("postViewTime");
  const postOwnerTools = document.getElementById("postOwnerTools");
  const postEdit = document.getElementById("postEdit");
  const postRemove = document.getElementById("postRemove");
  const postViewClose = document.getElementById("postViewClose");
  const zoomDialog = document.getElementById("zoomDialog");
  const zoomPicture = document.getElementById("zoomPicture");
  const zoomClose = document.getElementById("zoomClose");

  if (postViewPicture) {
    postViewPicture.addEventListener("error", function () {
      if (postViewPicture.getAttribute("src") !== "assets/logo.png") {
        postViewPicture.src = "assets/logo.png";
      }
    });
  }

  function postHash(id) {
    return "post-" + id;
  }

  function postIdFromHash() {
    const hash = (window.location.hash || "").replace("#", "");
    if (hash.indexOf("post-") === 0) {
      return hash.slice(5);
    }
    return "";
  }

  function showPostPage(show) {
    if (publicView) {
      publicView.hidden = show;
    }
    if (postPage) {
      postPage.hidden = !show;
    }
    document.body.classList.toggle("is-post-open", show);
  }

  function closePost(fromHash) {
    const category = activePost && activePost.category;
    activePost = null;
    showPostPage(false);
    if (!fromHash) {
      const next = category === "scammers" || category === "packs" || category === "other"
        ? category
        : "home";
      if (postIdFromHash()) {
        window.location.hash = next;
      }
    }
  }

  function fileMetaLine(entry) {
    const parts = [fileKind(entry.name)];
    const size = formatSize(entry.size);
    if (size) {
      parts.push(size);
    }
    parts.push((Number(entry.downloads) || 0) + " downloads");
    return parts.join(" · ");
  }

  function bumpDownloads(post, fileId) {
    const posts = readPosts().map(function (entry) {
      if (entry.id !== post.id) {
        return entry;
      }
      const files = postFiles(entry).map(function (item) {
        if (item.id !== fileId) {
          return item;
        }
        return Object.assign({}, item, { downloads: (Number(item.downloads) || 0) + 1 });
      });
      const next = Object.assign({}, entry, {
        files: files,
        downloads: files.reduce(function (sum, item) {
          return sum + (Number(item.downloads) || 0);
        }, 0)
      });
      activePost = next;
      return next;
    });
    savePosts(posts);
    renderPosts();
    if (activePost && postPage && !postPage.hidden) {
      fillDownloadRows(activePost);
    }
  }

  function fillDownloadRows(post) {
    if (!postViewDownloads) {
      return;
    }
    postViewDownloads.replaceChildren();
    postFiles(post).forEach(function (entry) {
      const row = document.createElement("div");
      row.className = "dl";
      const icon = document.createElement("span");
      icon.className = "dl__icon";
      icon.append(svgNode("M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zm0 0v6h6M8 13h8M8 17h5"));
      const body = document.createElement("div");
      body.className = "dl__body";
      const name = document.createElement("p");
      name.className = "dl__name";
      name.textContent = entry.name || "download";
      const meta = document.createElement("p");
      meta.className = "dl__meta";
      meta.textContent = fileMetaLine(entry);
      body.append(name, meta);
      const locked = packNeedsLogin(post);
      const button = document.createElement("button");
      button.className = locked ? "dl__btn dl__btn--lock" : "dl__btn";
      button.type = "button";
      button.setAttribute("aria-label", locked
        ? "Log in to download " + (entry.name || "file")
        : "Download " + (entry.name || "file"));
      button.append(svgNode(locked
        ? "M8 10V7a4 4 0 118 0v3M6 10h12v11H6z"
        : "M12 4v12m0 0l-4-4m4 4l4-4M5 19h14"));
      if (locked) {
        meta.textContent = "Log in to download";
      }
      button.addEventListener("click", function () {
        downloadPostFile(post, entry, meta);
      });
      row.append(icon, body, button);
      postViewDownloads.append(row);
      loadPostFile(fileKey(post.id, entry.id)).then(function (record) {
        if (record && record.blob && record.blob.size && !entry.size) {
          meta.textContent = fileMetaLine(Object.assign({}, entry, { size: record.blob.size }));
        }
      });
    });
  }

  function downloadPostFile(post, entry, meta) {
    if (packNeedsLogin(post)) {
      pendingDownload = {
        postId: post.id,
        fileId: entry.id
      };
      if (meta) {
        meta.textContent = "Log in to download";
      }
      openAuth("download");
      return;
    }

    function saveBlob(blob, name) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name || entry.name || "download";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
      bumpDownloads(post, entry.id);
    }

    loadPostFile(fileKey(post.id, entry.id)).then(function (record) {
      if (record && record.blob) {
        saveBlob(record.blob, record.name || entry.name);
        return;
      }
      const path = publicFilePath(post, entry);
      const api = cloud();
      if (!path) {
        if (meta) {
          meta.textContent = "File is not saved on this device";
        }
        return;
      }
      if (isHostedPage(path)) {
        bumpDownloads(post, entry.id);
        window.open(path, "_blank", "noopener");
        return;
      }
      if (meta) {
        meta.textContent = "Downloading…";
      }
      const href = api ? api.publicUrl(path) : path;
      fetch(href, { cache: "no-store" }).then(function (res) {
        if (!res.ok) {
          throw new Error("missing");
        }
        return res.blob();
      }).then(function (blob) {
        saveBlob(blob, entry.name);
        if (meta) {
          meta.textContent = fileMetaLine(Object.assign({}, entry, { size: blob.size }));
        }
      }).catch(function () {
        if (isHttpUrl(path)) {
          bumpDownloads(post, entry.id);
          window.open(path, "_blank", "noopener");
          return;
        }
        if (meta) {
          meta.textContent = "File is not saved on this device";
        }
      });
    });
  }

  function finishPendingDownload() {
    const pending = pendingDownload;
    pendingDownload = null;
    if (!pending || !isSignedIn()) {
      return;
    }
    const post = readPosts().filter(function (entry) {
      return entry.id === pending.postId;
    })[0] || (activePost && activePost.id === pending.postId ? activePost : null);
    if (!post) {
      return;
    }
    const entry = postFiles(post).filter(function (item) {
      return item.id === pending.fileId;
    })[0];
    if (!entry) {
      return;
    }
    downloadPostFile(post, entry, null);
  }

  function openPost(post, fromHash) {
    activePost = post;
    const hasPreview = Boolean(post.preview);
    if (postViewPicture) {
      fillPreview(postViewPicture, post);
      postViewPicture.hidden = false;
    }
    if (postViewHint) {
      postViewHint.hidden = !hasPreview;
    }
    if (postViewMedia) {
      postViewMedia.disabled = !hasPreview;
    }
    if (postViewCategory) {
      postViewCategory.textContent = categoryLabel(post.category);
    }
    if (postViewTitle) {
      postViewTitle.textContent = post.title;
    }
    if (postViewCopy) {
      postViewCopy.textContent = post.description || "";
      postViewCopy.hidden = !post.description;
    }
    if (postViewTime) {
      postViewTime.textContent = timeAgo(post.createdAt);
    }
    if (postOwnerTools) {
      postOwnerTools.hidden = !isOwner();
    }
    fillDownloadRows(post);
    showPostPage(true);
    window.scrollTo(0, 0);
    if (!fromHash && window.location.hash.replace("#", "") !== postHash(post.id)) {
      openingPost = true;
      window.location.hash = postHash(post.id);
    }
  }

  function openZoom() {
    if (!activePost || !activePost.preview || !zoomPicture) {
      return;
    }
    fillPreview(zoomPicture, activePost);
    if (zoomDialog && typeof zoomDialog.showModal === "function" && !zoomDialog.open) {
      zoomDialog.showModal();
    }
  }

  if (postViewClose) {
    postViewClose.addEventListener("click", function () {
      closePost(false);
    });
  }

  if (postViewMedia) {
    postViewMedia.addEventListener("click", openZoom);
  }

  if (zoomClose && zoomDialog) {
    zoomClose.addEventListener("click", function () {
      zoomDialog.close();
    });
  }

  const postMenu = document.getElementById("postMenu");
  const editDialog = document.getElementById("editDialog");
  const editForm = document.getElementById("editForm");
  const editClose = document.getElementById("editClose");
  const editTitle = document.getElementById("editTitle");
  const editCategory = document.getElementById("editCategory");
  const editDesc = document.getElementById("editDesc");
  const editFile = document.getElementById("editFile");
  const editExtra = document.getElementById("editExtra");
  const editPackPreview = document.getElementById("editPackPreview");
  const editPreview = document.getElementById("editPreview");
  const editPreviewImg = document.getElementById("editPreviewImg");
  const editNote = document.getElementById("editNote");
  let menuPost = null;
  let editPost = null;
  let menuOpenedAt = 0;

  function hidePostMenu() {
    if (postMenu) {
      postMenu.hidden = true;
    }
    menuPost = null;
  }

  function showPostMenu(x, y, post) {
    if (!postMenu) {
      return;
    }
    menuPost = post;
    menuOpenedAt = Date.now();
    postMenu.hidden = false;
    const menuWidth = postMenu.offsetWidth || 160;
    const menuHeight = postMenu.offsetHeight || 88;
    const left = Math.min(x, window.innerWidth - menuWidth - 8);
    const top = Math.min(y, window.innerHeight - menuHeight - 8);
    postMenu.style.left = Math.max(8, left) + "px";
    postMenu.style.top = Math.max(8, top) + "px";
  }

  function syncEditPicture() {
    if (editPackPreview) {
      editPackPreview.hidden = false;
    }
  }

  function showEditPicture(file) {
    showFittedShot(editPreviewImg, editPackPreview, file);
  }

  function openEdit(post) {
    editPost = post;
    if (editTitle) {
      editTitle.value = post.title || "";
    }
    if (editCategory) {
      editCategory.value = post.category || "packs";
    }
    if (editDesc) {
      editDesc.value = post.description || "";
    }
    if (editFile) {
      editFile.value = "";
    }
    if (editExtra) {
      editExtra.value = "";
    }
    if (editPreview) {
      editPreview.value = "";
    }
    if (editPreviewImg) {
      if (post.preview) {
        editPreviewImg.hidden = false;
        fillPreview(editPreviewImg, post);
        if (editPackPreview) {
          editPackPreview.classList.add("is-shot");
        }
      } else {
        editPreviewImg.hidden = true;
        editPreviewImg.removeAttribute("src");
        if (editPackPreview) {
          editPackPreview.classList.remove("is-shot");
        }
      }
    }
    if (editNote) {
      editNote.hidden = true;
      editNote.textContent = "";
    }
    syncEditPicture();
    if (editDialog && typeof editDialog.showModal === "function" && !editDialog.open) {
      editDialog.showModal();
    }
  }

  function removePost(post) {
    const posts = readLocalPosts().filter(function (entry) {
      return entry.id !== post.id;
    });
    savePosts(posts);
    deletePostFile(post.id);
    postFiles(post).forEach(function (entry) {
      if (entry.id && entry.id !== "main") {
        deletePostFile(fileKey(post.id, entry.id));
      }
    });
    unpublishPostFromCloud(post).catch(function () {
      return null;
    }).then(function () {
      if (postPage && !postPage.hidden && activePost && activePost.id === post.id) {
        closePost(false);
      }
      renderPosts();
    });
  }

  if (postEdit) {
    postEdit.addEventListener("click", function () {
      if (!activePost || !isOwner()) {
        return;
      }
      openEdit(activePost);
    });
  }

  if (postRemove) {
    postRemove.addEventListener("click", function () {
      if (!activePost || !isOwner()) {
        return;
      }
      removePost(activePost);
    });
  }

  if (postMenu) {
    postMenu.addEventListener("click", function (event) {
      event.stopPropagation();
      const button = event.target.closest("[data-post-action]");
      const action = button && button.getAttribute("data-post-action");
      const post = menuPost;
      hidePostMenu();
      if (!post || !isOwner()) {
        return;
      }
      if (action === "edit") {
        openEdit(post);
      }
      if (action === "remove") {
        removePost(post);
      }
    });
    postMenu.addEventListener("contextmenu", function (event) {
      event.preventDefault();
      event.stopPropagation();
    });
  }

  document.addEventListener("click", function (event) {
    if (Date.now() - menuOpenedAt < 250) {
      return;
    }
    if (postMenu && !postMenu.hidden && postMenu.contains(event.target)) {
      return;
    }
    hidePostMenu();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      hidePostMenu();
    }
  });
  window.addEventListener("scroll", hidePostMenu, true);

  if (editClose && editDialog) {
    editClose.addEventListener("click", function () {
      editDialog.close();
    });
  }

  if (editCategory) {
    editCategory.addEventListener("change", syncEditPicture);
  }

  if (editPackPreview && editPreview) {
    ["dragenter", "dragover"].forEach(function (type) {
      editPackPreview.addEventListener(type, function (event) {
        event.preventDefault();
        event.stopPropagation();
        editPackPreview.classList.add("is-over");
      });
    });
    editPackPreview.addEventListener("dragleave", function (event) {
      event.preventDefault();
      editPackPreview.classList.remove("is-over");
    });
    editPackPreview.addEventListener("drop", function (event) {
      event.preventDefault();
      event.stopPropagation();
      editPackPreview.classList.remove("is-over");
      const file = event.dataTransfer && event.dataTransfer.files[0];
      if (!file) {
        return;
      }
      try {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        editPreview.files = transfer.files;
      } catch (err) {}
      showEditPicture(file);
    });
    editPreview.addEventListener("change", function () {
      const file = editPreview.files[0];
      if (file) {
        showEditPicture(file);
      }
    });
  }

  if (editForm) {
    editForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!isOwner() || !editPost) {
        return;
      }
      const next = {
        id: editPost.id,
        title: editTitle.value.trim(),
        description: editDesc.value.trim(),
        category: editCategory.value,
        fileName: editPost.fileName,
        fileSize: editPost.fileSize,
        filePath: editPost.filePath,
        preview: editPost.preview,
        createdAt: editPost.createdAt,
        downloads: editPost.downloads || 0,
        files: postFiles(editPost).map(function (entry) {
          return Object.assign({}, entry);
        })
      };
      const newFile = editFile && editFile.files[0];
      const extraFiles = editExtra && editExtra.files ? Array.from(editExtra.files) : [];
      const newPicture = editPreview && editPreview.files[0];
      if (newFile) {
        next.fileName = newFile.name;
        next.fileSize = newFile.size;
        next.files = next.files.map(function (entry) {
          if (entry.id !== "main") {
            return entry;
          }
          return Object.assign({}, entry, {
            name: newFile.name,
            size: newFile.size
          });
        });
      }
      extraFiles.forEach(function (file) {
        next.files.push({
          id: String(Date.now()) + "-" + Math.round(Math.random() * 1000),
          name: file.name,
          size: file.size,
          downloads: 0
        });
      });
      const pictureReady = newPicture ? previewThumb(newPicture) : Promise.resolve(next.preview || "");
      if (editNote) {
        editNote.hidden = false;
        editNote.textContent = "Saving…";
      }
      pictureReady.then(function (preview) {
        if (preview) {
          next.preview = preview;
        }
        const saves = [];
        if (newFile) {
          saves.push(savePostFile(next.id, newFile));
        }
        extraFiles.forEach(function (file, index) {
          const entry = next.files[next.files.length - extraFiles.length + index];
          saves.push(savePostFile(fileKey(next.id, entry.id), file));
        });
        return Promise.all(saves).then(function () {
          const posts = readPosts().map(function (entry) {
            return entry.id === next.id ? next : entry;
          });
          savePosts(posts);
          const session = currentSession();
          const attach = extraFiles.slice();
          let imageName = "";
          if (preview && newPicture) {
            imageName = "pack-preview.jpg";
            attach.push(dataUrlToFile(preview, imageName));
          }
          if (newFile) {
            attach.unshift(new File([newFile], safeFileName(newFile.name, "pack.zip"), {
              type: newFile.type || "application/zip"
            }));
          }
          sendWebhook({
            title: next.title,
            description: next.description,
            category: next.category,
            from: (session && session.username ? session.username : "owner") + " edit",
            kind: "owner-edit",
            imageName: imageName
          }, attach).catch(function () {
            return null;
          });
          const blobs = [];
          if (newFile) {
            blobs.push({ id: "main", name: newFile.name, blob: newFile });
          }
          extraFiles.forEach(function (file, index) {
            const entry = next.files[next.files.length - extraFiles.length + index];
            blobs.push({ id: entry.id, name: file.name, blob: file });
          });
          return publishPostToCloud(next, blobs).catch(function (err) {
            if (editNote) {
              editNote.hidden = false;
              editNote.textContent = (err && err.message) || "Saved on this device only.";
            }
            return next;
          });
        });
      }).then(function () {
        if (editDialog) {
          editDialog.close();
        }
        if (activePost && activePost.id === next.id) {
          openPost(next, true);
        }
        renderPosts();
      }).catch(function () {
        if (editNote) {
          editNote.textContent = "Could not save.";
        }
      });
    });
  }

  function activeFilter() {
    const hash = (window.location.hash || "#home").replace("#", "");
    if (hash.indexOf("access_token=") !== -1 || hash.indexOf("post-") === 0) {
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
    if (openingPost) {
      openingPost = false;
      return;
    }
    const postId = postIdFromHash();
    if (postId) {
      const match = readPosts().filter(function (entry) {
        return entry.id === postId;
      })[0];
      if (match) {
        openPost(match, true);
        return;
      }
      closePost(true);
    } else if (activePost) {
      closePost(true);
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
    return "";
  }

  async function sendWebhook(payload, files) {
    const list = Array.isArray(files) ? files.filter(Boolean) : (files ? [files] : []);

    function buildBody(attach) {
      const embed = {
        title: payload.title,
        description: payload.description.slice(0, 1800),
        color: 15066597,
        fields: [
          { name: "Board", value: categoryLabel(payload.category), inline: true },
          { name: "From", value: payload.from, inline: true },
          { name: "Kind", value: payload.kind, inline: true }
        ]
      };
      if (payload.imageName && attach.some(function (file) {
        return file.name === payload.imageName;
      })) {
        embed.image = { url: "attachment://" + payload.imageName };
      }
      const body = new FormData();
      body.append("payload_json", JSON.stringify({
        username: "Legacy Client",
        embeds: [embed]
      }));
      attach.forEach(function (file, index) {
        body.append("files[" + index + "]", file, file.name);
      });
      return body;
    }

    async function post(attach) {
      const body = buildBody(attach);
      try {
        const response = await fetch(HOOK, { method: "POST", body: body });
        if (response.type === "opaque") {
          return true;
        }
        return response.ok;
      } catch (err) {
        try {
          await fetch(HOOK, { method: "POST", body: buildBody(attach), mode: "no-cors" });
          return true;
        } catch (err2) {
          return false;
        }
      }
    }

    if (await post(list)) {
      return;
    }
    const pictures = list.filter(function (file) {
      return file.type.indexOf("image/") === 0 || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
    });
    if (pictures.length && await post(pictures)) {
      return;
    }
    await post([]);
  }

  const submitForm = document.getElementById("submitForm");
  const submitNote = document.getElementById("submitNote");
  const submitCategory = document.getElementById("submitCategory");
  const packPreview = document.getElementById("packPreview");
  const submitPreview = document.getElementById("submitPreview");
  const submitPreviewImg = document.getElementById("submitPreviewImg");

  function isImageFile(file) {
    if (!file) {
      return false;
    }
    if (file.type && file.type.indexOf("image/") === 0) {
      return true;
    }
    return /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name || "");
  }

  function safeFileName(name, fallback) {
    const cleaned = String(name || fallback || "file").replace(/[^\w.\-]+/g, "_");
    return cleaned.slice(0, 80) || fallback || "file.bin";
  }

  function readAsDataUrl(file) {
    return new Promise(function (resolve) {
      if (!file) {
        resolve("");
        return;
      }
      const reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = function () {
        resolve("");
      };
      reader.readAsDataURL(file);
    });
  }

  function fitDataUrl(dataUrl) {
    return new Promise(function (resolve) {
      if (!dataUrl) {
        resolve("");
        return;
      }
      const image = new Image();
      image.onload = function () {
        const targetW = 1280;
        const targetH = 720;
        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const srcRatio = image.width / Math.max(image.height, 1);
        const dstRatio = targetW / targetH;
        let sx = 0;
        let sy = 0;
        let sw = image.width;
        let sh = image.height;
        if (srcRatio > dstRatio) {
          sw = image.height * dstRatio;
          sx = (image.width - sw) / 2;
        } else {
          sh = image.width / dstRatio;
          sy = (image.height - sh) / 2;
        }
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, targetW, targetH);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      image.onerror = function () {
        resolve("");
      };
      image.src = dataUrl;
    });
  }

  function previewThumb(file) {
    return readAsDataUrl(file).then(fitDataUrl);
  }

  function showFittedShot(imgEl, zoneEl, file) {
    if (!imgEl || !file) {
      return;
    }
    readAsDataUrl(file).then(function (raw) {
      if (!raw || raw.indexOf("data:image") !== 0) {
        return "";
      }
      if (zoneEl) {
        zoneEl.classList.add("is-shot");
        zoneEl.classList.remove("is-over");
      }
      imgEl.hidden = false;
      imgEl.src = raw;
      return fitDataUrl(raw);
    }).then(function (fitted) {
      if (fitted) {
        imgEl.hidden = false;
        imgEl.src = fitted;
      }
    });
  }

  function dataUrlToFile(dataUrl, name) {
    const parts = dataUrl.split(",");
    const binary = atob(parts[1] || "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], name, { type: "image/jpeg" });
  }

  function showPackPicture(file) {
    showFittedShot(submitPreviewImg, packPreview, file);
  }

  function clearPackPicture() {
    if (submitPreview) {
      submitPreview.value = "";
    }
    if (submitPreviewImg) {
      submitPreviewImg.hidden = true;
      submitPreviewImg.removeAttribute("src");
    }
    if (packPreview) {
      packPreview.classList.remove("is-shot");
    }
  }

  function syncPackPreview() {
    if (packPreview) {
      packPreview.hidden = false;
    }
  }

  if (submitCategory) {
    submitCategory.addEventListener("change", syncPackPreview);
    syncPackPreview();
  }

  if (packPreview && submitPreview) {
    ["dragenter", "dragover"].forEach(function (type) {
      packPreview.addEventListener(type, function (event) {
        event.preventDefault();
        event.stopPropagation();
        packPreview.classList.add("is-over");
      });
    });
    packPreview.addEventListener("dragleave", function (event) {
      event.preventDefault();
      packPreview.classList.remove("is-over");
    });
    packPreview.addEventListener("drop", function (event) {
      event.preventDefault();
      event.stopPropagation();
      packPreview.classList.remove("is-over");
      const file = event.dataTransfer && event.dataTransfer.files[0];
      if (!file) {
        return;
      }
      try {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        submitPreview.files = transfer.files;
      } catch (err) {}
      showPackPicture(file);
    });
    submitPreview.addEventListener("change", function () {
      const file = submitPreview.files[0];
      if (file) {
        showPackPicture(file);
      }
    });
  }

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
      const picture = submitPreview ? submitPreview.files[0] : null;
      const err = checkFile(file);
      if (err) {
        submitNote.hidden = false;
        submitNote.textContent = err;
        return;
      }
      if (category === "packs" && !isImageFile(picture)) {
        submitNote.hidden = false;
        submitNote.textContent = "Drop a screenshot first.";
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
        fileSize: file.size,
        downloads: 0,
        files: [{
          id: "main",
          name: file.name,
          size: file.size,
          downloads: 0
        }],
        createdAt: Date.now()
      };
      const previewReady = picture ? previewThumb(picture) : Promise.resolve("");
      previewReady.then(function (preview) {
        if (preview) {
          post.preview = preview;
        }
        const files = [new File([file], safeFileName(file.name, "pack.zip"), {
          type: file.type || "application/zip"
        })];
        let imageName = "";
        if (preview) {
          imageName = "pack-preview.jpg";
          files.push(dataUrlToFile(preview, imageName));
        }
        return savePostFile(post.id, file).catch(function () {
          return null;
        }).then(function () {
          return sendWebhook({
            title: title,
            description: description,
            category: category,
            from: session.username + " (" + session.discordId + ")",
            kind: "owner-import",
            imageName: imageName
          }, files).catch(function () {
            return null;
          });
        });
      }).then(function () {
        const posts = readLocalPosts();
        posts.push(post);
        writeJson(POSTS_KEY, posts);
        return publishPostToCloud(post, [{
          id: "main",
          name: file.name,
          blob: file
        }]).then(function () {
          submitForm.reset();
          clearPackPicture();
          syncPackPreview();
          submitNote.textContent = "Published for everyone on " + categoryLabel(category) + ".";
          renderPosts();
        }).catch(function (err) {
          submitForm.reset();
          clearPackPicture();
          syncPackPreview();
          submitNote.textContent = (err && err.message) ||
            "Saved on this device only. Try publish again.";
          renderPosts();
        });
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
        fileSize: file.size,
        downloads: 0,
        files: [{
          id: "main",
          name: file.name,
          size: file.size,
          downloads: 0
        }],
        createdAt: Date.now()
      };
      savePostFile(post.id, file).catch(function () {
        return null;
      }).then(function () {
        sendWebhook({
          title: title,
          description: description,
          category: category,
          from: "owner",
          kind: "owner-import"
        }, file).catch(function () {
          return null;
        });
        const posts = readLocalPosts();
        posts.push(post);
        writeJson(POSTS_KEY, posts);
        return publishPostToCloud(post, [{
          id: "main",
          name: file.name,
          blob: file
        }]).then(function () {
          importForm.reset();
          importNote.textContent = "Published for everyone on " + categoryLabel(category) + ".";
          renderPosts();
        }).catch(function (err) {
          importForm.reset();
          importNote.textContent = (err && err.message) ||
            "Saved on this device only. Try publish again.";
          renderPosts();
        });
      }).catch(function () {
        importNote.textContent = "Could not send the file.";
      });
    });
  }

  syncAuthUi();
  pullRemotePosts().then(function () {
    const startId = postIdFromHash();
    if (startId) {
      const startPost = readPosts().filter(function (entry) {
        return entry.id === startId;
      })[0];
      if (startPost) {
        openPost(startPost, true);
      }
    }
  });
})();
