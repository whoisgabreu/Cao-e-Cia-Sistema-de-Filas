/* ------------------------------------------------------------------
   Cão & Cia — Banho & Tosa
   Utilitários de interface compartilhados por todas as telas:
   ícones SVG, mascotes, teclado de PIN, toasts, navegação, helpers.
------------------------------------------------------------------ */
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ----------------------------------------------------------------
     Ícones (traço 2px, cantos arredondados, viewBox 24)
  ---------------------------------------------------------------- */
  const PAW = '<path fill="currentColor" stroke="none" d="M12 21.5c-3.6 0-6.2-2.3-6.2-5.2 0-2.2 1.9-3.4 3.2-5 1-1.3 1.7-2.4 3-2.4s2 1.1 3 2.4c1.3 1.6 3.2 2.8 3.2 5 0 2.9-2.6 5.2-6.2 5.2z"/><circle fill="currentColor" stroke="none" cx="4.3" cy="10.2" r="2.2"/><circle fill="currentColor" stroke="none" cx="19.7" cy="10.2" r="2.2"/><circle fill="currentColor" stroke="none" cx="8.4" cy="5" r="2.4"/><circle fill="currentColor" stroke="none" cx="15.6" cy="5" r="2.4"/>';

  const ICONS = {
    paw: PAW,
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.5 15.5M8.5 8.5 20 20"/>',
    bath: '<path d="M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M6 12V6a2 2 0 0 1 4 0"/><path d="M7 20l-1 2M17 20l1 2"/>',
    droplets: '<path d="M7 16.3a4 4 0 0 0 4-4c0-2.5-4-7-4-7s-4 4.5-4 7a4 4 0 0 0 4 4z"/><path d="M17 20.3a4 4 0 0 0 4-4c0-2.5-4-7-4-7s-4 4.5-4 7a4 4 0 0 0 4 4z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    timer: '<path d="M10 2h4M12 14l3-3"/><circle cx="12" cy="14" r="8"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 13.5a6 6 0 0 1 4 6.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.4 7.9 8 9 4.6-1.1 8-4.5 8-9V6z"/>',
    chart: '<path d="M5 20v-8M11 20V5M17 20v-6"/><path d="M3 20h18"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    tablet: '<rect x="4" y="2" width="16" height="20" rx="3"/><path d="M11 18h2"/>',
    layout: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M15 4v16"/>',
    volume: '<path d="M4 10v4h3l4 4V6L7 10z"/><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/>',
    volumeX: '<path d="M4 10v4h3l4 4V6L7 10z"/><path d="m16 9 5 5M21 9l-5 5"/>',
    car: '<path d="M3 16V9l2.5-4h9L17 9h4v7h-2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 17h6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    alert: '<path d="m10.3 4.3-7.6 13A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.7l-7.6-13a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    play: '<path fill="currentColor" stroke="none" d="M7 5v14l11-7z"/>',
    flag: '<path d="M5 21V4h11l-1.5 4L16 12H5"/>',
    bone: '<path d="M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z"/>',
    sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z"/>',
    hash: '<path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18"/>',
    home: '<path d="M3 11 12 3l9 8v10H3z"/><path d="M10 21v-6h4v6"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    backspace: '<path d="M21 5H8l-5 7 5 7h13a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="m18 9-6 6M12 9l6 6"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronRight: '<path d="m9 6 6 6-6 6"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    cloud: '<path d="M17.5 19H7a4 4 0 0 1-.7-7.9A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 10z"/>',
    heart: '<path d="M12 21s-7-4.6-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.4-9 9-9 9z"/>',
    eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.2-8.2M16 7l2 2M13 10l2 2"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/>',
    star: '<path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 3 1.1-6.2L3 9.7l6.2-.9z"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    externalLink: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    download: '<path d="M12 3v12M6 9l6 6 6-6"/><path d="M4 21h16"/>',
    sheet: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  };

  function icon(name, cls = "") {
    const body = ICONS[name] || ICONS.paw;
    return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  /* ----------------------------------------------------------------
     Mascotes cartoon (cachorro e gato)
  ---------------------------------------------------------------- */
  const EYES_OPEN = '<circle cx="47" cy="57" r="5.2" fill="#2F2A26"/><circle cx="73" cy="57" r="5.2" fill="#2F2A26"/><circle cx="49" cy="55" r="1.9" fill="#fff"/><circle cx="75" cy="55" r="1.9" fill="#fff"/>';
  const EYES_CLOSED = '<path d="M41 58q6 6 12 0M67 58q6 6 12 0" stroke="#2F2A26" stroke-width="3" fill="none" stroke-linecap="round"/>';
  const ZZZ = '<g class="zzz" font-family="Fredoka, Nunito, sans-serif" font-weight="600" fill="#038F9F"><text x="90" y="34" font-size="13" class="z1">z</text><text x="100" y="22" font-size="16" class="z2">z</text><text x="111" y="10" font-size="19" class="z3">Z</text></g>';

  function dog({ sleeping = false } = {}) {
    return `<svg class="mascot mascot-dog" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M31 40C15 42 9 70 22 84c8 9 18-2 17-18z" fill="#B8783F"/>
      <path d="M89 40c16 2 22 30 9 44-8 9-18-2-17-18z" fill="#B8783F"/>
      <circle cx="60" cy="63" r="36" fill="#E3A96B"/>
      <path d="M66 31a13 13 0 0 1 24 8 11 11 0 0 1-20 3z" fill="#B8783F" opacity=".85"/>
      <ellipse cx="60" cy="78" rx="19" ry="14" fill="#F7E4C8"/>
      ${sleeping ? EYES_CLOSED : EYES_OPEN}
      <path d="M53 70h14a2 2 0 0 1 1.5 3.3l-6.5 6a3 3 0 0 1-4 0l-6.5-6A2 2 0 0 1 53 70z" fill="#2F2A26"/>
      <path d="M60 79v4M51 84q9 7 18 0" stroke="#2F2A26" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      ${sleeping ? "" : '<path d="M55.5 85.5q4.5 8 9 0z" fill="#F08A97"/>'}
      <path d="M30 94q30 13 60 0v6q-30 13-60 0z" fill="#73B63A"/>
      <circle cx="60" cy="104" r="4" fill="#F4C542"/>
      ${sleeping ? ZZZ : ""}
    </svg>`;
  }

  function cat({ sleeping = false } = {}) {
    return `<svg class="mascot mascot-cat" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M30 54 24 18l30 19z" fill="#8F9BA8"/>
      <path d="M90 54l6-36-30 19z" fill="#8F9BA8"/>
      <path d="M34 47l-3-19 17 11z" fill="#F4B6C2"/>
      <path d="M86 47l3-19-17 11z" fill="#F4B6C2"/>
      <circle cx="60" cy="65" r="34" fill="#B4BFCB"/>
      <path d="M52 36q8-6 16 0M56 31q4-3 8 0" stroke="#8F9BA8" stroke-width="3" fill="none" stroke-linecap="round"/>
      ${sleeping ? EYES_CLOSED : EYES_OPEN.replace(/r="5.2"/g, 'r="5.4"')}
      <path d="M56 71h8l-4 4.5z" fill="#F08A97"/>
      <path d="M60 75.5q-4 5-8 2M60 75.5q4 5 8 2" stroke="#2F2A26" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M22 67h16M23 74h15M82 67h16M82 74h15" stroke="#2F2A26" stroke-width="1.8" stroke-linecap="round" opacity=".5"/>
      <path d="M32 93q28 12 56 0v6q-28 12-56 0z" fill="#038F9F"/>
      <circle cx="60" cy="102" r="3.6" fill="#F4C542"/>
      ${sleeping ? ZZZ : ""}
    </svg>`;
  }

  function mascot(kind = "dog") {
    switch (kind) {
      case "cat": return cat();
      case "catSleep": return cat({ sleeping: true });
      case "dogSleep": return dog({ sleeping: true });
      default: return dog();
    }
  }

  /* ----------------------------------------------------------------
     Helpers
  ---------------------------------------------------------------- */
  function escapeHtml(text) {
    if (text == null) return "";
    return String(text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fmtTime(dt) {
    if (!dt) return "";
    return String(dt).slice(11, 16);
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  /** Timestamps do SQLite (datetime('now')) chegam em UTC sem sufixo. */
  function parseUTC(s) {
    if (!s) return null;
    const iso = String(s).replace(" ", "T");
    return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  }

  function fmtLocalTime(utc) {
    const d = parseUTC(utc);
    if (!d || isNaN(d)) return "";
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function fmtLocalDateTime(utc) {
    const d = parseUTC(utc);
    if (!d || isNaN(d)) return "-";
    return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  }

  function elapsedMin(utc) {
    const d = parseUTC(utc);
    if (!d || isNaN(d)) return null;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  }

  function fmtElapsed(min) {
    if (min == null) return "";
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h ${String(m).padStart(2, "0")}`;
  }

  /** "GIOVANA (1)+ / EDSON DE SOUZA" -> "Giovana (1)+ / Edson de Souza" */
  const SMALL_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "di", "du", "del", "della", "von", "van"]);
  function titleCase(s) {
    if (s == null) return "";
    return String(s).trim().toLowerCase().split(/\s+/).map((w, i) => {
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      return w.replace(/(^|[(\/\-])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());
    }).join(" ");
  }

  function plural(n, singular, pluralWord) {
    return `${n} ${n === 1 ? singular : pluralWord}`;
  }

  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function initials(name) {
    const clean = String(name || "").trim();
    if (!clean) return "?";
    return clean[0].toUpperCase();
  }

  /** Avatar colorido por nome (cor estável): patinha para pets, ícone de pessoa para atendentes. */
  function avatar(name, cls = "") {
    const hue = hashStr(String(name || "pet")) % 360;
    const inner = /\bperson\b/.test(cls) ? icon("user") : icon("paw");
    return `<span class="avatar ${cls}" style="--hue:${hue}">${inner}</span>`;
  }

  /* ----------------------------------------------------------------
     Observações: linhas/trechos marcados com * viram negrito.
     "**SOMENTE LAÇO"  -> <b>SOMENTE LAÇO</b>
     "PODE TUDO****"   -> <b>PODE TUDO</b>
     "aviso *cuidado* ok" -> aviso <b>cuidado</b> ok
  ---------------------------------------------------------------- */
  function formatObs(text) {
    if (text == null) return "";
    return String(text).replace(/\r/g, "").split("\n").map((raw) => {
      const line = raw.trim();
      if (!line) return "";
      const runs = (line.match(/\*+/g) || []).length;
      if (runs === 0) return escapeHtml(line);
      const clean = line.replace(/\*+/g, "*").trim();
      if (runs === 1 || /^\*/.test(clean) && /\*$/.test(clean) && clean.split("*").length === 3) {
        const t = clean.replace(/\*/g, "").trim();
        return t ? `<b>${escapeHtml(t)}</b>` : "";
      }
      // alterna normal / negrito entre os marcadores
      return clean.split("*").map((seg, i) => {
        const t = escapeHtml(seg);
        if (!seg.trim()) return t;
        return i % 2 === 1 ? `<b>${t}</b>` : t;
      }).join("");
    }).filter((l, i, arr) => l !== "" || (i > 0 && i < arr.length - 1 && arr[i - 1] !== ""))
      .filter((l, i, arr) => !(l === "" && (i === 0 || i === arr.length - 1)))
      .join("<br>");
  }

  const TRANSPORT = {
    L: "Buscar e entregar",
    B: "Buscar",
    E: "Tutor leva e entrega",
    C: "Tutor leva e busca",
    D: "Atendimento domicílio",
    S: "Entregar",
  };

  /** Blocos de observação (estética + animal) de um item da fila. */
  function notes(item) {
    const out = [];
    if (item.obs_estetica) out.push(`<div class="note">${icon("alert")}<span>${formatObs(item.obs_estetica)}</span></div>`);
    if (item.obs_animal) out.push(`<div class="note animal">${icon("info")}<span>${formatObs(item.obs_animal)}</span></div>`);
    return out.join("");
  }

  function serviceChips(item) {
    const list = item.services || [];
    return list.map((s) => {
      const name = typeof s === "string" ? s : (s.nom_prod_serv || (s.cod_prod_serv != null ? `#${s.cod_prod_serv}` : ""));
      return `<span class="chip service" title="${escapeHtml(name)}">${icon("scissors")}<span>${escapeHtml(titleCase(name))}</span></span>`;
    }).join("");
  }

  function infoChips(item) {
    const chips = [];
    if (item.dat_evento) chips.push(`<span class="chip time">${icon("clock")}<span>${fmtTime(item.dat_evento)}</span></span>`);
    if (item.num_identificacao) chips.push(`<span class="chip id">${icon("hash")}<span>${escapeHtml(item.num_identificacao)}</span></span>`);
    const transport = item.tip_transporte ? TRANSPORT[item.tip_transporte] : "";
    if (transport) chips.push(`<span class="chip transport">${icon("car")}<span>${escapeHtml(transport)}</span></span>`);
    return chips.join("");
  }

  /** Modal informativo simples (título, corpo em HTML, botão de ok). */
  function infoModal({ title, subtitle = "", bodyHTML = "", okLabel = "Entendi", cancelLabel = "", tone = "green", iconName = "paw" }) {
    const okCls = tone === "green" ? "btn-primary" : tone === "amber" ? "btn-amber" : "btn-teal";
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.innerHTML = `
        <div class="modal modal-wide" role="dialog" aria-modal="true">
          <button class="modal-close" type="button" aria-label="Fechar">${icon("x")}</button>
          <div class="modal-head">
            <div class="modal-icon ${tone}">${icon(iconName)}</div>
            <h2>${escapeHtml(title)}</h2>
            ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
          </div>
          <div class="modal-body">${bodyHTML}</div>
          <button type="button" class="btn ${okCls} btn-lg btn-block ok" style="margin-top:16px">${escapeHtml(okLabel)}</button>
          ${cancelLabel ? `<button type="button" class="btn btn-ghost btn-block cancel">${escapeHtml(cancelLabel)}</button>` : ""}
        </div>`;
      document.body.appendChild(overlay);
      const close = (value) => {
        document.removeEventListener("keydown", onKey);
        overlay.classList.add("closing");
        setTimeout(() => overlay.remove(), 150);
        resolve(value);
      };
      const onKey = (e) => { if (e.key === "Escape") close(false); if (e.key === "Enter") close(true); };
      document.addEventListener("keydown", onKey);
      $(".ok", overlay).onclick = () => close(true);
      const cancelBtn = $(".cancel", overlay);
      if (cancelBtn) cancelBtn.onclick = () => close(false);
      $(".modal-close", overlay).onclick = () => close(false);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
      requestAnimationFrame(() => overlay.classList.add("open"));
    });
  }

  /* ----------------------------------------------------------------
     API
  ---------------------------------------------------------------- */
  async function api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    let res;
    try {
      res = await fetch(path, { ...options, headers });
    } catch (e) {
      throw new Error("Sem conexão com o servidor.");
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Sessão expirada/ausente → volta para o login.
      if (res.status === 401 && body.detail === "Não autorizado") {
        if (location.pathname !== LOGIN_PATH) window.location.href = LOGIN_PATH;
        throw new Error("Sessão expirada.");
      }
      const msg = body.detail || body.message || `Erro ${res.status}`;
      const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      err.status = res.status;
      throw err;
    }
    return body.data;
  }

  /* ----------------------------------------------------------------
     Toast
  ---------------------------------------------------------------- */
  let toastTimer = null;
  function toast(message, type = "info") {
    let el = $("#toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    const ic = type === "success" ? "checkCircle" : type === "error" ? "alert" : "info";
    el.className = `toast ${type}`;
    el.innerHTML = `${icon(ic)}<span>${escapeHtml(message)}</span>`;
    // força reflow para reanimar
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3800);
  }

  /* ----------------------------------------------------------------
     Modal de PIN com teclado numérico
  ---------------------------------------------------------------- */
  function pinModal({ title, subtitle = "", onOk, tone = "teal", iconName = "lock", maxLen = 6, minLen = 4 }) {
    return new Promise((resolve) => {
      let pin = "";
      let busy = false;

      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.innerHTML = `
        <div class="modal modal-pin" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
          <button class="modal-close" type="button" aria-label="Fechar">${icon("x")}</button>
          <div class="modal-head">
            <div class="modal-icon ${tone}">${icon(iconName)}</div>
            <h2>${escapeHtml(title)}</h2>
            ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
          </div>
          <div class="pin-dots" aria-live="polite"></div>
          <div class="modal-err" role="alert"></div>
          <div class="keypad">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => `<button type="button" class="key" data-key="${k}">${k}</button>`).join("")}
            <button type="button" class="key del" data-key="del" aria-label="Apagar">${icon("backspace")}</button>
            <button type="button" class="key" data-key="0">0</button>
            <button type="button" class="key ok" data-key="ok" aria-label="Confirmar">${icon("check")}</button>
          </div>
          <button type="button" class="btn btn-ghost btn-block cancel">Cancelar</button>
        </div>`;
      document.body.appendChild(overlay);

      const dotsEl = $(".pin-dots", overlay);
      const errEl = $(".modal-err", overlay);
      const modalEl = $(".modal", overlay);

      const okKey = $(".key.ok", overlay);
      const renderDots = () => {
        const shown = Math.max(minLen, Math.min(maxLen, pin.length));
        dotsEl.innerHTML = Array.from({ length: shown }, (_, i) =>
          `<span class="pin-dot ${i < pin.length ? "filled" : ""}"></span>`).join("");
        okKey.classList.toggle("ready", pin.length >= minLen);
      };

      const close = (value) => {
        document.removeEventListener("keydown", onKey);
        overlay.classList.add("closing");
        setTimeout(() => overlay.remove(), 150);
        resolve(value);
      };

      const fail = (msg) => {
        errEl.textContent = msg;
        pin = "";
        renderDots();
        dotsEl.classList.remove("shake");
        void dotsEl.offsetWidth;
        dotsEl.classList.add("shake");
      };

      const submit = async () => {
        if (busy) return;
        if (pin.length < minLen) { fail(`PIN deve ter ${minLen} a ${maxLen} dígitos`); return; }
        busy = true;
        modalEl.classList.add("busy");
        try {
          const result = await onOk(pin);
          close(result === undefined ? true : result);
        } catch (e) {
          fail(e.message || "Não foi possível confirmar.");
        } finally {
          busy = false;
          modalEl.classList.remove("busy");
        }
      };

      const press = (key) => {
        if (busy) return;
        errEl.textContent = "";
        if (key === "del") {
          pin = pin.slice(0, -1);
          renderDots();
        } else if (key === "ok") {
          submit();
        } else if (pin.length < maxLen) {
          pin += key;
          renderDots();
        }
      };

      overlay.addEventListener("click", (e) => {
        const keyBtn = e.target.closest(".key");
        if (keyBtn) { keyBtn.blur(); press(keyBtn.dataset.key); return; }
        if (e.target.closest(".cancel") || e.target.closest(".modal-close")) { close(null); return; }
        if (e.target === overlay) close(null);
      });

      const onKey = (e) => {
        if (e.key.length === 1 && e.key >= "0" && e.key <= "9") { press(e.key); e.preventDefault(); }
        else if (e.key === "Backspace") { press("del"); e.preventDefault(); }
        else if (e.key === "Enter") { press("ok"); e.preventDefault(); }
        else if (e.key === " ") { e.preventDefault(); }
        else if (e.key === "Escape") { close(null); }
      };
      document.addEventListener("keydown", onKey);

      // Fecha teclado virtual de algum input que estivesse focado (ex.: busca)
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

      renderDots();
      requestAnimationFrame(() => overlay.classList.add("open"));
    });
  }

  /* ----------------------------------------------------------------
     Modal de confirmação (substitui window.confirm)
  ---------------------------------------------------------------- */
  /** Resolve false (cancelou), true (confirmou) ou { value } quando há campo `input`. */
  function confirmModal({ title, message = "", confirmLabel = "Confirmar", cancelLabel = "Cancelar", danger = false, iconName = "alert", input = null }) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-head">
            <div class="modal-icon ${danger ? "red" : "amber"}">${icon(iconName)}</div>
            <h2>${escapeHtml(title)}</h2>
            ${message ? `<p>${escapeHtml(message)}</p>` : ""}
          </div>
          ${input ? `<label class="field"><span>${escapeHtml(input.label || "")}</span><input type="${escapeHtml(input.type || "text")}" class="confirm-input" maxlength="${input.maxLength || 200}" placeholder="${escapeHtml(input.placeholder || "")}" autocomplete="${input.type === "password" ? "current-password" : "off"}"></label>` : ""}
          <div class="modal-err" role="alert"></div>
          <div class="modal-row">
            <button type="button" class="btn btn-ghost cancel">${escapeHtml(cancelLabel)}</button>
            <button type="button" class="btn ${danger ? "btn-danger solid" : "btn-primary"} ok">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const close = (v) => {
        document.removeEventListener("keydown", onKey);
        overlay.classList.add("closing");
        setTimeout(() => overlay.remove(), 150);
        resolve(v);
      };
      const inputEl = $(".confirm-input", overlay);
      const errEl = $(".modal-err", overlay);
      const ok = () => {
        if (!inputEl) return close(true);
        const value = inputEl.value.trim();
        if (input && input.required && !value) {
          errEl.textContent = input.requiredMessage || "Preencha este campo.";
          inputEl.classList.remove("shake");
          void inputEl.offsetWidth;
          inputEl.classList.add("shake");
          inputEl.focus();
          return;
        }
        close({ value });
      };
      const onKey = (e) => { if (e.key === "Escape") close(false); if (e.key === "Enter" && inputEl) ok(); };
      document.addEventListener("keydown", onKey);
      $(".ok", overlay).onclick = ok;
      $(".cancel", overlay).onclick = () => close(false);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
      requestAnimationFrame(() => { overlay.classList.add("open"); (inputEl || $(".ok", overlay)).focus(); });
    });
  }

  /* ----------------------------------------------------------------
     Navegação compartilhada (por papel)
  ---------------------------------------------------------------- */
  const NAV = [
    { href: "/", label: "Fila", icon: "layout", roles: ["recepcao", "admin"] },
    { href: "/atendente", label: "Tela Atendente", icon: "tablet", roles: ["atendente", "admin"] },
    { href: "/atendente-minimalista", label: "Tela Simples", icon: "zap", roles: ["atendente", "admin"] },
    { href: "/attendants", label: "Atendentes", icon: "users", roles: ["admin"] },
    { href: "/audit", label: "Auditoria", icon: "chart", roles: ["admin"] },
  ];

  const LOGIN_PATH = "/login";

  async function initNav() {
    const nav = $("#topnav");
    const toggle = $("#nav-toggle");
    let role = null;
    try {
      role = (await api("/api/me")).role;
    } catch (e) {
      if (location.pathname !== LOGIN_PATH) window.location.href = LOGIN_PATH;
      return;
    }
    if (nav) {
      const path = location.pathname.replace(/\/$/, "") || "/";
      const items = NAV.filter((n) => (n.roles || []).includes(role));
      nav.innerHTML = items.map((n) =>
        `<a href="${n.href}" class="nav-link ${n.href === path ? "active" : ""}">${icon(n.icon)}<span>${n.label}</span></a>`).join("")
        + `<a href="#" class="nav-link logout" id="nav-logout">${icon("logout")}<span>Sair</span></a>`;
      const logout = $("#nav-logout", nav);
      if (logout) {
        logout.onclick = async (ev) => {
          ev.preventDefault();
          try { await api("/api/logout", { method: "POST", body: "{}" }); } catch (e) { /* segue */ }
          window.location.href = LOGIN_PATH;
        };
      }
    }
    if (toggle && nav) {
      toggle.innerHTML = icon("menu");
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = nav.classList.toggle("open");
        toggle.innerHTML = icon(open ? "x" : "menu");
        toggle.setAttribute("aria-expanded", String(open));
      });
      document.addEventListener("click", (e) => {
        if (!nav.classList.contains("open")) return;
        if (e.target.closest("#topnav") || e.target.closest("#nav-toggle")) return;
        nav.classList.remove("open");
        toggle.innerHTML = icon("menu");
        toggle.setAttribute("aria-expanded", "false");
      });
    }
    // Ícones declarados via data-icon no HTML
    $$("[data-icon]").forEach((el) => {
      el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon));
    });
    $$("[data-mascot]").forEach((el) => {
      el.innerHTML = mascot(el.dataset.mascot);
    });
  }

  /** Indicador "ao vivo" no cabeçalho. */
  function setLive(state, text) {
    const el = $("#sync-status");
    if (!el) return;
    el.className = `live-pill ${state}`;
    el.innerHTML = `<span class="live-dot"></span><span>${escapeHtml(text)}</span>`;
  }

  /* ----------------------------------------------------------------
     Diff-render: reconcilia lista por chave (só altera o que mudou)
  ---------------------------------------------------------------- */
  function elFromHTML(html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = String(html).trim();
    return tpl.content.firstElementChild;
  }

  function reconcileList(container, items, keyFn, htmlFn, emptyFn) {
    if (!container) return;
    if (!items.length) {
      container.innerHTML = emptyFn ? emptyFn() : "";
      return;
    }
    Array.from(container.children).forEach((el) => {
      if (el.dataset.key == null || el.classList.contains("rec-leave")) el.remove();
    });
    const existing = new Map();
    Array.from(container.children).forEach((el) => existing.set(el.dataset.key, el));

    const next = [];
    items.forEach((item, index) => {
      const k = String(keyFn(item));
      const html = String(htmlFn(item, index));
      let el = existing.get(k);
      if (el) {
        existing.delete(k);
        if (el._html !== html) {
          const fresh = elFromHTML(html);
          fresh.dataset.key = k;
          fresh._html = html;
          el.replaceWith(fresh);
          el = fresh;
        }
      } else {
        el = elFromHTML(html);
        el.dataset.key = k;
        el._html = html;
        el.classList.add("rec-enter");
        requestAnimationFrame(() => el.classList.remove("rec-enter"));
      }
      next.push(el);
    });
    existing.forEach((el) => {
      el.classList.add("rec-leave");
      container.appendChild(el);
      setTimeout(() => el.remove(), 220);
    });
    // Ordena apenas os que ficaram, movendo só os que estão fora de lugar.
    let anchor = container.firstChild;
    next.forEach((el) => {
      if (el === anchor) {
        anchor = anchor.nextSibling;
      } else {
        container.insertBefore(el, anchor);
      }
    });
  }

  /* ----------------------------------------------------------------
     SSE (server-sent events) + fallback de polling lento
  ---------------------------------------------------------------- */
  function connectQueueStream(onChange, opts = {}) {
    const fallbackMs = opts.fallbackMs || 60000;
    const url = opts.url || "/api/queue/stream";
    let es = null;
    let retryTimer = null;
    let debounceTimer = null;
    let retryMs = 5000;
    const maxRetryMs = 60000;
    const trigger = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(onChange, 150);
    };
    const pollTimer = setInterval(onChange, fallbackMs);

    const connect = () => {
      if (typeof EventSource === "undefined") return;
      try {
        es = new EventSource(url);
      } catch (e) {
        return;
      }
      es.addEventListener("changed", () => {
        retryMs = 5000;
        trigger();
      });
      es.addEventListener("error", () => {
        try { es.close(); } catch (e) { /* noop */ }
        es = null;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, maxRetryMs);
      });
    };
    connect();

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) trigger();
    });

    return {
      close() {
        clearInterval(pollTimer);
        clearTimeout(debounceTimer);
        clearTimeout(retryTimer);
        if (es) { try { es.close(); } catch (e) { /* noop */ } }
      },
    };
  }

  window.$ = $;
  window.$$ = $$;
  window.UI = {
    icon, mascot, escapeHtml, fmtTime, todayStr, parseUTC, fmtLocalTime, fmtLocalDateTime,
    elapsedMin, fmtElapsed, plural, titleCase, avatar, initials, hashStr, api, toast, pinModal, confirmModal,
    infoModal, formatObs, notes, serviceChips, infoChips, TRANSPORT, initNav, setLive, NAV,
    reconcileList, connectQueueStream,
  };

  document.addEventListener("DOMContentLoaded", initNav);
})();
