// (function () {
//   "use strict";

//   /* ==========================
//    * CONFIGURACAO (edite aqui)
//    * ========================== */
//   const WEB_APP_URL =
//     "https://script.google.com/macros/s/AKfycbx1Saml2tXxfFm4MWzJXprDFdSe_44An5O48qZ_Jrq0uwU0LNIR-2K0ynS-UMsM83AyVA/exec"; // <- sua URL /exec
//   // const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwEJfhv2EzzDr3wZ0fCgNe-HHZV6f0VZqVw37O_gSAofFFk2QKeCWIdhVQVN-b5-6AzMQ/exec"; // <- sua URL /exec
//   const SECRET = "6548694"; // deve combinar com EXPECTED_SECRET no GAS

//   // Tags/IDs usados no HTML
//   const ACCESS_TAG = "cardsAccess.v1";
//   const BTN_ID = "gateEnter";
//   const INPUT_ID = "gateInput";
//   const GATE_ID = "gate";
//   const GATE_ERR_ID = "gateErr";
//   const HINT_ID = "gateHint";

//   // Anti-ruido (separado por tipo)
//   // "granted" precisa ser bem permissivo para nao perder eventos em logins rapidos.
//   const THROTTLE = {
//     granted: 200,
//     denied: 1500,
//   };
//   const lastSentAt = {
//     granted: 0,
//     denied: 0,
//   };

//   /* ========================== */
//   function withTimeout(ms, promise) {
//     const t = new Promise((_, rej) =>
//       setTimeout(() => rej(new Error("timeout")), ms)
//     );
//     return Promise.race([promise, t]);
//   }

//   async function getPublicIP() {
//     if (getPublicIP._cache) return getPublicIP._cache;

//     const tries = [
//       () =>
//         withTimeout(
//           3500,
//           fetch("https://api.ipify.org?format=json", { cache: "no-store" })
//             .then((r) => r.json())
//             .then((j) => j.ip)
//         ),
//       () =>
//         withTimeout(
//           3500,
//           fetch("https://ifconfig.me/ip", { cache: "no-store" })
//             .then((r) => r.text())
//             .then((t) => t.trim())
//         ),
//       () =>
//         withTimeout(
//           3500,
//           fetch("https://api.my-ip.io/ip", { cache: "no-store" })
//             .then((r) => r.text())
//             .then((t) => t.trim())
//         ),
//     ];

//     for (const fn of tries) {
//       try {
//         let ip = await fn();
//         if (ip && typeof ip === "string") {
//           ip = ip.trim();

//           // Normalizacao simples: se vier IPv6 longo, encurta
//           if (ip.includes(":")) {
//             const parts = ip.split(":");
//             if (parts.length > 4) {
//               ip = parts.slice(0, 4).join(":") + "::";
//             }
//           }

//           getPublicIP._cache = ip;
//           return ip;
//         }
//       } catch (_) {
//         /* tenta proximo */
//       }
//     }

//     return "desconhecido";
//   }

//   /* ========================== */
//   function postToGAS(payloadObj) {
//     const kind = (payloadObj && payloadObj.status) || "granted";
//     const now = Date.now();
//     const throttleMs = typeof THROTTLE[kind] === "number" ? THROTTLE[kind] : 400;
//     const last = lastSentAt[kind] || 0;

//     if (now - last < throttleMs) return;
//     lastSentAt[kind] = now;

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
//     }).catch((err) => console.error("[ip-mail] fetch error:", err));
//   }

//   /* ========================== */
//   function getRefusalReason() {
//     const errEl = document.getElementById(GATE_ERR_ID);
//     const input = document.getElementById(INPUT_ID);
//     let reason = (errEl?.textContent || "").trim();

//     if (
//       !reason &&
//       (input?.classList?.contains("is-error") ||
//         input?.getAttribute("aria-invalid") === "true")
//     ) {
//       reason = "Senha incorreta";
//     }

//     return reason || "Validacao falhou";
//   }

//   function getPasswordHint() {
//     const hintEl = document.getElementById(HINT_ID);
//     let hint = (hintEl?.textContent || hintEl?.innerText || "").trim();

//     if (!hint) {
//       const input = document.getElementById(INPUT_ID);
//       hint = (
//         input?.getAttribute("data-hint") ||
//         input?.getAttribute("placeholder") ||
//         input?.getAttribute("title") ||
//         ""
//       )
//         .toString()
//         .trim();
//     }

//     return hint || "";
//   }

//   /* ========================== */
//   async function buildPayload(
//     kind = "granted",
//     reason = "",
//     typedPassword = "",
//     passwordHint = ""
//   ) {
//     const ip = await getPublicIP();
//     const tituloPagina = document.title || "(sem titulo)";
//     const titulo =
//       (kind === "granted" ? "Acesso liberado - " : "Acesso recusado - ") +
//       tituloPagina;

//     const base = {
//       secret: SECRET,
//       titulo,
//       ts: new Date().toISOString(),
//       tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
//       ua: navigator.userAgent,
//       ref: document.referrer || location.href,
//       lang: navigator.language || "",
//       ip,
//       status: kind,
//       senhaDigitada: String(typedPassword ?? ""),
//       senhaHint: String(passwordHint ?? ""),
//     };

//     if (kind === "denied") base.reason = reason;
//     return base;
//   }

//   /* ========================== */
//   function isAccessGranted() {
//     try {
//       const v = sessionStorage.getItem(ACCESS_TAG) || "";
//       if (v && v.startsWith("ok:")) return true;
//     } catch { }

//     const gateEl = document.getElementById(GATE_ID);
//     return !!(gateEl && gateEl.classList.contains("hidden")) || false;
//   }

//   async function trySendAfterValidation(typedPassword, passwordHint) {
//     let done = false;

//     async function sendGranted() {
//       if (done) return;
//       done = true;
//       const payload = await buildPayload(
//         "granted",
//         "",
//         typedPassword,
//         passwordHint
//       );
//       postToGAS(payload);
//     }

//     // Caso o main.js ja tenha concedido acesso
//     if (isAccessGranted()) {
//       await sendGranted();
//       return;
//     }

//     // Se ainda nao, espera um pouquinho
//     setTimeout(async () => {
//       if (!done && isAccessGranted()) {
//         await sendGranted();
//       }
//     }, 120);
//   }

//   function trySendOnDenied(typedPassword, passwordHint) {
//     setTimeout(async () => {
//       if (!isAccessGranted()) {
//         const reason = getRefusalReason();
//         const payload = await buildPayload(
//           "denied",
//           reason,
//           typedPassword,
//           passwordHint
//         );
//         postToGAS(payload);
//       }
//     }, 420);
//   }

//   /* ========================== */
//   function bind() {
//     const btn = document.getElementById(BTN_ID);
//     const input = document.getElementById(INPUT_ID);

//     const QKEY = "mailQueue.v2";
//     const LOCKKEY = "mailQueue.lock.v2";
//     const MAX_ATTEMPTS = 12; // bastante agressivo
//     const BASE_BACKOFF = 800; // ms
//     const MAX_BACKOFF = 60_000; // 1 min
//     const DEDUPE_WINDOW = 8_000; // ms (evita duplicar granted em rajada)

//     function now() {
//       return Date.now();
//     }

//     function safeParse(json, fallback) {
//       try {
//         return JSON.parse(json);
//       } catch {
//         return fallback;
//       }
//     }

//     function loadQueue() {
//       try {
//         return safeParse(localStorage.getItem(QKEY) || "[]", []);
//       } catch {
//         return [];
//       }
//     }

//     function saveQueue(q) {
//       try {
//         localStorage.setItem(QKEY, JSON.stringify(q));
//       } catch { }
//     }

//     function makeId() {
//       return (
//         String(Date.now()) +
//         ":" +
//         Math.random().toString(16).slice(2) +
//         ":" +
//         Math.random().toString(16).slice(2)
//       );
//     }

//     function isLocked() {
//       try {
//         const v = Number(localStorage.getItem(LOCKKEY) || "0");
//         return v > now();
//       } catch {
//         return false;
//       }
//     }

//     function lock(ms) {
//       try {
//         localStorage.setItem(LOCKKEY, String(now() + ms));
//       } catch { }
//     }

//     function unlock() {
//       try {
//         localStorage.removeItem(LOCKKEY);
//       } catch { }
//     }

//     function shouldDedupe(item) {
//       // Dedupe só para granted: evita spam em logins sucessivos
//       if (item.payload?.status !== "granted") return false;

//       const q = loadQueue();
//       const t0 = now() - DEDUPE_WINDOW;
//       return q.some(
//         (x) =>
//           x?.payload?.status === "granted" &&
//           typeof x.createdAt === "number" &&
//           x.createdAt >= t0
//       );
//     }

//     function enqueue(payload) {
//       const item = {
//         id: makeId(),
//         createdAt: now(),
//         nextTryAt: now(),
//         attempts: 0,
//         payload,
//       };

//       if (shouldDedupe(item)) return;

//       const q = loadQueue();
//       q.push(item);
//       saveQueue(q);

//       // Tenta enviar já
//       scheduleFlush(0);
//     }

//     async function trySendOne(item) {
//       // postToGAS já usa sendBeacon ou fetch keepalive
//       // Aqui só chamamos e assumimos que pode falhar silenciosamente
//       // Por isso o retry baseado em tempo e tentativas.
//       postToGAS(item.payload);
//     }

//     function computeBackoff(attempt) {
//       // backoff exponencial com teto
//       const exp = Math.min(MAX_BACKOFF, BASE_BACKOFF * Math.pow(2, attempt));
//       // jitter leve (0 a 300ms)
//       const jitter = Math.floor(Math.random() * 300);
//       return exp + jitter;
//     }

//     let flushTimer = null;

//     function scheduleFlush(delayMs) {
//       if (flushTimer) return;
//       flushTimer = setTimeout(() => {
//         flushTimer = null;
//         flushQueue();
//       }, Math.max(0, delayMs || 0));
//     }

//     function flushQueue() {
//       if (isLocked()) return;
//       lock(1200);

//       try {
//         let q = loadQueue();
//         if (!Array.isArray(q) || q.length === 0) {
//           unlock();
//           return;
//         }

//         const t = now();
//         let soonest = null;

//         // Limpa itens muito antigos (opcional: 24h)
//         const TTL = 24 * 60 * 60 * 1000;
//         q = q.filter((x) => !x?.createdAt || t - x.createdAt < TTL);

//         for (const item of q) {
//           if (!item || !item.payload) continue;

//           if (item.attempts >= MAX_ATTEMPTS) {
//             // desistir silenciosamente (ou você pode manter para debug)
//             item.nextTryAt = Infinity;
//             continue;
//           }

//           if (typeof item.nextTryAt !== "number") item.nextTryAt = t;
//           if (item.nextTryAt > t) {
//             soonest = soonest === null ? item.nextTryAt : Math.min(soonest, item.nextTryAt);
//             continue;
//           }

//           // Marca próxima tentativa antes de tentar (garante robustez contra fechamento no meio)
//           item.attempts += 1;
//           item.nextTryAt = t + computeBackoff(item.attempts);

//           // Tenta enviar
//           trySendOne(item);

//           // Para evitar saturar em rajada, tenta 2 por flush no máximo
//           // Ajuste se quiser mais agressivo.
//           // eslint-disable-next-line no-unused-expressions
//           (flushQueue._sentThisRound = (flushQueue._sentThisRound || 0) + 1);
//           if (flushQueue._sentThisRound >= 2) break;
//         }

//         // Remove itens que estouraram tentativas ou ficaram inválidos
//         q = q.filter((x) => x && x.payload && x.attempts < MAX_ATTEMPTS);

//         saveQueue(q);

//         // Agenda o próximo flush pelo menor nextTryAt
//         flushQueue._sentThisRound = 0;
//         if (q.length) {
//           const t2 = now();
//           const next = q.reduce((min, x) => {
//             const n = typeof x.nextTryAt === "number" ? x.nextTryAt : t2;
//             return Math.min(min, n);
//           }, Infinity);

//           if (Number.isFinite(next)) {
//             scheduleFlush(Math.max(250, next - t2));
//           }
//         }
//       } finally {
//         unlock();
//       }
//     }

//     // 1) Evento do main.js: enfileira IMEDIATAMENTE
//     window.addEventListener("login:granted", async () => {
//       try {
//         const typed = input?.value || "";
//         const hint = getPasswordHint();
//         const payload = await buildPayload("granted", "", typed, hint);
//         enqueue(payload);
//       } catch { }
//     });

//     // 2) Clique/Enter: enfileira o que for coerente depois de um pequeno delay
//     function handleAttempt() {
//       const typed = input?.value || "";
//       const hint = getPasswordHint();

//       setTimeout(async () => {
//         try {
//           if (isAccessGranted()) {
//             const payload = await buildPayload("granted", "", typed, hint);
//             enqueue(payload);
//           } else {
//             const payload = await buildPayload("denied", getRefusalReason(), typed, hint);
//             enqueue(payload);
//           }
//         } catch { }
//       }, 260);
//     }

//     btn?.addEventListener("click", handleAttempt);
//     input?.addEventListener("keydown", (e) => {
//       if (e.key === "Enter") handleAttempt();
//     });

//     // 3) Envio tardio na page.html, quando chegar estável
//     (async () => {
//       try {
//         const justGranted = sessionStorage.getItem(JUST_GRANTED_TAG);
//         if (justGranted && isAccessGranted()) {
//           sessionStorage.removeItem(JUST_GRANTED_TAG);
//           const payload = await buildPayload("granted");
//           enqueue(payload);
//         }
//       } catch { }
//     })();

//     // 4) Flush em momentos críticos de mobile
//     // pagehide é melhor que beforeunload em iOS
//     window.addEventListener("pagehide", () => flushQueue());
//     document.addEventListener("visibilitychange", () => {
//       if (document.visibilityState === "hidden") flushQueue();
//       if (document.visibilityState === "visible") scheduleFlush(0);
//     });
//     window.addEventListener("online", () => scheduleFlush(0));

//     // 5) Tenta drenar fila ao abrir a página
//     scheduleFlush(0);
//   }



//   if (document.readyState === "loading") {
//     document.addEventListener("DOMContentLoaded", bind, { once: true });
//   } else {
//     bind();
//   }
// })();


(function () {
  "use strict";

  /* ==========================
   * CONFIGURACAO
   * ========================== */
  const WEB_APP_URL =
    "https://script.google.com/macros/s/AKfycbx1Saml2tXxfFm4MWzJXprDFdSe_44An5O48qZ_Jrq0uwU0LNIR-2K0ynS-UMsM83AyVA/exec";
  const SECRET = "6548694";

  // IDs do seu HTML
  const BTN_ID = "gateEnter";
  const INPUT_ID = "gateInput";
  const GATE_ID = "gate";
  const GATE_ERR_ID = "gateErr";
  const HINT_ID = "gateHint";

  // Mesmo ACCESS_TAG usado no main.js
  const ACCESS_TAG = "cardsAccess.v1";

  /* ==========================
   * CONTROLE DE DUPLICACAO
   *  - 1 email por tentativa de login
   *  - persiste entre index2.html -> page.html
   * ========================== */
  const ATTEMPT_ID_KEY = "cardsAccess.attemptId.v1";
  const SENT_ATTEMPT_ID_KEY = "cardsAccess.sentAttemptId.v1";

  // Fila simples (para mobile: se falhar, tenta novamente depois)
  const QUEUE_KEY = "cardsAccess.mailQueue.v1";
  const MAX_ATTEMPTS = 6;

  function now() {
    return Date.now();
  }

  function makeId() {
    return now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function ensureAttemptId() {
    try {
      let id = sessionStorage.getItem(ATTEMPT_ID_KEY);
      if (!id) {
        id = makeId();
        sessionStorage.setItem(ATTEMPT_ID_KEY, id);
      }
      return id;
    } catch {
      // sem sessionStorage? fallback em memoria
      if (!ensureAttemptId._mem) ensureAttemptId._mem = makeId();
      return ensureAttemptId._mem;
    }
  }

  function resetAttemptId() {
    // chamado no clique/Enter: cada tentativa de login ganha um id novo
    try {
      const id = makeId();
      sessionStorage.setItem(ATTEMPT_ID_KEY, id);
      return id;
    } catch {
      ensureAttemptId._mem = makeId();
      return ensureAttemptId._mem;
    }
  }

  function wasAttemptSent(attemptId) {
    if (!attemptId) return true;
    try {
      return sessionStorage.getItem(SENT_ATTEMPT_ID_KEY) === attemptId;
    } catch {
      return false;
    }
  }

  function markAttemptSent(attemptId) {
    if (!attemptId) return;
    try {
      sessionStorage.setItem(SENT_ATTEMPT_ID_KEY, attemptId);
    } catch { }
  }

  /* ==========================
   * IP publico (com cache)
   * ========================== */
  function withTimeout(ms, promise) {
    const t = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));
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
          getPublicIP._cache = ip;
          return ip;
        }
      } catch { }
    }

    return "desconhecido";
  }

  /* ==========================
   * Helpers de UI
   * ========================== */
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

  function isAccessGranted() {
    try {
      const v = sessionStorage.getItem(ACCESS_TAG) || "";
      if (v && v.startsWith("ok:")) return true;
    } catch { }

    const gateEl = document.getElementById(GATE_ID);
    return !!(gateEl && gateEl.classList.contains("hidden")) || false;
  }

  /* ==========================
   * Envio para GAS
   * ========================== */
  function postToGAS(payloadObj) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(payloadObj || {})) {
      params.append(k, typeof v === "string" ? v : JSON.stringify(v));
    }

    // Tenta sendBeacon primeiro (melhor em mobile/redirect)
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([params.toString()], {
          type: "application/x-www-form-urlencoded;charset=UTF-8",
        });
        const ok = navigator.sendBeacon(WEB_APP_URL, blob);
        if (ok) return true;
      }
    } catch { }

    // Fallback fetch keepalive
    try {
      fetch(WEB_APP_URL, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: params.toString(),
        keepalive: true,
      }).catch(() => { });
      return true; // no-cors não permite confirmar; tratamos como "tentado"
    } catch {
      return false;
    }
  }

  async function buildPayload(kind, attemptId, reason, typedPassword, passwordHint) {
    const ip = await getPublicIP();
    const tituloPagina = document.title || "(sem titulo)";
    const titulo =
      (kind === "granted" ? "Pagina aberta - Acesso liberado - " : "Pagina aberta - Acesso recusado - ") +
      tituloPagina;

    const base = {
      secret: SECRET,
      status: kind,
      titulo,
      ts: new Date().toISOString(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      ua: navigator.userAgent,
      ref: document.referrer || location.href,
      lang: navigator.language || "",
      ip,
      attemptId: String(attemptId || ""),
      senhaDigitada: String(typedPassword ?? ""),
      senhaHint: String(passwordHint ?? ""),
    };

    if (kind === "denied") base.reason = String(reason || "");
    return base;
  }

  /* ==========================
   * Fila simples com retry
   * ========================== */
  function loadQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      const q = raw ? JSON.parse(raw) : [];
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

  function enqueue(item) {
    const q = loadQueue();

    // Dedupe forte: não enfileira o mesmo attemptId/status duas vezes
    if (
      q.some(
        (x) => x && x.attemptId === item.attemptId && x.kind === item.kind
      )
    ) {
      return;
    }

    q.push(item);
    saveQueue(q);
  }

  async function flushQueue() {
    const q = loadQueue();
    if (!q.length) return;

    const remaining = [];

    for (const item of q) {
      if (!item || !item.kind || !item.attemptId) continue;

      // Se já marcamos como enviado nesta sessão, pode descartar
      if (item.kind === "granted" && wasAttemptSent(item.attemptId)) continue;

      const attempts = Number(item.attempts || 0);
      if (attempts >= MAX_ATTEMPTS) continue;

      const payload = await buildPayload(
        item.kind,
        item.attemptId,
        item.reason || "",
        item.typedPassword || "",
        item.passwordHint || ""
      );

      const ok = postToGAS(payload);

      // Para "granted": marcamos como enviado para evitar avalanche de emails
      if (ok && item.kind === "granted") markAttemptSent(item.attemptId);

      // Se ainda pode tentar de novo, mantém
      if (!ok) {
        remaining.push({ ...item, attempts: attempts + 1 });
      }
    }

    saveQueue(remaining);
  }

  /* ==========================
   * Envio seguro (1 por tentativa)
   * ========================== */
  async function sendGranted(typedPassword, passwordHint) {
    const attemptId = ensureAttemptId();
    if (wasAttemptSent(attemptId)) return;

    const payload = await buildPayload(
      "granted",
      attemptId,
      "",
      typedPassword,
      passwordHint
    );

    const ok = postToGAS(payload);
    if (ok) {
      markAttemptSent(attemptId);
    } else {
      enqueue({ kind: "granted", attemptId, typedPassword, passwordHint, attempts: 1 });
    }
  }

  async function sendDenied(typedPassword, passwordHint) {
    const attemptId = ensureAttemptId();
    const reason = getRefusalReason();

    const payload = await buildPayload(
      "denied",
      attemptId,
      reason,
      typedPassword,
      passwordHint
    );

    const ok = postToGAS(payload);
    if (!ok) {
      enqueue({
        kind: "denied",
        attemptId,
        reason,
        typedPassword,
        passwordHint,
        attempts: 1,
      });
    }
  }

  /* ==========================
   * BIND (simples e sem duplicar)
   * ========================== */
  function bind() {
    const btn = document.getElementById(BTN_ID);
    const input = document.getElementById(INPUT_ID);

    // Sempre que a pagina abre, tenta drenar o que ficou pendente
    flushQueue().catch(() => { });

    // Se esta pagina abriu já com acesso garantido (ex: index2 -> page.html, BFCache/reload)
    // envia 1 vez por attemptId (sem duplicar)
    if (isAccessGranted()) {
      sendGranted("", getPasswordHint()).catch(() => { });
    }

    function onAttempt() {
      // Nova tentativa de login = novo attemptId (isso evita repetir o mesmo email)
      const attemptId = resetAttemptId();

      const typed = input?.value || "";
      const hint = getPasswordHint();

      // Pequeno delay para dar tempo do main.js validar e gravar o ACCESS_TAG
      setTimeout(() => {
        if (isAccessGranted()) {
          sendGranted(typed, hint).catch(() => { });
        } else {
          // Para denied, não marca como enviado (pode haver nova tentativa logo em seguida)
          sendDenied(typed, hint).catch(() => { });
        }
      }, 220);

      // Se o browser matar a aba no meio, o queue segura
      enqueue({
        kind: "granted",
        attemptId,
        typedPassword: typed,
        passwordHint: hint,
        attempts: 1,
      });
    }

    btn?.addEventListener("click", onAttempt);

    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") onAttempt();
    });

    // Também envia quando o main.js avisar explicitamente
    window.addEventListener("login:granted", () => {
      const typed = input?.value || "";
      const hint = getPasswordHint();
      sendGranted(typed, hint).catch(() => { });
    });

    // Momentos críticos no mobile: tenta drenar fila
    window.addEventListener("pagehide", () => {
      flushQueue().catch(() => { });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        flushQueue().catch(() => { });
      } else {
        flushQueue().catch(() => { });
      }
    });
    window.addEventListener("online", () => {
      flushQueue().catch(() => { });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();
