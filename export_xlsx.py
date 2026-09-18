"""Exportação da auditoria em planilha Excel (.xlsx) formatada.

Abas:
  Resumo          — cabeçalho, indicadores e ranking por atendente (fórmulas sobre a aba Detalhado)
  Detalhado       — um atendimento por linha (filtros, zebra, painel congelado)
  Por dia         — banhos e tempo médio por data (fórmulas)
  Atendente x Dia — matriz atendente × data com escala de cor (fórmulas)
"""
from datetime import date, datetime, timedelta, timezone
from io import BytesIO

from openpyxl import Workbook
from openpyxl.formatting.rule import ColorScaleRule, DataBarRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.workbook.properties import CalcProperties
from openpyxl.worksheet.page import PageMargins
from openpyxl.worksheet.properties import PageSetupProperties

import db

# ----------------------------------------------------------------------
# Paleta (cores da logo) e estilos
# ----------------------------------------------------------------------
GREEN = "73B63A"
GREEN_DARK = "4C7F22"
GREEN_LIGHT = "E6F3D8"
GREEN_ZEBRA = "F3FAEB"
TEAL = "038F9F"
TEAL_DARK = "035E69"
TEAL_LIGHT = "D6EFF2"
AMBER = "F5A524"
AMBER_LIGHT = "FEF0D3"
GRAY = "64716A"
BORDER = "DFEAD2"
TEXT = "1E2A20"

FONT = "Arial"
F_BASE = Font(name=FONT, size=10, color=TEXT)
F_MUTED = Font(name=FONT, size=9, color=GRAY, italic=True)
F_TITLE = Font(name=FONT, size=18, bold=True, color=TEAL_DARK)
F_SUBTITLE = Font(name=FONT, size=12, bold=True, color=GREEN_DARK)
F_HEADER = Font(name=FONT, size=10, bold=True, color="FFFFFF")
F_BOLD = Font(name=FONT, size=10, bold=True, color=TEXT)
F_KPI_LABEL = Font(name=FONT, size=9, bold=True, color="FFFFFF")
F_KPI_VALUE = Font(name=FONT, size=20, bold=True, color=TEAL_DARK)
F_SECTION = Font(name=FONT, size=11, bold=True, color=TEAL_DARK)

FILL_HEADER = PatternFill("solid", fgColor=GREEN)
FILL_HEADER_TEAL = PatternFill("solid", fgColor=TEAL)
FILL_KPI = PatternFill("solid", fgColor=TEAL)
FILL_KPI_VALUE = PatternFill("solid", fgColor=TEAL_LIGHT)
FILL_TOTAL = PatternFill("solid", fgColor=GREEN_LIGHT)
FILL_ZEBRA = PatternFill("solid", start_color=GREEN_ZEBRA, end_color=GREEN_ZEBRA)
FILL_NOTE = PatternFill("solid", fgColor=AMBER_LIGHT)

THIN = Side(style="thin", color=BORDER)
BORDER_ALL = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
BORDER_BOTTOM = Border(bottom=Side(style="medium", color=GREEN))

CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)
LEFT_TOP = Alignment(horizontal="left", vertical="top", wrap_text=True)
RIGHT = Alignment(horizontal="right", vertical="center")

FMT_INT = "0"
FMT_DEC = "0.0"
FMT_PCT = "0.0%"
FMT_DATE = "dd/mm/yyyy"
FMT_DATETIME = "dd/mm/yyyy hh:mm"
FMT_TIME = "hh:mm"
FMT_HOURS = '0.0" h"'
FMT_DURATION = '[h]"h "mm"min"'

MAX_MATRIX_DAYS = 62


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def _utc_to_local(value: str | None) -> datetime | None:
    """'YYYY-MM-DD HH:MM:SS' em UTC (SQLite) -> datetime local sem tzinfo."""
    if not value:
        return None
    try:
        dt = datetime.strptime(str(value)[:19], "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None
    return dt.replace(tzinfo=timezone.utc).astimezone().replace(tzinfo=None)


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _title_case(text: str | None) -> str:
    if not text:
        return ""
    small = {"de", "da", "do", "das", "dos", "e", "di", "du", "del", "della", "von", "van"}
    words = str(text).strip().lower().split()
    out = []
    for i, w in enumerate(words):
        if i > 0 and w in small:
            out.append(w)
            continue
        chars = list(w)
        upper_next = True
        for j, c in enumerate(chars):
            if upper_next and c.isalpha():
                chars[j] = c.upper()
                upper_next = False
            elif c in "(/-":
                upper_next = True
        out.append("".join(chars))
    return " ".join(out)


def _style_header_row(ws, row: int, first_col: int, last_col: int, fill=FILL_HEADER, height=24):
    for col in range(first_col, last_col + 1):
        c = ws.cell(row=row, column=col)
        c.font = F_HEADER
        c.fill = fill
        c.alignment = CENTER
        c.border = BORDER_ALL
    ws.row_dimensions[row].height = height


def _set_widths(ws, widths: dict[int, float]):
    for col, width in widths.items():
        ws.column_dimensions[get_column_letter(col)].width = width


def _page_setup(ws, landscape=True):
    ws.page_setup.orientation = "landscape" if landscape else "portrait"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_margins = PageMargins(left=0.4, right=0.4, top=0.5, bottom=0.5)
    ws.print_options.horizontalCentered = True


# ----------------------------------------------------------------------
# Aba Detalhado
# ----------------------------------------------------------------------
DET_COLS = [
    ("#", 5),
    ("Data", 12),
    ("Pet", 24),
    ("Tutor", 30),
    ("Atendente", 20),
    ("Serviços", 46),
    ("Início", 17),
    ("Fim", 17),
    ("Duração (min)", 13),
    ("Duração", 12),
]
# índices (1-based) das colunas usadas nas fórmulas
C_NUM, C_DATE, C_PET, C_TUTOR, C_ATT, C_SERV, C_START, C_END, C_MIN, C_DUR = range(1, 11)


def _build_detalhado(ws, rows: list[dict]) -> int:
    """Escreve a aba Detalhado. Retorna a quantidade de linhas de dados."""
    ws.sheet_properties.tabColor = GREEN
    ws.sheet_view.showGridLines = False
    ws.freeze_panes = "A2"

    for i, (name, width) in enumerate(DET_COLS, start=1):
        ws.cell(row=1, column=i, value=name)
        ws.column_dimensions[get_column_letter(i)].width = width
    _style_header_row(ws, 1, 1, len(DET_COLS))

    for r, item in enumerate(rows, start=2):
        start = _utc_to_local(item.get("claimed_at"))
        end = _utc_to_local(item.get("finished_at"))
        minutes = item.get("duracao_min")
        services = ", ".join(
            (s.get("nom_prod_serv") and _title_case(s["nom_prod_serv"])) or f"#{s.get('cod_prod_serv')}"
            for s in (item.get("services") or [])
        )
        ws.cell(row=r, column=C_NUM, value=r - 1)
        ws.cell(row=r, column=C_DATE, value=(end or start).date() if (end or start) else None)
        ws.cell(row=r, column=C_PET, value=_title_case(item.get("nom_animal")))
        ws.cell(row=r, column=C_TUTOR, value=_title_case(item.get("nom_cliente")))
        ws.cell(row=r, column=C_ATT, value=item.get("nom_attendant") or "")
        ws.cell(row=r, column=C_SERV, value=services or "-")
        ws.cell(row=r, column=C_START, value=start)
        ws.cell(row=r, column=C_END, value=end)
        ws.cell(row=r, column=C_MIN, value=float(minutes) if minutes is not None else None)
        ws.cell(row=r, column=C_DUR, value=f"={get_column_letter(C_MIN)}{r}/1440")

        for col in range(1, len(DET_COLS) + 1):
            c = ws.cell(row=r, column=col)
            c.font = F_BASE
            c.border = BORDER_ALL
            c.alignment = LEFT_TOP if col in (C_PET, C_TUTOR, C_SERV) else CENTER
        ws.cell(row=r, column=C_PET).font = F_BOLD
        ws.cell(row=r, column=C_DATE).number_format = FMT_DATE
        ws.cell(row=r, column=C_START).number_format = FMT_DATETIME
        ws.cell(row=r, column=C_END).number_format = FMT_DATETIME
        ws.cell(row=r, column=C_MIN).number_format = FMT_DEC
        ws.cell(row=r, column=C_DUR).number_format = FMT_DURATION

    n = len(rows)
    last = max(2, n + 1)
    ws.auto_filter.ref = f"A1:{get_column_letter(len(DET_COLS))}{last}"

    if n:
        rng = f"A2:{get_column_letter(len(DET_COLS))}{last}"
        # zebra por fórmula (sobrevive à ordenação/filtro)
        ws.conditional_formatting.add(rng, FormulaRule(formula=["MOD(ROW(),2)=0"], fill=FILL_ZEBRA))
        min_rng = f"{get_column_letter(C_MIN)}2:{get_column_letter(C_MIN)}{last}"
        ws.conditional_formatting.add(
            min_rng, DataBarRule(start_type="min", end_type="max", color=TEAL, showValue=True)
        )
    else:
        ws.cell(row=2, column=1, value="Nenhum atendimento finalizado no período.").font = F_MUTED
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=len(DET_COLS))

    _page_setup(ws, landscape=True)
    ws.print_title_rows = "1:1"
    return n


# ----------------------------------------------------------------------
# Aba Resumo
# ----------------------------------------------------------------------
def _build_resumo(ws, *, periodo: str, atendente_label: str, resumo: list[dict], rows: list[dict], n_rows: int):
    ws.sheet_properties.tabColor = TEAL
    ws.sheet_view.showGridLines = False
    _set_widths(ws, {1: 3, 2: 11, 3: 28, 4: 14, 5: 14, 6: 18, 7: 18, 8: 20, 9: 16})

    ws["B1"] = "Cão & Cia · Banho & Tosa"
    ws["B1"].font = F_TITLE
    ws["B2"] = "Relatório de atendimentos"
    ws["B2"].font = F_SUBTITLE
    ws["B3"] = f"Período: {periodo}   ·   Atendente: {atendente_label}   ·   Gerado em {datetime.now():%d/%m/%Y %H:%M}"
    ws["B3"].font = F_MUTED
    ws.row_dimensions[1].height = 28
    ws.row_dimensions[2].height = 20

    det_att = f"Detalhado!${get_column_letter(C_ATT)}:${get_column_letter(C_ATT)}"
    det_min = f"Detalhado!${get_column_letter(C_MIN)}:${get_column_letter(C_MIN)}"
    det_num = f"Detalhado!${get_column_letter(C_NUM)}:${get_column_letter(C_NUM)}"

    # ---- Indicadores (linha 5 rótulo / linha 6 valor) ----
    kpis = [
        ("Banhos finalizados", f"=COUNT({det_num})", FMT_INT),
        ("Tempo médio (min)", f"=IFERROR(ROUND(AVERAGE({det_min}),1),0)", FMT_DEC),
        ("Mais rápido (min)", f"=IFERROR(MIN({det_min}),0)", FMT_DEC),
        ("Mais demorado (min)", f"=IFERROR(MAX({det_min}),0)", FMT_DEC),
        ("Tempo total (h)", f"=SUM({det_min})/60", FMT_HOURS),
        ("Atendentes", len(resumo), FMT_INT),
    ]
    for i, (label, value, fmt) in enumerate(kpis):
        col = 2 + i
        lc = ws.cell(row=5, column=col, value=label)
        lc.font = F_KPI_LABEL
        lc.fill = FILL_KPI
        lc.alignment = CENTER
        vc = ws.cell(row=6, column=col, value=value)
        vc.font = F_KPI_VALUE
        vc.fill = FILL_KPI_VALUE
        vc.alignment = CENTER
        vc.number_format = fmt
    ws.row_dimensions[5].height = 30
    ws.row_dimensions[6].height = 38

    # ---- Ranking ----
    head_row = 9
    ws.cell(row=8, column=2, value="Ranking por atendente").font = F_SECTION
    headers = ["Posição", "Atendente", "Banhos", "% do total", "Tempo médio (min)",
               "Mais rápido (min)", "Mais demorado (min)", "Tempo total (h)"]
    for i, h in enumerate(headers, start=2):
        ws.cell(row=head_row, column=i, value=h)
    _style_header_row(ws, head_row, 2, 2 + len(headers) - 1)

    # mín/máx por atendente calculados na exportação (evita funções recentes do Excel)
    per_att: dict[str, list[float]] = {}
    for item in rows:
        if item.get("duracao_min") is not None:
            per_att.setdefault(item.get("nom_attendant") or "", []).append(float(item["duracao_min"]))

    first = head_row + 1
    last = head_row + max(1, len(resumo))
    total_row = last + 1
    for i, r in enumerate(resumo):
        row = first + i
        name = r["nom_attendant"]
        durs = per_att.get(name, [])
        ws.cell(row=row, column=2, value=i + 1)
        ws.cell(row=row, column=3, value=name)
        ws.cell(row=row, column=4, value=f"=COUNTIF({det_att},$C{row})")
        ws.cell(row=row, column=5, value=f"=IFERROR(D{row}/$D${total_row},0)")
        ws.cell(row=row, column=6, value=f"=IFERROR(ROUND(AVERAGEIF({det_att},$C{row},{det_min}),1),0)")
        ws.cell(row=row, column=7, value=min(durs) if durs else None)
        ws.cell(row=row, column=8, value=max(durs) if durs else None)
        ws.cell(row=row, column=9, value=f"=SUMIF({det_att},$C{row},{det_min})/60")
    if not resumo:
        ws.cell(row=first, column=3, value="Nenhum atendimento no período").font = F_MUTED

    fmts = {2: FMT_INT, 4: FMT_INT, 5: FMT_PCT, 6: FMT_DEC, 7: FMT_DEC, 8: FMT_DEC, 9: FMT_HOURS}
    for row in range(first, last + 1):
        for col in range(2, 10):
            c = ws.cell(row=row, column=col)
            c.font = F_BOLD if col == 3 else F_BASE
            c.border = BORDER_ALL
            c.alignment = LEFT if col == 3 else CENTER
            if col in fmts:
                c.number_format = fmts[col]
        if (row - first) % 2 == 1:
            for col in range(2, 10):
                ws.cell(row=row, column=col).fill = FILL_ZEBRA

    # linha de total
    ws.cell(row=total_row, column=3, value="Total")
    ws.cell(row=total_row, column=4, value=f"=SUM(D{first}:D{last})")
    ws.cell(row=total_row, column=5, value=f"=IFERROR(D{total_row}/$D${total_row},0)")
    ws.cell(row=total_row, column=6, value=f"=IFERROR(ROUND(AVERAGE({det_min}),1),0)")
    ws.cell(row=total_row, column=7, value=f"=IFERROR(MIN({det_min}),0)")
    ws.cell(row=total_row, column=8, value=f"=IFERROR(MAX({det_min}),0)")
    ws.cell(row=total_row, column=9, value=f"=SUM(I{first}:I{last})")
    for col in range(2, 10):
        c = ws.cell(row=total_row, column=col)
        c.font = F_BOLD
        c.fill = FILL_TOTAL
        c.border = BORDER_ALL
        c.alignment = LEFT if col == 3 else CENTER
        if col in fmts:
            c.number_format = fmts[col]

    if resumo:
        ws.conditional_formatting.add(
            f"D{first}:D{last}", DataBarRule(start_type="num", start_value=0, end_type="max", color=GREEN, showValue=True)
        )
        ws.conditional_formatting.add(
            f"F{first}:F{last}",
            ColorScaleRule(start_type="min", start_color=GREEN_LIGHT, end_type="max", end_color=AMBER_LIGHT),
        )

    note_row = total_row + 2
    ws.cell(row=note_row, column=2, value=(
        "Como ler: Banhos, % do total, Tempo médio e Tempo total são fórmulas sobre a aba \"Detalhado\" "
        "(filtre ou ordene lá à vontade). Mais rápido / Mais demorado foram calculados na exportação. "
        "Horários em hora local."
    )).font = F_MUTED
    ws.merge_cells(start_row=note_row, start_column=2, end_row=note_row, end_column=9)
    ws.cell(row=note_row, column=2).alignment = LEFT_TOP
    ws.row_dimensions[note_row].height = 30

    _page_setup(ws, landscape=True)


# ----------------------------------------------------------------------
# Aba Por dia
# ----------------------------------------------------------------------
def _date_range(dat_inicio: date | None, dat_fim: date | None, rows: list[dict]) -> list[date]:
    if dat_inicio and dat_fim and dat_inicio <= dat_fim and (dat_fim - dat_inicio).days <= 400:
        return [dat_inicio + timedelta(days=i) for i in range((dat_fim - dat_inicio).days + 1)]
    seen = set()
    for item in rows:
        dt = _utc_to_local(item.get("finished_at")) or _utc_to_local(item.get("claimed_at"))
        if dt:
            seen.add(dt.date())
    return sorted(seen)


def _build_por_dia(ws, dates: list[date]):
    ws.sheet_properties.tabColor = AMBER
    ws.sheet_view.showGridLines = False
    ws.freeze_panes = "A2"
    _set_widths(ws, {1: 14, 2: 12, 3: 12, 4: 18, 5: 16})

    det_date = f"Detalhado!${get_column_letter(C_DATE)}:${get_column_letter(C_DATE)}"
    det_min = f"Detalhado!${get_column_letter(C_MIN)}:${get_column_letter(C_MIN)}"

    headers = ["Data", "Dia", "Banhos", "Tempo médio (min)", "Tempo total (h)"]
    for i, h in enumerate(headers, start=1):
        ws.cell(row=1, column=i, value=h)
    _style_header_row(ws, 1, 1, len(headers), fill=FILL_HEADER_TEAL)

    dias = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
    for i, d in enumerate(dates):
        row = 2 + i
        ws.cell(row=row, column=1, value=d).number_format = FMT_DATE
        ws.cell(row=row, column=2, value=dias[d.weekday()])
        ws.cell(row=row, column=3, value=f"=COUNTIF({det_date},$A{row})").number_format = FMT_INT
        ws.cell(row=row, column=4, value=f"=IFERROR(ROUND(AVERAGEIF({det_date},$A{row},{det_min}),1),0)").number_format = FMT_DEC
        ws.cell(row=row, column=5, value=f"=SUMIF({det_date},$A{row},{det_min})/60").number_format = FMT_HOURS
        for col in range(1, 6):
            c = ws.cell(row=row, column=col)
            c.font = F_BASE
            c.border = BORDER_ALL
            c.alignment = CENTER
            if i % 2 == 1:
                c.fill = FILL_ZEBRA
        if d.weekday() == 6:
            ws.cell(row=row, column=2).font = Font(name=FONT, size=10, color=AMBER, bold=True)

    last = 1 + len(dates)
    total_row = last + 1
    if dates:
        ws.cell(row=total_row, column=1, value="Total")
        ws.cell(row=total_row, column=3, value=f"=SUM(C2:C{last})").number_format = FMT_INT
        ws.cell(row=total_row, column=4, value=f"=IFERROR(ROUND(AVERAGE({det_min}),1),0)").number_format = FMT_DEC
        ws.cell(row=total_row, column=5, value=f"=SUM(E2:E{last})").number_format = FMT_HOURS
        for col in range(1, 6):
            c = ws.cell(row=total_row, column=col)
            c.font = F_BOLD
            c.fill = FILL_TOTAL
            c.border = BORDER_ALL
            c.alignment = CENTER
        ws.conditional_formatting.add(
            f"C2:C{last}", DataBarRule(start_type="num", start_value=0, end_type="max", color=TEAL, showValue=True)
        )
    else:
        ws.cell(row=2, column=1, value="Nenhum atendimento no período.").font = F_MUTED

    _page_setup(ws, landscape=False)


# ----------------------------------------------------------------------
# Aba Atendente x Dia
# ----------------------------------------------------------------------
def _build_matriz(ws, resumo: list[dict], dates: list[date]):
    ws.sheet_properties.tabColor = GRAY
    ws.sheet_view.showGridLines = False
    ws.freeze_panes = "B3"

    det_att = f"Detalhado!${get_column_letter(C_ATT)}:${get_column_letter(C_ATT)}"
    det_date = f"Detalhado!${get_column_letter(C_DATE)}:${get_column_letter(C_DATE)}"

    ws.cell(row=1, column=1, value="Banhos por atendente e por dia").font = F_SECTION
    ws.cell(row=2, column=1, value="Atendente")
    ws.column_dimensions["A"].width = 24
    for j, d in enumerate(dates):
        col = 2 + j
        c = ws.cell(row=2, column=col, value=d)
        c.number_format = "dd/mm"
        ws.column_dimensions[get_column_letter(col)].width = 7.5
    total_col = 2 + len(dates)
    ws.cell(row=2, column=total_col, value="Total")
    ws.column_dimensions[get_column_letter(total_col)].width = 9
    _style_header_row(ws, 2, 1, total_col, fill=FILL_HEADER_TEAL, height=22)

    first = 3
    for i, r in enumerate(resumo):
        row = first + i
        ws.cell(row=row, column=1, value=r["nom_attendant"]).font = F_BOLD
        for j in range(len(dates)):
            col = 2 + j
            cl = get_column_letter(col)
            c = ws.cell(row=row, column=col, value=f"=COUNTIFS({det_att},$A{row},{det_date},{cl}$2)")
            c.number_format = '0;-0;""'
            c.alignment = CENTER
            c.font = F_BASE
            c.border = BORDER_ALL
        if dates:
            tc = ws.cell(row=row, column=total_col,
                         value=f"=SUM(B{row}:{get_column_letter(total_col - 1)}{row})")
        else:
            tc = ws.cell(row=row, column=total_col, value=0)
        tc.font = F_BOLD
        tc.fill = FILL_TOTAL
        tc.alignment = CENTER
        tc.border = BORDER_ALL
        tc.number_format = FMT_INT
        ws.cell(row=row, column=1).border = BORDER_ALL
        ws.cell(row=row, column=1).alignment = LEFT

    last = first + len(resumo) - 1
    if resumo and dates:
        total_row = last + 1
        ws.cell(row=total_row, column=1, value="Total").font = F_BOLD
        for j in range(len(dates) + 1):
            col = 2 + j
            cl = get_column_letter(col)
            c = ws.cell(row=total_row, column=col, value=f"=SUM({cl}{first}:{cl}{last})")
            c.font = F_BOLD
            c.fill = FILL_TOTAL
            c.alignment = CENTER
            c.border = BORDER_ALL
            c.number_format = FMT_INT
        ws.cell(row=total_row, column=1).fill = FILL_TOTAL
        ws.cell(row=total_row, column=1).border = BORDER_ALL
        rng = f"B{first}:{get_column_letter(total_col - 1)}{last}"
        ws.conditional_formatting.add(
            rng, ColorScaleRule(start_type="num", start_value=0, start_color="FFFFFF",
                                end_type="max", end_color=GREEN),
        )
    elif not resumo:
        ws.cell(row=first, column=1, value="Nenhum atendimento no período.").font = F_MUTED

    _page_setup(ws, landscape=True)


# ----------------------------------------------------------------------
# Montagem
# ----------------------------------------------------------------------
def build_audit_workbook(dat_inicio: str | None, dat_fim: str | None, cod_atendente: int | None) -> tuple[bytes, str]:
    """Gera a planilha. Retorna (bytes, nome_do_arquivo)."""
    resumo = db.get_audit(dat_inicio, dat_fim, cod_atendente)
    rows = db.get_audit_detalhado(dat_inicio, dat_fim, cod_atendente)
    rows.sort(key=lambda r: (r.get("finished_at") or ""))

    d_ini = _parse_date(dat_inicio)
    d_fim = _parse_date(dat_fim)
    if d_ini and d_fim and d_ini == d_fim:
        periodo = f"{d_ini:%d/%m/%Y}"
    elif d_ini and d_fim:
        periodo = f"{d_ini:%d/%m/%Y} a {d_fim:%d/%m/%Y}"
    elif d_ini:
        periodo = f"a partir de {d_ini:%d/%m/%Y}"
    elif d_fim:
        periodo = f"até {d_fim:%d/%m/%Y}"
    else:
        periodo = "todo o histórico"

    atendente_label = "Todos"
    if cod_atendente is not None:
        att = db.get_attendant(cod_atendente)
        atendente_label = att["nome"] if att else f"#{cod_atendente}"

    dates = _date_range(d_ini, d_fim, rows)

    wb = Workbook()
    wb.calculation = CalcProperties(fullCalcOnLoad=True)
    ws_resumo = wb.active
    ws_resumo.title = "Resumo"
    ws_det = wb.create_sheet("Detalhado")
    ws_dia = wb.create_sheet("Por dia")

    n = _build_detalhado(ws_det, rows)
    _build_resumo(ws_resumo, periodo=periodo, atendente_label=atendente_label, resumo=resumo, rows=rows, n_rows=n)
    _build_por_dia(ws_dia, dates)
    if len(dates) <= MAX_MATRIX_DAYS:
        _build_matriz(wb.create_sheet("Atendente x Dia"), resumo, dates)

    buf = BytesIO()
    wb.save(buf)

    suffix = ""
    if d_ini and d_fim:
        suffix = f"_{d_ini:%Y-%m-%d}" if d_ini == d_fim else f"_{d_ini:%Y-%m-%d}_a_{d_fim:%Y-%m-%d}"
    if cod_atendente is not None:
        safe = "".join(ch if ch.isalnum() else "-" for ch in atendente_label.lower())
        suffix += f"_{safe}"
    return buf.getvalue(), f"auditoria-banho-tosa{suffix}.xlsx"
