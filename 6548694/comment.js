// comment.js (versão atualizada com sendBeacon e no-cors)
import { openCommentModal } from './modal.js';

const cfg = (window.COMMENT_CONFIG || {});
const GAS_ENDPOINT = cfg.GAS_ENDPOINT || '';
const SECRET = cfg.SECRET || '';

function getCardTitle() {
    const meta = document.querySelector('meta[name="card-title"]');
    return (meta && meta.content) || document.title || 'Card';
}

function getOS() {
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'Android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
    if (/Windows NT/i.test(ua)) return 'Windows';
    if (/Mac OS X/i.test(ua)) return 'macOS';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Desconhecido';
}

async function getPublicIP() {
    try {
        const r = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
        if (!r.ok) throw new Error('ipify fail');
        const j = await r.json();
        return j.ip || '';
    } catch {
        return '';
    }
}

// 🚀 Envio sem bloqueio CORS
async function sendToGAS(payload) {
    const body = JSON.stringify(payload);

    // 1) Tenta sendBeacon (sem CORS)
    if (navigator.sendBeacon) {
        try {
            const ok = navigator.sendBeacon(
                (GAS_ENDPOINT || '') + '?v=' + Date.now(),
                new Blob([body], { type: 'text/plain;charset=utf-8' })
            );
            if (ok) return true;
        } catch (_) { }
    }

    // 2) Fallback: fetch com no-cors (resposta opaca)
    try {
        await fetch((GAS_ENDPOINT || '') + '?v=' + Date.now(), {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body,
            redirect: 'follow',
            keepalive: true
        });
        return true;
    } catch {
        return false;
    }
}

function nowISO() {
    try {
        return new Date().toISOString();
    } catch {
        return '';
    }
}

function fmtMeta(tsISO) {
    try {
        const d = new Date(tsISO);
        const f = d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
        return f;
    } catch {
        return tsISO;
    }
}

function attachCommentButton() {
    const btn = document.getElementById('openComment');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        const title = getCardTitle();
        const ts = nowISO();
        const metaText = `Card: ${title} • ${fmtMeta(ts)}`;

        openCommentModal({
            title,
            meta: metaText,
            onSend: async (comment, { done, stopSpinnerOnly }) => {
                const [ip] = await Promise.all([getPublicIP()]);
                const payload = {
                    secret: SECRET,
                    ts,
                    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
                    title,
                    comment,
                    ip,
                    os: getOS(),
                    ua: navigator.userAgent || '',
                    location: location.href
                };

                const minWait = new Promise(res => setTimeout(res, 2000));
                let ok = false;
                try { ok = await sendToGAS(payload); } catch { }
                await minWait;

                if (ok) {
                    done();
                    toast('Comentário enviado. Obrigado!');
                    if (navigator.vibrate) navigator.vibrate([6, 20, 6]);
                } else {
                    stopSpinnerOnly();
                    toast('Falha ao enviar. Tente novamente.');
                }
            }
        });
    });
}

// Toast leve (reuso simples)
function toast(msg, ms = 1600) {
    let el = document.getElementById('__comment_toast');
    if (!el) {
        el = document.createElement('div');
        el.id = '__comment_toast';
        el.style.cssText = `
      position:fixed;left:50%;bottom:22px;transform:translateX(-50%) translateY(20px);
      background:rgba(20,24,45,.85);border:1px solid rgba(255,255,255,.1);color:#e8ecff;
      font-size:12px;padding:8px 12px;border-radius:999px;opacity:0;pointer-events:none;
      transition:opacity .2s ease, transform .2s ease;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.35);
    `;
        document.body.appendChild(el);
    }
    el.textContent = msg;
    requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateX(-50%) translateY(0)';
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateX(-50%) translateY(20px)';
        }, ms);
    });
}

attachCommentButton();
