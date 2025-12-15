const GAS_URL = "https://script.google.com/macros/s/AKfycbx1Saml2tXxfFm4MWzJXprDFdSe_44An5O48qZ_Jrq0uwU0LNIR-2K0ynS-UMsM83AyVA/exec";

const QUEUE_KEY = "mailQueue.v3";
const MAX_QUEUE = 40;

function encodeForm(obj) {
  const p = new URLSearchParams();
  Object.entries(obj || {}).forEach(([k, v]) => p.append(k, String(v)));
  return p.toString();
}

function loadQueue() {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}

function saveQueue(q) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch { }
}

function enqueue(payload) {
  const q = loadQueue();
  q.push({ payload, at: Date.now() });
  while (q.length > MAX_QUEUE) q.shift();
  saveQueue(q);
}

function trySend(payload) {
  const body = encodeForm(payload);

  // 1) sendBeacon é o melhor para navegação/fechamento
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], {
        type: "application/x-www-form-urlencoded;charset=UTF-8",
      });
      const ok = navigator.sendBeacon(GAS_URL, blob);
      if (ok) return true;
    }
  } catch { }

  // 2) fallback fetch SEM ler resposta (evita CORB)
  try {
    fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body,
      keepalive: true,
    }).catch(() => { });
    return true; // fire-and-forget
  } catch { }

  return false;
}

function flushQueue() {
  const q = loadQueue();
  if (!q.length) return;

  const remaining = [];
  for (const item of q) {
    const ok = trySend(item.payload);
    if (!ok) remaining.push(item);
  }
  saveQueue(remaining);
}

// Reenvia em momentos bons (página estável)
window.addEventListener("pageshow", flushQueue);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") flushQueue();
});

// No “quase saindo”, tenta também (sem depender disso)
window.addEventListener("pagehide", flushQueue);


(function () {
  "use strict";

  /* ==========================
   * CONFIG
   * ========================== */
  const WEB_APP_URL =
    "https://script.google.com/macros/s/AKfycbwURwnuNjP6sfiWPD8Vb4Kh9ke20QgUpp4sPfMRICKiHx1jSyp0fNwmL6I76rtW6H4/exec";
  const SECRET = "990143";

  // IDs do seu HTML (index2.html)
  const BTN_ID = "gateEnter";
  const INPUT_ID = "gateInput";
  const GATE_ERR_ID = "gateErr";
  const HINT_ID = "gateHint";

  // Tags de acesso
  const ACCESS_TAG = "cardsAccess.v1";
  const JUST_GRANTED_TAG = "cardsAccess.justGranted.v1";

  // attempt por tentativa
  const ATTEMPT_ID_KEY = "cardsAccess.attemptId.v2";

  // dedupe e fila
  const SENT_MAP_KEY = "cardsAccess.sentMap.v2"; // key = attemptId|status
  const QUEUE_KEY = "cardsAccess.mailQueue.v2";

  // ajustes
  const SENT_TTL_MS = 6 * 60 * 60 * 1000; // 6h
  const GRANTED_DEBOUNCE_MS = 800; // só para evitar duplo clique muito rápido
  const MAX_QUEUE = 30;

  let lastGrantedLocalAt = 0;

  /* ==========================
   * HELPERS
   * ========================== */
  function now() {
    return Date.now();
  }

  function safeJSONParse(v, fallback) {
    try {
      return JSON.parse(v);
    } catch {
      return fallback;
    }
  }

  function makeId() {
    return (
      now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2) +
      "-" +
      Math.random().toString(36).slice(2)
    );
  }

  function hasAccessGranted() {
    try {
      const v = sessionStorage.getItem(ACCESS_TAG) || "";
      return v.startsWith("ok:");
    } catch {
      return false;
    }
  }

  function setNewAttemptId() {
    const id = makeId();
    try {
      sessionStorage.setItem(ATTEMPT_ID_KEY, id);
    } catch { }
    return id;
  }

  function getAttemptId() {
    try {
      return sessionStorage.getItem(ATTEMPT_ID_KEY) || "";
    } catch {
      return "";
    }
  }

  function loadSentMap() {
    try {
      return safeJSONParse(localStorage.getItem(SENT_MAP_KEY) || "{}", {});
    } catch {
      return {};
    }
  }

  function saveSentMap(map) {
    try {
      localStorage.setItem(SENT_MAP_KEY, JSON.stringify(map));
    } catch { }
  }

  function cleanupSentMap(map) {
    const t = now();
    for (const k of Object.keys(map)) {
      const ts = Number(map[k]);
      if (!ts || t - ts > SENT_TTL_MS) delete map[k];
    }
    return map;
  }

  function sentKey(attemptId, status) {
    return String(attemptId || "") + "|" + String(status || "");
  }

  function wasSent(attemptId, status) {
    const map = cleanupSentMap(loadSentMap());
    return !!map[sentKey(attemptId, status)];
  }

  function markSent(attemptId, status) {
    const map = cleanupSentMap(loadSentMap());
    map[sentKey(attemptId, status)] = now();
    saveSentMap(map);
  }

  function getPasswordHint() {
    const hintEl = document.getElementById(HINT_ID);
    const txt = (hintEl && hintEl.textContent ? hintEl.textContent : "").trim();
    if (txt) return txt;

    const input = document.getElementById(INPUT_ID);
    const v =
      ((input && input.getAttribute("data-hint")) ||
        (input && input.getAttribute("placeholder")) ||
        (input && input.getAttribute("title")) ||
        "") + "";
    return v.trim();
  }

  function getRefusalReason() {
    const errEl = document.getElementById(GATE_ERR_ID);
    const reason = (errEl && errEl.textContent ? errEl.textContent : "").trim();
    return reason || "Senha incorreta";
  }

  function encodeForm(payloadObj) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(payloadObj || {})) {
      params.append(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    return params.toString();
  }

  function postToGAS(payloadObj) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(payloadObj || {})) {
      params.append(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    const body = params.toString();

    // 1) sendBeacon
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([body], {
          type: "application/x-www-form-urlencoded;charset=UTF-8",
        });
        const ok = navigator.sendBeacon(WEB_APP_URL, blob);
        if (ok) return true;
      }
    } catch { }

    // 2) fetch keepalive (no-cors)
    try {
      fetch(WEB_APP_URL, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body,
        keepalive: true,
      }).catch(() => { });
      return true;
    } catch { }

    return false;
  }


  /* ==========================
   * IP PUBLICO (NAO BLOQUEANTE)
   * ========================== */
  async function getPublicIP() {
    if (getPublicIP._cache) return getPublicIP._cache;
    if (getPublicIP._inflight) return getPublicIP._inflight;

    const withTimeout = (p, ms) =>
      Promise.race([
        p,
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
      ]);

    const sources = [
      async () => {
        const r = await fetch("https://api.ipify.org?format=json", {
          cache: "no-store",
        });
        if (!r.ok) throw new Error("ipify not ok");
        const j = await r.json();
        return (j.ip || "").trim();
      },
      async () => {
        const r = await fetch("https://api.my-ip.io/ip", { cache: "no-store" });
        if (!r.ok) throw new Error("my-ip not ok");
        return (await r.text()).trim();
      },
      async () => {
        const r = await fetch("https://icanhazip.com", { cache: "no-store" });
        if (!r.ok) throw new Error("icanhazip not ok");
        return (await r.text()).trim();
      },
      async () => {
        const r = await fetch("https://checkip.amazonaws.com", {
          cache: "no-store",
        });
        if (!r.ok) throw new Error("aws not ok");
        return (await r.text()).trim();
      },
    ];

    getPublicIP._inflight = (async () => {
      for (const fn of sources) {
        try {
          const ip = await withTimeout(fn(), 3500);
          if (ip && typeof ip === "string") {
            const clean = ip.trim();
            const looksLikeIP =
              /^(\d{1,3}\.){3}\d{1,3}$/.test(clean) || clean.includes(":");
            if (looksLikeIP) {
              getPublicIP._cache = clean;
              return clean;
            }
          }
        } catch { }
      }
      return "desconhecido";
    })();

    try {
      const resolved = await getPublicIP._inflight;
      getPublicIP._cache = resolved || "desconhecido";
      return getPublicIP._cache;
    } finally {
      getPublicIP._inflight = null;
    }
  }

  try {
    getPublicIP().catch(() => { });
  } catch { }

  function getCachedIPFast() {
    return getPublicIP._cache || "desconhecido";
  }

  function buildPayload(status, reason, typed, hint, attemptId) {
    return {
      secret: SECRET,
      status,
      attemptId,
      titulo:
        (status === "granted" ? "Acesso liberado - " : "Acesso recusado - ") +
        (document.title || ""),
      ts: new Date().toISOString(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      ua: navigator.userAgent,
      ref: document.referrer || location.href,
      lang: navigator.language || "",
      ip: getCachedIPFast(),
      senhaDigitada: String(typed || ""),
      senhaHint: String(hint || ""),
      ...(status === "denied" ? { reason: String(reason || "") } : {}),
    };
  }

  /* ==========================
   * FILA + RETRY
   * ========================== */
  function loadQueue() {
    try {
      const q = safeJSONParse(localStorage.getItem(QUEUE_KEY) || "[]", []);
      return Array.isArray(q) ? q : [];
    } catch {
      return [];
    }
  }

  function saveQueue(q) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    } catch { }
  }

  function enqueue(payload) {
    const q = loadQueue();
    q.push({ payload, at: now() });

    // limita tamanho
    while (q.length > MAX_QUEUE) q.shift();

    saveQueue(q);
  }

  function flushQueue() {
    const q = loadQueue();
    if (!q.length) return;

    const remaining = [];
    for (const item of q) {
      const ok = postToGAS(item.payload);
      if (!ok) remaining.push(item);
    }
    saveQueue(remaining);
  }

  // tenta reenviar em momentos típicos em que o browser permite tráfego
  window.addEventListener("pageshow", flushQueue);
  window.addEventListener("pagehide", flushQueue);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushQueue();
  });

  /* ==========================
   * ENVIO CORE
   * ========================== */
  function sendOnce(status, reason, typed, hint, attemptId) {
    if (!attemptId) attemptId = setNewAttemptId();

    if (status === "granted") {
      const t = now();
      if (t - lastGrantedLocalAt < GRANTED_DEBOUNCE_MS) return;
      lastGrantedLocalAt = t;
    }

    if (wasSent(attemptId, status)) return;

    const payload = buildPayload(status, reason, typed, hint, attemptId);

    // marca como enviado para não duplicar, e coloca na fila por segurança
    markSent(attemptId, status);
    enqueue(payload);

    // tenta já
    flushQueue();
  }

  /* ==========================
   * BIND
   * ========================== */
  function bind() {
    const btn = document.getElementById(BTN_ID);
    const input = document.getElementById(INPUT_ID);

    // 1) quando a tentativa inicia: cria attemptId novo
    function beginAttempt() {
      setNewAttemptId();
    }

    // 2) tentativa via clique/enter: decide após um pequeno delay
    function handleAttempt() {
      beginAttempt();

      const typed = (input && input.value ? input.value : "") || "";
      const hint = getPasswordHint();

      setTimeout(() => {
        const attemptId = getAttemptId() || "";

        if (hasAccessGranted()) {
          sendOnce("granted", "", typed, hint, attemptId);
        } else {
          sendOnce("denied", getRefusalReason(), typed, hint, attemptId);
        }
      }, 220);
    }

    btn && btn.addEventListener("mousedown", beginAttempt);
    btn && btn.addEventListener("click", handleAttempt);

    input &&
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleAttempt();
      });

    // 3) evento direto do main.js (garante envio do "granted" mesmo se o redirect vier rápido)
    window.addEventListener("login:granted", () => {
      // se por algum motivo não houve beginAttempt, cria agora
      const attemptId = getAttemptId() || setNewAttemptId();

      const typed = (input && input.value ? input.value : "") || "";
      const hint = getPasswordHint();

      sendOnce("granted", "", typed, hint, attemptId);
    });

    // 4) fallback pela flag JUST_GRANTED
    try {
      const just = sessionStorage.getItem(JUST_GRANTED_TAG);
      if (just && hasAccessGranted()) {
        sessionStorage.removeItem(JUST_GRANTED_TAG);
        const attemptId = getAttemptId() || setNewAttemptId();
        sendOnce("granted", "", "", "", attemptId);
      }
    } catch { }

    // 5) tenta descarregar fila ao iniciar
    flushQueue();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();





// (function () {
//   "use strict";

//   /* ==========================
//    * CONFIG
//    * ========================== */
//   const WEB_APP_URL =
//     "https://script.google.com/macros/s/AKfycbx1Saml2tXxfFm4MWzJXprDFdSe_44An5O48qZ_Jrq0uwU0LNIR-2K0ynS-UMsM83AyVA/exec";
//   const SECRET = "6548694";

//   // IDs do seu HTML (index2.html)
//   const BTN_ID = "gateEnter";
//   const INPUT_ID = "gateInput";
//   const GATE_ERR_ID = "gateErr";
//   const HINT_ID = "gateHint";

//   // Tags de acesso (já existentes no seu projeto)
//   const ACCESS_TAG = "cardsAccess.v1";
//   const JUST_GRANTED_TAG = "cardsAccess.justGranted.v1";

//   // Dedupe real
//   const ATTEMPT_ID_KEY = "cardsAccess.attemptId.v1";
//   const SENT_MAP_KEY = "cardsAccess.sentMap.v1"; // localStorage map attemptId -> timestamp

//   // Limites
//   const SENT_TTL_MS = 6 * 60 * 60 * 1000; // 6h
//   const GRANTED_DEBOUNCE_MS = 1500;

//   let lastGrantedLocalAt = 0;

//   /* ==========================
//    * HELPERS
//    * ========================== */
//   function now() {
//     return Date.now();
//   }

//   function safeJSONParse(v, fallback) {
//     try {
//       return JSON.parse(v);
//     } catch {
//       return fallback;
//     }
//   }

//   function makeId() {
//     return (
//       now().toString(36) +
//       "-" +
//       Math.random().toString(36).slice(2) +
//       "-" +
//       Math.random().toString(36).slice(2)
//     );
//   }

//   function hasAccessGranted() {
//     try {
//       const v = sessionStorage.getItem(ACCESS_TAG) || "";
//       return v.startsWith("ok:");
//     } catch {
//       return false;
//     }
//   }

//   function getOrCreateAttemptId() {
//     try {
//       const existing = sessionStorage.getItem(ATTEMPT_ID_KEY);
//       if (existing) return existing;

//       const id = makeId();
//       sessionStorage.setItem(ATTEMPT_ID_KEY, id);
//       return id;
//     } catch {
//       return makeId();
//     }
//   }

//   function loadSentMap() {
//     try {
//       const raw = localStorage.getItem(SENT_MAP_KEY) || "{}";
//       const obj = safeJSONParse(raw, {});
//       return obj && typeof obj === "object" ? obj : {};
//     } catch {
//       return {};
//     }
//   }

//   function saveSentMap(map) {
//     try {
//       localStorage.setItem(SENT_MAP_KEY, JSON.stringify(map));
//     } catch { }
//   }

//   function cleanupSentMap(map) {
//     const t = now();
//     for (const k of Object.keys(map)) {
//       const ts = Number(map[k]);
//       if (!ts || t - ts > SENT_TTL_MS) delete map[k];
//     }
//     return map;
//   }

//   function wasAttemptSent(attemptId) {
//     const map = cleanupSentMap(loadSentMap());
//     return !!map[attemptId];
//   }

//   function markAttemptSent(attemptId) {
//     const map = cleanupSentMap(loadSentMap());
//     map[attemptId] = now();
//     saveSentMap(map);
//   }

//   function getPasswordHint() {
//     const hintEl = document.getElementById(HINT_ID);
//     const txt = (hintEl?.textContent || "").trim();
//     if (txt) return txt;

//     const input = document.getElementById(INPUT_ID);
//     const v =
//       (input?.getAttribute("data-hint") ||
//         input?.getAttribute("placeholder") ||
//         input?.getAttribute("title") ||
//         "") + "";
//     return v.trim();
//   }

//   function getRefusalReason() {
//     const errEl = document.getElementById(GATE_ERR_ID);
//     const reason = (errEl?.textContent || "").trim();
//     return reason || "Senha incorreta";
//   }

//   function postToGAS(payloadObj) {
//     const params = new URLSearchParams();
//     for (const [k, v] of Object.entries(payloadObj || {})) {
//       params.append(k, typeof v === "string" ? v : JSON.stringify(v));
//     }

//     try {
//       if (navigator.sendBeacon) {
//         const blob = new Blob([params.toString()], {
//           type: "application/x-www-form-urlencoded;charset=UTF-8",
//         });
//         const ok = navigator.sendBeacon(WEB_APP_URL, blob);
//         if (ok) return;
//       }
//     } catch { }

//     fetch(WEB_APP_URL, {
//       method: "POST",
//       mode: "no-cors",
//       headers: {
//         "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
//       },
//       body: params.toString(),
//       keepalive: true,
//     }).catch(() => { });
//   }

//   /* ==========================
//    * IP PUBLICO (NAO BLOQUEANTE)
//    * ========================== */
//   async function getPublicIP() {
//     if (getPublicIP._cache) return getPublicIP._cache;
//     if (getPublicIP._inflight) return getPublicIP._inflight;

//     const withTimeout = (p, ms) =>
//       Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

//     const sources = [
//       async () => {
//         const r = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
//         if (!r.ok) throw new Error("ipify not ok");
//         const j = await r.json();
//         return (j.ip || "").trim();
//       },
//       async () => {
//         const r = await fetch("https://api.my-ip.io/ip", { cache: "no-store" });
//         if (!r.ok) throw new Error("my-ip not ok");
//         return (await r.text()).trim();
//       },
//       async () => {
//         const r = await fetch("https://icanhazip.com", { cache: "no-store" });
//         if (!r.ok) throw new Error("icanhazip not ok");
//         return (await r.text()).trim();
//       },
//       async () => {
//         const r = await fetch("https://checkip.amazonaws.com", { cache: "no-store" });
//         if (!r.ok) throw new Error("aws checkip not ok");
//         return (await r.text()).trim();
//       },
//     ];

//     getPublicIP._inflight = (async () => {
//       for (const fn of sources) {
//         try {
//           const ip = await withTimeout(fn(), 3500);
//           if (ip && typeof ip === "string") {
//             const clean = ip.trim();
//             const looksLikeIP =
//               /^(\d{1,3}\.){3}\d{1,3}$/.test(clean) || clean.includes(":");
//             if (looksLikeIP) {
//               getPublicIP._cache = clean;
//               return clean;
//             }
//           }
//         } catch { }
//       }
//       return "desconhecido";
//     })();

//     try {
//       const resolved = await getPublicIP._inflight;
//       getPublicIP._cache = resolved || "desconhecido";
//       return getPublicIP._cache;
//     } finally {
//       getPublicIP._inflight = null;
//     }
//   }

//   // Warmup: tenta pegar IP em paralelo, sem travar nada
//   try {
//     getPublicIP().catch(() => { });
//   } catch { }

//   function getCachedIPFast() {
//     return getPublicIP._cache || "desconhecido";
//   }

//   async function buildPayload(status, reason, typed, hint, attemptId) {
//     // IMPORTANTE: NAO fazer await do IP aqui
//     return {
//       secret: SECRET,
//       status,
//       attemptId,
//       titulo:
//         (status === "granted" ? "Acesso liberado - " : "Acesso recusado - ") +
//         (document.title || ""),
//       ts: new Date().toISOString(),
//       tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
//       ua: navigator.userAgent,
//       ref: document.referrer || location.href,
//       lang: navigator.language || "",
//       ip: getCachedIPFast(),
//       senhaDigitada: String(typed || ""),
//       senhaHint: String(hint || ""),
//       ...(status === "denied" ? { reason: String(reason || "") } : {}),
//     };
//   }

//   /* ==========================
//    * ENVIO UNICO (CORE)
//    * ========================== */
//   async function safeSendGrantedOnce(typed, hint) {
//     const t = now();
//     if (t - lastGrantedLocalAt < GRANTED_DEBOUNCE_MS) return;
//     lastGrantedLocalAt = t;

//     const attemptId = getOrCreateAttemptId();
//     if (wasAttemptSent(attemptId)) return;

//     // Marca antes (no-cors nao confirma)
//     markAttemptSent(attemptId);

//     const payload = await buildPayload("granted", "", typed || "", hint || "", attemptId);
//     postToGAS(payload);
//   }

//   async function safeSendDenied(typed, hint) {
//     const attemptId = getOrCreateAttemptId();
//     const reason = getRefusalReason();
//     const payload = await buildPayload("denied", reason, typed || "", hint || "", attemptId);
//     postToGAS(payload);
//   }

//   /* ==========================
//    * BIND
//    * ========================== */
//   function bind() {
//     const btn = document.getElementById(BTN_ID);
//     const input = document.getElementById(INPUT_ID);

//     window.addEventListener("login:granted", () => {
//       const typed = input?.value || "";
//       const hint = getPasswordHint();
//       safeSendGrantedOnce(typed, hint);
//     });

//     function handleAttempt() {
//       const typed = input?.value || "";
//       const hint = getPasswordHint();

//       setTimeout(() => {
//         if (hasAccessGranted()) safeSendGrantedOnce(typed, hint);
//         else safeSendDenied(typed, hint);
//       }, 220);
//     }

//     btn?.addEventListener("click", handleAttempt);
//     input?.addEventListener("keydown", (e) => {
//       if (e.key === "Enter") handleAttempt();
//     });

//     // Fallback via flag
//     try {
//       const just = sessionStorage.getItem(JUST_GRANTED_TAG);
//       if (just && hasAccessGranted()) {
//         sessionStorage.removeItem(JUST_GRANTED_TAG);
//         safeSendGrantedOnce("", "");
//       }
//     } catch { }

//     // Fallback extra: se abriu já com acesso
//     if (hasAccessGranted()) {
//       safeSendGrantedOnce("", "");
//     }

//     // Se a página for restaurada (mobile), tenta de novo sem duplicar
//     window.addEventListener("pageshow", () => {
//       if (hasAccessGranted()) safeSendGrantedOnce("", "");
//     });
//   }

//   if (document.readyState === "loading") {
//     document.addEventListener("DOMContentLoaded", bind, { once: true });
//   } else {
//     bind();
//   }
// })();