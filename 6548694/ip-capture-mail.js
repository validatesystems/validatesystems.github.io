// (function () {
//     "use strict";

//     /* ==========================
//      * CONFIGURAÇÃO (edite aqui)
//      * ========================== */
//     const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwEJfhv2EzzDr3wZ0fCgNe-HHZV6f0VZqVw37O_gSAofFFk2QKeCWIdhVQVN-b5-6AzMQ/exec"; // <- sua URL /exec
//     const SECRET = "6548694"; // deve combinar com EXPECTED_SECRET no GAS

//     // Tag que o código existente usa para marcar acesso liberado
//     const ACCESS_TAG = "cardsAccess.v1"; // já é salvo via sessionStorage no seu HTML

//     // IDs dos elementos existentes (não altere HTML já feito)
//     const BTN_ID = "gateEnter";
//     const INPUT_ID = "gateInput";
//     const GATE_ID = "gate";
//     const GATE_ERR_ID = "gateErr";

//     // Anti-ruído: mínimo entre envios (ms)
//     const THROTTLE_MS = 1500;
//     let lastSentAt = 0;

//     /* ==========================
//      * Util: timeout para fetch
//      * ========================== */
//     function withTimeout(ms, promise) {
//         const t = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));
//         return Promise.race([promise, t]);
//     }

//     /* ==========================
//      * Captura de IP com fallbacks
//      * ========================== */
//     async function getPublicIP() {
//         if (getPublicIP._cache) return getPublicIP._cache;

//         const tries = [
//             () => withTimeout(3500, fetch("https://api.ipify.org?format=json", { cache: "no-store" }).then(r => r.json()).then(j => j.ip)),
//             () => withTimeout(3500, fetch("https://ifconfig.me/ip", { cache: "no-store" }).then(r => r.text()).then(t => t.trim())),
//             () => withTimeout(3500, fetch("https://api.my-ip.io/ip", { cache: "no-store" }).then(r => r.text()).then(t => t.trim())),
//         ];
//         for (const fn of tries) {
//             try {
//                 const ip = await fn();
//                 if (ip && typeof ip === "string") {
//                     getPublicIP._cache = ip;
//                     return ip;
//                 }
//             } catch (_) { /* tenta o próximo */ }
//         }
//         return "desconhecido";
//     }

//     /* ==========================
//      * Envio para o GAS (sem preflight)
//      * ========================== */
//     function postToGAS(payloadObj) {
//         const now = Date.now();
//         if (now - lastSentAt < THROTTLE_MS) return;
//         lastSentAt = now;

//         // application/x-www-form-urlencoded (simple request)
//         const params = new URLSearchParams();
//         for (const [k, v] of Object.entries(payloadObj)) {
//             params.append(k, typeof v === "string" ? v : JSON.stringify(v));
//         }

//         // 1) sendBeacon
//         try {
//             if (navigator.sendBeacon) {
//                 const blob = new Blob([params.toString()], {
//                     type: "application/x-www-form-urlencoded;charset=UTF-8",
//                 });
//                 const ok = navigator.sendBeacon(WEB_APP_URL, blob);
//                 if (ok) return;
//             }
//         } catch (_) { /* cai no fetch */ }

//         // 2) fetch sem preflight
//         fetch(WEB_APP_URL, {
//             method: "POST",
//             mode: "no-cors",
//             headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
//             body: params.toString(),
//             keepalive: true,
//         }).catch((err) => console.error("[ip-mail] fetch error:", err));
//     }

//     /* ==========================
//      * Motivo de recusa (sem coletar senha)
//      * ========================== */
//     function getRefusalReason() {
//         const errEl = document.getElementById(GATE_ERR_ID);
//         const input = document.getElementById(INPUT_ID);
//         let reason = (errEl?.textContent || "").trim();
//         if (!reason && (input?.classList?.contains("is-error") || input?.getAttribute("aria-invalid") === "true")) {
//             reason = "Senha incorreta";
//         }
//         return reason || "Validação falhou";
//     }

//     /* ==========================
//      * Monta o payload p/ email
//      * ========================== */
//     async function buildPayload(kind = "granted", reason = "") {
//         const ip = await getPublicIP();
//         const tituloPagina = document.title || "(sem título)";
//         const titulo = (kind === "granted" ? "Acesso liberado — " : "Acesso recusado — ") + tituloPagina;

//         const base = {
//             secret: SECRET,
//             titulo,
//             ts: new Date().toISOString(),
//             tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
//             ua: navigator.userAgent,
//             ref: document.referrer || location.href,
//             lang: navigator.language || "",
//             ip,
//             status: kind
//         };
//         if (kind === "denied") base.reason = reason;
//         return base;
//     }

//     /* ==========================
//      * Checa se acesso foi concedido
//      * ========================== */
//     function isAccessGranted() {
//         try {
//             const v = sessionStorage.getItem(ACCESS_TAG) || "";
//             if (v && v.startsWith("ok:")) return true;
//         } catch (_) { }
//         const gateEl = document.getElementById(GATE_ID);
//         return !!(gateEl && gateEl.classList.contains("hidden")) || false;
//     }

//     /* ==========================
//      * Fluxo: sucesso (como já existia)
//      * ========================== */
//     async function trySendAfterValidation() {
//         if (isAccessGranted()) {
//             const payload = await buildPayload("granted");
//             postToGAS(payload);
//             return;
//         }

//         const gateEl = document.getElementById(GATE_ID);
//         let done = false;
//         const sendGranted = async () => {
//             if (done) return;
//             done = true;
//             observer && observer.disconnect();
//             clearTimeout(timer);
//             const payload = await buildPayload("granted");
//             postToGAS(payload);
//         };

//         let observer = null;
//         if (gateEl) {
//             observer = new MutationObserver(() => {
//                 if (isAccessGranted()) sendGranted();
//             });
//             observer.observe(gateEl, { attributes: true, attributeFilter: ["class"] });
//         }

//         const timer = setTimeout(() => {
//             if (isAccessGranted()) sendGranted();
//             else observer && observer.disconnect();
//         }, 6000);
//     }

//     /* ==========================
//      * Novo: envio quando for recusado
//      * ========================== */
//     function trySendOnDenied() {
//         // pequeno atraso para deixar o script principal aplicar .is-error / gateErr
//         setTimeout(async () => {
//             if (!isAccessGranted()) {
//                 const reason = getRefusalReason();
//                 const payload = await buildPayload("denied", reason);
//                 postToGAS(payload);
//             }
//         }, 420);
//     }

//     /* ==========================
//      * Bind dos eventos solicitados
//      * ========================== */
//     function bind() {
//         const btn = document.getElementById(BTN_ID);
//         const input = document.getElementById(INPUT_ID);

//         if (btn) {
//             btn.addEventListener("click", () => {
//                 // O script original valida a senha aqui; nós escutamos os dois casos:
//                 trySendAfterValidation(); // sucesso
//                 trySendOnDenied();        // recusa
//             });
//         }

//         if (input) {
//             input.addEventListener("keydown", (e) => {
//                 if (e.key === "Enter") {
//                     trySendAfterValidation(); // sucesso
//                     trySendOnDenied();        // recusa
//                 }
//             });
//         }
//     }

//     if (document.readyState === "loading") {
//         document.addEventListener("DOMContentLoaded", bind, { once: true });
//     } else {
//         bind();
//     }
// })();


(function () {
    "use strict";

    /* ==========================
     * CONFIGURAÇÃO (edite aqui)
     * ========================== */
    const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwEJfhv2EzzDr3wZ0fCgNe-HHZV6f0VZqVw37O_gSAofFFk2QKeCWIdhVQVN-b5-6AzMQ/exec"; // <- sua URL /exec
    const SECRET = "6548694"; // deve combinar com EXPECTED_SECRET no GAS

    // Tags/IDs já usados no seu HTML
    const ACCESS_TAG = "cardsAccess.v1";
    const BTN_ID = "gateEnter";
    const INPUT_ID = "gateInput";
    const GATE_ID = "gate";
    const GATE_ERR_ID = "gateErr";
    const HINT_ID = "gateHint"; // <- NOVO: id do elemento que exibe a dica

    // Anti-ruído
    const THROTTLE_MS = 1500;
    let lastSentAt = 0;

    /* ========================== */
    function withTimeout(ms, promise) {
        const t = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));
        return Promise.race([promise, t]);
    }

    /* ========================== */
    // async function getPublicIP() {
    //     if (getPublicIP._cache) return getPublicIP._cache;
    //     const tries = [
    //         () => withTimeout(3500, fetch("https://api.ipify.org?format=json", { cache: "no-store" }).then(r => r.json()).then(j => j.ip)),
    //         () => withTimeout(3500, fetch("https://ifconfig.me/ip", { cache: "no-store" }).then(r => r.text()).then(t => t.trim())),
    //         () => withTimeout(3500, fetch("https://api.my-ip.io/ip", { cache: "no-store" }).then(r => r.text()).then(t => t.trim())),
    //     ];
    //     for (const fn of tries) {
    //         try {
    //             const ip = await fn();
    //             if (ip && typeof ip === "string") {
    //                 getPublicIP._cache = ip;
    //                 return ip;
    //             }
    //         } catch (_) { }
    //     }
    //     return "desconhecido";
    // }

    async function getPublicIP() {
        if (getPublicIP._cache) return getPublicIP._cache;

        const tries = [
            () => withTimeout(3500, fetch("https://api.ipify.org?format=json", { cache: "no-store" }).then(r => r.json()).then(j => j.ip)),
            () => withTimeout(3500, fetch("https://ifconfig.me/ip", { cache: "no-store" }).then(r => r.text()).then(t => t.trim())),
            () => withTimeout(3500, fetch("https://api.my-ip.io/ip", { cache: "no-store" }).then(r => r.text()).then(t => t.trim())),
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
            } catch (_) { /* tenta próximo */ }
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
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: params.toString(),
            keepalive: true,
        }).catch((err) => console.error("[ip-mail] fetch error:", err));
    }

    /* ========================== */
    function getRefusalReason() {
        const errEl = document.getElementById(GATE_ERR_ID);
        const input = document.getElementById(INPUT_ID);
        let reason = (errEl?.textContent || "").trim();
        if (!reason && (input?.classList?.contains("is-error") || input?.getAttribute("aria-invalid") === "true")) {
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
            hint = (input?.getAttribute("data-hint")
                || input?.getAttribute("placeholder")
                || input?.getAttribute("title")
                || ""
            ).toString().trim();
        }
        return hint || "";
    }

    /* ========================== */
    async function buildPayload(kind = "granted", reason = "", typedPassword = "", passwordHint = "") {
        const ip = await getPublicIP();
        const tituloPagina = document.title || "(sem título)";
        const titulo = (kind === "granted" ? "Acesso liberado — " : "Acesso recusado — ") + tituloPagina;

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
            senhaHint: String(passwordHint ?? "")       // NOVO: dica de senha
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

    /* ========================== */
    async function trySendAfterValidation(typedPassword, passwordHint) {
        if (isAccessGranted()) {
            const payload = await buildPayload("granted", "", typedPassword, passwordHint);
            postToGAS(payload);
            return;
        }

        const gateEl = document.getElementById(GATE_ID);
        let done = false;
        const sendGranted = async () => {
            if (done) return;
            done = true;
            observer && observer.disconnect();
            clearTimeout(timer);
            const payload = await buildPayload("granted", "", typedPassword, passwordHint);
            postToGAS(payload);
        };

        let observer = null;
        if (gateEl) {
            observer = new MutationObserver(() => {
                if (isAccessGranted()) sendGranted();
            });
            observer.observe(gateEl, { attributes: true, attributeFilter: ["class"] });
        }

        const timer = setTimeout(() => {
            if (isAccessGranted()) sendGranted();
            else observer && observer.disconnect();
        }, 6000);
    }

    /* ========================== */
    function trySendOnDenied(typedPassword, passwordHint) {
        setTimeout(async () => {
            if (!isAccessGranted()) {
                const reason = getRefusalReason();
                const payload = await buildPayload("denied", reason, typedPassword, passwordHint);
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
                const typed = (document.getElementById(INPUT_ID)?.value ?? "");
                const hint = getPasswordHint(); // NOVO
                trySendAfterValidation(typed, hint); // sucesso
                trySendOnDenied(typed, hint);        // recusa
            });
        }

        if (input) {
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    const typed = (document.getElementById(INPUT_ID)?.value ?? "");
                    const hint = getPasswordHint(); // NOVO
                    trySendAfterValidation(typed, hint); // sucesso
                    trySendOnDenied(typed, hint);        // recusa
                }
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bind, { once: true });
    } else {
        bind();
    }
})();
