(function () {
    "use strict";

    // === CONFIG ===
    const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbx4UONn2V8mf4jALjCstdm8-mioLJO4XOE0j9GBrYrnmFW7YPIs4VJPYGOKcwL5E5NJmw/exec";
    const SECRET = "990143";

    // Chaves de storage (já usadas no seu projeto)
    const READ_KEY = "cardsRead.v1";        // lista de hrefs lidos
    const CARDS_CACHE_KEY = "cardsCache.v1"; // cache leve dos cards (criado no cards-module.js)
    const SENT_KEY = "cardsUnread.sent.v1";  // dedupe (por sessão / tentativa)

    // attempt id que seu fluxo já usa (se existir)
    const ATTEMPT_ID_KEY = "cardsAccess.attemptId.v2";

    function safeJSONParse(v, fallback) {
        try {
            const j = JSON.parse(v);
            return j ?? fallback;
        } catch {
            return fallback;
        }
    }

    function getAttemptId() {
        try {
            return sessionStorage.getItem(ATTEMPT_ID_KEY) || "";
        } catch {
            return "";
        }
    }

    function getIPFast() {
        try {
            if (typeof window.getCachedIPFast === "function") return window.getCachedIPFast() || "desconhecido";
        } catch { }
        return "desconhecido";
    }

    function loadCardsFromLocalStorage() {
        const raw = localStorage.getItem(CARDS_CACHE_KEY) || "[]";
        const arr = safeJSONParse(raw, []);
        return Array.isArray(arr) ? arr : [];
    }

    function loadReadHrefs() {
        const raw = localStorage.getItem(READ_KEY) || "[]";
        const arr = safeJSONParse(raw, []);
        return Array.isArray(arr) ? arr : [];
    }

    function computeUnread() {
        const cards = loadCardsFromLocalStorage();
        const read = new Set(loadReadHrefs());
        const unread = cards.filter((c) => c && c.href && !read.has(c.href));

        // Ordena pelo publishedAt (mais antigo primeiro), se existir
        unread.sort((a, b) => {
            const da = Date.parse(a.publishedAt || "") || 0;
            const db = Date.parse(b.publishedAt || "") || 0;
            return da - db;
        });

        return unread.map((c) => ({
            title: c.title || "",
            sub: c.sub || "",
            desc: c.desc || "",
            href: c.href || "",
            publishedAt: c.publishedAt || "",
        }));
    }

    function encodeForm(obj) {
        const p = new URLSearchParams();
        Object.entries(obj || {}).forEach(([k, v]) => p.append(k, typeof v === "string" ? v : JSON.stringify(v)));
        return p.toString();
    }

    function trySend(payload) {
        const body = encodeForm(payload);

        // 1) sendBeacon
        try {
            if (navigator.sendBeacon) {
                const blob = new Blob([body], { type: "application/x-www-form-urlencoded;charset=UTF-8" });
                const ok = navigator.sendBeacon(WEB_APP_URL, blob);
                if (ok) return true;
            }
        } catch { }

        // 2) fetch keepalive (no-cors)
        try {
            fetch(WEB_APP_URL, {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
                body,
                keepalive: true,
            }).catch(() => { });
            return true; // fire-and-forget
        } catch { }

        return false;
    }

    function alreadySentForAttempt(attemptId) {
        try {
            const map = safeJSONParse(localStorage.getItem(SENT_KEY) || "{}", {});
            const key = attemptId || "noAttempt";
            return !!map[key];
        } catch {
            return false;
        }
    }

    function markSentForAttempt(attemptId) {
        try {
            const map = safeJSONParse(localStorage.getItem(SENT_KEY) || "{}", {});
            const key = attemptId || "noAttempt";
            map[key] = Date.now();
            localStorage.setItem(SENT_KEY, JSON.stringify(map));
        } catch { }
    }

    function sendUnreadCardsEmail(trigger) {
        const attemptId = getAttemptId();
        if (alreadySentForAttempt(attemptId)) return;

        const unread = computeUnread();

        const payload = {
            secret: SECRET,
            type: "unread_cards",
            trigger: trigger || "login:granted",
            attemptId: attemptId || "",
            ts: new Date().toISOString(),
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            ua: navigator.userAgent,
            ref: document.referrer || location.href,
            lang: navigator.language || "",
            ip: getIPFast(),
            unreadCount: String(unread.length),
            unreadCards: unread, // vai como JSON.stringified no encodeForm
        };

        // Marca antes para evitar duplicar em navegação rápida
        markSentForAttempt(attemptId);

        // Envia
        trySend(payload);
    }

    // Disparo do mesmo jeito do login: evento já emitido pelo seu main.js no grantAccess()
    // (você já faz: window.dispatchEvent(new Event("login:granted"));)
    window.addEventListener("login:granted", () => sendUnreadCardsEmail("login:granted"));

    // Opcional: se a página recarregar já com acesso e você quiser garantir 1 envio:
    // window.addEventListener("pageshow", () => sendUnreadCardsEmail("pageshow"));
})();
