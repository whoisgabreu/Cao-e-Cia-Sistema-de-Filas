/* Auditoria de atendimentos — usa /static/ui.js */
const { api, icon, escapeHtml, avatar, fmtLocalDateTime, fmtLocalTime, fmtElapsed, titleCase, plural, infoModal } = UI;

let lastResumo = [];

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

document.addEventListener("DOMContentLoaded", () => {
  let detailOpen = false;

  function refresh() {
    $("#export").href = `/api/audit/export.xlsx?${params()}`;
    populateAttendants().then(() => {
      loadResumo();
      if (detailOpen) loadDetalhe();
    });
  }

  $("#today").onclick = () => { const t = new Date(); setRange(t, t); setActiveChip("today"); refresh(); };
  $("#week").onclick = () => { const t = new Date(); const f = new Date(); f.setDate(t.getDate() - 6); setRange(f, t); setActiveChip("week"); refresh(); };
  $("#month").onclick = () => { const t = new Date(); setRange(new Date(t.getFullYear(), t.getMonth(), 1), t); setActiveChip("month"); refresh(); };
  $("#apply").onclick = () => { setActiveChip(""); refresh(); };
  $("#atendente").onchange = refresh;
  $("#dat-inicio").onchange = () => setActiveChip("");
  $("#dat-fim").onchange = () => setActiveChip("");

  $("#toggle-detail").onclick = () => {
    detailOpen = !detailOpen;
    $("#detail-wrap").classList.toggle("hidden", !detailOpen);
    $("#toggle-detail").innerHTML = `${icon(detailOpen ? "x" : "chevronDown")}${detailOpen ? "Ocultar" : "Mostrar"}`;
    if (detailOpen) loadDetalhe();
  };

  const today = new Date();
  setRange(today, today);
  refresh();
});
