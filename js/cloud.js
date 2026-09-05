(function (global) {
  const cfg = global.LEGACY || {};
  const OWNER = cfg.githubOwner || "Redoxbite";
  const REPO = cfg.githubRepo || "Legacyclient.github.io";
  const BRANCH = cfg.githubBranch || "main";
  const TOKEN_KEY = cfg.tokenKey || "legacy-github-token";
  const POSTS_PATH = "data/posts.json";
  const API = "https://api.github.com/repos/" + OWNER + "/" + REPO + "/contents/";
  const RAW = "https://raw.githubusercontent.com/" + OWNER + "/" + REPO + "/" + BRANCH + "/";

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
    return fetch(API + encodePath(path) + "?ref=" + encodeURIComponent(BRANCH), {
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
      return fetch(API + encodePath(path), {
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
    return getMeta(path).then(function (meta) {
      if (!meta || !meta.sha) {
        return null;
      }
      return fetch(API + encodePath(path), {
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

  function loadPosts() {
    return fetch(RAW + POSTS_PATH + "?t=" + Date.now(), { cache: "no-store" }).then(function (res) {
      if (!res.ok) {
        throw new Error("remote");
      }
      return res.json();
    }).catch(function () {
      return fetch("data/posts.json?t=" + Date.now(), { cache: "no-store" }).then(function (res) {
        if (!res.ok) {
          return [];
        }
        return res.json();
      });
    }).then(function (data) {
      return Array.isArray(data) ? data : [];
    }).catch(function () {
      return [];
    });
  }

  function savePosts(posts, message) {
    const json = JSON.stringify(posts, null, 2);
    const base64 = btoa(unescape(encodeURIComponent(json)));
    return putFile(POSTS_PATH, base64, message || "Update board posts");
  }

  function uploadBlob(path, blob, message) {
    return blobToBase64(blob).then(function (base64) {
      return putFile(path, base64, message);
    });
  }

  global.LEGACY_CLOUD = {
    hasToken: hasToken,
    getToken: getToken,
    setToken: setToken,
    publicUrl: publicUrl,
    loadPosts: loadPosts,
    savePosts: savePosts,
    uploadBlob: uploadBlob,
    deleteFile: deleteFile,
    filePath: function (postId, name) {
      return "files/" + postId + "/" + name;
    }
  };
})(window);
