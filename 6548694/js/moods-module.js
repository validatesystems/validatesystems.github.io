const moodBtn = document.getElementById("openSentimentosBtn");
const moodModal = document.getElementById("moodModal");
const moodClose = document.getElementById("moodClose");
const moodListEl = document.getElementById("moodList");

/* ================================
 * 1) Catálogo de humores (com polaridade e “tags” de match)
 *    -> ajuste os ids/tags para bater com seu cards.json
 * ================================ */
const MOODS = [
    {
        id: "tranquilo",
        label: "Tranquila",
        polarity: "pos",
        tags: ["calmo", "sereno", "paz", "tranquilo", "leve"],
    },
    {
        id: "inspirado",
        label: "Inspirada",
        polarity: "pos",
        tags: [
            "inspirado",
            "criativo",
            "esperança",
            "brilho",
            "carinho",
            "humor do dia",
        ],
    },
    {
        id: "ironico",
        label: "Ironicamente bem",
        polarity: "pos",
        tags: ["ironico", "humor", "brincadeira"],
    },

    {
        id: "triste",
        label: "Triste",
        polarity: "neg",
        tags: ["triste", "melancolia", "down"],
    },
    {
        id: "cansado",
        label: "Cansada",
        polarity: "neg",
        tags: ["cansado", "exausto", "sem-energia"],
    },
    {
        id: "saudade",
        label: "Com saudade",
        polarity: "neg",
        tags: ["saudade", "falta", "nostalgia"],
    },
    {
        id: "ansioso",
        label: "Ansiosa",
        polarity: "neg",
        tags: ["ansioso", "tenso", "preocupado"],
    },
];

// Conjunto do que consideramos “negativo” para exibir quando o usuário escolhe um humor positivo
const NEGATIVE_TAGS = new Set([
    "triste",
    "melancolia",
    "down",
    "cansado",
    "exausto",
    "sem-energia",
    "saudade",
    "falta",
    "nostalgia",
    "ansioso",
    "tenso",
    "preocupado",
]);

/* ================================
 * 2) Banco de frases cômicas (“vou piorar isso kkkkk”)
 * ================================ */
const SENTENCE_BANK = {
    // Usuário escolheu humor NEGATIVO → mostrar cards relacionados ao mesmo sentimento (mesmas tags)
    negativeChoice: {
        generic: [
            "Ah, você está na bad? Então segura essa listinha… escolha um card 👀",
            "Triste? Perfeito! Vou piorar com elegância: selecione um card 😈",
            "Desânimo detectado. Abrindo o menu ‘drama com açúcar’. Escolha um card 🍬",
            "Clima nublado por aí? Então toma tempestade de cards ☔",
        ],
        byMood: {
            triste: [
                "Tristeza? Vamos de trilha sonora em dó menor. Pegue um card 🎻",
                "Modo chororô ativado. Escolha seu card com lencinho incluso 🧻",
            ],
            cansado: [
                "Cansaço? Tenho cards que cansam só de olhar. Escolha um 💤",
                "Exausto? Vou te dar tarefa: selecione um card 😴",
            ],
            saudade: [
                "Saudade? Prepare o coração e escolha um card 💌",
                "Sentiu falta? Olha a coleção de lembranças. Pegue um card 📬",
            ],
            ansioso: [
                "Ansiedade batendo? Então decide rápido: escolha um card ⏳",
                "Muitas abas abertas na mente? Abre mais uma: um card! 🧠",
            ],
        },
    },

    // Usuário escolheu humor POSITIVO → mostrar cards de sentimentos NEGATIVOS (surpresa)
    positiveChoice: {
        generic: [
            "Feliz? Pode ir tirando o cavalinho da chuva. Escolha um card 😏",
            "Animação detectada. Hora de jogar uma nuvem dramática: escolha um card 🌧️",
            "Rindo à toa? Segura essa lista tensa, escolhe um card 🙃",
            "Tudo lindo? Vamos testar sua fé. Pegue um card 😇",
        ],
    },
};

/* ================================
 * 3) Utilitários
 * ================================ */
const fmt = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
});

function parsePublishedAt(s) {
    if (!s) return null;
    const dt = new Date(s); // ISO com fuso
    if (!isNaN(dt)) return dt;
    const only = s.slice(0, 10); // YYYY-MM-DD => 00:00 local
    const [y, m, d] = only.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}

// Extrai tags de sentimento de um card (flexível aos seus campos)
function extractCardTags(card) {
    const raw =
        card?.moods ??
        card?.sentimentos ??
        card?.tags ??
        card?.keywords ??
        [];
    return (Array.isArray(raw) ? raw : [])
        .map(String)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getVisibleCards() {
    const now = new Date();
    return (window.cards || [])
        .map((c) => ({ ...c, __dt: parsePublishedAt(c.publishedAt) }))
        .filter((c) => c.__dt && c.__dt <= now);
}

function renderMoodHome() {
    const chips = `
      <div class="mood-chips">
        ${MOODS.map(
        (m) => `<button class="mood-btn" data-m="${m.id}">${m.label}</button>`
    ).join("")}
        <button class="mood-btn" data-m="aleatorio">🎲 Surpreenda-me</button>
      </div>
    `;

    moodListEl.innerHTML = `
      <p class="notif-empty">Escolha um humor abaixo ou deixe a sorte decidir.</p>
      ${chips}
      <div id="moodResult" class="notif-empty" style="margin-top:.25rem"></div>
      <div id="moodGrid" class="grid" aria-live="polite"></div>
    `;

    moodListEl.querySelectorAll(".mood-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.m;
            const mood =
                id === "aleatorio"
                    ? pick(MOODS)
                    : MOODS.find((m) => m.id === id) || MOODS[0];
            renderMoodResult(mood);
        });
    });
}

// Filtra por tags relacionadas (qualquer interseção)
function filterCardsByTags(targetTags) {
    const tt = new Set(targetTags.map((t) => t.toLowerCase()));
    return getVisibleCards().filter((c) => {
        const ct = extractCardTags(c);
        return ct.some((t) => tt.has(t));
    });
}

// Todos os cards com QUALQUER sentimento negativo
function filterCardsNegativeUniverse() {
    return getVisibleCards().filter((c) => {
        const ct = extractCardTags(c);
        return ct.some((t) => NEGATIVE_TAGS.has(t));
    });
}

function phraseForChoice(mood) {
    if (mood.polarity === "neg") {
        const key = mood.tags?.[0]; // usa a 1ª tag como "nome curto" do humor
        const bank = SENTENCE_BANK.negativeChoice;
        return pick(bank.byMood[key] || bank.generic);
    } else {
        return pick(SENTENCE_BANK.positiveChoice.generic);
    }
}

function cardsForChoice(mood) {
    if (mood.polarity === "neg") {
        // mostra somente os cards RELACIONADOS ao mesmo sentimento
        return filterCardsByTags(mood.tags);
    } else {
        // mostra cards com sentimentos NEGATIVOS (surpresa)
        return filterCardsNegativeUniverse();
    }
}

function renderCardList(cards) {
    const grid = document.getElementById("moodGrid");
    if (!cards.length) {
        grid.innerHTML = `
        <div class="notif-card">
          <p class="notif-item-title">Sem sugestões por aqui</p>
          <p class="notif-msg">Não encontrei cards compatíveis. Tente outro humor 😉</p>
        </div>`;
        return;
    }

    // Ordena por data desc e limita 12
    cards.sort((a, b) => b.__dt - a.__dt);
    const take = cards.slice(0, 12);

    grid.innerHTML = take
        .map(
            (c) => `
      <a class="card" href="${c.href}" data-title="${c.title}">
        <div class="card-head">
          <div class="art" aria-hidden="true">${c.emoji || "✨"}</div>
          <div>
            <h3 class="card-title">${c.title}</h3>
            <p class="card-sub">${c.sub || ""}</p>
            <div class="card-meta">
              <span class="card-date"><span aria-hidden="true">🗓️</span><span>${fmt.format(
                c.__dt
            )}</span></span>
            </div>
          </div>
        </div>
        <div class="card-body">${c.desc || ""}</div>
      </a>
    `
        )
        .join("");
}

function renderMoodResult(mood) {
    const phrase = phraseForChoice(mood);
    const list = cardsForChoice(mood);

    const result = document.getElementById("moodResult");
    result.textContent = phrase;

    renderCardList(list);

    // acessibilidade: foca no grid para leitura do leitor de tela
    requestAnimationFrame(() => {
        document.getElementById("moodGrid")?.focus?.();
    });
}

function openMood() {
    moodModal.classList.add("open");
    moodModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    renderMoodHome();
}

function closeMood() {
    moodModal.classList.remove("open");
    moodModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    moodBtn?.focus();
}

// Bindings
moodBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    openMood();
});
moodClose?.addEventListener("click", closeMood);
moodModal?.addEventListener("click", (e) => {
    if (e.target === moodModal) closeMood();
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && moodModal.classList.contains("open"))
        closeMood();
});
