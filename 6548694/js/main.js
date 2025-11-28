(async function loadCards() {
    try {
        const res = await fetch("./cards.json?ts=" + Date.now(), {
            cache: "no-store",
        });
        if (!res.ok) {
            console.error("Erro ao carregar cards.json:", res.status);
            return;
        }

        const data = await res.json();

        // se seu arquivo for um array direto:
        // window.cards = Array.isArray(data) ? data : [];

        // se for algo como { cards: [...] }:
        window.cards = Array.isArray(data)
            ? data
            : Array.isArray(data.cards)
                ? data.cards
                : [];

        // dispara o evento que o main.js já escuta
        document.dispatchEvent(new Event("cards:ready"));
    } catch (e) {
        console.error("Falha ao carregar cards.json:", e);
    }
})();


(function () {
    const $ = (s) => document.querySelector(s);

    /* ==================== CONFIGURE AQUI AS CHAVES ==================== */
    // const KEYS = [
    //   { id: "lua", pass: "LUA", hint: "Quando o mar dorme, quem brilha?" },
    //   { id: "vento", pass: "VENTO", hint: "Balança sua rede." },
    //   { id: "dj", pass: "SEREIA", hint: "DJ do mar" },
    //   { id: "mare", pass: "MARE", hint: "Sobe e desce sem pedir licença." },
    //   { id: "onda", pass: "ONDA", hint: "Chega, bagunça e vai." },
    // ];

    /* ======================   25/11/2025 - 06:48   ======================= */
    const KEYS = [
        { id: "dj", pass: "SEREIA", hint: "Encanta as águas" },
    ];
    /* ================================================================== */

    /* ===== Tema com persistência ===== */
    const THEME_KEY = "theme.mode";
    const themeParam = (
        new URL(location.href).searchParams.get("theme") || ""
    ).toLowerCase();
    const storedTheme = localStorage.getItem(THEME_KEY) || "";
    let currentTheme =
        themeParam === "eletrico"
            ? "eletrico"
            : themeParam === "acustico"
                ? "acustico"
                : storedTheme || "acustico";
    function applyTheme(mode) {
        document.body.classList.toggle("eletrico", mode === "eletrico");
        localStorage.setItem(THEME_KEY, mode);
        currentTheme = mode;

        const iconChar = mode === "eletrico" ? "🌙" : "🌤️";
        document
            .querySelectorAll(".theme-icon")
            .forEach((el) => (el.textContent = iconChar));
    }

    function toggleTheme() {
        applyTheme(currentTheme === "eletrico" ? "acustico" : "eletrico");
    }
    applyTheme(currentTheme);
    $("#toggleTheme")?.addEventListener("click", toggleTheme);

    /* ===== Gate (senha) ===== */
    const gate = $("#gate"),
        gateHint = $("#gateHint"),
        gateInput = $("#gateInput"),
        gateEnter = $("#gateEnter"),
        gateErr = $("#gateErr"),
        gateTheme = $("#gateTheme"),
        appRoot = $("#appRoot");

    // --- Força UPPERCASE sem mover o cursor ---
    gateInput?.addEventListener("input", (e) => {
        // limpa erro enquanto digita
        clearError();

        const el = e.target;
        const { selectionStart, selectionEnd } = el;
        const upper = (el.value || "").toUpperCase();
        if (upper !== el.value) {
            el.value = upper;
            // restaura a posição do cursor
            try {
                el.setSelectionRange(selectionStart, selectionEnd);
            } catch { }
        }
    });

    function pickKeyIndex() {
        return Math.floor(Math.random() * KEYS.length);
    }
    const keyParam = (
        new URL(location.href).searchParams.get("key") || ""
    ).toLowerCase();
    let currentKeyIndex = (() => {
        const i = KEYS.findIndex((k) => k.id.toLowerCase() === keyParam);
        return i >= 0 ? i : pickKeyIndex();
    })();
    let currentKey = KEYS[currentKeyIndex];
    function refreshHint() {
        gateHint.textContent = "Dica: " + (currentKey?.hint || "—");
    }

    const ACCESS_TAG = "cardsAccess.v1";
    function grantAccess() {
        try {
            sessionStorage.setItem(ACCESS_TAG, "ok:" + (currentKey?.id || ""));
        } catch { }
        hideGate();
    }
    function hasAccess() {
        try {
            const v = sessionStorage.getItem(ACCESS_TAG) || "";
            return v.startsWith("ok:");
        } catch {
            return false;
        }
    }

    function showGate() {
        document.body.classList.add("gate-open");
        gate.classList.remove("hidden");
        appRoot.setAttribute("aria-hidden", "true");
        refreshHint();
        setTimeout(() => gateInput?.focus(), 60);
    }
    function hideGate() {
        gate.classList.add("hidden");
        document.body.classList.remove("gate-open");
        appRoot.removeAttribute("aria-hidden");
    }

    function setError(msg) {
        gateErr.textContent = msg || "Senha incorreta 😅";
        const card = gate.querySelector(".gate-card");
        card.classList.remove("shake");
        void card.offsetWidth;
        card.classList.add("shake");
        gateInput?.classList.add("is-error");
        gateInput?.setAttribute("aria-invalid", "true");
    }
    function clearError() {
        gateErr.textContent = "";
        gateInput?.classList.remove("is-error");
        gateInput?.removeAttribute("aria-invalid");
    }
    function checkPass() {
        const v = (gateInput?.value || "").trim();
        if (!currentKey) return setError("Nenhuma chave ativa.");
        if (v === currentKey.pass) {
            grantAccess();
        } else setError("Ops, foi quase. Tenta de novo?");
    }

    if (hasAccess()) hideGate();
    else showGate();
    gateEnter?.addEventListener("click", checkPass);
    gateInput?.addEventListener("keyup", (e) => {
        if (e.key === "Enter") checkPass();
        else clearError();
    });
    gateInput?.addEventListener("input", clearError);
    gateTheme?.addEventListener("click", () => {
        toggleTheme();
        const card = gate.querySelector(".gate-card");
        card.classList.add("shake");
        setTimeout(() => card.classList.remove("shake"), 380);
        gateInput?.focus();
    });

    /* ===== Notificações (badge + modal) ===== */
    const notifBtn = $("#notifBtn"),
        notifBadge = $("#notifBadge");
    const notifBackdrop = $("#notifBackdrop"),
        notifList = $("#notifList"),
        notifClose = $("#notifClose");
    const fmtDate = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    function ymdLocal(d = new Date()) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${dd}`;
    }

    async function countTodayNotifications() {
        try {
            const res = await fetch("./notificacoes.json?ts=" + Date.now(), {
                cache: "no-store",
            });
            if (!res.ok) throw new Error("Falha ao carregar notificações");

            const data = await res.json();
            const items = Array.isArray(data)
                ? data
                : Array.isArray(data?.notificacoes)
                    ? data.notificacoes
                    : [];

            // ===== FILTRO: apenas notificações de HOJE e com horário <= AGORA =====
            const now = new Date();
            const y = now.getFullYear();
            const m = now.getMonth();
            const d = now.getDate();

            const filtered = items.filter((n) => {
                if (!n?.data) return false;
                const dt = new Date(n.data);
                if (isNaN(dt)) return false;
                const isSameDay =
                    dt.getFullYear() === y &&
                    dt.getMonth() === m &&
                    dt.getDate() === d;
                return isSameDay && dt <= now;
            });

            // retorna a quantidade filtrada
            return filtered.length;
        } catch (e) {
            return 0;
        }
    }

    async function refreshNotificationBadgeFromJSON() {
        const count = await countTodayNotifications();
        if (!notifBadge) return;
        if (count > 0) {
            notifBadge.textContent = count > 9 ? "9+" : String(count);
            notifBadge.style.display = "flex";
        } else {
            notifBadge.style.display = "none";
        }
    }

    function renderNotifications(items) {
        if (!items.length) {
            notifList.innerHTML = `<p class="notif-empty">Sem notificações por aqui.</p>`;
            return;
        }
        const frag = document.createDocumentFragment();
        items.forEach((n) => {
            const href = (n.href || "").trim();

            // Se há href, usa <a>; caso contrário, <article>
            const wrap = href
                ? document.createElement("a")
                : document.createElement("article");
            wrap.className = "notif-card";
            if (href) wrap.href = href;

            // Guardamos atributos para o rastreamento condicional
            wrap.setAttribute("data-title", n.titulo ?? "Sem título");
            wrap.setAttribute("data-href", href);

            const date = n.data ? new Date(n.data) : null;
            const pretty =
                date && !isNaN(date) ? fmtDate.format(date) : n.data || "";

            wrap.innerHTML = `
                <p class="notif-date">🗓️ ${pretty}</p>
                <h3 class="notif-item-title">${n.titulo ?? "Sem título"}</h3>
                <p class="notif-msg">${n.mensagem ?? ""}</p>
              `;

            frag.appendChild(wrap);
        });
        notifList.innerHTML = "";
        notifList.appendChild(frag);
    }

    async function openNotificationsModal() {
        notifBackdrop.classList.add("open");
        notifBackdrop.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        notifList.setAttribute("aria-busy", "true");
        notifList.innerHTML = '<p class="notif-empty">Carregando…</p>';

        try {
            const res = await fetch("./notificacoes.json?ts=" + Date.now(), {
                cache: "no-store",
            });
            if (!res.ok) throw new Error("Falha ao carregar notificações.");
            const data = await res.json();
            const items = Array.isArray(data)
                ? data
                : Array.isArray(data?.notificacoes)
                    ? data.notificacoes
                    : [];

            // ===== FILTRO: somente HOJE e horário <= AGORA (local) =====
            const now = new Date();
            const y = now.getFullYear();
            const m = now.getMonth();
            const d = now.getDate();

            const filtered = items.filter((n) => {
                if (!n?.data) return false;
                const dt = new Date(n.data);
                if (isNaN(dt)) return false;
                const isSameDay =
                    dt.getFullYear() === y &&
                    dt.getMonth() === m &&
                    dt.getDate() === d;
                return isSameDay && dt <= now;
            });

            // (opcional) ordenar por data/hora crescente
            filtered.sort((a, b) => new Date(b.data) - new Date(a.data));

            renderNotifications(filtered);
        } catch (err) {
            notifList.innerHTML = `
                <div class="notif-card">
                  <p class="notif-item-title">Não foi possível carregar</p>
                  <p class="notif-msg">Verifique se <code>./notificacoes.json</code> está acessível.</p>
                </div>
              `;
        } finally {
            notifList.setAttribute("aria-busy", "false");
            notifList.focus();
        }
    }

    function closeNotificationsModal() {
        notifBackdrop.classList.remove("open");
        notifBackdrop.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
        notifBtn?.focus();
    }

    notifBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        openNotificationsModal();
    });
    notifClose?.addEventListener("click", closeNotificationsModal);
    notifBackdrop?.addEventListener("click", (e) => {
        if (e.target === notifBackdrop) closeNotificationsModal();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && notifBackdrop.classList.contains("open"))
            closeNotificationsModal();
    });

    // Clique: navega só se houver href
    notifList.addEventListener("click", (e) => {
        const card = e.target.closest(".notif-card");
        if (!card) return;
        const href = card.dataset.href;
        if (href) {
            closeNotificationsModal();
            location.href = href;
        }
    });

    // Teclado: Enter ou Espaço disparam a navegação quando houver href
    notifList.addEventListener("keyup", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const card = e.target.closest(".notif-card");
        if (!card) return;
        const href = card.dataset.href;
        if (href) {
            closeNotificationsModal();
            location.href = href;
        }
    });

    refreshNotificationBadgeFromJSON();

    function localDateFromYYYYMMDD(s) {
        if (!s) return null;
        const only = s.slice(0, 10);
        const [y, m, d] = only.split("-").map(Number);
        if (!y || !m || !d) return null;
        return new Date(y, m - 1, d);
    }

    /* ===== Renderização dos cards + filtros (hoje / todos) ===== */
    (function setupCardsRendering() {
        const grid = document.getElementById("grid");
        const filterTodayBtn = document.getElementById("filterToday");
        const filterAllBtn = document.getElementById("filterAll");
        const filterUnreadBtn = document.getElementById("filterUnread");

        // Spans de contagem nos botões
        const countUnreadEl = document.getElementById("countUnread");
        const countTodayEl = document.getElementById("countToday");
        const countAllEl = document.getElementById("countAll");

        const fmt = new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });

        function parsePublishedAt(s) {
            if (!s) return null;
            const dt = new Date(s);
            if (!isNaN(dt)) return dt;
            const only = s.slice(0, 10);
            const [y, m, d] = only.split("-").map(Number);
            if (!y || !m || !d) return null;
            return new Date(y, m - 1, d);
        }

        function isToday(d, ref) {
            if (!d) return false;
            const r = ref || new Date();
            return (
                d.getFullYear() === r.getFullYear() &&
                d.getMonth() === r.getMonth() &&
                d.getDate() === r.getDate()
            );
        }

        let baseCards = [];
        let currentFilter = "today";

        // Atualiza a contagem dos filtros com base em baseCards e no horário atual
        function updateFilterCounts() {
            if (!Array.isArray(baseCards) || !baseCards.length) {
                if (countUnreadEl) countUnreadEl.textContent = "";
                if (countTodayEl) countTodayEl.textContent = "";
                if (countAllEl) countAllEl.textContent = "";
                return;
            }

            const now = new Date();

            // Todos os cards cujo horário já chegou
            const allCards = baseCards.filter((c) => c.__dt && c.__dt <= now);

            // Só de hoje (e já "no tempo")
            const todayCards = allCards.filter((c) => isToday(c.__dt, now));

            // Não lidos: já no tempo E não marcados como lidos
            let unreadCards = allCards;
            if (typeof window.isCardRead === "function") {
                unreadCards = allCards.filter((c) => !window.isCardRead(c.href));
            }

            if (countAllEl) {
                countAllEl.textContent = allCards.length
                    ? String(allCards.length)
                    : "";
            }
            if (countTodayEl) {
                countTodayEl.textContent = todayCards.length
                    ? String(todayCards.length)
                    : "";
            }
            if (countUnreadEl) {
                countUnreadEl.textContent = unreadCards.length
                    ? String(unreadCards.length)
                    : "";
            }
        }

        // Deixa acessível globalmente para outros scripts chamarem
        window.updateFilterCounts = updateFilterCounts;

        function createCardElement(c) {
            const a = document.createElement("article");
            a.className = "card";
            a.dataset.title = c.title;

            const d = c.__dt;
            const hoje = new Date();

            // Destaque agora é para "não lidos"
            if (typeof window.isCardRead === "function") {
                if (!window.isCardRead(c.href)) {
                    a.classList.add("card-hoje");
                }
            } else {
                // fallback: se por algum motivo o rastreador não estiver disponível,
                // ainda dá para usar o destaque antigo (opcional)
                if (isToday(d, hoje)) {
                    a.classList.add("card-hoje");
                }
            }

            const dateHtml = `
          <div class="card-meta">
            <span class="card-date" title="Data de publicação">
              <span aria-hidden="true">🗓️</span>
              <span>${fmt.format(d)}</span>
            </span>
          </div>
        `;

            a.innerHTML = `
          <div class="card-head">
            <div class="art" aria-hidden="true">${c.emoji}</div>
            <div>
              <h3 class="card-title">${c.title}</h3>
              <p class="card-sub">${c.sub}</p>
              ${dateHtml}
            </div>
          </div>
          <div class="card-body">${c.desc}</div>
        `;

            const statusTag = document.createElement("span");
            statusTag.className = "card-status-tag";

            // define o texto inicial
            if (
                typeof window.isCardRead === "function" &&
                window.isCardRead(c.href)
            ) {
                statusTag.textContent = "Lido";
                statusTag.classList.add("lido");
            } else {
                statusTag.textContent = "Não lido";
                statusTag.classList.add("nao-lido");
            }
            a.appendChild(statusTag);

            a.tabIndex = 0;
            a.addEventListener("click", (e) => {
                const isButton = e.target.closest("a,button");
                if (!isButton) location.href = c.href;
            });
            a.addEventListener("keyup", (e) => {
                if (e.key === "Enter" || e.key === " ") location.href = c.href;
            });

            return a;
        }

        function applyFilter(filter) {
            if (!grid) return;
            currentFilter = filter;

            // estado visual nos botões
            if (filterTodayBtn) {
                filterTodayBtn.classList.toggle("secondary", filter === "today");
                filterTodayBtn.classList.toggle("ghost", filter !== "today");
            }

            if (filterAllBtn) {
                filterAllBtn.classList.toggle("secondary", filter === "all");
                filterAllBtn.classList.toggle("ghost", filter !== "all");
            }

            if (filterUnreadBtn) {
                filterUnreadBtn.classList.toggle(
                    "secondary",
                    filter === "unread"
                );
                filterUnreadBtn.classList.toggle("ghost", filter !== "unread");
            }

            // efeito suave
            grid.classList.add("is-updating");

            setTimeout(() => {
                grid.innerHTML = "";

                let list = baseCards.slice();
                const now = new Date();

                if (filter === "today") {
                    list = list.filter((c) => {
                        return isToday(c.__dt, now) && c.__dt <= now;
                    });
                }

                if (filter === "all") {
                    list = list.filter((c) => c.__dt <= now);
                }

                // filtro "Não lidos"
                if (filter === "unread") {
                    const readSet =
                        window.__cardsRead instanceof Set
                            ? window.__cardsRead
                            : typeof window.getReadCards === "function"
                                ? new Set(window.getReadCards())
                                : new Set();

                    list = list.filter(
                        (c) => c.__dt <= now && !readSet.has(c.href)
                    );
                }

                // if (!list.length) {
                //   let msg = "Não há cards disponíveis neste momento.";

                //   if (filter === "today") {
                //     msg = "Não há cards publicados para hoje (por enquanto).";
                //   } else if (filter === "unread") {
                //     msg = "Não há cards não lidos. Olha você em dia com tudo!";
                //   }

                //   const p = document.createElement("p");
                //   p.className = "empty-grid-message";
                //   p.textContent = msg;
                //   grid.appendChild(p);
                // } else {
                //   list.forEach((c, index) => {
                //     const cardEl = createCardElement(c);
                //     cardEl.classList.add("fade-in");
                //     cardEl.style.animationDelay = index * 40 + "ms";
                //     grid.appendChild(cardEl);
                //   });
                // }

                if (!list.length) {
                    const msg =
                        filter === "today"
                            ? "Não há cards publicados para hoje (por enquanto)."
                            : "Não há cards disponíveis neste momento.";

                    const btn = document.createElement("button");
                    btn.type = "button";
                    // reaproveita o estilo de mensagem vazia + estilo de botão
                    btn.className = "btn secondary empty-grid-message";
                    btn.textContent = "🔄 Atualizar página";
                    // se quiser, mantém o texto antigo como tooltip
                    btn.title = msg;

                    btn.addEventListener("click", () => {
                        window.location.reload();
                    });

                    grid.appendChild(btn);
                } else {
                    list.forEach((c, index) => {
                        const cardEl = createCardElement(c);
                        cardEl.classList.add("fade-in");
                        cardEl.style.animationDelay = index * 40 + "ms";
                        grid.appendChild(cardEl);
                    });
                }

                setTimeout(() => {
                    grid.classList.remove("is-updating");
                }, 220);
            }, 180);
        }

        document.addEventListener("cards:ready", async () => {
            const cards = await (window.cards ? window.cards : []);
            const now = new Date();

            baseCards = cards
                .map((c) => ({ ...c, __dt: parsePublishedAt(c.publishedAt) }))
                .filter((c) => c.__dt) // ✅ só garante que a data é válida
                .sort((a, b) => b.__dt - a.__dt);

            // começa mostrando os cards de hoje
            applyFilter("today");
            updateFilterCounts();
        });

        filterTodayBtn?.addEventListener("click", () => applyFilter("today"));
        filterAllBtn?.addEventListener("click", () => applyFilter("all"));
        filterUnreadBtn?.addEventListener("click", () =>
            applyFilter("unread")
        );
    })();

    // render();

    /* ===== Rastreamento por título (envia para GAS) ===== */
    const EMAIL_WEBHOOK =
        "https://script.google.com/macros/s/AKfycbyrXFeRH7VrfjwdPRfyVkje4IwyhZxOhK4_Cw_xTcXF5eosIXQHdVglgUk7fj-934bDPg/exec"; // <<<<<<<<<<<<<< SUBSTITUA pela URL do seu Web App (exec)
    // "https://script.google.com/macros/s/AKfycbx1Saml2tXxfFm4MWzJXprDFdSe_44An5O48qZ_Jrq0uwU0LNIR-2K0ynS-UMsM83AyVA/exec"; // <<<<<<<<<<<<<< SUBSTITUA pela URL do seu Web App (exec)

    // Inicialização segura no escopo global (window)
    (function ensureThrottleVar() {
        if (typeof window.__lastSentAt !== "number") {
            window.__lastSentAt = 0;
        }
    })();

    /**
     * Envia telemetria de clique em card para Apps Script (sem preflight / OPTIONS)
     * - Usa sendBeacon (text/plain) quando disponível
     * - Fallback para fetch sem headers (evita preflight) com keepalive
     * - Anti-ruído: 1s entre envios (usa window.__lastSentAt)
     */
    function notifyCardClickByTitle(titulo) {
        const now = Date.now();
        if (now - window.__lastSentAt < 1000) return; // 1s de intervalo mínimo entre envios
        window.__lastSentAt = now;

        const payload = {
            titulo: titulo || "(sem título)",
            ts: new Date().toISOString(),
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            ua: navigator.userAgent,
            ref: document.referrer || location.href,
            lang: navigator.language || "",
        };

        const jsonStr = JSON.stringify(payload);
        console.log("[track] payload:", payload);

        // 1) sendBeacon com string/Uint8Array => Content-Type text/plain (sem preflight)
        let sent = false;
        try {
            if (navigator.sendBeacon) {
                const data = new TextEncoder().encode(jsonStr);
                sent = navigator.sendBeacon(EMAIL_WEBHOOK, data);
                console.log("[track] sendBeacon:", sent);
            }
        } catch (err) {
            console.warn("[track] sendBeacon error:", err);
        }

        // 2) Fallback fetch SEM headers (evita preflight); mantém keepalive
        if (!sent) {
            fetch(EMAIL_WEBHOOK, {
                method: "POST",
                body: jsonStr, // text/plain (sem headers) — GAS faz parse robusto
                keepalive: true,
                // mode: "no-cors" // opcional: se ativar, resposta será opaca (difícil de debugar)
            })
                .then(async (res) => {
                    try {
                        const text = await res.text();
                        console.log(
                            "[track] fetch status:",
                            res.status,
                            "body:",
                            text
                        );
                    } catch {
                        console.log(
                            "[track] fetch status:",
                            res.status,
                            "(sem corpo)"
                        );
                    }
                })
                .catch((err) => console.error("[track] fetch error:", err));
        }
    }

    document.addEventListener(
        "click",
        (ev) => {
            // 1) Clique vindo do modal de notificações?
            const notifEl = ev.target.closest(".notif-card");
            if (notifEl) {
                const href = (notifEl.getAttribute("data-href") || "").trim();
                if (!href) {
                    // Notificação sem página: não navega e não envia e-mail
                    return;
                }
                // Envia o mesmo e-mail dos cards da home
                const title =
                    notifEl.getAttribute("data-title") ||
                    notifEl
                        .querySelector(".notif-item-title")
                        ?.textContent?.trim() ||
                    "";
                if (title) notifyCardClickByTitle(title);
                // (navegação padrão acontece sozinha se for <a href="...">)
                return;
            }

            // 2) Demais cliques (cards da home etc.) mantêm o comportamento existente
            const el = ev.target.closest("[data-title],[data-card]");
            if (!el) return;
            const title =
                el.getAttribute("data-title") ||
                el.getAttribute("data-card") ||
                el.textContent?.trim();
            if (title) notifyCardClickByTitle(title);
        },
        { capture: true }
    );
})();

(function () {
    // Usa a mesma chave do seed (PRE_READ_CARDS)
    const STORAGE_KEY = "cardsRead.v1";

    function loadReadSet() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return new Set();
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return new Set();
            return new Set(arr);
        } catch (e) {
            console.warn("[cardsRead] erro ao carregar:", e);
            return new Set();
        }
    }

    function saveReadSet(set) {
        try {
            // salva como array simples de hrefs
            localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
        } catch (e) {
            console.warn("[cardsRead] erro ao salvar:", e);
        }
    }

    const readSet = loadReadSet();

    // Helpers globais
    window.__cardsRead = readSet;
    window.isCardRead = function (cardId) {
        return readSet.has(cardId);
    };
    window.getReadCards = function () {
        return Array.from(readSet);
    };

    // Mapeia um <article.card> para um ID (href)
    function getCardIdFromElement(el) {
        if (!el) return null;
        const title = el.dataset.title;
        if (!title || !Array.isArray(window.cards)) return null;

        const card = window.cards.find((c) => c.title === title);
        if (!card || !card.href) return null;

        return card.href;
    }

    function markCardAsReadFromElement(el) {
        const id = getCardIdFromElement(el);
        if (!id) return;

        if (!readSet.has(id)) {
            readSet.add(id);
            saveReadSet(readSet);
        }

        // visual: lido
        el.classList.add("card-lido");
        el.classList.remove("card-hoje");

        const tag = el.querySelector(".card-status-tag");
        if (tag) {
            tag.textContent = "Lido";
            tag.classList.remove("nao-lido");
            tag.classList.add("lido");
        }

        // se você estiver usando contadores nos botões:
        if (typeof window.updateFilterCounts === "function") {
            window.updateFilterCounts();
        }
        // Atualiza os números dos filtros (se a função existir)
        if (typeof window.updateFilterCounts === "function") {
            window.updateFilterCounts();
        }
    }

    function syncVisualReadState() {
        const cardsEls = document.querySelectorAll(".card[data-title]");

        // aplica classe visual de lido
        cardsEls.forEach((el) => {
            const id = getCardIdFromElement(el);
            if (id && readSet.has(id)) {
                el.classList.add("card-lido");
                el.classList.remove("card-hoje");
            }
        });

        // ajusta tag "Lido / Não lido"
        cardsEls.forEach((el) => {
            const id = getCardIdFromElement(el);
            const tag = el.querySelector(".card-status-tag");
            if (!tag) return;

            if (id && window.isCardRead(id)) {
                tag.textContent = "Lido";
                tag.classList.remove("nao-lido");
                tag.classList.add("lido");
            } else {
                tag.textContent = "Não lido";
                tag.classList.remove("lido");
                tag.classList.add("nao-lido");
            }
        });
    }

    // Quando os cards forem carregados pela primeira vez
    document.addEventListener("cards:ready", () => {
        setTimeout(() => {
            syncVisualReadState();
            if (typeof window.updateFilterCounts === "function") {
                window.updateFilterCounts();
            }
        }, 250);
    });

    // Quando mudar o filtro (Hoje / Todos / Não lidos)
    const filterTodayBtn = document.getElementById("filterToday");
    const filterAllBtn = document.getElementById("filterAll");
    const filterUnreadBtn = document.getElementById("filterUnread");

    [filterTodayBtn, filterAllBtn, filterUnreadBtn].forEach((btn) => {
        if (!btn) return;
        btn.addEventListener("click", () => {
            setTimeout(syncVisualReadState, 260);
        });
    });

    // Qualquer clique em card marca como lido
    document.addEventListener(
        "click",
        (ev) => {
            const cardEl = ev.target.closest(".card[data-title]");
            if (!cardEl) return;
            markCardAsReadFromElement(cardEl);
        },
        { capture: true }
    );
})();


document.addEventListener("cards:ready", () => {
    const totalCards = window.cards || [];

    // Lidos (LocalStorage)
    const readStr = localStorage.getItem("cardsRead") || "[]";
    let readArr = [];
    try {
        readArr = JSON.parse(readStr);
    } catch (e) { }

    // Quantidade Não Lidos
    const notReadCount = totalCards.filter(
        (c) => !readArr.includes(c.href)
    ).length;

    // Só de Hoje
    const now = new Date();
    const isToday = (d) =>
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();

    const todayCount = totalCards.filter((c) => {
        const dt = c.__dt instanceof Date ? c.__dt : new Date(c.publishedAt);
        return isToday(dt) && dt <= now;
    }).length;

    // Todos disponíveis (até agora)
    const allAvailableCount = totalCards.filter((c) => {
        const dt = c.__dt instanceof Date ? c.__dt : new Date(c.publishedAt);
        return dt <= now;
    }).length;

    // Atualizar botões
    const btnUnread = document.querySelector("#filterUnread span");
    const btnToday = document.querySelector("#filterToday span");
    const btnAll = document.querySelector("#filterAll span");

    // if (btnUnread) btnUnread.textContent = `Não lido (${notReadCount})`;
    // if (btnToday) btnToday.textContent = `Só de hoje (${todayCount})`;
    // if (btnAll)
    //   btnAll.textContent = `Todos os cards (${allAvailableCount})`;
});


window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
        window.location.reload();
    }

});
