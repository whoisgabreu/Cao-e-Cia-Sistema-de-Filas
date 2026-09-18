# Cão & Cia — Sistema de Filas (Banho & Tosa)

Fila de atendimento do banho e tosa, sincronizada com a agenda de estética do VetSoft.

## Rodar

```bash
pip install -r requirements.txt
cp .env.example .env   # preencha credenciais VetSoft e ADMIN_PIN
python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

Abra `http://<ip-da-maquina>:8000` no PC, tablet ou celular (todas as telas são responsivas).

## Telas

| Rota | Uso |
| --- | --- |
| `/` | Fila (Kanban) — visão da **recepção**: marca "Chegou", cancela/restaura; faixa "Cancelados hoje" |
| `/atendente` | Tela do atendente (tablet): iniciar/finalizar com PIN, observações do pet |
| `/atendente-minimalista` | Tela simples (tablet): "Pegar próximo pet" (confirma observações → PIN) e "Finalizar" |
| `/attendants` | Cadastro de atendentes (PIN de administrador) |
| `/audit` | Auditoria: ranking por atendente (clique abre detalhes) e download de planilha Excel |
| `/ferramentas` | Limpeza do banco local (PIN de administrador) |

## Regras de negócio

- **PIN** só para quem faz o banho (pegar/iniciar/finalizar). "Chegou" e "Cancelar" são ações da recepção, sem PIN.
- **1 pet por atendente**: quem pegou é quem finaliza.
- **Cancelamento** tem origem: `local` (botão, pode restaurar), `vetsoft` (cancelado/removido na agenda do VetSoft; só volta reativando lá) ou `sistema` (agendamento de dia anterior). Cancelamento local sobrevive ao sync.
- **Observações** do VetSoft (`obs_estetica`, `obs_animal`): trechos com `*` viram negrito; na Tela Simples aparecem em um passo de confirmação antes do PIN.

## API principal

| Método/Rota | Ação |
| --- | --- |
| `GET /api/queue` | fila de hoje (inclui cancelados) |
| `POST /api/queue/{id}/checkin` | pet chegou |
| `POST /api/queue/{id}/cancel` `{motivo?}` | cancela (recepção) |
| `POST /api/queue/{id}/restore` | desfaz cancelamento local |
| `POST /api/queue/{id}/claim` / `start` `{pin}` | atendente pega/inicia |
| `POST /api/queue/next` `{pin}` | pega o próximo da fila (atômico) |
| `POST /api/queue/finish/prepare` · `finish` · `{id}/checkout` `{pin}` | finaliza |
| `GET /api/audit?dat_inicio&dat_fim&cod_atendente&detalhado` | auditoria |
| `GET /api/audit/export.xlsx?...` | planilha Excel (Resumo, Detalhado, Por dia, Atendente x Dia) |

## Front-end

- `static/styles.css` — tema único baseado nas cores da logo (verde `#73B63A`, petróleo `#038F9F`), fontes Fredoka + Nunito.
- `static/ui.js` — ícones SVG, mascotes cartoon, teclado de PIN, toasts, navegação e helpers compartilhados.
- `static/admin.js` — portaria de PIN de administrador (Atendentes e Ferramentas).
- `export_xlsx.py` — geração da planilha de auditoria (openpyxl).
- Cada página tem seu próprio `*.html` + `*.js`.
