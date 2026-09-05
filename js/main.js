(function () {
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

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        header.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open menu");
      });
    });
  }

  const modules = {
    combat: [
      { name: "Auto Crystal", desc: "Hold right-click on obsidian to place and break crystals", on: true },
      { name: "Auto Inventory Totem", desc: "Fills missing totems in hotbar slot and/or offhand when inventory opens", on: true },
      { name: "Cpvp Macro", desc: "After placing obsidian/anchor, switch, charge, and explode", on: false },
      { name: "Double Anchor", desc: "Charge, explode, replace, and repeat on the same spot", on: false },
      { name: "FastPlace", desc: "Places blocks super fast", on: false },
      { name: "FastXP", desc: "Throws XP bottles super fast", on: true },
      { name: "Walksy's Crystal Optimiser", desc: "Faster crystal place/break timing (Walksy)", on: true }
    ],
    movement: [
      { name: "Boat Fly", desc: "Fly while riding a boat", on: false },
      { name: "Flight", desc: "Fly in survival — horizontal movement with space/sneak for up/down", on: false },
      { name: "JumpReset", desc: "Automatically jumps when taking damage to reduce knockback", on: false },
      { name: "NoPush", desc: "Disables pushing from entities and water", on: false },
      { name: "NoSlow", desc: "Removes slowdown from using items", on: true },
      { name: "Phase", desc: "Walk through blocks (no collision)", on: false },
      { name: "Sprint", desc: "Automatically holds the sprint state", on: true }
    ],
    render: [
      { name: "Block Outline", desc: "3D corner outline on the block you look at", on: false },
      { name: "Free Cam", desc: "Detach camera — WASD flies the cam; your body keeps falling/moving naturally", on: false },
      { name: "Free Look", desc: "Toggle 360° orbit camera around your body while keeping full control", on: false },
      { name: "TNTTimer", desc: "Thin smoked-glass fuse countdown cards", on: true },
      { name: "World", desc: "World lighting, custom time and gamma", on: true }
    ],
    visuals: [
      { name: "Arrows", desc: "Directional indicators for nearby players", on: true },
      { name: "Base Hunting", desc: "Low-detail blocks & clear water — pick how flat", on: false },
      { name: "Fake Pay", desc: "Blocks /pay and shows a fake receipt", on: false },
      { name: "Fake Roles", desc: "Donut-style tab and nametag roles (LT3 | name)", on: false },
      { name: "Fake Scoreboard", desc: "Fake custom sidebar scoreboard", on: false },
      { name: "Fake Spawner", desc: "Yellow glass looks like a spawner", on: false },
      { name: "Hit Animations", desc: "Chosen emoji bursts off hits, then drops and bounces", on: true },
      { name: "Motion Blur", desc: "Blurs the whole scene while looking around", on: true },
      { name: "Projectile Prediction", desc: "Predicts and displays projectile flight paths & landing spots", on: false },
      { name: "Projectile Trails", desc: "3D volumetric glowing projectile trails and HUD tracker", on: true },
      { name: "Starlight", desc: "Deep-space night sky with distant stars and meteors", on: true },
      { name: "Swing Speed", desc: "Visual main-hand swing speed (0.1x–5x), no mid-swing reset", on: false },
      { name: "Target Frame", desc: "Spinning corner frame when hovering a player", on: false }
    ],
    hud: [
      { name: "ArrayList", desc: "Compact movable module list with keybind tags", on: true },
      { name: "Crosshair", desc: "Custom HUD crosshair (disabled)", on: false },
      { name: "Custom Hotbar", desc: "Black smoked-glass hotbar matching vanilla proportions", on: true },
      { name: "Hud", desc: "HUD elements, chrome theme and layout", on: true },
      { name: "Keystrokes", desc: "WASD, LMB/RMB and spacebar overlay", on: false },
      { name: "MineProgress", desc: "Smooth HUD indicator displaying block with expanding radial circle", on: false },
      { name: "Radar", desc: "Square smoked-glass nearby-player radar", on: false },
      { name: "Region Map", desc: "DonutSMP region map with your location", on: false },
      { name: "Scanning", desc: "Radar-style Activity Scanner status HUD", on: false },
      { name: "Spotify", desc: "Compact Spotify now-playing card", on: false }
    ],
    esp: [
      { name: "Base ESP", desc: "Highlights chunks with deep storage clusters", on: true },
      { name: "Block ESP", desc: "Filled ESP for selected blocks with hairline tracers", on: false },
      { name: "Hole ESP", desc: "Highlights 1x1 and 1x3 vertical shafts with top-down shading", on: false },
      { name: "Nametags", desc: "Compact tags for players, animals and dropped items", on: true },
      { name: "Player ESP", desc: "Corner brackets and tracers on other players", on: true },
      { name: "Storage ESP", desc: "Legacy storage ESP with no-depth boxes and tracers", on: true }
    ],
    donut: [
      { name: "Auto Kick", desc: "Disconnect at or below a Y level, or when you press Kick", on: false },
      { name: "Auto Log Donut", desc: "Disconnect when another player is detected", on: true },
      { name: "Base Locate", desc: "Flags new underground mobs you never saw from the surface and highlights their chunk", on: true },
      { name: "Chunk Bypass V2", desc: "Finds player-activity / stash chunks and highlights them at sea level.", on: false },
      { name: "Home Reset", desc: "Deletes then sets a home slot so it matches your current position", on: false },
      { name: "Legacy Amethyst Finder", desc: "Heat-map of grown amethyst activity chunks with animated visual scanning", on: true },
      { name: "Legacy Chunk Finder", desc: "Finds hive, vine, and seagrass activity chunks", on: true },
      { name: "Legacy Debug", desc: "Highlights geode-like chunks and deep chest clusters", on: false },
      { name: "Legacy Player Debug", desc: "Flags player-occupied chunks from sky-light update leaks, not first-load cave darkness", on: false },
      { name: "Spawner Notifier", desc: "Filled ESP and tracers on spawners from Y -64 to 128", on: false },
      { name: "Sus Chunk Finder", desc: "Nova-style sus chunk heat map", on: false }
    ],
    client: [
      { name: "Fake Player", desc: "Damageable clone that copies your armor and hands", on: false },
      { name: "FPS", desc: "Trade visual quality for frames — Low / Lower / Lowest", on: false },
      { name: "GUI", desc: "ClickGUI and HUD Classic / Chrome / Black style", on: true },
      { name: "Quick Chat", desc: "Keybound chat messages and commands", on: false }
    ]
  };

  const guiList = document.getElementById("guiList");
  const catButtons = document.querySelectorAll(".gui__cat");

  function renderCategory(key) {
    if (!guiList || !modules[key]) {
      return;
    }

    guiList.replaceChildren();
    modules[key].forEach(function (mod) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gui__item" + (mod.on ? " is-on" : "");
      button.setAttribute("aria-pressed", String(mod.on));

      const copy = document.createElement("span");
      const name = document.createElement("span");
      name.className = "gui__item-name";
      name.textContent = mod.name;
      copy.append(name);
      if (mod.desc) {
        const desc = document.createElement("span");
        desc.className = "gui__item-desc";
        desc.textContent = mod.desc;
        copy.append(desc);
      }

      const sw = document.createElement("span");
      sw.className = "gui__switch";
      sw.setAttribute("aria-hidden", "true");

      button.append(copy, sw);
      button.addEventListener("click", function () {
        mod.on = !mod.on;
        button.classList.toggle("is-on", mod.on);
        button.setAttribute("aria-pressed", String(mod.on));
      });
      guiList.append(button);
    });
  }

  catButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      catButtons.forEach(function (other) {
        other.classList.toggle("is-active", other === button);
      });
      renderCategory(button.dataset.cat);
    });
  });

  renderCategory("combat");

  const cloud = document.getElementById("moduleCloud");
  if (cloud) {
    Object.keys(modules).forEach(function (key) {
      modules[key].forEach(function (mod) {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = mod.name;
        cloud.append(chip);
      });
    });
  }

  const form = document.getElementById("contactForm");
  const note = document.getElementById("formNote");
  const RATE_KEY = "legacy-contact-at";
  const RATE_MS = 20000;

  if (form && note) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const name = document.getElementById("name").value.trim();
      const email = document.getElementById("email").value.trim();
      const message = document.getElementById("message").value.trim();
      const last = Number(window.sessionStorage.getItem(RATE_KEY) || 0);
      const now = Date.now();

      if (!name || !email || !message) {
        note.hidden = false;
        note.textContent = "Fill every field before sending.";
        return;
      }

      if (now - last < RATE_MS) {
        note.hidden = false;
        note.textContent = "Wait a moment — local rate limit is on.";
        return;
      }

      window.sessionStorage.setItem(RATE_KEY, String(now));
      const subject = encodeURIComponent("Legacy Client — " + name);
      const body = encodeURIComponent("Name: " + name + "\nEmail: " + email + "\n\n" + message);
      window.location.href = "mailto:hello@legacyclient.dev?subject=" + subject + "&body=" + body;
      note.hidden = false;
      note.textContent = "Opening your mail client.";
      form.reset();
    });
  }

  const USERS_KEY = "legacy-users";
  const SESSION_KEY = "legacy-session";
  const dialog = document.getElementById("authDialog");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const authNote = document.getElementById("authNote");
  const authHeading = document.getElementById("authHeading");
  const authUser = document.getElementById("authUser");
  const authLogout = document.getElementById("authLogout");
  const heroAuth = document.getElementById("heroAuth");

  function readUsers() {
    try {
      const raw = window.localStorage.getItem(USERS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function writeUsers(users) {
    window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function currentUser() {
    return window.localStorage.getItem(SESSION_KEY) || "";
  }

  function setSession(username) {
    if (username) {
      window.localStorage.setItem(SESSION_KEY, username);
    } else {
      window.localStorage.removeItem(SESSION_KEY);
    }
    syncAuthUi();
  }

  function syncAuthUi() {
    const user = currentUser();
    const guests = document.querySelectorAll("[data-auth-guest]");
    guests.forEach(function (el) {
      el.hidden = Boolean(user);
    });
    if (heroAuth) {
      heroAuth.hidden = Boolean(user);
    }
    if (authUser) {
      authUser.hidden = !user;
      authUser.textContent = user ? user : "";
    }
    if (authLogout) {
      authLogout.hidden = !user;
    }
  }

  async function hashPass(password) {
    const bytes = new TextEncoder().encode(password);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map(function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }

  function showAuthNote(text) {
    if (!authNote) {
      return;
    }
    authNote.hidden = false;
    authNote.textContent = text;
  }

  function setAuthMode(mode) {
    const isLogin = mode === "login";
    if (loginForm) {
      loginForm.hidden = !isLogin;
    }
    if (registerForm) {
      registerForm.hidden = isLogin;
    }
    if (authHeading) {
      authHeading.textContent = isLogin ? "Log In" : "Register";
    }
    document.querySelectorAll("[data-auth-tab]").forEach(function (tab) {
      tab.classList.toggle("is-active", tab.getAttribute("data-auth-tab") === mode);
    });
    if (authNote) {
      authNote.hidden = true;
      authNote.textContent = "";
    }
  }

  function openAuth(mode) {
    setAuthMode(mode === "register" ? "register" : "login");
    if (dialog && typeof dialog.showModal === "function") {
      if (!dialog.open) {
        dialog.showModal();
      }
    }
  }

  document.querySelectorAll("[data-auth-open]").forEach(function (button) {
    button.addEventListener("click", function () {
      openAuth(button.getAttribute("data-auth-open"));
    });
  });

  document.querySelectorAll("[data-auth-tab]").forEach(function (tab) {
    tab.addEventListener("click", function () {
      setAuthMode(tab.getAttribute("data-auth-tab"));
    });
  });

  const closeBtn = document.querySelector(".auth__close");
  if (closeBtn && dialog) {
    closeBtn.addEventListener("click", function () {
      dialog.close();
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const username = document.getElementById("loginUser").value.trim().toLowerCase();
      const password = document.getElementById("loginPass").value;
      hashPass(password).then(function (hash) {
        const match = readUsers().find(function (entry) {
          return entry.username === username && entry.hash === hash;
        });
        if (!match) {
          showAuthNote("Wrong username or password.");
          return;
        }
        setSession(match.username);
        loginForm.reset();
        if (dialog) {
          dialog.close();
        }
      });
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const username = document.getElementById("registerUser").value.trim().toLowerCase();
      const password = document.getElementById("registerPass").value;
      const confirm = document.getElementById("registerPass2").value;
      if (!/^[a-z0-9_]{3,24}$/.test(username)) {
        showAuthNote("Use 3–24 letters, numbers, or underscores.");
        return;
      }
      if (password !== confirm) {
        showAuthNote("Passwords do not match.");
        return;
      }
      const users = readUsers();
      if (users.some(function (entry) {
        return entry.username === username;
      })) {
        showAuthNote("That username is taken.");
        return;
      }
      hashPass(password).then(function (hash) {
        users.push({ username: username, hash: hash });
        writeUsers(users);
        setSession(username);
        registerForm.reset();
        if (dialog) {
          dialog.close();
        }
      });
    });
  }

  if (authLogout) {
    authLogout.addEventListener("click", function () {
      setSession("");
    });
  }

  setAuthMode("login");
  syncAuthUi();
})();
