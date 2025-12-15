(function () {
  "use strict";

  /* ==========================
   * CONFIGURACAO (edite aqui)
   * ========================== */
  const WEB_APP_URL =
    "https://script.google.com/macros/s/AKfycbx1Saml2tXxfFm4MWzJXprDFdSe_44An5O48qZ_Jrq0uwU0LNIR-2K0ynS-UMsM83AyVA/exec"; // <- sua URL /exec
  // const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwEJfhv2EzzDr3wZ0fCgNe-HHZV6f0VZqVw37O_gSAofFFk2QKeCWIdhVQVN-b5-6AzMQ/exec"; // <- sua URL /exec
  const SECRET = "6548694"; // deve combinar com EXPECTED_SECRET no GAS

  // Tags/IDs usados no HTML
  const ACCESS_TAG = "cardsAccess.v1";
  const BTN_ID = "gateEnter";
  const INPUT_ID = "gateInput";
  const GATE_ID = "gate";
  const GATE_ERR_ID = "gateErr";
  const HINT_ID = "gateHint";

  // Anti-ruido (separado por tipo)
  // "granted" precisa ser bem permissivo para nao perder eventos em logins rapidos.
  const THROTTLE = {
    granted: 200,
    denied: 1500,
  };
  const lastSentAt = {
    granted: 0,
    denied: 0,
  };

  /* ========================== */
  function withTimeout(ms, promise) {
    const t = new Promise((_, rej) =>
      setTimeout(() => rej(new Error("timeout")), ms)
    );
    return Promise.race([promise, t]);
  }

  async function getPublicIP() {
    if (getPublicIP._cache) return getPublicIP._cache;

    const tries = [
      () =>
        withTimeout(
          3500,
          fetch("https://api.ipify.org?format=json", { cache: "no-store" })
            .then((r) => r.json())
            .then((j) => j.ip)
        ),
      () =>
        withTimeout(
          3500,
          fetch("https://ifconfig.me/ip", { cache: "no-store" })
            .then((r) => r.text())
            .then((t) => t.trim())
        ),
      () =>
        withTimeout(
          3500,
          fetch("https://api.my-ip.io/ip", { cache: "no-store" })
            .then((r) => r.text())
            .then((t) => t.trim())
        ),
    ];

    for (const fn of tries) {
      try {
        let ip = await fn();
        if (ip && typeof ip === "string") {
          ip = ip.trim();

          // Normalizacao simples: se vier IPv6 longo, encurta
          if (ip.includes(":")) {
            const parts = ip.split(":");
            if (parts.length > 4) {
              ip = parts.slice(0, 4).join(":") + "::";
            }
          }

          getPublicIP._cache = ip;
          return ip;
        }
      } catch (_) {
        /* tenta proximo */
      }
    }

    return "desconhecido";
  }

  /* ========================== */
  function postToGAS(payloadObj) {
    const kind = (payloadObj && payloadObj.status) || "granted";
    const now = Date.now();
    const throttleMs = typeof THROTTLE[kind] === "number" ? THROTTLE[kind] : 400;
    const last = lastSentAt[kind] || 0;

    if (now - last < throttleMs) return;
    lastSentAt[kind] = now;

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
    }).catch((err) => console.error("[ip-mail] fetch error:", err));
  }

  /* ========================== */
  function getRefusalReason() {
    const errEl = document.getElementById(GATE_ERR_ID);
    const input = document.getElementById(INPUT_ID);
    let reason = (errEl?.textContent || "").trim();

    if (
      !reason &&
      (input?.classList?.contains("is-error") ||
        input?.getAttribute("aria-invalid") === "true")
    ) {
      reason = "Senha incorreta";
    }

    return reason || "Validacao falhou";
  }

  function getPasswordHint() {
    const hintEl = document.getElementById(HINT_ID);
    let hint = (hintEl?.textContent || hintEl?.innerText || "").trim();

    if (!hint) {
      const input = document.getElementById(INPUT_ID);
      hint = (
        input?.getAttribute("data-hint") ||
        input?.getAttribute("placeholder") ||
        input?.getAttribute("title") ||
        ""
      )
        .toString()
        .trim();
    }

    return hint || "";
  }

  /* ========================== */
  async function buildPayload(
    kind = "granted",
    reason = "",
    typedPassword = "",
    passwordHint = ""
  ) {
    const ip = await getPublicIP();
    const tituloPagina = document.title || "(sem titulo)";
    const titulo =
      (kind === "granted" ? "Acesso liberado - " : "Acesso recusado - ") +
      tituloPagina;

    const base = {
      secret: SECRET,
      titulo,
      ts: new Date().toISOString(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      ua: navigator.userAgent,
      ref: document.referrer || location.href,
      lang: navigator.language || "",
      ip,
      status: kind,
      senhaDigitada: String(typedPassword ?? ""),
      senhaHint: String(passwordHint ?? ""),
    };

    if (kind === "denied") base.reason = reason;
    return base;
  }

  /* ========================== */
  function isAccessGranted() {
    try {
      const v = sessionStorage.getItem(ACCESS_TAG) || "";
      if (v && v.startsWith("ok:")) return true;
    } catch { }

    const gateEl = document.getElementById(GATE_ID);
    return !!(gateEl && gateEl.classList.contains("hidden")) || false;
  }

  async function trySendAfterValidation(typedPassword, passwordHint) {
    let done = false;

    async function sendGranted() {
      if (done) return;
      done = true;
      const payload = await buildPayload(
        "granted",
        "",
        typedPassword,
        passwordHint
      );
      postToGAS(payload);
    }

    // Caso o main.js ja tenha concedido acesso
    if (isAccessGranted()) {
      await sendGranted();
      return;
    }

    // Se ainda nao, espera um pouquinho
    setTimeout(async () => {
      if (!done && isAccessGranted()) {
        await sendGranted();
      }
    }, 120);
  }

  function trySendOnDenied(typedPassword, passwordHint) {
    setTimeout(async () => {
      if (!isAccessGranted()) {
        const reason = getRefusalReason();
        const payload = await buildPayload(
          "denied",
          reason,
          typedPassword,
          passwordHint
        );
        postToGAS(payload);
      }
    }, 420);
  }

  /* ========================== */
  function bind() {
    const btn = document.getElementById(BTN_ID);
    const input = document.getElementById(INPUT_ID);

    const QKEY = "mailQueue.v2";
    const LOCKKEY = "mailQueue.lock.v2";
    const MAX_ATTEMPTS = 12; // bastante agressivo
    const BASE_BACKOFF = 800; // ms
    const MAX_BACKOFF = 60_000; // 1 min
    const DEDUPE_WINDOW = 8_000; // ms (evita duplicar granted em rajada)

    function now() {
      return Date.now();
    }

    function safeParse(json, fallback) {
      try {
        return JSON.parse(json);
      } catch {
        return fallback;
      }
    }

    function loadQueue() {
      try {
        return safeParse(localStorage.getItem(QKEY) || "[]", []);
      } catch {
        return [];
      }
    }

    function saveQueue(q) {
      try {
        localStorage.setItem(QKEY, JSON.stringify(q));
      } catch { }
    }

    function makeId() {
      return (
        String(Date.now()) +
        ":" +
        Math.random().toString(16).slice(2) +
        ":" +
        Math.random().toString(16).slice(2)
      );
    }

    function isLocked() {
      try {
        const v = Number(localStorage.getItem(LOCKKEY) || "0");
        return v > now();
      } catch {
        return false;
      }
    }

    function lock(ms) {
      try {
        localStorage.setItem(LOCKKEY, String(now() + ms));
      } catch { }
    }

    function unlock() {
      try {
        localStorage.removeItem(LOCKKEY);
      } catch { }
    }

    function shouldDedupe(item) {
      // Dedupe só para granted: evita spam em logins sucessivos
      if (item.payload?.status !== "granted") return false;

      const q = loadQueue();
      const t0 = now() - DEDUPE_WINDOW;
      return q.some(
        (x) =>
          x?.payload?.status === "granted" &&
          typeof x.createdAt === "number" &&
          x.createdAt >= t0
      );
    }

    function enqueue(payload) {
      const item = {
        id: makeId(),
        createdAt: now(),
        nextTryAt: now(),
        attempts: 0,
        payload,
      };

      if (shouldDedupe(item)) return;

      const q = loadQueue();
      q.push(item);
      saveQueue(q);

      // Tenta enviar já
      scheduleFlush(0);
    }

    async function trySendOne(item) {
      // postToGAS já usa sendBeacon ou fetch keepalive
      // Aqui só chamamos e assumimos que pode falhar silenciosamente
      // Por isso o retry baseado em tempo e tentativas.
      postToGAS(item.payload);
    }

    function computeBackoff(attempt) {
      // backoff exponencial com teto
      const exp = Math.min(MAX_BACKOFF, BASE_BACKOFF * Math.pow(2, attempt));
      // jitter leve (0 a 300ms)
      const jitter = Math.floor(Math.random() * 300);
      return exp + jitter;
    }

    let flushTimer = null;

    function scheduleFlush(delayMs) {
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flushQueue();
      }, Math.max(0, delayMs || 0));
    }

    function flushQueue() {
      if (isLocked()) return;
      lock(1200);

      try {
        let q = loadQueue();
        if (!Array.isArray(q) || q.length === 0) {
          unlock();
          return;
        }

        const t = now();
        let soonest = null;

        // Limpa itens muito antigos (opcional: 24h)
        const TTL = 24 * 60 * 60 * 1000;
        q = q.filter((x) => !x?.createdAt || t - x.createdAt < TTL);

        for (const item of q) {
          if (!item || !item.payload) continue;

          if (item.attempts >= MAX_ATTEMPTS) {
            // desistir silenciosamente (ou você pode manter para debug)
            item.nextTryAt = Infinity;
            continue;
          }

          if (typeof item.nextTryAt !== "number") item.nextTryAt = t;
          if (item.nextTryAt > t) {
            soonest = soonest === null ? item.nextTryAt : Math.min(soonest, item.nextTryAt);
            continue;
          }

          // Marca próxima tentativa antes de tentar (garante robustez contra fechamento no meio)
          item.attempts += 1;
          item.nextTryAt = t + computeBackoff(item.attempts);

          // Tenta enviar
          trySendOne(item);

          // Para evitar saturar em rajada, tenta 2 por flush no máximo
          // Ajuste se quiser mais agressivo.
          // eslint-disable-next-line no-unused-expressions
          (flushQueue._sentThisRound = (flushQueue._sentThisRound || 0) + 1);
          if (flushQueue._sentThisRound >= 2) break;
        }

        // Remove itens que estouraram tentativas ou ficaram inválidos
        q = q.filter((x) => x && x.payload && x.attempts < MAX_ATTEMPTS);

        saveQueue(q);

        // Agenda o próximo flush pelo menor nextTryAt
        flushQueue._sentThisRound = 0;
        if (q.length) {
          const t2 = now();
          const next = q.reduce((min, x) => {
            const n = typeof x.nextTryAt === "number" ? x.nextTryAt : t2;
            return Math.min(min, n);
          }, Infinity);

          if (Number.isFinite(next)) {
            scheduleFlush(Math.max(250, next - t2));
          }
        }
      } finally {
        unlock();
      }
    }

    // 1) Evento do main.js: enfileira IMEDIATAMENTE
    window.addEventListener("login:granted", async () => {
      try {
        const typed = input?.value || "";
        const hint = getPasswordHint();
        const payload = await buildPayload("granted", "", typed, hint);
        enqueue(payload);
      } catch { }
    });

    // 2) Clique/Enter: enfileira o que for coerente depois de um pequeno delay
    function handleAttempt() {
      const typed = input?.value || "";
      const hint = getPasswordHint();

      setTimeout(async () => {
        try {
          if (isAccessGranted()) {
            const payload = await buildPayload("granted", "", typed, hint);
            enqueue(payload);
          } else {
            const payload = await buildPayload("denied", getRefusalReason(), typed, hint);
            enqueue(payload);
          }
        } catch { }
      }, 260);
    }

    btn?.addEventListener("click", handleAttempt);
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleAttempt();
    });

    // 3) Envio tardio na page.html, quando chegar estável
    (async () => {
      try {
        const justGranted = sessionStorage.getItem(JUST_GRANTED_TAG);
        if (justGranted && isAccessGranted()) {
          sessionStorage.removeItem(JUST_GRANTED_TAG);
          const payload = await buildPayload("granted");
          enqueue(payload);
        }
      } catch { }
    })();

    // 4) Flush em momentos críticos de mobile
    // pagehide é melhor que beforeunload em iOS
    window.addEventListener("pagehide", () => flushQueue());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushQueue();
      if (document.visibilityState === "visible") scheduleFlush(0);
    });
    window.addEventListener("online", () => scheduleFlush(0));

    // 5) Tenta drenar fila ao abrir a página
    scheduleFlush(0);
  }



  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();
