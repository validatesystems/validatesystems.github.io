(function () {
  "use strict";

  /* ==========================
   * CONFIGURAÇÃO (edite aqui)
   * ========================== */
  const WEB_APP_URL =
    "https://script.google.com/macros/s/AKfycbx1Saml2tXxfFm4MWzJXprDFdSe_44An5O48qZ_Jrq0uwU0LNIR-2K0ynS-UMsM83AyVA/exec"; // <- sua URL /exec
  // const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwEJfhv2EzzDr3wZ0fCgNe-HHZV6f0VZqVw37O_gSAofFFk2QKeCWIdhVQVN-b5-6AzMQ/exec"; // <- sua URL /exec
  const SECRET = "6548694"; // deve combinar com EXPECTED_SECRET no GAS

  // Tags/IDs já usados no seu HTML
  const ACCESS_TAG = "cardsAccess.v1";
  const BTN_ID = "gateEnter";
  const INPUT_ID = "gateInput";
  const GATE_ID = "gate";
  const GATE_ERR_ID = "gateErr";
  const HINT_ID = "gateHint"; // <- NOVO: id do elemento que exibe a dica

  // Anti-ruído
  const THROTTLE_MS = 200;
  let lastSentAt = 0;

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

          // 🌐 Normalização: prefere IPv4; se IPv6, encurta formato longo
          if (ip.includes(":")) {
            // IPv6 detectado → deixa forma reduzida
            const parts = ip.split(":");
            if (parts.length > 4) {
              ip = parts.slice(0, 4).join(":") + "::";
            }
          }

          getPublicIP._cache = ip;
          return ip;
        }
      } catch (_) {
        /* tenta próximo */
      }
    }

    return "desconhecido";
  }

  /* ========================== */
  function postToGAS(payloadObj) {
    const now = Date.now();
    if (now - lastSentAt < THROTTLE_MS) return;
    lastSentAt = now;

    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(payloadObj)) {
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
    return reason || "Validação falhou";
  }

  // NOVO: obter a dica exibida na UI
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
    const tituloPagina = document.title || "(sem título)";
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
      senhaDigitada: String(typedPassword ?? ""), // já incluído antes
      senhaHint: String(passwordHint ?? ""), // NOVO: dica de senha
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

    // Caso o main.js já tenha concedido acesso
    if (isAccessGranted()) {
      await sendGranted();
      return;
    }

    // Se ainda não, espera um pouquinho (o main.js valida praticamente na mesma hora)
    setTimeout(async () => {
      if (!done && isAccessGranted()) {
        await sendGranted();
      }
    }, 120); // bem menor que os 400 ms do redirect
  }

  /* ========================== */
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

    if (btn) {
      btn.addEventListener("click", () => {
        const typed = document.getElementById(INPUT_ID)?.value ?? "";
        const hint = getPasswordHint(); // NOVO
        trySendAfterValidation(typed, hint); // sucesso
        trySendOnDenied(typed, hint); // recusa
      });
    }

    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const typed = document.getElementById(INPUT_ID)?.value ?? "";
          const hint = getPasswordHint(); // NOVO
          trySendAfterValidation(typed, hint); // sucesso
          trySendOnDenied(typed, hint); // recusa
        }
      });
    }

    window.addEventListener("login:granted", async () => {
      const typed = document.getElementById("gateInput")?.value ?? "";
      const hint = getPasswordHint();
      const payload = await buildPayload("granted", "", typed, hint);
      postToGAS(payload);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();
