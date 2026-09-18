# Design System — Cão & Cia · Fila Banho & Tosa

## Direção visual
Moderno e simples, **neutral-first**: o neutro domina e a cor da marca é usada como acento.
Sem barras coloridas, sem gradientes, sem emojis, sem cards excessivamente arredondados.

---

## Paleta de Cores

### Neutros (tema claro)

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#ffffff` | Fundo da aplicação |
| `--surface` | `#ffffff` | Cards, tabelas, modais |
| `--surface-2` | `#f7f8fa` | Fundos sutis, hover de linha, cabeçalho de tabela |
| `--border` | `#e5e7eb` | Bordas, separadores |
| `--border-strong` | `#d1d5db` | Bordas em hover |
| `--text` | `#111827` | Texto principal |
| `--muted` | `#6b7280` | Texto secundário, legendas |

### Marca (usada como acento)

| Token | Hex | Uso |
|---|---|---|
| `--brand` | `#00838F` | Ações primárias, links, foco |
| `--brand-dark` | `#006064` | Hover de ações primárias |
| `--brand-tint` | `#e6f4f5` | Fundo sutil de alertas teal |
| `--success` | `#16a34a` | Concluído, sucesso |
| `--success-tint` | `#e9f7ee` | Fundo sutil de sucesso/obs estética |
| `--danger` | `#dc2626` | Cancelado, erros, perigo |
| `--danger-tint` | `#fdeaea` | Fundo sutil de perigo |

### Status (ponto colorido + texto)

| Status | Token | Hex |
|---|---|---|
| Aguardando | `--st-aguardando` | `#6b7280` |
| Presente | `--st-presente` | `#00ACC1` |
| Em atendimento | `--st-em_atendimento` | `#00838F` |
| Concluído | `--st-concluido` | `#16a34a` |
| Cancelado | `--st-cancelado` | `#dc2626` |

---

## Tipografia

- **Fonte**: [Inter](https://fonts.google.com/specimen/Inter) (Google Fonts), pesos 400/500/600/700
- **Fallback**: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
- **Corpo**: 14px, line-height 1.45

| Elemento | Peso | Tamanho |
|---|---|---|
| `h1` (header) | 600 | 15px |
| Título de card / pet | 600 | 15–17px |
| Cabeçalho de coluna/seção | 600 | 13px |
| Corpo / cards | 400 | 13–14px |
| Metadata / legendas | 400 | 12px |

---

## Logo

- **Arquivo**: `static/logo-cao-cia.png`
- **Header**: 32×32px, `border-radius: 50%`, `object-fit: cover`
- **Posição**: à esquerda do título, junto à marca

```html
<div class="brand">
  <img src="/static/logo-cao-cia.png" alt="Cão & Cia" class="logo">
  <div>
    <h1>Fila Banho & Tosa</h1>
    <div class="sub" id="sync-status">...</div>
  </div>
</div>
```

---

## Componentes

### Header
- Fundo branco, borda inferior 1px `var(--border)`.
- Logo + título (15px/600) à esquerda; navegação em **links de texto** (muted, hover texto).
- Ação principal como botão pequeno (`.btn-primary`).

### Cards (Board / Painel)
- Fundo branco, borda 1px `var(--border)`, **radius 8px**, sem barra lateral, sem sombra.
- Topo: nome do pet (600) à esquerda + **status (ponto 8px + texto)** à direita.
- Tutor (muted 12px), horário, serviços como **texto separado por " · "** (sem chips).
- Obs: bloco com tint sutil (`--success-tint` p/ estética, `--brand-tint` p/ animal), radius 6px.
- Ações: botões pequenos (`.btn`).

### Botões

| Variante | Classe | Aparência |
|---|---|---|
| Primário | `.btn-primary` | Teal sólido, texto branco |
| Secundário | `.btn-secondary` | Branco + borda `--border` |
| Perigo | `.btn-danger` | Fantasma: borda/texto `--danger` |

- Base: `padding 7px 14px`, `radius 6px`, `font-size 13px`, `weight 600`.
- Hover: primário escurece (`--brand-dark`); secundário usa `--surface-2`; perigo usa `--danger-tint`.

### Status

```html
<span class="status em_atendimento"><span class="dot"></span>Em atendimento</span>
```
- `.dot`: 8×8px, `border-radius: 50%`, `background: currentColor`.
- Texto e ponto usam a cor do status.

### Colunas (Board)
- Cabeçalho: 13px/600, **ponto colorido via `::before`**, contagem em pill sutil cinza à direita.
- Sem uppercase, sem letter-spacing.

### Tabelas (Auditoria)
- Borda 1px `--border`, radius 8px.
- Header `--surface-2`, 12px/600, muted, **sem uppercase**.
- Hover de linha: `--surface-2`.

### Modais
- Overlay `rgba(17,24,39,.45)`, fundo branco, radius 10px, sombra suave.
- Botões **alinhados à direita**.
- PIN input: centrado, letter-spacing 6px, foco borda `--brand`.

### Toast
- Fundo `#111827` (neutro escuro), texto branco, radius 8px.

### Contadores (Tablet)
- Card branco, borda, radius 8px, **linha de acento de 3px no topo** (cor do status).
- Valor 32px/700 (texto neutro), label muted 12px.

### Ferramentas / Stats
- Cards brancos, borda, radius 8px.
- Ações destrutivas como `.btn-danger` (fantasma).

---

## O que foi removido (para fugir do "visual de IA")
- Barras laterais coloridas nos cards
- Emojis nos títulos e na interface
- Cabeçalhos em maiúsculas com letter-spacing
- Texto escuro sobre botões coloridos (agora texto branco)
- Pills/badges coloridos em excesso
- Raios de borda exagerados (14px+)

---

## Responsividade

- **Board**: grid 3 colunas; abaixo de 900px → 1 coluna.
- **Tablet (atendente)**: coluna única, max-width 720px.
- **Header**: quebra linha em telas menores.
- **Filtros**: `flex-wrap`.