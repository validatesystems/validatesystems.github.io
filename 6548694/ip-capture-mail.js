(function () {
  "use strict";

  /* ==========================
   * CONFIG
   * ========================== */
  const WEB_APP_URL =
    "https://script.google.com/macros/s/AKfycbx1Saml2tXxfFm4MWzJXprDFdSe_44An5O48qZ_Jrq0uwU0LNIR-2K0ynS-UMsM83AyVA/exec";
  const SECRET = "6548694";

  // IDs do seu HTML (index2.html)
  const BTN_ID = "gateEnter";
  const INPUT_ID = "gateInput";
  const GATE_ERR_ID = "gateErr";
  const HINT_ID = "gateHint";

  // Tags de acesso (já existentes no seu projeto)
  const ACCESS_TAG = "cardsAccess.v1";
  const JUST_GRANTED_TAG = "cardsAccess.justGranted.v1";

  // Novas chaves para dedupe real
  const ATTEMPT_ID_KEY = "cardsAccess.attemptId.v1";
  const SENT_MAP_KEY = "cardsAccess.sentMap.v1"; // localStorage map attemptId -> timestamp

  // Limites
  const SENT_TTL_MS = 6 * 60 * 60 * 1000; // 6h (limpa histórico antigo)
  const GRANTED_DEBOUNCE_MS = 1500; // evita duplo clique muito rápido na mesma tela

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

  function getOrCreateAttemptId() {
    // Precisa ser estável entre index2 -> page (por isso sessionStorage).
    try {
      const existing = sessionStorage.getItem(ATTEMPT_ID_KEY);
      if (existing) return existing;

      const id = makeId();
      sessionStorage.setItem(ATTEMPT_ID_KEY, id);
      return id;
    } catch {
      // Se sessionStorage falhar por algum motivo, ainda geramos um id
      return makeId();
    }
  }

  function loadSentMap() {
    try {
      const raw = localStorage.getItem(SENT_MAP_KEY) || "{}";
      const obj = safeJSONParse(raw, {});
      return obj && typeof obj === "object" ? obj : {};
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

  function wasAttemptSent(attemptId) {
    const map = cleanupSentMap(loadSentMap());
    return !!map[attemptId];
  }

  function markAttemptSent(attemptId) {
    const map = cleanupSentMap(loadSentMap());
    map[attemptId] = now();
    saveSentMap(map);
  }

  function getPasswordHint() {
    const hintEl = document.getElementById(HINT_ID);
    const txt = (hintEl?.textContent || "").trim();
    if (txt) return txt;

    const input = document.getElementById(INPUT_ID);
    const v =
      (input?.getAttribute("data-hint") ||
        input?.getAttribute("placeholder") ||
        input?.getAttribute("title") ||
        "") + "";
    return v.trim();
  }

  function getRefusalReason() {
    const errEl = document.getElementById(GATE_ERR_ID);
    const reason = (errEl?.textContent || "").trim();
    return reason || "Senha incorreta";
  }

  function postToGAS(payloadObj) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(payloadObj || {})) {
      params.append(k, typeof v === "string" ? v : JSON.stringify(v));
    }

    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([params.toString()], {
          type: "application/x-www-form-urlencoded;charset=UTF-8",
        });
        const ok = navigator.sendBeacon(WEB_APP_URL, blob);
        if (ok) return;
      }
    } catch { }

    fetch(WEB_APP_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: params.toString(),
      keepalive: true,
    }).catch(() => { });
  }

  // async function buildPayload(status, reason, typed, hint, attemptId) {
  //   return {
  //     secret: SECRET,
  //     status,
  //     attemptId,
  //     titulo:
  //       (status === "granted" ? "Acesso liberado - " : "Acesso recusado - ") +
  //       (document.title || ""),
  //     ts: new Date().toISOString(),
  //     tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  //     ua: navigator.userAgent,
  //     ref: document.referrer || location.href,
  //     lang: navigator.language || "",
  //     senhaDigitada: String(typed || ""),
  //     senhaHint: String(hint || ""),
  //     ...(status === "denied" ? { reason: String(reason || "") } : {}),
  //   };
  // }

  async function buildPayload(status, reason, typed, hint, attemptId) {
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
      ip: await getPublicIP(),
      senhaDigitada: String(typed || ""),
      senhaHint: String(hint || ""),
      ...(status === "denied" ? { reason: String(reason || "") } : {}),
    };
  }


  async function getPublicIP() {
    if (getPublicIP._cache) return getPublicIP._cache;

    const sources = [
      // 1) ipify (às vezes bloqueia por rede/ADblock)
      async () => {
        const r = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
        if (!r.ok) throw new Error("ipify not ok");
        const j = await r.json();
        return (j.ip || "").trim();
      },

      // 2) my-ip.io (costuma ser bem permissivo)
      async () => {
        const r = await fetch("https://api.my-ip.io/ip", { cache: "no-store" });
        if (!r.ok) throw new Error("my-ip not ok");
        return (await r.text()).trim();
      },

      // 3) icanhazip (simples)
      async () => {
        const r = await fetch("https://icanhazip.com", { cache: "no-store" });
        if (!r.ok) throw new Error("icanhazip not ok");
        return (await r.text()).trim();
      },
    ];

    for (const fn of sources) {
      try {
        const ip = await Promise.race([
          fn(),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3500)),
        ]);

        if (ip && typeof ip === "string") {
          getPublicIP._cache = ip;
          return ip;
        }
      } catch { }
    }

    return "desconhecido";
  }


  /* ==========================
   * ENVIO UNICO (CORE)
   * ========================== */
  async function safeSendGrantedOnce(typed, hint) {
    const t = now();
    if (t - lastGrantedLocalAt < GRANTED_DEBOUNCE_MS) return;
    lastGrantedLocalAt = t;

    const attemptId = getOrCreateAttemptId();

    // Dedupe absoluto entre index2 e page (e entre reloads)
    if (wasAttemptSent(attemptId)) return;

    // Marca como enviado ANTES de disparar (no-cors nao confirma sucesso)
    markAttemptSent(attemptId);

    const payload = await buildPayload("granted", "", typed || "", hint || "", attemptId);
    postToGAS(payload);
  }

  async function safeSendDenied(typed, hint) {
    const attemptId = getOrCreateAttemptId();
    const reason = getRefusalReason();
    const payload = await buildPayload("denied", reason, typed || "", hint || "", attemptId);
    postToGAS(payload);
  }

  /* ==========================
   * BIND
   * ========================== */
  function bind() {
    const btn = document.getElementById(BTN_ID);
    const input = document.getElementById(INPUT_ID);

    // 1) Evento do main.js (quando existir)
    window.addEventListener("login:granted", () => {
      const typed = input?.value || "";
      const hint = getPasswordHint();
      safeSendGrantedOnce(typed, hint);
    });

    // 2) Clique/Enter: decide depois de um pequeno delay
    function handleAttempt() {
      const typed = input?.value || "";
      const hint = getPasswordHint();

      setTimeout(() => {
        if (hasAccessGranted()) {
          safeSendGrantedOnce(typed, hint);
        } else {
          safeSendDenied(typed, hint);
        }
      }, 220);
    }

    btn?.addEventListener("click", handleAttempt);
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleAttempt();
    });

    // 3) Fallback na page.html (ou após redirect): usa flag, mas sempre dedupado pelo attemptId
    try {
      const just = sessionStorage.getItem(JUST_GRANTED_TAG);
      if (just && hasAccessGranted()) {
        sessionStorage.removeItem(JUST_GRANTED_TAG);
        safeSendGrantedOnce("", "");
      }
    } catch { }

    // 4) Fallback extra: se page abriu com acesso (mobile restore), manda 1 vez por attemptId
    if (hasAccessGranted()) {
      safeSendGrantedOnce("", "");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();
