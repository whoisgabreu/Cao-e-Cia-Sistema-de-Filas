/* Auditoria de atendimentos — usa /static/ui.js */
const { api, icon, escapeHtml, avatar, fmtLocalDateTime, fmtLocalTime, fmtElapsed, titleCase, plural, infoModal } = UI;

let lastResumo = [];
let detailOpen = false;

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function baseParams() {
  const ini = $("#dat-inicio").value;
  const fim = $("#dat-fim").value;
  const q = new URLSearchParams();
  if (ini) q.set("dat_inicio", ini);
  if (fim) q.set("dat_fim", fim);
  return q.toString();
}

function params() {
  const q = new URLSearchParams(baseParams());
  const att = $("#atendente").value;
  if (att) q.set("cod_atendente", att);
  return q.toString();
}

function fmtMin(v) {
  if (v == null) return "-";
  return fmtElapsed(Math.round(v));
}

/* ------------------------------------------------------------------
   Banco local (hoje) + gráficos
------------------------------------------------------------------ */
const STATUS_META = [
  { key: "aguardando", label: "Agendados", color: "var(--st-aguardando)" },
  { key: "presente", label: "Esperando", color: "var(--st-presente)" },
  { key: "em_atendimento", label: "Em banho", color: "var(--st-em_atendimento)" },
  { key: "concluido", label: "Concluídos", color: "var(--st-concluido)" },
  { key: "cancelado", label: "Cancelados", color: "var(--st-cancelado)" },
];

function renderDonut(q) {
  const total = q.total || 0;
  $("#donut-total").textContent = total;
  const donut = $("#donut");
  const legend = $("#donut-legend");
  if (!total) {
    donut.style.background = "var(--surface-2)";
    legend.innerHTML = `<div class="muted">Sem pets hoje.</div>`;
    return;
  }
  let acc = 0;
  const stops = STATUS_META.map((s) => {
    const pct = ((q[s.key] || 0) / total) * 100;
    const from = acc;
    acc += pct;
    return `${s.color} ${from}% ${acc}%`;
  });
  donut.style.background = `conic-gradient(${stops.join(", ")})`;
  legend.innerHTML = STATUS_META.map((s) => `
    <div class="legend-row">
      <span class="legend-dot" style="background:${s.color}"></span>
      <span class="legend-label">${s.label}</span>
      <b>${q[s.key] || 0}</b>
    </div>`).join("");
}

function renderDbStatus(data) {
  const q = data.queue || {};
  $("#db-aguardando").textContent = q.aguardando || 0;
  $("#db-presente").textContent = q.presente || 0;
  $("#db-em_atendimento").textContent = q.em_atendimento || 0;
  $("#db-concluido").textContent = q.concluido || 0;
  $("#db-cancelado").textContent = q.cancelado || 0;
  $("#db-total").textContent = q.total || 0;
  renderDonut(q);
}

async function loadDbStatus() {
  try {
    renderDbStatus(await api("/api/debug/status"));
  } catch (e) {
    /* mantém os valores atuais */
  }
}

function fillSerieDays(rows) {
  const ini = $("#dat-inicio").value;
  const fim = $("#dat-fim").value;
  if (!ini || !fim) return rows;
  const map = new Map(rows.map((r) => [r.data, r]));
  const out = [];
  const d = new Date(`${ini}T12:00:00`);
  const end = new Date(`${fim}T12:00:00`);
  let guard = 0;
  while (d <= end && guard < 120) {
    const key = isoDate(d);
    out.push(map.get(key) || { data: key, total: 0 });
    d.setDate(d.getDate() + 1);
    guard++;
  }
  return out;
}

function dayLabel(iso) {
  const parts = String(iso).split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : iso;
}

function renderSerie(rows) {
  const el = $("#serie-chart");
  if (!rows.length) {
    el.innerHTML = `<div class="empty">${UI.mascot("catSleep")}<div class="empty-title">Nenhum banho no período</div></div>`;
    return;
  }
  const max = Math.max(...rows.map((r) => r.total), 1);
  el.innerHTML = `<div class="bars">${rows.map((r) => `
    <div class="bar-col" title="${dayLabel(r.data)}: ${r.total} ${r.total === 1 ? "banho" : "banhos"}">
      <div class="bar-value">${r.total}</div>
      <div class="bar-track"><div class="bar-fill" style="height:${Math.round((r.total / max) * 100)}%"></div></div>
      <div class="bar-label">${dayLabel(r.data)}</div>
    </div>`).join("")}</div>`;
}

async function loadSerie() {
  try {
    renderSerie(fillSerieDays(await api(`/api/audit/serie?${params()}`)));
  } catch (e) {
    $("#serie-chart").innerHTML = `<div class="empty"><div class="empty-title">Erro ao carregar</div><div class="empty-sub">${escapeHtml(e.message)}</div></div>`;
  }
}

async function populateAttendants() {
  const sel = $("#atendente");
  const current = sel.value;
  let data = [];
  try {
    data = await api(`/api/audit?${baseParams()}`);
  } catch (e) {
    /* mantém as opções atuais */
  }
  sel.innerHTML = '<option value="">Todos os atendentes</option>';
  data.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.attendant_id;
    opt.textContent = r.nom_attendant;
    sel.appendChild(opt);
  });
  sel.value = current && Array.from(sel.options).some((o) => o.value === current) ? current : "";
}

function emptyHTML(mascot, title, sub) {
  return `<div class="empty panel">${UI.mascot(mascot)}<div class="empty-title">${title}</div><div class="empty-sub">${sub}</div></div>`;
}

async function loadResumo() {
  const list = $("#resumo");
  list.innerHTML = `<div class="empty panel">${icon("refresh", "spin")}<div class="empty-title">Carregando...</div></div>`;
  try {
    const data = await api(`/api/audit?${params()}`);
    const total = data.reduce((s, r) => s + r.total, 0);
    const weighted = data.reduce((s, r) => s + (r.tempo_medio_min || 0) * r.total, 0);
    $("#st-total").textContent = total;
    $("#st-avg").textContent = total ? fmtMin(weighted / total) : "-";
    $("#st-att").textContent = data.length;

    if (!data.length) {
      list.innerHTML = emptyHTML("catSleep", "Nenhum atendimento no período", "Ajuste as datas ou o atendente.");
      return;
    }
    lastResumo = data;
    const max = Math.max(...data.map((r) => r.total));
    list.innerHTML = data.map((r, i) => `
      <button type="button" class="rank-row" data-att="${r.attendant_id}">
        <span class="rank-pos">${i + 1}</span>
        ${avatar(r.nom_attendant, "person")}
        <div style="min-width:0">
          <div class="rank-name">${escapeHtml(r.nom_attendant)}</div>
          <div class="rank-bar"><span style="width:${Math.round((r.total / max) * 100)}%"></span></div>
          <div class="rank-hint">${icon("chevronRight")}${Math.round((r.total / total) * 100)}% dos banhos do período · toque para detalhes</div>
        </div>
        <div class="rank-stats">
          <div class="rank-stat green"><b>${r.total}</b><span>${r.total === 1 ? "banho" : "banhos"}</span></div>
          <div class="rank-stat teal"><b>${fmtMin(r.tempo_medio_min)}</b><span>média por banho</span></div>
        </div>
      </button>`).join("");
    $$(".rank-row").forEach((row) => {
      row.onclick = () => {
        const r = lastResumo.find((x) => String(x.attendant_id) === row.dataset.att);
        if (r) attendantModal(r);
      };
    });
  } catch (e) {
    list.innerHTML = emptyHTML("catSleep", "Erro ao carregar", escapeHtml(e.message));
  }
}

function periodLabel() {
  const ini = $("#dat-inicio").value;
  const fim = $("#dat-fim").value;
  const f = (s) => (s ? s.split("-").reverse().join("/") : "");
  if (ini && fim && ini === fim) return f(ini);
  if (ini && fim) return `${f(ini)} a ${f(fim)}`;
  return "todo o período";
}

async function attendantModal(r) {
  let items = [];
  try {
    const q = new URLSearchParams(baseParams());
    q.set("cod_atendente", r.attendant_id);
    q.set("detalhado", "true");
    items = await api(`/api/audit?${q.toString()}`);
  } catch (e) {
    UI.toast(e.message, "error");
    return;
  }
  const durations = items.map((i) => i.duracao_min).filter((v) => v != null);
  const fastest = durations.length ? Math.min(...durations) : null;
  const slowest = durations.length ? Math.max(...durations) : null;
  const list = items.length
    ? items.map((i) => {
        const servs = (i.services || []).map((s) => titleCase(s.nom_prod_serv) || `#${s.cod_prod_serv}`).join(", ");
        return `
          <div class="att-item">
            ${avatar(i.nom_animal, "sm")}
            <div class="att-text">
              <div class="att-pet">${escapeHtml(titleCase(i.nom_animal))} <span class="muted" style="font-weight:700">· ${escapeHtml(titleCase(i.nom_cliente))}</span></div>
              <div class="att-meta">${escapeHtml(servs || "Sem serviço")}</div>
              <div class="att-meta">${icon("play")} ${fmtLocalDateTime(i.claimed_at)} &nbsp;→&nbsp; ${icon("checkCircle")} ${fmtLocalTime(i.finished_at)}</div>
            </div>
            <div class="att-dur" title="Duração">${fmtMin(i.duracao_min)}</div>
          </div>`;
      }).join("")
    : `<div class="empty">${UI.mascot("catSleep")}<div class="empty-title">Nenhum banho no período</div></div>`;

  infoModal({
    title: r.nom_attendant,
    subtitle: `Banhos finalizados em ${periodLabel()}`,
    tone: "teal",
    iconName: "user",
    okLabel: "Fechar",
    bodyHTML: `
      <div class="att-summary">
        <div class="rank-stat green"><b>${r.total}</b><span>${r.total === 1 ? "banho finalizado" : "banhos finalizados"}</span></div>
        <div class="rank-stat teal"><b>${fmtMin(r.tempo_medio_min)}</b><span>tempo médio por banho</span></div>
        <div class="rank-stat"><b>${fmtMin(fastest)}</b><span>mais rápido</span></div>
        <div class="rank-stat"><b>${fmtMin(slowest)}</b><span>mais demorado</span></div>
      </div>
      <div class="att-list">${list}</div>`,
  });
}

async function loadDetalhe() {
  const tbody = $("#detalhe");
  tbody.innerHTML = `<tr><td colspan="7" class="muted">Carregando...</td></tr>`;
  try {
    const data = await api(`/api/audit?${params()}&detalhado=true`);
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="muted">Nenhum atendimento no período.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map((r) => {
      const servs = (r.services || [])
        .map((s) => titleCase(s.nom_prod_serv) || `#${s.cod_prod_serv}`)
        .join(", ");
      return `
        <tr>
          <td><span class="pet-cell">${avatar(r.nom_animal, "sm")}${escapeHtml(titleCase(r.nom_animal))}</span></td>
          <td class="muted">${escapeHtml(titleCase(r.nom_cliente))}</td>
          <td>${escapeHtml(r.nom_attendant)}</td>
          <td class="muted">${escapeHtml(servs || "-")}</td>
          <td>${escapeHtml(fmtLocalDateTime(r.claimed_at))}</td>
          <td>${escapeHtml(fmtLocalDateTime(r.finished_at))}</td>
          <td class="num"><b>${fmtMin(r.duracao_min)}</b></td>
        </tr>`;
    }).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Erro: ${escapeHtml(e.message)}</td></tr>`;
  }
}

function setRange(from, to) {
  $("#dat-inicio").value = isoDate(from);
  $("#dat-fim").value = isoDate(to);
}

function setActiveChip(id) {
  $$(".quick-chip").forEach((c) => c.classList.toggle("active", c.id === id));
}

function refreshAudit() {
  $("#export").href = `/api/audit/export.xlsx?${params()}`;
  loadDbStatus();
  loadSerie();
  populateAttendants().then(() => {
    loadResumo();
    if (detailOpen) loadDetalhe();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  $("#today").onclick = () => { const t = new Date(); setRange(t, t); setActiveChip("today"); refreshAudit(); };
  $("#week").onclick = () => { const t = new Date(); const f = new Date(); f.setDate(t.getDate() - 6); setRange(f, t); setActiveChip("week"); refreshAudit(); };
  $("#month").onclick = () => { const t = new Date(); setRange(new Date(t.getFullYear(), t.getMonth(), 1), t); setActiveChip("month"); refreshAudit(); };
  $("#apply").onclick = () => { setActiveChip(""); refreshAudit(); };
  $("#atendente").onchange = refreshAudit;
  $("#dat-inicio").onchange = () => setActiveChip("");
  $("#dat-fim").onchange = () => setActiveChip("");

  $("#refresh-db").onclick = async (e) => {
    const btn = e.currentTarget;
    btn.classList.add("loading");
    try {
      await loadDbStatus();
      await loadSerie();
    } finally {
      btn.classList.remove("loading");
    }
  };

  $("#toggle-detail").onclick = () => {
    detailOpen = !detailOpen;
    $("#detail-wrap").classList.toggle("hidden", !detailOpen);
    $("#toggle-detail").innerHTML = `${icon(detailOpen ? "x" : "chevronDown")}${detailOpen ? "Ocultar" : "Mostrar"}`;
    if (detailOpen) loadDetalhe();
  };

  const today = new Date();
  setRange(today, today);
  refreshAudit();
});
