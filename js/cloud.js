(function (global) {
  const cfg = global.LEGACY || {};
  const OWNER = cfg.githubOwner || "Redoxbite";
  const REPO = cfg.githubRepo || "Legacyclient.github.io";
  const BRANCH = cfg.githubBranch || "main";
  const TOKEN_KEY = cfg.tokenKey || "legacy-github-token";
  const POSTS_PATH = "data/posts.json";
  const API = "https://api.github.com/repos/" + OWNER + "/" + REPO + "/contents/";
  const RAW = "https://raw.githubusercontent.com/" + OWNER + "/" + REPO + "/" + BRANCH + "/";
  const BOARD_URL = cfg.boardStore || "https://mantledb.sh/v2/legacyclientboard/posts";
  const BOARD_KEY = cfg.boardKey || "454742b233283cfb642bcac227f83a8a2b75fd6b3d7c823d44b78ee4dc4b48e3";
  let loadPostsJob = null;
  const previewCache = {};
  const previewJobs = {};

  function net(url, opts) {
    const shield = global.LEGACY_SHIELD;
    if (shield && typeof shield.fetch === "function") {
      return shield.fetch(url, opts);
    }
    return window["fetch"](url, opts);
  }

  function getToken() {
    try {
      return String(window.localStorage.getItem(TOKEN_KEY) || "").trim();
    } catch (err) {
      return "";
    }
  }

  function setToken(token) {
    const value = String(token || "").trim();
    if (value) {
      window.localStorage.setItem(TOKEN_KEY, value);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  }

  function hasToken() {
    return Boolean(getToken());
  }

  function canPublish() {
    return Boolean(BOARD_URL && BOARD_KEY) || hasToken();
  }

  function encodePath(path) {
    return String(path).split("/").filter(Boolean).map(encodeURIComponent).join("/");
  }

  function publicUrl(path) {
    if (!path) {
      return "";
    }
    if (path.indexOf("data:") === 0 || path.indexOf("blob:") === 0 || path.indexOf("http") === 0) {
      return path;
    }
    return RAW + encodePath(path) + "?t=" + Date.now();
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const text = String(reader.result || "");
        const comma = text.indexOf(",");
        resolve(comma === -1 ? text : text.slice(comma + 1));
      };
      reader.onerror = function () {
        reject(reader.error);
      };
      reader.readAsDataURL(blob);
    });
  }

  function ghHeaders() {
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    const token = getToken();
    if (token) {
      headers.Authorization = "Bearer " + token;
    }
    return headers;
  }

  function getMeta(path) {
    return net(API + encodePath(path) + "?ref=" + encodeURIComponent(BRANCH), {
      headers: ghHeaders()
    }).then(function (res) {
      if (res.status === 404) {
        return null;
      }
      return res.json().then(function (data) {
        if (!res.ok) {
          throw new Error(data.message || "Could not read " + path);
        }
        return data;
      });
    });
  }

  function putFile(path, base64, message) {
    return getMeta(path).then(function (meta) {
      const body = {
        message: message,
        content: base64,
        branch: BRANCH
      };
      if (meta && meta.sha) {
        body.sha = meta.sha;
      }
      return net(API + encodePath(path), {
        method: "PUT",
        headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
        body: JSON.stringify(body)
      }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) {
            throw new Error(data.message || "Could not publish " + path);
          }
          return data;
        });
      });
    });
  }

  function deleteFile(path, message) {
    if (!path || path.indexOf("http") === 0) {
      return Promise.resolve(null);
    }
    if (!hasToken()) {
      return Promise.resolve(null);
    }
    return getMeta(path).then(function (meta) {
      if (!meta || !meta.sha) {
        return null;
      }
      return net(API + encodePath(path), {
        method: "DELETE",
        headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
        body: JSON.stringify({
          message: message,
          sha: meta.sha,
          branch: BRANCH
        })
      });
    });
  }

  function parseList(data) {
    if (Array.isArray(data)) {
      return data;
    }
    if (data && Array.isArray(data.items)) {
      return data.items;
    }
    return [];
  }

  function loadGithubPosts() {
    return net(RAW + POSTS_PATH + "?t=" + Date.now(), { cache: "no-store" }).then(function (res) {
      if (!res.ok) {
        throw new Error("remote");
      }
      return res.json();
    }).catch(function () {
      return net("data/posts.json?t=" + Date.now(), { cache: "no-store" }).then(function (res) {
        if (!res.ok) {
          return [];
        }
        return res.json();
      });
    }).then(parseList).catch(function () {
      return [];
    });
  }

  function loadPosts() {
    if (loadPostsJob) {
      return loadPostsJob;
    }
    const job = Promise.all([
      net(BOARD_URL, { cache: "no-store" }).then(function (res) {
        if (!res.ok) {
          throw new Error("board");
        }
        return res.json();
      }).then(parseList).catch(function () {
        return [];
      }),
      loadGithubPosts()
    ]).then(function (lists) {
      const byId = {};
      lists[1].concat(lists[0]).forEach(function (post) {
        if (post && post.id) {
          byId[post.id] = post;
        }
      });
      return Object.keys(byId).map(function (id) {
        return byId[id];
      }).sort(function (a, b) {
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
    });
    loadPostsJob = job;
    job.finally(function () {
      window.setTimeout(function () {
        if (loadPostsJob === job) {
          loadPostsJob = null;
        }
      }, 1200);
    });
    return job;
  }

  function saveGithubPosts(posts, message) {
    const json = JSON.stringify(posts, null, 2);
    const base64 = btoa(unescape(encodeURIComponent(json)));
    return putFile(POSTS_PATH, base64, message || "Update board posts");
  }

  function savePosts(posts, message) {
    const jobs = [];
    if (BOARD_URL && BOARD_KEY) {
      jobs.push(net(BOARD_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Mantle-Key": BOARD_KEY
        },
        body: JSON.stringify({ items: posts })
      }).then(function (res) {
        if (!res.ok) {
          throw new Error("Could not publish for everyone.");
        }
        return res.json();
      }));
    }
    if (hasToken()) {
      jobs.push(saveGithubPosts(posts, message).catch(function () {
        return null;
      }));
    }
    if (!jobs.length) {
      return Promise.reject(new Error("Could not publish for everyone."));
    }
    return Promise.all(jobs);
  }

  function isImageBlob(blob, name) {
    if (blob && blob.type && blob.type.indexOf("image/") === 0) {
      return true;
    }
    return /\.(png|jpe?g|webp|gif)$/i.test(name || "");
  }

  function baseName(path) {
    const parts = String(path || "file.bin").split("/");
    return parts[parts.length - 1] || "file.bin";
  }

  function boardOrigin() {
    return BOARD_URL.replace(/\/posts\/?$/, "");
  }

  function boardImgUrl(postId) {
    return boardOrigin() + "/img/" + encodeURIComponent(postId);
  }

  function setPublicRead(path) {
    const relative = path.replace(boardOrigin() + "/", "");
    return net("https://mantledb.sh/v2/visibility/legacyclientboard/" + relative, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Mantle-Key": BOARD_KEY
      },
      body: JSON.stringify({ public_read: true })
    });
  }

  function blobToCompactDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const image = new Image();
        image.onload = function () {
          const canvas = document.createElement("canvas");
          const scale = Math.min(960 / image.width, 540 / image.height, 1);
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const ctx = canvas.getContext("2d");
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          let quality = 0.72;
          let url = canvas.toDataURL("image/jpeg", quality);
          while (url.length > 58000 && quality > 0.32) {
            quality -= 0.08;
            url = canvas.toDataURL("image/jpeg", quality);
          }
          if (url.length > 58000) {
            reject(new Error("preview too large"));
            return;
          }
          resolve(url);
        };
        image.onerror = function () {
          reject(new Error("preview"));
        };
        image.src = String(reader.result || "");
      };
      reader.onerror = function () {
        reject(reader.error);
      };
      reader.readAsDataURL(blob);
    });
  }

  function storeBoardImage(postId, blob) {
    const url = boardImgUrl(postId);
    return blobToCompactDataUrl(blob).then(function (src) {
      return net(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Mantle-Key": BOARD_KEY
        },
        body: JSON.stringify({ src: src })
      }).then(function (res) {
        if (!res.ok) {
          throw new Error("Could not publish screenshot.");
        }
        return setPublicRead(url).then(function () {
          return { url: url, path: url };
        });
      });
    });
  }

  function loadPreview(preview) {
    const url = isBoardPreview(preview) ? preview : "";
    if (!url) {
      return Promise.resolve("");
    }
    if (Object.prototype.hasOwnProperty.call(previewCache, url)) {
      return Promise.resolve(previewCache[url]);
    }
    if (previewJobs[url]) {
      return previewJobs[url];
    }
    previewJobs[url] = net(url).then(function (res) {
      if (!res.ok) {
        throw new Error("preview");
      }
      return res.json();
    }).then(function (data) {
      const src = data && data.src ? data.src : "";
      previewCache[url] = src;
      return src;
    }).catch(function () {
      previewCache[url] = "";
      return "";
    }).then(function (src) {
      delete previewJobs[url];
      return src;
    });
    return previewJobs[url];
  }

  function isBoardPreview(value) {
    return /mantledb\.sh\/v2\/.+\/img\//i.test(String(value || ""));
  }

  function uploadTelegraph(blob, name) {
    const body = new FormData();
    body.append("file", blob, name);
    return net("https://telegra.ph/upload", { method: "POST", body: body }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          throw new Error("image host");
        }
        const src = Array.isArray(data) && data[0] && data[0].src;
        if (!src || typeof src !== "string") {
          throw new Error("image host");
        }
        const url = src.indexOf("http") === 0 ? src : "https://telegra.ph" + src;
        return { url: url, path: url };
      });
    });
  }

  function uploadGofile(blob, name) {
    const body = new FormData();
    body.append("file", blob, name);
    return net("https://upload.gofile.io/uploadfile", { method: "POST", body: body }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || !data || data.status !== "ok" || !data.data || !data.data.downloadPage) {
          throw new Error("Could not upload " + name);
        }
        const url = data.data.downloadPage;
        return { url: url, path: url };
      });
    });
  }

  function uploadPublic(name, blob) {
    if (isImageBlob(blob, name)) {
      return uploadTelegraph(blob, name).catch(function () {
        return uploadGofile(blob, name);
      });
    }
    return uploadGofile(blob, name);
  }

  function uploadPreview(postId, blob) {
    return uploadTelegraph(blob, "preview.jpg").catch(function () {
      return storeBoardImage(postId, blob);
    });
  }

  function uploadBlob(path, blob, message) {
    const name = baseName(path);
    const publicJob = uploadPublic(name, blob);
    if (!hasToken()) {
      return publicJob;
    }
    return publicJob.then(function (uploaded) {
      return blobToBase64(blob).then(function (base64) {
        const ghPath = path.indexOf("http") === 0 ? filePath("misc", name) : path;
        return putFile(ghPath, base64, message).then(function () {
          return uploaded;
        }).catch(function () {
          return uploaded;
        });
      });
    });
  }

  function filePath(postId, name) {
    return "files/" + postId + "/" + name;
  }

  global.LEGACY_CLOUD = {
    hasToken: hasToken,
    canPublish: canPublish,
    getToken: getToken,
    setToken: setToken,
    publicUrl: publicUrl,
    loadPosts: loadPosts,
    savePosts: savePosts,
    uploadBlob: uploadBlob,
    uploadPreview: uploadPreview,
    loadPreview: loadPreview,
    isBoardPreview: isBoardPreview,
    deleteFile: deleteFile,
    filePath: filePath
  };
})(window);
