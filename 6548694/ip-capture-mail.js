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

    // 1) Evento disparado pelo main.js no momento exato da liberação
    window.addEventListener("login:granted", async () => {
      try {
        const typed = input?.value || "";
        const hint = getPasswordHint();
        const payload = await buildPayload("granted", "", typed, hint);
        postToGAS(payload);
      } catch { }
    });

    // Função comum para clique e Enter
    function handleAttempt() {
      const typed = input?.value || "";
      const hint = getPasswordHint();

      // Pequeno delay para permitir o main.js concluir a validação
      setTimeout(async () => {
        try {
          if (isAccessGranted()) {
            const payload = await buildPayload("granted", "", typed, hint);
            postToGAS(payload);
          } else {
            const payload = await buildPayload(
              "denied",
              getRefusalReason(),
              typed,
              hint
            );
            postToGAS(payload);
          }
        } catch { }
      }, 350);
    }

    // 2) Clique no botão
    btn?.addEventListener("click", handleAttempt);

    // 3) Enter no input
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleAttempt();
    });

    // 4) Caso raro: página já abriu com acesso garantido (mobile / restore)
    (async () => {
      try {
        const justGranted = sessionStorage.getItem(JUST_GRANTED_TAG);
        if (justGranted && isAccessGranted()) {
          sessionStorage.removeItem(JUST_GRANTED_TAG);
          const payload = await buildPayload("granted");
          postToGAS(payload);
        }
      } catch { }
    })();
  }


  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();
