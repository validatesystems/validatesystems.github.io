(function () {
    "use strict";

    // ==========================
    // CONFIGURAÇÃO
    // ==========================

    // Link para onde deve redirecionar quando a página "expirar"
    const REDIRECT_URL = "https://validatesystems.github.io/6548694/index.html";

    // Quantos minutos até "expirar" o acesso direto / histórico
    const EXPIRATION_MINUTES = 5;

    // Prefixo para a chave no localStorage
    const ACCESS_KEY_PREFIX = "cleia_page_access_";

    // ==========================
    // FUNÇÕES INTERNAS
    // ==========================

    // Gera uma chave única por página
    function getPageKey() {
        const pageIdAttr = document.documentElement.getAttribute("data-page-id");
        const pageId =
            pageIdAttr && pageIdAttr.trim().length > 0
                ? pageIdAttr.trim()
                : window.location.pathname || "default";

        return ACCESS_KEY_PREFIX + pageId;
    }

    // Verifica se esse acesso veio de OUTRA página do mesmo site
    // Se veio de outra página, vamos considerar "acesso novo" e renovar o horário
    function isNewVisitFromOtherPage() {
        try {
            const ref = document.referrer;
            if (!ref) return false;

            // Mesma origem (mesmo domínio / protocolo / porta)
            const sameOrigin = ref.startsWith(window.location.origin);
            if (!sameOrigin) return false;

            // URL atual "base" (origem + caminho)
            const currentUrlBase = window.location.origin + window.location.pathname;

            // Se o referrer for exatamente a mesma página, não conta como "outra página"
            if (ref.indexOf(window.location.pathname) !== -1) {
                // referrer contém o mesmo path da página atual
                return false;
            }

            // Se chegou até aqui, é outra página do mesmo site
            return true;
        } catch (err) {
            return false;
        }
    }

    function handleAccess() {
        if (!REDIRECT_URL || typeof REDIRECT_URL !== "string") {
            // Se esquecer de configurar, não faz nada
            return;
        }

        const key = getPageKey();
        const now = Date.now();
        const thresholdMs = EXPIRATION_MINUTES * 60 * 1000;

        try {
            const raw = localStorage.getItem(key);

            // 1) Se veio de outra página do mesmo site, sempre renova o horário e libera o acesso
            if (isNewVisitFromOtherPage()) {
                localStorage.setItem(key, String(now));
                return;
            }

            // 2) Primeiro acesso em qualquer contexto: grava o horário e libera
            if (!raw) {
                localStorage.setItem(key, String(now));
                return;
            }

            const lastAccess = parseInt(raw, 10);

            // 3) Se o valor estiver quebrado, reseta
            if (Number.isNaN(lastAccess)) {
                localStorage.setItem(key, String(now));
                return;
            }

            const diffMs = now - lastAccess;

            // 4) Se passou do tempo limite e NÃO veio de outra página → redireciona
            if (diffMs >= thresholdMs) {
                window.location.replace(REDIRECT_URL);
                return;
            }

            // 5) Ainda dentro dos 5 minutos: apenas atualiza o horário
            localStorage.setItem(key, String(now));
        } catch (err) {
            // Se der erro no localStorage, não quebra a página
            console.error("Erro ao acessar localStorage na proteção de página:", err);
        }
    }

    // ==========================
    // INICIALIZAÇÃO
    // ==========================

    if (
        document.readyState === "complete" ||
        document.readyState === "interactive"
    ) {
        handleAccess();
    } else {
        document.addEventListener("DOMContentLoaded", handleAccess);
    }

    // Trata o caso de voltar do cache de navegação (botão Voltar)
    window.addEventListener("pageshow", function (event) {
        if (event.persisted) {
            handleAccess();
        }
    });
})();
