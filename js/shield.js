(function (global) {
  const STORE_KEY = "legacy-shield";
  const BITS = 12;
  const MIN_MS = 650;
  const MAX_MS = 8000;
  const PASS_MS = 45 * 60 * 1000;
  const encoder = new TextEncoder();

  const buckets = {
    read: { tokens: 10, cap: 10, refillMs: 8000, last: Date.now() },
    write: { tokens: 3, cap: 3, refillMs: 20000, last: Date.now() },
    upload: { tokens: 4, cap: 4, refillMs: 16000, last: Date.now() },
    hook: { tokens: 3, cap: 3, refillMs: 30000, last: Date.now() }
  };

  let readyResolve;
  const ready = new Promise(function (resolve) {
    readyResolve = resolve;
  });

  function challenge() {
    const hour = Math.floor(Date.now() / 3600000);
    const ua = String(navigator.userAgent || "").slice(0, 48);
    return "lc1|" + hour + "|" + ua;
  }

  function digest(text) {
    return crypto.subtle.digest("SHA-256", encoder.encode(text)).then(function (buf) {
      return new Uint8Array(buf);
    });
  }

  function leadingBits(hash) {
    let bits = 0;
    for (let i = 0; i < hash.length; i += 1) {
      const byte = hash[i];
      if (byte === 0) {
        bits += 8;
        continue;
      }
      let mask = 128;
      while (mask && !(byte & mask)) {
        bits += 1;
        mask >>= 1;
      }
      break;
    }
    return bits;
  }

  function meets(hash) {
    return leadingBits(hash) >= BITS;
  }

  function readPass() {
    try {
      const parsed = JSON.parse(window.sessionStorage.getItem(STORE_KEY) || "null");
      if (!parsed || parsed.v !== 1 || typeof parsed.n !== "number") {
        return null;
      }
      if (parsed.ch !== challenge() || Date.now() - parsed.t > PASS_MS) {
        return null;
      }
      return parsed;
    } catch (err) {
      return null;
    }
  }

  function writePass(ch, nonce) {
    try {
      window.sessionStorage.setItem(STORE_KEY, JSON.stringify({
        v: 1,
        ch: ch,
        n: nonce,
        t: Date.now()
      }));
    } catch (err) {
      return;
    }
  }

  function solve(ch) {
    if (!global.crypto || !crypto.subtle) {
      return Promise.resolve(0);
    }
    let nonce = 0;

    function batch() {
      const jobs = [];
      for (let i = 0; i < 20; i += 1) {
        const n = nonce;
        nonce += 1;
        jobs.push(digest(ch + ":" + n).then(function (hash) {
          return meets(hash) ? n : -1;
        }));
      }
      return Promise.all(jobs).then(function (found) {
        for (let i = 0; i < found.length; i += 1) {
          if (found[i] >= 0) {
            return found[i];
          }
        }
        return batch();
      });
    }

    return batch();
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function classify(url, method) {
    const href = String(url || "");
    const verb = String(method || "GET").toUpperCase();
    if (href.indexOf("discord.com/api/webhooks") !== -1) {
      return "hook";
    }
    if (href.indexOf("upload.gofile.io") !== -1 || href.indexOf("telegra.ph/upload") !== -1) {
      return "upload";
    }
    if (verb === "GET" || verb === "HEAD") {
      if (href.indexOf("/img/") !== -1 || href.indexOf("telegra.ph") !== -1 ||
          href.indexOf("te.legra.ph") !== -1) {
        return "media";
      }
    }
    if (verb !== "GET" && verb !== "HEAD") {
      return "write";
    }
    return "read";
  }

  function refill(bucket) {
    const now = Date.now();
    const gained = ((now - bucket.last) / bucket.refillMs) * bucket.cap;
    bucket.tokens = Math.min(bucket.cap, bucket.tokens + gained);
    bucket.last = now;
  }

  function take(kind) {
    const bucket = buckets[kind] || buckets.read;
    refill(bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return Promise.resolve();
    }
    const wait = Math.min(4000, Math.ceil((1 - bucket.tokens) * (bucket.refillMs / bucket.cap)));
    return sleep(wait).then(function () {
      return take(kind);
    });
  }

  function guardedFetch(url, opts) {
    const options = opts || {};
    const kind = classify(url, options.method);
    return ready.then(function () {
      const gate = kind === "media" ? Promise.resolve() : take(kind);
      return gate.then(function () {
        return window.fetch(url, options).then(function (res) {
          if (res.status !== 429) {
            return res;
          }
          const retry = Number(res.headers.get("Retry-After"));
          const wait = Math.min(8000, (retry > 0 ? retry : 2) * 1000);
          return sleep(wait).then(function () {
            return take(kind === "media" ? "read" : kind).then(function () {
              return window.fetch(url, options);
            });
          });
        });
      });
    });
  }

  function release() {
    const root = document.getElementById("shield");
    document.body.classList.remove("is-shielded");
    if (!root) {
      return;
    }
    root.classList.add("is-off");
    root.setAttribute("aria-hidden", "true");
    window.setTimeout(function () {
      root.hidden = true;
    }, 280);
  }

  function start() {
    const started = Date.now();
    const ch = challenge();
    const saved = readPass();
    const job = saved
      ? digest(saved.ch + ":" + saved.n).then(function (hash) {
        return saved.ch === ch && meets(hash) ? saved.n : solve(ch);
      }).catch(function () {
        return solve(ch);
      })
      : solve(ch);

    const timed = Promise.race([
      job,
      sleep(MAX_MS).then(function () {
        return 0;
      })
    ]);

    timed.then(function (nonce) {
      writePass(ch, nonce);
      const wait = saved ? 0 : Math.max(0, MIN_MS - (Date.now() - started));
      return sleep(wait);
    }).catch(function () {
      return null;
    }).then(function () {
      release();
      readyResolve();
    });
  }

  global.LEGACY_SHIELD = {
    ready: ready,
    fetch: guardedFetch
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(window);
