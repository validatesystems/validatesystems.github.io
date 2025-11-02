// modal.js
// Web Component simples para modal de comentário — reutilizável em qualquer página

class CommentModal {
    constructor() {
        // cria backdrop e estrutura
        this.backdrop = document.createElement('div');
        this.backdrop.className = 'comment-modal-backdrop';
        this.backdrop.innerHTML = `
      <div class="comment-modal" role="dialog" aria-modal="true" aria-labelledby="cm-title">
        <header>
          <h3 id="cm-title">Enviar comentário</h3>
        </header>
        <div class="comment-meta" id="cm-meta"></div>
        <div class="comment-group">
          <label for="cm-text">Comentário</label>
          <textarea id="cm-text" class="comment-textarea" placeholder="Escreva aqui..."></textarea>
        </div>
        <div class="comment-actions">
          <span id="cm-sending" class="sending" style="display:none;">
            Enviando
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          </span>
          <button id="cm-cancel" class="btn btn-ghost">Cancelar</button>
          <button id="cm-send" class="btn btn-primary">Enviar</button>
        </div>
      </div>
    `;
        document.body.appendChild(this.backdrop);

        // binds
        this._esc = (e) => { if (e.key === 'Escape') this.close(); };
        this.backdrop.addEventListener('click', (e) => { if (e.target === this.backdrop) this.close(); });

        // refs
        this.meta = this.backdrop.querySelector('#cm-meta');
        this.ta = this.backdrop.querySelector('#cm-text');
        this.btnSend = this.backdrop.querySelector('#cm-send');
        this.btnCancel = this.backdrop.querySelector('#cm-cancel');
        this.sending = this.backdrop.querySelector('#cm-sending');

        this.btnCancel.addEventListener('click', () => this.close());
    }

    open({ title, meta, onSend }) {
        this.onSend = onSend;
        this.title = title || 'Comentário';
        this.meta.textContent = meta || '';
        this.ta.value = '';
        this.toggleSending(false);
        this.backdrop.dataset.open = '1';
        document.addEventListener('keydown', this._esc);

        // foco
        setTimeout(() => this.ta.focus(), 50);

        // click enviar
        this.btnSend.onclick = () => {
            const text = (this.ta.value || '').trim();
            if (!text) {
                this.ta.focus();
                this.ta.setSelectionRange(0, this.ta.value.length);
                return;
            }
            this.toggleSending(true);
            if (typeof this.onSend === 'function') this.onSend(text, {
                done: () => { this.toggleSending(false); this.close(); },
                stopSpinnerOnly: () => { this.toggleSending(false); }
            });
        };
    }

    close() {
        delete this.onSend;
        this.backdrop.dataset.open = '0';
        document.removeEventListener('keydown', this._esc);
    }

    toggleSending(on) {
        this.sending.style.display = on ? 'inline-flex' : 'none';
        this.btnSend.disabled = on;
        this.btnCancel.disabled = on;
    }
}

// Singleton global
window.__commentModal = window.__commentModal || new CommentModal();

// API simples
export function openCommentModal(opts) { window.__commentModal.open(opts); }
