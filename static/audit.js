const $ = (sel) => document.querySelector(sel);

async function api(path) {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || `Erro ${res.status}`);
  return body.data;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function escapeHtml(text) {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmtDT(dt) {
  return dt ? dt.slice(0, 16) : "-";
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

async function loadResumo() {
  const tbody = $("#resumo");
  tbody.innerHTML = `<tr><td colspan="3">Carregando...</td></tr>`;
  try {
    const data = await api(`/api/audit?${params()}`);
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="3">Nenhum atendimento no período.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map((r) => `
      <tr>
        <td>${escapeHtml(r.nom_attendant)}</td>
        <td class="num">${r.total}</td>
        <td class="num">${r.tempo_medio_min ?? "-"}</td>
      </tr>`).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="3">Erro: ${escapeHtml(e.message)}</td></tr>`;
  }
}

async function loadDetalhe() {
  const tbody = $("#detalhe");
  tbody.innerHTML = `<tr><td colspan="7">Carregando...</td></tr>`;
  try {
    const data = await api(`/api/audit?${params()}&detalhado=true`);
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="7">Nenhum atendimento no período.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map((r) => {
      const servs = (r.services || [])
        .map((s) => s.nom_prod_serv || `#${s.cod_prod_serv}`)
        .join(", ");
      return `
        <tr>
          <td>${escapeHtml(fmtDT(r.claimed_at))}</td>
          <td>${escapeHtml(fmtDT(r.finished_at))}</td>
          <td class="num">${r.duracao_min ?? "-"}</td>
          <td>${escapeHtml(r.nom_animal)}</td>
          <td>${escapeHtml(r.nom_attendant)}</td>
          <td>${escapeHtml(r.nom_cliente)}</td>
          <td>${escapeHtml(servs)}</td>
        </tr>`;
    }).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7">Erro: ${escapeHtml(e.message)}</td></tr>`;
  }
}

function setMonth() {
  const now = new Date();
  $("#dat-inicio").value = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  $("#dat-fim").value = isoDate(now);
}

document.addEventListener("DOMContentLoaded", () => {
  $("#today").onclick = () => {
    const today = isoDate(new Date());
    $("#dat-inicio").value = today;
    $("#dat-fim").value = today;
    refresh();
  };
  $("#month").onclick = () => { setMonth(); refresh(); };
  $("#apply").onclick = refresh;
  $("#atendente").onchange = refresh;

  let detailOpen = false;
  $("#toggle-detail").onclick = (e) => {
    e.preventDefault();
    detailOpen = !detailOpen;
    $("#detail-wrap").style.display = detailOpen ? "block" : "none";
    $("#toggle-detail").textContent = detailOpen ? "Ocultar detalhamento" : "Ver detalhamento por pet";
    if (detailOpen) loadDetalhe();
  };

  function refresh() {
    populateAttendants().then(() => {
      loadResumo();
      if (detailOpen) loadDetalhe();
    });
  }

  const today = isoDate(new Date());
  $("#dat-inicio").value = today;
  $("#dat-fim").value = today;
  refresh();
});