(function () {
  const root = document.documentElement;
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("siteNav");
  const canvas = document.getElementById("fireflies");
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
      { name: "Auto Crystal", desc: "Place and break crystals", on: true },
      { name: "Fast XP", desc: "Throw bottles without delay", on: true },
      { name: "Auto Totem", desc: "Keep a totem in offhand", on: true },
      { name: "Fast Place", desc: "Speed up block placement", on: false },
      { name: "Double Anchor", desc: "Anchor placements stacked", on: false }
    ],
    render: [
      { name: "Nametags", desc: "Clean tags through walls", on: true },
      { name: "Motion Blur", desc: "Soft camera trail", on: true },
      { name: "Custom Hotbar", desc: "Glass hotbar strip", on: true },
      { name: "Radar", desc: "Nearby players on a disc", on: false },
      { name: "Starlight", desc: "Night lighting pass", on: true }
    ],
    esp: [
      { name: "Player ESP", desc: "Box and fill players", on: true },
      { name: "Storage ESP", desc: "Chests and shulkers", on: true },
      { name: "Hole ESP", desc: "Safe holes marked", on: false },
      { name: "Base ESP", desc: "Stash and base hints", on: true },
      { name: "Block Outline", desc: "Quiet block edges", on: false }
    ],
    movement: [
      { name: "Sprint", desc: "Hold sprint for you", on: true },
      { name: "NoSlow", desc: "Move while using items", on: true },
      { name: "Jump Reset", desc: "Reset sprint on jump", on: false },
      { name: "Phase", desc: "Slip through tight spots", on: false },
      { name: "Boat Fly", desc: "Boat movement assist", on: false }
    ],
    donut: [
      { name: "Base Locate", desc: "Donut stash locator", on: true },
      { name: "Chunk Finder", desc: "Scan loaded chunks", on: true },
      { name: "Player Debug", desc: "Track nearby players", on: false },
      { name: "Home Reset", desc: "Reset home state", on: false },
      { name: "Auto Log", desc: "Leave on danger", on: true }
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
      const desc = document.createElement("span");
      desc.className = "gui__item-desc";
      desc.textContent = mod.desc;
      copy.append(name, desc);

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
    const names = [
      "Auto Crystal", "Player ESP", "Storage ESP", "Base Locate", "Chunk Finder",
      "Nametags", "Motion Blur", "FreeCam", "Starlight", "Hole ESP",
      "Sprint", "NoSlow", "Fast XP", "Hud Arraylist", "Keystrokes",
      "Radar", "Target Frame", "Home Reset", "Sus Chunk", "Fps Boost"
    ];
    names.forEach(function (name) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = name;
      cloud.append(chip);
    });
  }

  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext("2d");
    const flies = [];
    let width = 0;
    let height = 0;

    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }

    function seed() {
      flies.length = 0;
      const count = Math.min(70, Math.floor((width * height) / 18000));
      for (let i = 0; i < count; i++) {
        flies.push({
          x: Math.random() * width,
          y: Math.random() * height * 0.75 + height * 0.15,
          r: Math.random() * 1.6 + 0.4,
          s: Math.random() * 0.35 + 0.08,
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    function draw(time) {
      ctx.clearRect(0, 0, width, height);
      for (const fly of flies) {
        fly.phase += 0.02;
        fly.x += Math.cos(fly.phase) * fly.s;
        fly.y += Math.sin(fly.phase * 0.8) * fly.s * 0.6;
        if (fly.x < 0) fly.x = width;
        if (fly.x > width) fly.x = 0;
        if (fly.y < 0) fly.y = height;
        if (fly.y > height) fly.y = 0;

        const dx = fly.x - lightX;
        const dy = fly.y - lightY;
        const near = Math.max(0, 1 - Math.hypot(dx, dy) / 280);
        const alpha = 0.12 + near * 0.8 + Math.sin(time * 0.004 + fly.phase) * 0.12;

        ctx.beginPath();
        ctx.arc(fly.x, fly.y, fly.r + near * 1.4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(232, 223, 200, " + Math.max(0.08, alpha) + ")";
        ctx.fill();
      }
      requestAnimationFrame(draw);
    }

    resize();
    seed();
    window.addEventListener("resize", function () {
      resize();
      seed();
    });
    if (!reduceMotion) {
      requestAnimationFrame(draw);
    }
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
})();
