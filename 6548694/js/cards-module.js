// --- Caminhos candidatos (ajuste se seu assets estiver noutro lugar) ---
const CARDS_CANDIDATES = [
  "./assets/cards.json",
  "/assets/cards.json",
  "../assets/cards.json",
  "cards.json",
];

async function loadJSON(candidates) {
  let lastErr = null;
  for (const url of candidates) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        console.debug(
          "[index] cards carregados de:",
          url,
          "total:",
          Array.isArray(data) ? data.length : 0
        );
        return data;
      } else {
        lastErr = new Error("HTTP " + r.status + " em " + url);
      }
    } catch (e) {
      lastErr = e;
    }
  }
  console.error("[index] falha ao carregar cards.json de", candidates, lastErr);
  throw new Error("Não foi possível carregar assets/cards.json");
}

// Expor cards globalmente + evento 'cards:ready'
async function ensureCards() {
  if (Array.isArray(window.cards) && window.cards.length) return window.cards;
  const data = await loadJSON(CARDS_CANDIDATES);
  window.cards = Array.isArray(data) ? data : [];
  document.dispatchEvent(
    new CustomEvent("cards:ready", {
      detail: { count: window.cards.length },
    })
  );
  return window.cards;
}

// Carregar ao iniciar
document.addEventListener("DOMContentLoaded", () => {
  ensureCards().catch((err) => console.error(err));
});

/* ===== Efeito visual ao clicar/tocar em um card ===== */
document.addEventListener("click", (ev) => {
  const card = ev.target.closest(".card");
  if (!card) return;

  // Remove classe anterior, se houver
  card.classList.remove("clicked");
  void card.offsetWidth; // força reflow

  // Adiciona classe para ativar a animação
  card.classList.add("clicked");

  // Remove a classe após o término da animação
  setTimeout(() => card.classList.remove("clicked"), 600);
});

/* ===== Ripple no ponto exato do clique/toque ===== */
document.addEventListener("pointerdown", (ev) => {
  const card = ev.target.closest(".card");
  if (!card) return;

  const rect = card.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;

  // injeta as coords do clique em variáveis CSS do card
  card.style.setProperty("--rx", x);
  card.style.setProperty("--ry", y);

  // reinicia a animação
  card.classList.remove("ripple");
  void card.offsetWidth; // força reflow
  card.classList.add("ripple");

  // limpa a classe ao final para futuras animações
  setTimeout(() => card.classList.remove("ripple"), 700);
});

(function () {
  const STORAGE_KEY = "cardsRead.v1";

  function loadReadArray() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      console.warn("[cardsRead seed] erro ao carregar:", e);
      return [];
    }
  }

  function saveReadArray(arr) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch (e) {
      console.warn("[cardsRead seed] erro ao salvar:", e);
    }
  }


  // #############################################################################################
  // #############################################################################################
  // ##################### MARCAR COMO LIDOS ####################################
  // #############################################################################################
  // #############################################################################################

  // Lista completa dos cards que devem ser marcados como lidos
  const PRE_READ_CARDS = [

  ].map((c) => c.href);

  // #############################################################################################
  // #############################################################################################
  // ##################### MARCAR COMO NAO LIDOS ####################################
  // #############################################################################################
  // #############################################################################################

  // Lista de cards que devem ser forçados a ficarem NÃO lidos
  const PRE_UNREAD_CARDS = [

  ];

  /* ===== Aplicar PRE_UNREAD_CARDS ===== */
  (function applyPreUnread() {
    if (!Array.isArray(PRE_UNREAD_CARDS) || PRE_UNREAD_CARDS.length === 0)
      return;

    const readArr = loadReadArray();

    PRE_UNREAD_CARDS.forEach((card) => {
      if (card && card.href) {
        const index = readArr.indexOf(card.href);
        if (index !== -1) {
          readArr.splice(index, 1); // remove da lista de lidos
        }
      }
    });

    saveReadArray(readArr);
  })();

  // Une o que já existia com esses "pre lidos"
  const existing = loadReadArray();
  const set = new Set([...existing, ...PRE_READ_CARDS]);
  const finalArray = [...set];

  saveReadArray(finalArray);

  // Se o script de rastreio já criou o Set global, sincroniza também
  if (window.__cardsRead instanceof Set) {
    PRE_READ_CARDS.forEach((href) => window.__cardsRead.add(href));
  }

  console.log(
    "[cardsRead seed] Cards marcados como lidos:",
    PRE_READ_CARDS.length
  );
})();

