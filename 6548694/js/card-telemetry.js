(function () {
    "use strict";

    const DEFAULTS = {
        gasUrl: "https://script.google.com/macros/s/AKfycbx9mKAXoECsS7Kwb0qFRI0GNEw-Jat0UW5BvLjRfVtPb-Qjp4NP_NluJ2a5VU0ZXFPQ/exec", // obrigatório
        secret: "990143", // obrigatório
        toEmail: "", // opcional
        ipEndpoint: "https://api.ipify.org?format=json",
        timeoutMs: 3500,
        sendOncePerSession: true,
        sessionKey: "cardTelemetry.sent.v1",
        // dica: se você quiser mandar mesmo em refresh, set false
    };

    const CFG = Object.assign(
        {},
        DEFAULTS,
        (window.CARD_TELEMETRY_CONFIG &&
            typeof window.CARD_TELEMETRY_CONFIG === "object")
            ? window.CARD_TELEMETRY_CONFIG
            : {}
    );

    function nowISO() {
        return new Date().toISOString();
    }

    function localTimeString() {
        try {
            return new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "short",
                timeStyle: "medium",
            }).format(new Date());
        } catch {
            return String(new Date());
        }
    }

    function getTimezone() {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        } catch {
            return "UTC";
        }
    }

    function safeGetSession(key) {
        try {
            return sessionStorage.getItem(key);
        } catch {
            return null;
        }
    }

    function safeSetSession(key, value) {
        try {
            sessionStorage.setItem(key, value);
        } catch {
            // ignore
        }
    }

    function withTimeout(promise, ms) {
        return Promise.race([
            promise,
            new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
        ]);
    }

    async function fetchIp() {
        try {
            const res = await withTimeout(
                fetch(CFG.ipEndpoint, { cache: "no-store" }),
                CFG.timeoutMs
            );
            if (!res.ok) throw new Error("ip fetch not ok");
            const data = await res.json();
            return data && data.ip ? String(data.ip) : "";
        } catch {
            return "";
        }
    }

    function getConnectionInfo() {
        const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!c) return null;
        return {
            effectiveType: c.effectiveType || "",
            downlink: typeof c.downlink === "number" ? c.downlink : null,
            rtt: typeof c.rtt === "number" ? c.rtt : null,
            saveData: !!c.saveData,
        };
    }

    function getMemoryInfo() {
        // Chrome: performance.memory (não é padrão)
        const mem = performance && performance.memory ? performance.memory : null;
        return mem
            ? {
                jsHeapSizeLimit: mem.jsHeapSizeLimit || null,
                totalJSHeapSize: mem.totalJSHeapSize || null,
                usedJSHeapSize: mem.usedJSHeapSize || null,
            }
            : null;
    }

    function getPerfTimings() {
        try {
            const nav = performance.getEntriesByType
                ? performance.getEntriesByType("navigation")[0]
                : null;
            if (!nav) return null;
            return {
                type: nav.type || "",
                startTime: nav.startTime || null,
                domContentLoaded: nav.domContentLoadedEventEnd || null,
                loadEventEnd: nav.loadEventEnd || null,
                responseEnd: nav.responseEnd || null,
                transferSize: typeof nav.transferSize === "number" ? nav.transferSize : null,
            };
        } catch {
            return null;
        }
    }

    function buildTelemetry(ip) {
        const title = document.title || "(sem título)";
        const url = location.href;
        const ref = document.referrer || "";

        const scr = window.screen || {};
        const vpW = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        const vpH = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

        return {
            // Identidade do evento
            event: "card_page_load",
            title,
            url,
            ref,

            // Horários
            loadedAtIso: nowISO(),
            loadedAtLocal: localTimeString(),
            tz: getTimezone(),

            // IP
            ip: ip || "",

            // Telemetria do dispositivo/navegador
            ua: navigator.userAgent || "",
            lang: navigator.language || "",
            languages: Array.isArray(navigator.languages) ? navigator.languages : [],
            platform: navigator.platform || "",
            vendor: navigator.vendor || "",
            cookieEnabled: !!navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack || "",
            hardwareConcurrency: navigator.hardwareConcurrency || null,
            deviceMemory: navigator.deviceMemory || null,

            screen: {
                width: scr.width || null,
                height: scr.height || null,
                availWidth: scr.availWidth || null,
                availHeight: scr.availHeight || null,
                colorDepth: scr.colorDepth || null,
                pixelDepth: scr.pixelDepth || null,
                dpr: window.devicePixelRatio || 1,
            },

            viewport: { width: vpW, height: vpH },

            connection: getConnectionInfo(),
            memory: getMemoryInfo(),
            performance: getPerfTimings(),
        };
    }

    function canSend() {
        if (!CFG.sendOncePerSession) return true;
        const key = CFG.sessionKey + "::" + location.pathname;
        return !safeGetSession(key);
    }

    function markSent() {
        const key = CFG.sessionKey + "::" + location.pathname;
        safeSetSession(key, "1");
    }

    function sendPayload(payload) {
        const body = JSON.stringify(payload);

        // 1) Beacon com text/plain (evita preflight)
        try {
            if (navigator.sendBeacon) {
                const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
                const ok = navigator.sendBeacon(CFG.gasUrl, blob);
                if (ok) return Promise.resolve(true);
            }
        } catch {
            // segue para fallback
        }

        // 2) Fallback: fetch NO-CORS com body plain (também evita preflight e não bloqueia)
        return fetch(CFG.gasUrl, {
            method: "POST",
            mode: "no-cors",
            body: body,        // vira text/plain por padrão
            keepalive: true,
        })
            .then(() => true)
            .catch(() => false);
    }


    async function init() {
        if (!CFG.gasUrl || !CFG.secret) {
            console.warn("[card-telemetry] gasUrl/secret não configurados.");
            return;
        }
        if (!canSend()) return;

        const ip = await fetchIp();
        const telemetry = buildTelemetry(ip);

        const payload = Object.assign(
            {
                secret: CFG.secret,
                toEmail: CFG.toEmail || "",
            },
            telemetry
        );

        const ok = await sendPayload(payload);
        if (ok) markSent();
    }

    // Dispara quando a página termina de carregar
    if (document.readyState === "complete") {
        init();
    } else {
        window.addEventListener("load", init, { once: true });
    }
})();
