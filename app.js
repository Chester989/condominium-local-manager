const STORAGE_KEY = "gestao-condominios-mvp-v1";
const VAULT_KEY = "gestao-condominios-vault-v1";
const AUTO_BACKUP_KEY = "gestao-condominios-auto-backups-v1";

const money = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const monthName = new Intl.DateTimeFormat("pt-PT", { month: "long", year: "numeric" });

const app = document.querySelector("#app");
const modal = document.querySelector("#modal");
const modalTitle = document.querySelector("#modalTitle");
const modalBody = document.querySelector("#modalBody");
const importFile = document.querySelector("#importFile");
const printArea = document.querySelector("#printArea");

const viewLabels = {
  dashboard: "Painel",
  condo: "Condomínio",
  search: "Pesquisa",
  reports: "Relatórios",
  portal: "Portal dos condóminos",
  settings: "Cópias e dados",
};

let vault = { unlocked: false, key: null };
let state = null;
let selectedCondoId = "";
let activeView = "dashboard";
let activeTab = "quotas";
let activeMonth = currentMonth();
let portalCondoId = "";
let portalUnitId = "";
let searchQuery = "";

bootApp();

document.addEventListener("click", (event) => {
  const close = event.target.closest("[data-close-modal]");
  if (close) {
    modal.close();
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;

  const { action, id, view, tab } = actionButton.dataset;

  if (view) {
    activeView = view;
    if (view === "condo" && !selectedCondoId) selectedCondoId = state.condominiums[0]?.id || "";
    render();
    return;
  }

  if (tab) {
    activeTab = tab;
    render();
    return;
  }

  const handlers = {
    selectCondo: () => {
      selectedCondoId = id;
      activeView = "condo";
      saveState();
      render();
    },
    newCondo: () => openCondoForm(),
    editCondo: () => openCondoForm(getCondo(id || selectedCondoId)),
    toggleCondo: () => toggleCondo(id || selectedCondoId),
    newUnit: () => openUnitForm(),
    editUnit: () => openUnitForm(getUnit(id)),
    toggleUnit: () => toggleUnit(id),
    generateQuotas: () => openGenerateQuotasForm(),
    markPaid: () => openPaymentForm(id),
    showReceipt: () => openReceipt(id),
    showNotice: () => openPaymentNotice(id),
    printMonthReceipts: () => printMonthReceipts(),
    newExpense: () => openExpenseForm(),
    newDocument: () => openDocumentForm(),
    exportBackup: () => downloadBackup(),
    exportEncryptedBackup: () => downloadEncryptedBackup(),
    exportAutoBackup: () => downloadLatestAutoBackup(),
    exportCsv: () => downloadCsv(),
    reportDebtors: () => downloadReport("debtors"),
    reportCurrentAccounts: () => downloadReport("currentAccounts"),
    reportAnnual: () => downloadReport("annual"),
    reportReceipts: () => downloadReport("receipts"),
    openBankReconcile: () => openBankReconcileForm(),
    importBackup: () => importFile.click(),
    importZip: () => importFile.click(),
    enableVault: () => openEnableVaultForm(),
    lockVault: () => lockVault(),
    resetSample: () => resetSampleData(),
    resetEmpty: () => resetEmptyData(),
  };

  handlers[action]?.();
});

document.addEventListener("input", (event) => {
  if (!event.target.matches("[data-global-search]")) return;
  searchQuery = event.target.value;
  render();
});

document.addEventListener("change", (event) => {
  if (event.target.matches("[data-month-filter]")) {
    activeMonth = event.target.value;
    render();
  }

  if (event.target.matches("[data-portal-condo]")) {
    portalCondoId = event.target.value;
    portalUnitId = getCondo(portalCondoId)?.units[0]?.id || "";
    render();
  }

  if (event.target.matches("[data-portal-unit]")) {
    portalUnitId = event.target.value;
    render();
  }
});

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!form.matches("[data-page-form]")) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  if (form.dataset.pageForm === "unlockVault") unlockVault(data);
});

modal.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  const validation = validateForm(form);
  if (!validation.ok) {
    showFormError(form, validation.message);
    return;
  }

  const data = Object.fromEntries(new FormData(form).entries());
  const type = form.dataset.form;

  if (type === "unlockVault") return unlockVault(data);
  if (type === "enableVault") return enableVault(data);
  if (type === "encryptedImport") return importEncryptedBackup(data);
  if (type === "condo") saveCondo(data);
  if (type === "unit") saveUnit(data);
  if (type === "generateQuotas") generateQuotas(data);
  if (type === "payment") savePayment(data);
  if (type === "expense") saveExpense(data);
  if (type === "document") saveDocument(data);
  if (type === "bankReconcile") return reconcileBankMovements(data);

  modal.close();
  saveState();
  render();
});

importFile.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    await handleImportFile(file);
  } catch (error) {
    alert(error.message || "Não consegui importar este ficheiro. Confirma se é uma cópia criada pela aplicação.");
  } finally {
    importFile.value = "";
  }
});

async function bootApp() {
  if (localStorage.getItem(VAULT_KEY)) {
    renderLockScreen();
    return;
  }

  state = migrateState(loadState());
  selectedCondoId = state.selectedCondoId || state.condominiums[0]?.id || "";
  portalCondoId = selectedCondoId;
  runAutomaticQuotas();
  maybeCreateDailyBackup();
  saveState();
  render();
}

function render() {
  if (!state) return;
  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <main class="main">
        ${renderMain()}
      </main>
    </div>
  `;
}

function renderLockScreen(message = "") {
  app.innerHTML = `
    <main class="lock-screen">
      <section class="lock-panel">
        <div class="brand-mark">GC</div>
        <h1>Gestão de Condomínios</h1>
        <p>Os dados deste computador estão protegidos. Introduz a palavra-passe para abrir a aplicação.</p>
        ${message ? `<div class="form-error">${escapeHtml(message)}</div>` : ""}
        <form data-page-form="unlockVault">
          <label class="field">
            <span>Palavra-passe</span>
            <input name="password" type="password" autocomplete="current-password" required />
          </label>
          <button class="button" type="submit">Abrir aplicação</button>
        </form>
      </section>
    </main>
  `;
}

function renderSidebar() {
  const activeCondos = state.condominiums.filter((condo) => condo.active);
  const inactiveCondos = state.condominiums.filter((condo) => !condo.active);

  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">GC</div>
        <div>
          <h1>Gestão de Condomínios</h1>
          <p>Quotas, pagamentos e recibos</p>
        </div>
      </div>

      <nav class="nav-section">
        <button class="nav-button ${activeView === "dashboard" ? "active" : ""}" data-action="go" data-view="dashboard">
          <span>Painel</span><span>›</span>
        </button>
        <button class="nav-button ${activeView === "search" ? "active" : ""}" data-action="go" data-view="search">
          <span>Pesquisa</span><span>›</span>
        </button>
        <button class="nav-button ${activeView === "reports" ? "active" : ""}" data-action="go" data-view="reports">
          <span>Relatórios</span><span>›</span>
        </button>
        <button class="nav-button ${activeView === "portal" ? "active" : ""}" data-action="go" data-view="portal">
          <span>Portal condóminos</span><span>›</span>
        </button>
        <button class="nav-button ${activeView === "settings" ? "active" : ""}" data-action="go" data-view="settings">
          <span>Cópias e dados</span><span>›</span>
        </button>
      </nav>

      <section class="nav-section">
        <div class="actions">
          <p class="nav-title">Condomínios ativos</p>
          <button class="icon-button" data-action="newCondo" title="Novo condomínio" aria-label="Novo condomínio">+</button>
        </div>
        <div class="condo-list">
          ${activeCondos.map(renderCondoButton).join("") || `<div class="empty">Ainda não há condomínios ativos.</div>`}
        </div>
      </section>

      ${
        inactiveCondos.length
          ? `<section class="nav-section">
              <p class="nav-title">Arquivados</p>
              <div class="condo-list">${inactiveCondos.map(renderCondoButton).join("")}</div>
            </section>`
          : ""
      }
    </aside>
  `;
}

function renderCondoButton(condo) {
  return `
    <button class="condo-button ${selectedCondoId === condo.id && activeView === "condo" ? "active" : ""}" data-action="selectCondo" data-id="${condo.id}">
      <span>${escapeHtml(condo.name)}<br /><small>${condo.units.length} frações</small></span>
      <span>›</span>
    </button>
  `;
}

function renderMain() {
  if (activeView === "condo") return renderCondoPage();
  if (activeView === "search") return renderSearch();
  if (activeView === "reports") return renderReports();
  if (activeView === "portal") return renderPortal();
  if (activeView === "settings") return renderSettings();
  return renderDashboard();
}

function renderDashboard() {
  const totals = getTotals();
  const overdue = getOverduePayments();
  const monthIncome = getMonthIncome(activeMonth);
  const monthExpenses = getMonthExpenses(activeMonth);
  const tasks = getDashboardTasks();

  return `
    <div class="topbar">
      <div class="page-title">
        <h2>${viewLabels.dashboard}</h2>
        <p>Resumo rápido do que precisa de atenção.</p>
      </div>
      <div class="actions">
        <button class="button" data-action="newCondo">Novo condomínio</button>
        <button class="ghost-button" data-action="exportBackup">Guardar cópia</button>
      </div>
    </div>

    <section class="grid stats-grid">
      <article class="panel stat"><h3>Condomínios ativos</h3><strong>${totals.activeCondos}</strong><span>${totals.inactiveCondos} arquivados</span></article>
      <article class="panel stat"><h3>Frações ativas</h3><strong>${totals.activeUnits}</strong><span>em todos os condomínios</span></article>
      <article class="panel stat"><h3>Por receber</h3><strong>${money.format(totals.pendingAmount)}</strong><span>quotas pendentes</span></article>
      <article class="panel stat"><h3>Em atraso</h3><strong>${overdue.length}</strong><span>pagamentos por regularizar</span></article>
      <article class="panel stat"><h3>Saldo do mês</h3><strong>${money.format(monthIncome - monthExpenses)}</strong><span>${money.format(monthIncome)} recebido · ${money.format(monthExpenses)} despesas</span></article>
    </section>

    <section class="grid content-grid" style="margin-top: 14px">
      <div class="panel">
        <div class="panel-head">
          <h3>Condomínios</h3>
          <button class="ghost-button" data-action="newCondo">Adicionar</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Nome</th><th>Estado</th><th>Frações</th><th>Por receber</th><th></th></tr></thead>
            <tbody>
              ${
                state.condominiums
                  .map((condo) => {
                    const pending = condo.payments.filter((p) => p.status !== "paid").reduce((sum, p) => sum + Number(p.amount), 0);
                    return `<tr>
                      <td><strong>${escapeHtml(condo.name)}</strong><br /><small>${escapeHtml(formatAddress(condo))}</small></td>
                      <td><span class="pill ${condo.active ? "ok" : "warn"}">${condo.active ? "Ativo" : "Arquivado"}</span></td>
                      <td>${condo.units.filter((unit) => unit.active).length}</td>
                      <td>${money.format(pending)}</td>
                      <td class="actions-cell"><button class="ghost-button" data-action="selectCondo" data-id="${condo.id}">Abrir</button></td>
                    </tr>`;
                  })
                  .join("") || `<tr><td colspan="5"><div class="empty">Cria o primeiro condomínio para começar.</div></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>

      <aside class="panel">
        <div class="panel-head"><h3>Tarefas sugeridas</h3></div>
        <div class="panel-body">
          ${renderTaskList(tasks)}
        </div>
      </aside>
    </section>

    <section class="grid content-grid" style="margin-top: 14px">
      <div class="panel">
        <div class="panel-head"><h3>Pagamentos em atraso</h3></div>
        <div class="panel-body">
          ${renderOverdueList(overdue)}
        </div>
      </div>
      <aside class="panel">
        <div class="panel-head"><h3>Ferramentas rápidas</h3></div>
        <div class="panel-body">
          <div class="quick-actions">
            <button class="ghost-button" data-action="go" data-view="search">Pesquisar tudo</button>
            <button class="ghost-button" data-action="go" data-view="reports">Abrir relatórios</button>
            <button class="ghost-button" data-action="exportEncryptedBackup">Cópia cifrada</button>
            <button class="ghost-button" data-action="importZip">Importar ZIP/Excel</button>
          </div>
        </div>
      </aside>
    </section>
  `;
}

function renderOverdueList(overdue) {
  if (!overdue.length) return `<div class="empty">Não há quotas em atraso.</div>`;
  return overdue
    .slice(0, 8)
    .map(
      ({ condo, unit, payment }) => `
        <div class="receipt-row">
          <div>
            <strong>${escapeHtml(unit.label)}</strong><br />
            <small>${escapeHtml(condo.name)} · ${formatMonth(payment.month)}</small>
          </div>
          <div class="stacked-actions">
            <strong>${money.format(Number(payment.amount))}</strong>
            <button class="ghost-button small-button" data-action="showNotice" data-id="${payment.id}">Aviso</button>
          </div>
        </div>
      `,
    )
    .join("");
}

function renderTaskList(tasks) {
  if (!tasks.length) return `<div class="empty">Está tudo controlado para já.</div>`;
  return tasks
    .map(
      (task) => `
        <div class="task-row">
          <span class="pill ${task.kind}">${escapeHtml(task.label)}</span>
          <div>
            <strong>${escapeHtml(task.title)}</strong><br />
            <small>${escapeHtml(task.detail)}</small>
          </div>
          ${task.action ? `<button class="ghost-button small-button" ${task.action}>Abrir</button>` : ""}
        </div>
      `,
    )
    .join("");
}

function renderSearch() {
  const results = getSearchResults(searchQuery);
  return `
    <div class="topbar">
      <div class="page-title">
        <h2>Pesquisa</h2>
        <p>Encontra condomínios, frações, condóminos, pagamentos, despesas e documentos.</p>
      </div>
    </div>

    <section class="panel">
      <div class="panel-body">
        <label class="field search-field">
          <span>Pesquisar</span>
          <input data-global-search value="${escapeAttr(searchQuery)}" placeholder="Nome, NIF, fração, recibo, fornecedor..." autofocus />
        </label>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Tipo</th><th>Resultado</th><th>Condomínio</th><th>Detalhe</th><th></th></tr></thead>
          <tbody>
            ${
              results
                .map(
                  (result) => `
                    <tr>
                      <td><span class="pill">${escapeHtml(result.type)}</span></td>
                      <td><strong>${escapeHtml(result.title)}</strong></td>
                      <td>${escapeHtml(result.condo.name)}</td>
                      <td>${escapeHtml(result.detail)}</td>
                      <td class="actions-cell"><button class="ghost-button" data-action="selectCondo" data-id="${result.condo.id}">Abrir</button></td>
                    </tr>
                  `,
                )
                .join("") || `<tr><td colspan="5"><div class="empty">${searchQuery ? "Não encontrei resultados." : "Escreve acima para pesquisar em toda a aplicação."}</div></td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderReports() {
  const totals = getTotals();
  const paid = getAllPayments().filter(({ payment }) => payment.status === "paid").reduce((sum, item) => sum + Number(item.payment.amount), 0);
  const expenses = state.condominiums.flatMap((condo) => condo.expenses).reduce((sum, expense) => sum + Number(expense.amount), 0);
  return `
    <div class="topbar">
      <div class="page-title">
        <h2>Relatórios</h2>
        <p>Mapas exportáveis para rever contas, cobranças e recibos.</p>
      </div>
      <div class="actions">
        <button class="ghost-button" data-action="reportDebtors">Mapa de devedores</button>
        <button class="ghost-button" data-action="reportAnnual">Resumo anual</button>
        <button class="button" data-action="openBankReconcile">Reconciliar banco</button>
      </div>
    </div>

    <section class="grid stats-grid">
      <article class="panel stat"><h3>Total recebido</h3><strong>${money.format(paid)}</strong><span>pagamentos marcados como pagos</span></article>
      <article class="panel stat"><h3>Total por receber</h3><strong>${money.format(totals.pendingAmount)}</strong><span>quotas pendentes</span></article>
      <article class="panel stat"><h3>Total despesas</h3><strong>${money.format(expenses)}</strong><span>despesas registadas</span></article>
      <article class="panel stat"><h3>Documentos</h3><strong>${state.condominiums.reduce((sum, condo) => sum + condo.documents.length, 0)}</strong><span>registos guardados</span></article>
    </section>

    <section class="grid report-grid" style="margin-top: 14px">
      <article class="panel report-card">
        <h3>Mapa de devedores</h3>
        <p>Lista quotas pendentes e em atraso, com fração, condómino, vencimento e valor.</p>
        <button class="button" data-action="reportDebtors">Exportar CSV</button>
      </article>
      <article class="panel report-card">
        <h3>Conta corrente</h3>
        <p>Mostra cada movimento de cada fração: quotas pagas, pendentes e referências.</p>
        <button class="button" data-action="reportCurrentAccounts">Exportar CSV</button>
      </article>
      <article class="panel report-card">
        <h3>Resumo anual</h3>
        <p>Agrupa receitas e despesas por condomínio, mês e ano para prestação de contas.</p>
        <button class="button" data-action="reportAnnual">Exportar CSV</button>
      </article>
      <article class="panel report-card">
        <h3>Recibos emitidos</h3>
        <p>Mapa dos recibos já numerados, útil para arquivo e confirmação.</p>
        <button class="button" data-action="reportReceipts">Exportar CSV</button>
      </article>
      <article class="panel report-card">
        <h3>Reconciliação bancária</h3>
        <p>Cola movimentos do banco em CSV e confirma quotas pagas em lote.</p>
        <button class="button" data-action="openBankReconcile">Abrir</button>
      </article>
    </section>
  `;
}

function renderCondoPage() {
  const condo = getCondo(selectedCondoId);
  if (!condo) return `<div class="empty">Escolhe ou cria um condomínio.</div>`;

  return `
    <div class="topbar">
      <div class="page-title">
        <h2>${escapeHtml(condo.name)}</h2>
        <p>${escapeHtml(formatAddress(condo) || "Sem morada definida")} ${condo.nif ? `· NIF ${escapeHtml(condo.nif)}` : ""}</p>
      </div>
      <div class="actions">
        <button class="ghost-button" data-action="editCondo">Editar</button>
        <button class="${condo.active ? "danger-button" : "button"}" data-action="toggleCondo">${condo.active ? "Arquivar" : "Reativar"}</button>
      </div>
    </div>

    <div class="tabs">
      ${tabButton("resumo", "Resumo")}
      ${tabButton("fracoes", "Frações")}
      ${tabButton("quotas", "Quotas")}
      ${tabButton("despesas", "Despesas")}
      ${tabButton("documentos", "Documentos")}
    </div>

    ${renderCondoTab(condo)}
  `;
}

function tabButton(key, label) {
  return `<button class="tab ${activeTab === key ? "active" : ""}" data-action="tab" data-tab="${key}">${label}</button>`;
}

function renderCondoTab(condo) {
  if (activeTab === "resumo") return renderCondoSummary(condo);
  if (activeTab === "fracoes") return renderUnits(condo);
  if (activeTab === "despesas") return renderExpenses(condo);
  if (activeTab === "documentos") return renderDocuments(condo);
  return renderQuotas(condo);
}

function renderCondoSummary(condo) {
  const pending = condo.payments.filter((p) => p.status !== "paid").reduce((sum, p) => sum + Number(p.amount), 0);
  const paidThisMonth = condo.payments.filter((p) => p.status === "paid" && p.month === activeMonth).reduce((sum, p) => sum + Number(p.amount), 0);
  const expensesThisMonth = condo.expenses.filter((e) => e.date.startsWith(activeMonth)).reduce((sum, e) => sum + Number(e.amount), 0);

  return `
    <section class="grid stats-grid">
      <article class="panel stat"><h3>Frações ativas</h3><strong>${condo.units.filter((u) => u.active).length}</strong><span>${condo.units.length} no total</span></article>
      <article class="panel stat"><h3>Quotas pendentes</h3><strong>${money.format(pending)}</strong><span>por regularizar</span></article>
      <article class="panel stat"><h3>Recebido no mês</h3><strong>${money.format(paidThisMonth)}</strong><span>${formatMonth(activeMonth)}</span></article>
      <article class="panel stat"><h3>Despesas no mês</h3><strong>${money.format(expensesThisMonth)}</strong><span>${formatMonth(activeMonth)}</span></article>
    </section>
    <section class="panel" style="margin-top: 14px">
      <div class="panel-head"><h3>Dados do condomínio</h3></div>
      <div class="panel-body">
        <p><strong>Administrador:</strong> ${escapeHtml(condo.managerName || "Por definir")}</p>
        <p><strong>IBAN:</strong> ${escapeHtml(condo.iban || "Por definir")}</p>
        <p><strong>Quotas automáticas:</strong> ${condo.autoGenerate ? `Ativas, dia ${condo.dueDay || 10}` : "Desativadas"}</p>
        <p><strong>Notas:</strong> ${escapeHtml(condo.notes || "Sem notas.")}</p>
      </div>
    </section>
  `;
}

function renderUnits(condo) {
  return `
    <section class="panel">
      <div class="panel-head">
        <h3>Frações e condóminos</h3>
        <button class="button" data-action="newUnit">Nova fração</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fração</th><th>Proprietário</th><th>Quota mensal</th><th>Permilagem</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${
              condo.units
                .map(
                  (unit) => `
                    <tr>
                      <td><strong>${escapeHtml(unit.label)}</strong><br /><small>${escapeHtml(unit.notes || "")}</small></td>
                      <td>${escapeHtml(formatUnitOwners(unit))}<br /><small>${escapeHtml(unit.ownerNif ? `NIF ${unit.ownerNif} · ` : "")}${escapeHtml(unit.email || "")} ${escapeHtml(unit.phone || "")}</small></td>
                      <td>${money.format(Number(unit.monthlyFee || 0))}</td>
                      <td>${unit.percentage || 0}‰</td>
                      <td><span class="pill ${unit.active ? "ok" : "warn"}">${unit.active ? "Ativa" : "Arquivada"}</span></td>
                      <td class="actions-cell">
                        <button class="ghost-button" data-action="editUnit" data-id="${unit.id}">Editar</button>
                        <button class="ghost-button" data-action="toggleUnit" data-id="${unit.id}">${unit.active ? "Arquivar" : "Reativar"}</button>
                      </td>
                    </tr>
                  `,
                )
                .join("") || `<tr><td colspan="6"><div class="empty">Ainda não há frações.</div></td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderQuotas(condo) {
  const payments = condo.payments.filter((payment) => payment.month === activeMonth);

  return `
    <section class="panel">
      <div class="panel-head">
        <h3>Quotas e pagamentos</h3>
        <div class="actions">
          <button class="ghost-button" data-action="exportCsv">Exportar CSV</button>
          <button class="ghost-button" data-action="printMonthReceipts">Recibos do mês</button>
          <button class="button" data-action="generateQuotas">Gerar quotas</button>
        </div>
      </div>
      <div class="panel-body">
        <div class="toolbar">
          <label class="field" style="max-width: 220px">
            <span>Mês</span>
            <input type="month" value="${activeMonth}" data-month-filter />
          </label>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Fração</th><th>Condómino</th><th>Vencimento</th><th>Valor</th><th>Estado</th><th>Recibo</th><th></th></tr></thead>
            <tbody>
              ${
                payments
                  .map((payment) => {
                    const unit = condo.units.find((item) => item.id === payment.unitId) || {};
                    const overdue = payment.status !== "paid" && payment.dueDate < today();
                    return `<tr>
                      <td><strong>${escapeHtml(unit.label || "Fração removida")}</strong></td>
                      <td>${escapeHtml(formatUnitOwners(unit))}</td>
                      <td>${formatDate(payment.dueDate)}</td>
                      <td>${money.format(Number(payment.amount))}</td>
                      <td><span class="pill ${payment.status === "paid" ? "ok" : overdue ? "danger" : "warn"}">${payment.status === "paid" ? "Pago" : overdue ? "Em atraso" : "Pendente"}</span></td>
                      <td>${payment.receiptNumber ? escapeHtml(payment.receiptNumber) : "—"}</td>
                      <td class="actions-cell">
                        ${
                          payment.status === "paid"
                            ? `<button class="ghost-button" data-action="showReceipt" data-id="${payment.id}">Ver recibo</button>`
                            : `<button class="button" data-action="markPaid" data-id="${payment.id}">Marcar pago</button>
                              <button class="ghost-button" data-action="showNotice" data-id="${payment.id}">Aviso</button>`
                        }
                      </td>
                    </tr>`;
                  })
                  .join("") || `<tr><td colspan="7"><div class="empty">Ainda não há quotas para ${formatMonth(activeMonth)}.</div></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

function renderExpenses(condo) {
  return `
    <section class="panel">
      <div class="panel-head">
        <h3>Despesas</h3>
        <button class="button" data-action="newExpense">Nova despesa</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Categoria</th><th>Fornecedor</th><th>Descrição</th><th>Valor</th><th>Documento</th></tr></thead>
          <tbody>
            ${
              condo.expenses
                .slice()
                .sort((a, b) => b.date.localeCompare(a.date))
                .map(
                  (expense) => `
                    <tr>
                      <td>${formatDate(expense.date)}</td>
                      <td>${escapeHtml(expense.category)}</td>
                      <td>${escapeHtml(expense.supplier || "")}</td>
                      <td>${escapeHtml(expense.description)}</td>
                      <td>${money.format(Number(expense.amount))}</td>
                      <td>${escapeHtml(expense.documentName || "—")}</td>
                    </tr>
                  `,
                )
                .join("") || `<tr><td colspan="6"><div class="empty">Ainda não há despesas registadas.</div></td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDocuments(condo) {
  return `
    <section class="panel">
      <div class="panel-head">
        <h3>Documentos</h3>
        <button class="button" data-action="newDocument">Novo registo</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Tipo</th><th>Título</th><th>Notas</th></tr></thead>
          <tbody>
            ${
              condo.documents
                .slice()
                .sort((a, b) => b.date.localeCompare(a.date))
                .map(
                  (doc) => `
                    <tr>
                      <td>${formatDate(doc.date)}</td>
                      <td>${escapeHtml(doc.type)}</td>
                      <td><strong>${escapeHtml(doc.title)}</strong></td>
                      <td>${escapeHtml(doc.notes || "")}</td>
                    </tr>
                  `,
                )
                .join("") || `<tr><td colspan="4"><div class="empty">Regista atas, seguros, contratos ou outros documentos importantes.</div></td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderPortal() {
  const condo = getCondo(portalCondoId) || state.condominiums[0];
  if (!condo) return `<div class="empty">Cria um condomínio antes de usar o portal.</div>`;
  if (!portalUnitId) portalUnitId = condo.units[0]?.id || "";
  const unit = condo.units.find((item) => item.id === portalUnitId) || condo.units[0];
  const payments = unit ? condo.payments.filter((payment) => payment.unitId === unit.id).sort((a, b) => b.month.localeCompare(a.month)) : [];

  return `
    <div class="topbar">
      <div class="page-title">
        <h2>Portal dos condóminos</h2>
        <p>Vista simples para validar o que um condómino poderia consultar.</p>
      </div>
    </div>
    <section class="panel">
      <div class="panel-body">
        <div class="mini-form">
          <label class="field">
            <span>Condomínio</span>
            <select data-portal-condo>
              ${state.condominiums.map((item) => `<option value="${item.id}" ${item.id === condo.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Fração</span>
            <select data-portal-unit>
              ${condo.units.map((item) => `<option value="${item.id}" ${item.id === unit?.id ? "selected" : ""}>${escapeHtml(item.label)} · ${escapeHtml(formatUnitOwners(item))}</option>`).join("")}
            </select>
          </label>
        </div>
      </div>
    </section>

    ${
      unit
        ? `<section class="grid content-grid" style="margin-top: 14px">
            <div class="panel">
              <div class="panel-head"><h3>Quotas da fração ${escapeHtml(unit.label)}</h3></div>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Mês</th><th>Valor</th><th>Estado</th><th>Recibo</th></tr></thead>
                  <tbody>
                    ${
                      payments
                        .map(
                          (payment) => `
                            <tr>
                              <td>${formatMonth(payment.month)}</td>
                              <td>${money.format(Number(payment.amount))}</td>
                              <td><span class="pill ${payment.status === "paid" ? "ok" : "warn"}">${payment.status === "paid" ? "Pago" : "Pendente"}</span></td>
                              <td>${payment.receiptNumber ? `<button class="ghost-button" data-action="showReceipt" data-id="${payment.id}">${escapeHtml(payment.receiptNumber)}</button>` : "—"}</td>
                            </tr>
                          `,
                        )
                        .join("") || `<tr><td colspan="4"><div class="empty">Ainda não há quotas.</div></td></tr>`
                    }
                  </tbody>
                </table>
              </div>
            </div>
            <aside class="panel">
              <div class="panel-head"><h3>Documentos disponíveis</h3></div>
              <div class="panel-body">
                ${
                  condo.documents.length
                    ? condo.documents
                        .slice(0, 6)
                        .map((doc) => `<div class="receipt-row"><div><strong>${escapeHtml(doc.title)}</strong><br /><small>${escapeHtml(doc.type)} · ${formatDate(doc.date)}</small></div></div>`)
                        .join("")
                    : `<div class="empty">Sem documentos registados.</div>`
                }
              </div>
            </aside>
          </section>`
        : `<div class="empty">Este condomínio ainda não tem frações.</div>`
    }
  `;
}

function renderSettings() {
  const vaultEnabled = Boolean(localStorage.getItem(VAULT_KEY)) && vault.unlocked;
  const autoBackups = getAutomaticBackups();
  const lastAutoBackup = autoBackups[0];
  return `
    <div class="topbar">
      <div class="page-title">
        <h2>Cópias e dados</h2>
        <p>Importa dados antigos, protege cópias e leva os dados contigo.</p>
      </div>
    </div>
    <section class="grid content-grid">
      <div class="panel">
        <div class="panel-head"><h3>Cópia de segurança</h3></div>
        <div class="panel-body">
          <p>Exporta cópias cifradas com palavra-passe. A cópia normal continua disponível para migração técnica, mas deve ser guardada com cuidado.</p>
          <div class="actions">
            <button class="button" data-action="exportEncryptedBackup">Exportar cópia cifrada</button>
            <button class="ghost-button" data-action="exportBackup">Exportar JSON simples</button>
            <button class="ghost-button" data-action="importBackup">Importar cópia</button>
          </div>
        </div>
      </div>
      <aside class="panel">
        <div class="panel-head"><h3>Importar dados antigos</h3></div>
        <div class="panel-body">
          <p>Carrega um ZIP com ficheiros CSV, XLSX, JSON ou documentos. A aplicação lê os dados, classifica documentos e só atualiza depois de confirmares.</p>
          <button class="button" data-action="importZip">Importar ZIP/Excel</button>
        </div>
      </aside>
      <div class="panel">
        <div class="panel-head"><h3>Cópias automáticas locais</h3></div>
        <div class="panel-body">
          <p>${lastAutoBackup ? `Última cópia local: ${formatDate(lastAutoBackup.date)} · ${escapeHtml(lastAutoBackup.reason)}.` : "Ainda não há cópias automáticas locais neste computador."}</p>
          <p>São guardadas até 10 versões recentes antes de importações e uma vez por dia. Com o cofre ativo, privilegia a cópia cifrada.</p>
          <div class="actions">
            <button class="ghost-button" data-action="exportAutoBackup" ${lastAutoBackup ? "" : "disabled"}>Exportar última cópia local</button>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Cofre local</h3></div>
        <div class="panel-body">
          <p>${vaultEnabled ? "O cofre está ativo. Ao voltar a abrir a aplicação, será pedida a palavra-passe." : "Ativa uma palavra-passe mestre para cifrar os dados guardados neste computador."}</p>
          <div class="actions">
            ${vaultEnabled ? `<button class="button" data-action="lockVault">Bloquear agora</button>` : `<button class="button" data-action="enableVault">Ativar cofre</button>`}
          </div>
        </div>
      </div>
      <aside class="panel">
        <div class="panel-head"><h3>Dados de teste</h3></div>
        <div class="panel-body">
          <p>Repõe um exemplo para testar ou limpa tudo para começar a trabalhar de raiz.</p>
          <div class="actions">
            <button class="ghost-button" data-action="resetSample">Repor exemplo</button>
            <button class="danger-button" data-action="resetEmpty">Limpar tudo</button>
          </div>
        </div>
      </aside>
    </section>
  `;
}

function openCondoForm(condo = {}) {
  openModal(
    condo.id ? "Editar condomínio" : "Novo condomínio",
    `
      <form data-form="condo">
        <input type="hidden" name="id" value="${condo.id || ""}" />
        <div class="form-grid">
          ${field("Nome", "name", condo.name, "text", true, "", { maxlength: 90 })}
          ${field("NIF", "nif", condo.nif, "text", true, "", { inputmode: "numeric", maxlength: 9, pattern: "\\d{9}", title: "O NIF deve ter exatamente 9 algarismos." })}
          ${field("Morada", "address", condo.address, "text", false, "full")}
          ${field("Código postal", "postalCode", condo.postalCode, "text", true, "", { maxlength: 8, pattern: "\\d{4}-\\d{3}", placeholder: "1000-001", title: "Usa o formato 0000-000." })}
          ${field("Localidade", "city", condo.city, "text", false, "", { maxlength: 60 })}
          ${field("Administrador", "managerName", condo.managerName, "text", false, "", { maxlength: 90 })}
          ${field("IBAN", "iban", condo.iban, "text", false, "", { maxlength: 34, pattern: "PT50\\s?\\d{4}\\s?\\d{4}\\s?\\d{4}\\s?\\d{4}\\s?\\d{4}\\s?\\d", title: "Usa um IBAN português no formato PT50..." })}
          ${field("Dia de vencimento", "dueDay", condo.dueDay || 10, "number", true, "", { min: 1, max: 28, step: 1 })}
          ${checkboxField("Gerar quotas automaticamente todos os meses", "autoGenerate", condo.autoGenerate !== false, "full")}
          ${textArea("Notas", "notes", condo.notes, "full")}
        </div>
        ${formActions()}
      </form>
    `,
  );
}

function openUnitForm(unit = {}) {
  openModal(
    unit.id ? "Editar fração" : "Nova fração",
    `
      <form data-form="unit">
        <input type="hidden" name="id" value="${unit.id || ""}" />
        <div class="form-grid">
          ${field("Fração", "label", unit.label, "text", true, "", { maxlength: 40 })}
          ${field("Titular 1", "ownerName", unit.ownerName, "text", true, "", { maxlength: 90 })}
          ${field("Titular 2 / marido ou mulher", "coOwnerName", unit.coOwnerName, "text", false, "", { maxlength: 90 })}
          ${field("NIF do proprietário", "ownerNif", unit.ownerNif, "text", false, "", { inputmode: "numeric", maxlength: 9, pattern: "\\d{9}", title: "O NIF deve ter exatamente 9 algarismos." })}
          ${field("Email", "email", unit.email, "email", false, "", { maxlength: 120 })}
          ${field("Telefone", "phone", unit.phone, "text", false, "", { inputmode: "numeric", maxlength: 9, pattern: "\\d{9}", title: "Usa 9 algarismos, sem espaços." })}
          ${field("Quota mensal", "monthlyFee", unit.monthlyFee || 0, "number", true, "", { min: 0, max: 10000, step: "0.01" })}
          ${field("Permilagem", "percentage", unit.percentage || 0, "number", false, "", { min: 0, max: 1000, step: "0.01" })}
          ${textArea("Notas", "notes", unit.notes, "full")}
        </div>
        ${formActions()}
      </form>
    `,
  );
}

function openGenerateQuotasForm() {
  openModal(
    "Gerar quotas mensais",
    `
      <form data-form="generateQuotas">
        <div class="form-grid">
          ${field("Mês", "month", activeMonth, "month", true)}
          ${field("Dia de vencimento", "dueDay", getCondo(selectedCondoId)?.dueDay || 10, "number", true, "", { min: 1, max: 28, step: 1 })}
        </div>
        <p>Serão criadas quotas para as frações ativas que ainda não tenham quota nesse mês.</p>
        ${formActions("Gerar")}
      </form>
    `,
  );
}

function openPaymentForm(paymentId) {
  const payment = getPayment(paymentId);
  const unit = getUnit(payment.unitId);
  openModal(
    "Marcar pagamento",
    `
      <form data-form="payment">
        <input type="hidden" name="id" value="${payment.id}" />
        <div class="form-grid">
          <div class="field full">
            <label>Pagamento</label>
            <input value="${escapeHtml(unit?.label || "")} · ${formatMonth(payment.month)} · ${money.format(Number(payment.amount))}" disabled />
          </div>
          ${field("Data de pagamento", "paidAt", today(), "date", true)}
          ${field("Valor pago", "amount", payment.amount, "number", true, "", { min: 0, max: 10000, step: "0.01" })}
          ${selectField("Método", "method", payment.method || "Transferência", ["Transferência", "Numerário", "MB Way", "Cheque", "Outro"])}
          ${field("Referência", "reference", payment.reference || "")}
          ${textArea("Notas", "notes", payment.notes, "full")}
        </div>
        ${formActions("Guardar e criar recibo")}
      </form>
    `,
  );
}

function openExpenseForm() {
  openModal(
    "Nova despesa",
    `
      <form data-form="expense">
        <div class="form-grid">
          ${field("Data", "date", today(), "date", true)}
          ${selectField("Categoria", "category", "Manutenção", ["Manutenção", "Limpeza", "Água", "Eletricidade", "Seguro", "Obras", "Outros"])}
          ${field("Fornecedor", "supplier", "", "text", false, "", { maxlength: 90 })}
          ${field("Valor", "amount", 0, "number", true, "", { min: 0, max: 100000, step: "0.01" })}
          ${field("Documento", "documentName", "", "text", false, "full")}
          ${textArea("Descrição", "description", "", "full", true)}
        </div>
        ${formActions()}
      </form>
    `,
  );
}

function openDocumentForm() {
  openModal(
    "Novo documento",
    `
      <form data-form="document">
        <div class="form-grid">
          ${field("Data", "date", today(), "date", true)}
          ${selectField("Tipo", "type", "Ata", ["Ata", "Seguro", "Contrato", "Orçamento", "Aviso", "Outro"])}
          ${field("Título", "title", "", "text", true, "full")}
          ${textArea("Notas", "notes", "", "full")}
        </div>
        ${formActions()}
      </form>
    `,
  );
}

function openBankReconcileForm() {
  openModal(
    "Reconciliação bancária",
    `
      <form data-form="bankReconcile">
        <div class="form-grid">
          <label class="field full">
            <span>Movimentos do banco em CSV</span>
            <textarea name="movements" required placeholder="Data;Descrição;Valor&#10;2026-01-08;Quota Fração A;45,00"></textarea>
          </label>
        </div>
        <p>Usa movimentos com colunas como data, descrição e valor. A app tenta casar pelo valor e por texto do condómino, fração ou referência.</p>
        ${formActions("Procurar correspondências")}
      </form>
    `,
  );
}

function saveCondo(data) {
  if (data.id) {
    Object.assign(getCondo(data.id), {
      name: data.name,
      nif: data.nif,
      address: data.address,
      postalCode: data.postalCode,
      city: data.city,
      managerName: data.managerName,
      iban: data.iban,
      dueDay: Number(data.dueDay || 10),
      autoGenerate: data.autoGenerate === "on",
      notes: data.notes,
    });
    return;
  }

  const condo = {
    id: uid(),
    name: data.name,
    nif: data.nif,
    address: data.address,
    postalCode: data.postalCode,
    city: data.city,
    managerName: data.managerName,
    iban: data.iban,
    dueDay: Number(data.dueDay || 10),
    autoGenerate: data.autoGenerate === "on",
    notes: data.notes,
    active: true,
    units: [],
    payments: [],
    expenses: [],
    documents: [],
  };
  state.condominiums.push(condo);
  selectedCondoId = condo.id;
  activeView = "condo";
}

function saveUnit(data) {
  const condo = getCondo(selectedCondoId);
  const payload = {
    label: data.label,
    ownerName: data.ownerName,
    coOwnerName: data.coOwnerName,
    ownerNif: data.ownerNif,
    email: data.email,
    phone: data.phone,
    monthlyFee: Number(data.monthlyFee || 0),
    percentage: Number(data.percentage || 0),
    notes: data.notes,
  };

  if (data.id) {
    Object.assign(getUnit(data.id), payload);
    return;
  }

  condo.units.push({ id: uid(), active: true, ...payload });
}

function generateQuotas(data) {
  const condo = getCondo(selectedCondoId);
  createMissingQuotas(condo, data.month, Number(data.dueDay || condo.dueDay || 10));
  activeMonth = data.month;
  activeTab = "quotas";
}

function savePayment(data) {
  const payment = getPayment(data.id);
  payment.amount = Number(data.amount || payment.amount);
  payment.paidAt = data.paidAt;
  payment.method = data.method;
  payment.reference = data.reference;
  payment.notes = data.notes;
  payment.status = "paid";
  if (!payment.receiptNumber) {
    payment.receiptNumber = `RC-${new Date().getFullYear()}-${String(state.receiptSequence).padStart(4, "0")}`;
    state.receiptSequence += 1;
  }
}

function saveExpense(data) {
  const condo = getCondo(selectedCondoId);
  condo.expenses.push({
    id: uid(),
    date: data.date,
    category: data.category,
    supplier: data.supplier,
    description: data.description,
    amount: Number(data.amount || 0),
    documentName: data.documentName,
  });
}

function saveDocument(data) {
  const condo = getCondo(selectedCondoId);
  condo.documents.push({
    id: uid(),
    date: data.date,
    type: data.type,
    title: data.title,
    notes: data.notes,
  });
}

function reconcileBankMovements(data) {
  const movements = parseBankMovements(data.movements || "");
  const matches = findBankMatches(movements);
  window.pendingBankMatches = matches;
  modal.close();

  openModal(
    "Pré-visualização da reconciliação",
    `
      <div class="receipt-preview">
        <div class="import-summary">
          <strong>${movements.length}</strong><span>movimentos lidos</span>
          <strong>${matches.length}</strong><span>pagamentos encontrados</span>
          <strong>${money.format(matches.reduce((sum, item) => sum + Number(item.payment.amount), 0))}</strong><span>valor a marcar como pago</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Movimento</th><th>Quota encontrada</th><th>Valor</th></tr></thead>
            <tbody>
              ${
                matches
                  .map(
                    ({ movement, condo, unit, payment }) => `
                      <tr>
                        <td>${formatDate(movement.date)}<br /><small>${escapeHtml(movement.description)}</small></td>
                        <td><strong>${escapeHtml(condo.name)}</strong><br /><small>${escapeHtml(unit.label || "")} · ${escapeHtml(formatUnitOwners(unit))} · ${formatMonth(payment.month)}</small></td>
                        <td>${money.format(Number(payment.amount))}</td>
                      </tr>
                    `,
                  )
                  .join("") || `<tr><td colspan="3"><div class="empty">Não encontrei correspondências seguras. Confirma se o CSV tem data, descrição e valor.</div></td></tr>`
              }
            </tbody>
          </table>
        </div>
        <div class="form-actions">
          <button class="ghost-button" data-close-modal>Cancelar</button>
          <button class="button" type="button" onclick="confirmBankReconciliation()" ${matches.length ? "" : "disabled"}>Marcar como pagos</button>
        </div>
      </div>
    `,
  );
}

function confirmBankReconciliation() {
  const matches = window.pendingBankMatches || [];
  if (!matches.length) return;
  saveAutomaticBackup("Antes da reconciliação bancária");
  matches.forEach(({ movement, payment }) => {
    payment.status = "paid";
    payment.paidAt = movement.date || today();
    payment.method = "Transferência";
    payment.reference = movement.description;
    if (!payment.receiptNumber) {
      payment.receiptNumber = `RC-${new Date().getFullYear()}-${String(state.receiptSequence).padStart(4, "0")}`;
      state.receiptSequence += 1;
    }
  });
  window.pendingBankMatches = null;
  modal.close();
  saveState();
  render();
}

function toggleCondo(id) {
  const condo = getCondo(id);
  condo.active = !condo.active;
  saveState();
  render();
}

function toggleUnit(id) {
  const unit = getUnit(id);
  unit.active = !unit.active;
  saveState();
  render();
}

function openReceipt(paymentId) {
  const receipt = buildReceipt(paymentId);
  openModal(
    "Recibo",
    `
      <div class="receipt-preview">
        ${receipt.html}
        <div class="form-actions">
          <button class="ghost-button" data-close-modal>Fechar</button>
          <button class="button" type="button" onclick="printReceipt('${paymentId}')">Imprimir</button>
        </div>
      </div>
    `,
  );
}

function printReceipt(paymentId) {
  const receipt = buildReceipt(paymentId);
  printArea.innerHTML = `<div class="print-receipt">${receipt.html}</div>`;
  window.print();
}

function printMonthReceipts() {
  const condo = getCondo(selectedCondoId);
  if (!condo) return;
  const paidPayments = condo.payments.filter((payment) => payment.month === activeMonth && payment.status === "paid");
  if (!paidPayments.length) {
    alert(`Não há recibos pagos para ${formatMonth(activeMonth)}.`);
    return;
  }
  printArea.innerHTML = paidPayments
    .map((payment) => `<div class="print-receipt page-break">${buildReceipt(payment.id).html}</div>`)
    .join("");
  window.print();
}

function openPaymentNotice(paymentId) {
  const notice = buildPaymentNotice(paymentId);
  openModal(
    "Aviso de cobrança",
    `
      <div class="receipt-preview">
        ${notice.html}
        <div class="form-actions">
          <button class="ghost-button" data-close-modal>Fechar</button>
          <button class="button" type="button" onclick="printPaymentNotice('${paymentId}')">Imprimir</button>
        </div>
      </div>
    `,
  );
}

function printPaymentNotice(paymentId) {
  const notice = buildPaymentNotice(paymentId);
  printArea.innerHTML = `<div class="print-receipt">${notice.html}</div>`;
  window.print();
}

function buildReceipt(paymentId) {
  const condo = state.condominiums.find((item) => item.payments.some((payment) => payment.id === paymentId));
  const payment = condo.payments.find((item) => item.id === paymentId);
  const unit = condo.units.find((item) => item.id === payment.unitId) || {};
  const html = `
    <article class="receipt-box">
      <h2>Recibo de quota de condomínio</h2>
      <p><strong>${escapeHtml(payment.receiptNumber || "Sem número")}</strong></p>
      <div class="receipt-row"><span>Condomínio</span><strong>${escapeHtml(condo.name)}</strong></div>
      <div class="receipt-row"><span>Morada</span><strong>${escapeHtml(formatAddress(condo) || "—")}</strong></div>
      <div class="receipt-row"><span>NIF do condomínio</span><strong>${escapeHtml(condo.nif || "—")}</strong></div>
      <div class="receipt-row"><span>Fração</span><strong>${escapeHtml(unit.label || "—")}</strong></div>
      <div class="receipt-row"><span>Condómino(s)</span><strong>${escapeHtml(formatUnitOwners(unit) || "—")}</strong></div>
      <div class="receipt-row"><span>Período</span><strong>${formatMonth(payment.month)}</strong></div>
      <div class="receipt-row"><span>Valor</span><strong>${money.format(Number(payment.amount))}</strong></div>
      <div class="receipt-row"><span>Data de pagamento</span><strong>${formatDate(payment.paidAt)}</strong></div>
      <div class="receipt-row"><span>Método</span><strong>${escapeHtml(payment.method || "—")}</strong></div>
      <div class="receipt-row"><span>Referência</span><strong>${escapeHtml(payment.reference || "—")}</strong></div>
      <p>Emitido por ${escapeHtml(condo.managerName || "administrador do condomínio")} em ${formatDate(today())}.</p>
    </article>
  `;
  return { condo, payment, unit, html };
}

function buildPaymentNotice(paymentId) {
  const condo = state.condominiums.find((item) => item.payments.some((payment) => payment.id === paymentId));
  const payment = condo.payments.find((item) => item.id === paymentId);
  const unit = condo.units.find((item) => item.id === payment.unitId) || {};
  const html = `
    <article class="receipt-box">
      <h2>Aviso de cobrança</h2>
      <p>Quota de condomínio pendente</p>
      <div class="receipt-row"><span>Condomínio</span><strong>${escapeHtml(condo.name)}</strong></div>
      <div class="receipt-row"><span>Morada</span><strong>${escapeHtml(formatAddress(condo) || "—")}</strong></div>
      <div class="receipt-row"><span>Fração</span><strong>${escapeHtml(unit.label || "—")}</strong></div>
      <div class="receipt-row"><span>Condómino(s)</span><strong>${escapeHtml(formatUnitOwners(unit) || "—")}</strong></div>
      <div class="receipt-row"><span>Período</span><strong>${formatMonth(payment.month)}</strong></div>
      <div class="receipt-row"><span>Vencimento</span><strong>${formatDate(payment.dueDate)}</strong></div>
      <div class="receipt-row"><span>Valor em aberto</span><strong>${money.format(Number(payment.amount))}</strong></div>
      <div class="receipt-row"><span>IBAN</span><strong>${escapeHtml(condo.iban || "—")}</strong></div>
      <p>Solicita-se a regularização do valor indicado. Depois de confirmado o pagamento, será emitido o respetivo recibo.</p>
      <p>Emitido por ${escapeHtml(condo.managerName || "administrador do condomínio")} em ${formatDate(today())}.</p>
    </article>
  `;
  return { condo, payment, unit, html };
}

function downloadBackup() {
  saveState();
  downloadFile(`copia-condominios-${today()}.json`, JSON.stringify(state, null, 2), "application/json");
}

async function downloadEncryptedBackup() {
  const password = prompt("Palavra-passe para cifrar esta cópia de segurança:");
  if (!password) return;
  if (password.length < 10) {
    alert("Usa pelo menos 10 caracteres.");
    return;
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  const encrypted = await encryptJson(state, key);
  const payload = {
    app: "gestao-condominios",
    kind: "encrypted-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    salt: bytesToBase64(salt),
    ...encrypted,
  };
  downloadFile(`copia-cifrada-condominios-${today()}.json`, JSON.stringify(payload, null, 2), "application/json");
}

async function handleImportFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json")) {
    const imported = JSON.parse(await file.text());
    if (imported.kind === "encrypted-backup") {
      openEncryptedImportForm(imported);
      return;
    }
    importStateObject(imported);
    return;
  }

  if (name.endsWith(".csv")) {
    const rows = parseCsv(await file.text());
    previewSmartImport(buildStateFromRows(rows, file.name));
    return;
  }

  if (name.endsWith(".xlsx")) {
    const rows = await parseXlsx(await file.arrayBuffer());
    previewSmartImport(buildStateFromRows(rows, file.name));
    return;
  }

  if (name.endsWith(".zip")) {
    const rows = await readImportZip(await file.arrayBuffer());
    previewSmartImport(buildStateFromRows(rows, file.name));
    return;
  }

  throw new Error("Formato ainda não suportado. Usa JSON, ZIP, CSV ou XLSX.");
}

function importStateObject(imported) {
  if (!Array.isArray(imported.condominiums)) throw new Error("Formato inválido.");
  saveAutomaticBackup("Antes de importar cópia");
  state = migrateState({
    selectedCondoId: imported.selectedCondoId || imported.condominiums[0]?.id || "",
    receiptSequence: Number(imported.receiptSequence || 1),
    condominiums: imported.condominiums,
  });
  selectedCondoId = state.selectedCondoId;
  portalCondoId = selectedCondoId;
  runAutomaticQuotas();
  saveState();
  render();
}

function openEncryptedImportForm(payload) {
  window.pendingEncryptedImport = payload;
  openModal(
    "Importar cópia cifrada",
    `
      <form data-form="encryptedImport">
        ${field("Palavra-passe da cópia", "password", "", "password", true, "full", { autocomplete: "current-password" })}
        ${formActions("Importar")}
      </form>
    `,
  );
}

async function importEncryptedBackup(data) {
  try {
    const payload = window.pendingEncryptedImport;
    const key = await deriveKey(data.password, base64ToBytes(payload.salt));
    const decoded = await decryptJson(payload, key);
    importStateObject(decoded);
    window.pendingEncryptedImport = null;
    modal.close();
  } catch (error) {
    showFormError(document.querySelector("[data-form='encryptedImport']"), "Palavra-passe incorreta ou ficheiro danificado.");
  }
}

async function readImportZip(buffer) {
  const entries = await unzipEntries(buffer);
  const rows = [];
  for (const entry of entries) {
    const lower = entry.name.toLowerCase();
    if (lower.endsWith("/") || !entry.bytes?.length) continue;
    const condoFromPath = guessCondoNameFromPath(entry.name);
    if (lower.endsWith(".csv")) rows.push(...parseCsv(bytesToText(entry.bytes)).map((row) => ({ condominio: condoFromPath, ...row, origem: entry.name })));
    if (lower.endsWith(".json")) {
      const parsed = JSON.parse(bytesToText(entry.bytes));
      if (Array.isArray(parsed)) rows.push(...parsed.map((row) => ({ condominio: condoFromPath, ...row, origem: entry.name })));
      if (Array.isArray(parsed.condominiums)) return parsed.condominiums.flatMap((condo) => condo.units.map((unit) => ({ ...unit, condominio: condo.name, origem: entry.name })));
    }
    if (lower.endsWith(".xlsx")) rows.push(...(await parseXlsx(entry.bytes)).map((row) => ({ condominio: condoFromPath, ...row, origem: entry.name })));
    if (isDocumentFile(lower)) {
      rows.push({
        tipo_linha: "documento",
        condominio: condoFromPath || "Documentos importados",
        data: today(),
        tipo_documento: classifyDocument(entry.name),
        titulo: cleanDocumentTitle(entry.name),
        notas: entry.name,
        origem: entry.name,
      });
    }
  }
  return rows;
}

function previewSmartImport(importedState) {
  if (!importedState.condominiums.length) {
    alert("Não encontrei condomínios/frações reconhecíveis. O ideal é ter colunas como condomínio, fração, proprietário, email, telefone e quota.");
    return;
  }

  window.pendingSmartImport = importedState;
  const units = importedState.condominiums.reduce((sum, condo) => sum + condo.units.length, 0);
  const documents = importedState.condominiums.reduce((sum, condo) => sum + condo.documents.length, 0);
  openModal(
    "Pré-visualização da importação",
    `
      <div class="receipt-preview">
        <div class="import-summary">
          <strong>${importedState.condominiums.length}</strong><span>condomínios encontrados</span>
          <strong>${units}</strong><span>frações/condóminos encontrados</span>
          <strong>${documents}</strong><span>documentos classificados</span>
          <strong>${importedState.importWarnings.length}</strong><span>avisos a rever</span>
        </div>
        ${
          importedState.importWarnings.length
            ? `<div class="form-error">${importedState.importWarnings.slice(0, 5).map(escapeHtml).join("<br>")}</div>`
            : ""
        }
        <div class="table-wrap">
          <table>
            <thead><tr><th>Condomínio</th><th>Frações</th><th>Origem</th></tr></thead>
            <tbody>
              ${importedState.condominiums
                .map((condo) => `<tr><td><strong>${escapeHtml(condo.name)}</strong></td><td>${condo.units.length}</td><td>${escapeHtml(condo.importSource || "ficheiro")}</td></tr>`)
                .join("")}
            </tbody>
          </table>
        </div>
        <div class="form-actions">
          <button class="ghost-button" data-close-modal>Cancelar</button>
          <button class="button" type="button" onclick="confirmSmartImport()">Adicionar/atualizar dados</button>
        </div>
      </div>
    `,
  );
}

function confirmSmartImport() {
  const imported = window.pendingSmartImport;
  saveAutomaticBackup("Antes de importar dados");
  mergeImportedState(imported);
  window.pendingSmartImport = null;
  modal.close();
  saveState();
  render();
}

function mergeImportedState(imported) {
  imported.condominiums.forEach((incoming) => {
    const existing = state.condominiums.find((condo) => normalizeKey(condo.name) === normalizeKey(incoming.name));
    if (!existing) {
      state.condominiums.push(incoming);
      return;
    }
    Object.assign(existing, {
      nif: existing.nif || incoming.nif,
      address: existing.address || incoming.address,
      postalCode: existing.postalCode === "0000-000" ? incoming.postalCode : existing.postalCode,
      city: existing.city || incoming.city,
      iban: existing.iban || incoming.iban,
    });
    incoming.units.forEach((incomingUnit) => {
      const unit = existing.units.find((item) => normalizeKey(item.label) === normalizeKey(incomingUnit.label));
      if (unit) Object.assign(unit, { ...incomingUnit, id: unit.id, active: unit.active });
      else existing.units.push(incomingUnit);
    });
    incoming.payments.forEach((incomingPayment) => {
      const incomingUnit = incoming.units.find((unit) => unit.id === incomingPayment.unitId);
      const targetUnit = incomingUnit ? existing.units.find((unit) => normalizeKey(unit.label) === normalizeKey(incomingUnit.label)) : null;
      if (!targetUnit) return;
      const exists = existing.payments.some((payment) => payment.unitId === targetUnit.id && payment.month === incomingPayment.month);
      if (!exists) existing.payments.push({ ...incomingPayment, id: uid(), unitId: targetUnit.id });
    });
    incoming.expenses.forEach((expense) => {
      const exists = existing.expenses.some((item) => item.date === expense.date && normalizeKey(item.description) === normalizeKey(expense.description) && Number(item.amount) === Number(expense.amount));
      if (!exists) existing.expenses.push({ ...expense, id: uid() });
    });
    incoming.documents.forEach((document) => {
      const exists = existing.documents.some((item) => normalizeKey(item.title) === normalizeKey(document.title) && item.notes === document.notes);
      if (!exists) existing.documents.push({ ...document, id: uid() });
    });
  });
}

function downloadCsv() {
  const condo = getCondo(selectedCondoId);
  const rows = [["Condomínio", "Fração", "Condómino(s)", "Mês", "Vencimento", "Valor", "Estado", "Pago em", "Recibo"]];
  const condos = condo ? [condo] : state.condominiums;
  condos.forEach((item) => {
    item.payments.forEach((payment) => {
      const unit = item.units.find((entry) => entry.id === payment.unitId) || {};
      rows.push([
        item.name,
        unit.label || "",
        formatUnitOwners(unit),
        payment.month,
        payment.dueDate,
        String(payment.amount).replace(".", ","),
        payment.status === "paid" ? "Pago" : "Pendente",
        payment.paidAt || "",
        payment.receiptNumber || "",
      ]);
    });
  });
  const csv = rows.map((row) => row.map(csvCell).join(";")).join("\n");
  downloadFile(`quotas-${condo?.name || "todos"}-${today()}.csv`, csv, "text/csv;charset=utf-8");
}

function downloadReport(type) {
  const reports = {
    debtors: buildDebtorsReport,
    currentAccounts: buildCurrentAccountsReport,
    annual: buildAnnualReport,
    receipts: buildReceiptsReport,
  };
  const report = reports[type]?.();
  if (!report) return;
  const csv = report.rows.map((row) => row.map(csvCell).join(";")).join("\n");
  downloadFile(`${report.filename}-${today()}.csv`, csv, "text/csv;charset=utf-8");
}

function buildDebtorsReport() {
  const rows = [["Condomínio", "Fração", "Condómino(s)", "Mês", "Vencimento", "Dias atraso", "Valor", "Contacto", "Email"]];
  getAllPayments()
    .filter(({ payment }) => payment.status !== "paid")
    .sort((a, b) => a.payment.dueDate.localeCompare(b.payment.dueDate))
    .forEach(({ condo, unit, payment }) => {
      rows.push([
        condo.name,
        unit.label || "",
        formatUnitOwners(unit),
        formatMonth(payment.month),
        payment.dueDate,
        String(Math.max(0, daysBetween(payment.dueDate, today()))),
        String(payment.amount).replace(".", ","),
        unit.phone || "",
        unit.email || "",
      ]);
    });
  return { filename: "mapa-de-devedores", rows };
}

function buildCurrentAccountsReport() {
  const rows = [["Condomínio", "Fração", "Condómino(s)", "Mês", "Tipo", "Estado", "Valor", "Data", "Referência", "Recibo"]];
  getAllPayments()
    .sort((a, b) => `${a.condo.name}-${a.unit.label}-${a.payment.month}`.localeCompare(`${b.condo.name}-${b.unit.label}-${b.payment.month}`))
    .forEach(({ condo, unit, payment }) => {
      rows.push([
        condo.name,
        unit.label || "",
        formatUnitOwners(unit),
        formatMonth(payment.month),
        "Quota",
        payment.status === "paid" ? "Pago" : "Pendente",
        String(payment.amount).replace(".", ","),
        payment.paidAt || payment.dueDate,
        payment.reference || "",
        payment.receiptNumber || "",
      ]);
    });
  return { filename: "conta-corrente", rows };
}

function buildAnnualReport() {
  const rows = [["Condomínio", "Ano", "Mês", "Receitas", "Despesas", "Saldo"]];
  const map = new Map();
  state.condominiums.forEach((condo) => {
    condo.payments.forEach((payment) => {
      const key = `${condo.id}|${payment.month}`;
      const item = map.get(key) || { condo: condo.name, month: payment.month, income: 0, expenses: 0 };
      if (payment.status === "paid") item.income += Number(payment.amount);
      map.set(key, item);
    });
    condo.expenses.forEach((expense) => {
      const month = (expense.date || "").slice(0, 7);
      const key = `${condo.id}|${month}`;
      const item = map.get(key) || { condo: condo.name, month, income: 0, expenses: 0 };
      item.expenses += Number(expense.amount);
      map.set(key, item);
    });
  });
  [...map.values()]
    .filter((item) => item.month)
    .sort((a, b) => `${a.condo}-${a.month}`.localeCompare(`${b.condo}-${b.month}`))
    .forEach((item) => {
      rows.push([item.condo, item.month.slice(0, 4), formatMonth(item.month), String(item.income).replace(".", ","), String(item.expenses).replace(".", ","), String(item.income - item.expenses).replace(".", ",")]);
    });
  return { filename: "resumo-anual", rows };
}

function buildReceiptsReport() {
  const rows = [["Condomínio", "Recibo", "Fração", "Condómino(s)", "Mês", "Valor", "Pago em", "Método", "Referência"]];
  getAllPayments()
    .filter(({ payment }) => payment.receiptNumber)
    .sort((a, b) => a.payment.receiptNumber.localeCompare(b.payment.receiptNumber))
    .forEach(({ condo, unit, payment }) => {
      rows.push([condo.name, payment.receiptNumber, unit.label || "", formatUnitOwners(unit), formatMonth(payment.month), String(payment.amount).replace(".", ","), payment.paidAt || "", payment.method || "", payment.reference || ""]);
    });
  return { filename: "recibos-emitidos", rows };
}

function resetSampleData() {
  if (!confirm("Isto substitui os dados atuais por dados de exemplo. Queres continuar?")) return;
  saveAutomaticBackup("Antes de repor exemplo");
  state = createSampleState();
  selectedCondoId = state.selectedCondoId;
  portalCondoId = selectedCondoId;
  saveState();
  render();
}

function resetEmptyData() {
  if (!confirm("Isto apaga todos os dados guardados nesta aplicação. Confirma que já fizeste uma cópia de segurança.")) return;
  state = createEmptyState();
  selectedCondoId = "";
  portalCondoId = "";
  portalUnitId = "";
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(VAULT_KEY);
  localStorage.removeItem(AUTO_BACKUP_KEY);
  vault = { unlocked: false, key: null };
  saveState();
  render();
}

function openEnableVaultForm() {
  openModal(
    "Ativar cofre local",
    `
      <form data-form="enableVault">
        <div class="form-grid">
          ${field("Palavra-passe mestre", "password", "", "password", true, "full", { minlength: 10, autocomplete: "new-password" })}
          ${field("Confirmar palavra-passe", "confirmPassword", "", "password", true, "full", { minlength: 10, autocomplete: "new-password" })}
        </div>
        <p>Guarda esta palavra-passe num local seguro. Se for perdida, os dados cifrados não podem ser recuperados.</p>
        ${formActions("Ativar cofre")}
      </form>
    `,
  );
}

async function enableVault(data) {
  if (data.password !== data.confirmPassword) {
    showFormError(document.querySelector("[data-form='enableVault']"), "As palavras-passe não coincidem.");
    return;
  }

  if ((data.password || "").length < 10) {
    showFormError(document.querySelector("[data-form='enableVault']"), "Usa pelo menos 10 caracteres.");
    return;
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  vault = { unlocked: true, key: await deriveKey(data.password, salt) };
  await writeVault(salt);
  localStorage.removeItem(STORAGE_KEY);
  modal.close();
  render();
}

async function unlockVault(data) {
  try {
    const payload = JSON.parse(localStorage.getItem(VAULT_KEY));
    const salt = base64ToBytes(payload.salt);
    const key = await deriveKey(data.password, salt);
    const decoded = await decryptJson(payload, key);
    vault = { unlocked: true, key };
    state = migrateState(decoded);
    selectedCondoId = state.selectedCondoId || state.condominiums[0]?.id || "";
    portalCondoId = selectedCondoId;
    runAutomaticQuotas();
    saveState();
    render();
  } catch (error) {
    renderLockScreen("Palavra-passe incorreta ou cofre danificado.");
  }
}

function lockVault() {
  vault = { unlocked: false, key: null };
  state = null;
  renderLockScreen();
}

async function writeVault(salt = null) {
  if (!vault.unlocked || !vault.key) return;
  const existing = localStorage.getItem(VAULT_KEY);
  const currentSalt = salt || (existing ? base64ToBytes(JSON.parse(existing).salt) : crypto.getRandomValues(new Uint8Array(16)));
  const encrypted = await encryptJson(state, vault.key);
  localStorage.setItem(
    VAULT_KEY,
    JSON.stringify({
      version: 1,
      salt: bytesToBase64(currentSalt),
      ...encrypted,
    }),
  );
}

function openModal(title, body) {
  modalTitle.textContent = title;
  modalBody.innerHTML = body;
  modalBody.querySelectorAll("form").forEach((form) => form.setAttribute("novalidate", ""));
  modal.showModal();
}

function field(label, name, value = "", type = "text", required = false, className = "", attrs = {}) {
  const step = type === "number" && attrs.step === undefined ? ` step="0.01"` : "";
  const extraAttrs = Object.entries(attrs)
    .filter(([, attrValue]) => attrValue !== undefined && attrValue !== null && attrValue !== false)
    .map(([attrName, attrValue]) => ` ${attrName}="${escapeAttr(attrValue)}"`)
    .join("");
  return `
    <label class="field ${className}">
      <span>${label}</span>
      <input name="${name}" type="${type}" value="${escapeAttr(value)}"${required ? " required" : ""}${step}${extraAttrs} />
    </label>
  `;
}

function checkboxField(label, name, checked = false, className = "") {
  return `
    <label class="checkbox-field ${className}">
      <input name="${name}" type="checkbox" ${checked ? "checked" : ""} />
      <span>${label}</span>
    </label>
  `;
}

function textArea(label, name, value = "", className = "", required = false) {
  return `
    <label class="field ${className}">
      <span>${label}</span>
      <textarea name="${name}"${required ? " required" : ""}>${escapeHtml(value || "")}</textarea>
    </label>
  `;
}

function selectField(label, name, value, options) {
  return `
    <label class="field">
      <span>${label}</span>
      <select name="${name}">
        ${options.map((option) => `<option value="${escapeAttr(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    </label>
  `;
}

function formActions(label = "Guardar") {
  return `
    <div class="form-actions">
      <button class="ghost-button" type="button" data-close-modal>Cancelar</button>
      <button class="button" type="submit">${label}</button>
    </div>
  `;
}

function validateForm(form) {
  const builtInOk = form.checkValidity();
  if (!builtInOk) {
    const invalid = form.querySelector(":invalid");
    return { ok: false, message: invalid?.title || "Há campos obrigatórios ou com formato incorreto." };
  }

  const data = Object.fromEntries(new FormData(form).entries());
  const type = form.dataset.form;

  if (type === "condo") {
    if (!isValidNif(data.nif)) return { ok: false, message: "O NIF do condomínio deve ter exatamente 9 algarismos." };
    if (!/^\d{4}-\d{3}$/.test(data.postalCode || "")) return { ok: false, message: "O código postal deve estar no formato 0000-000." };
    if (data.iban && !/^PT50\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d$/.test(data.iban)) return { ok: false, message: "O IBAN deve ser português e começar por PT50." };
    if (!isNumberBetween(data.dueDay, 1, 28)) return { ok: false, message: "O dia de vencimento deve estar entre 1 e 28." };
  }

  if (type === "unit") {
    if (data.ownerNif && !isValidNif(data.ownerNif)) return { ok: false, message: "O NIF do proprietário deve ter exatamente 9 algarismos." };
    if (data.phone && !/^\d{9}$/.test(data.phone)) return { ok: false, message: "O telefone deve ter 9 algarismos, sem espaços." };
    if (!isNumberBetween(data.monthlyFee, 0, 10000)) return { ok: false, message: "A quota mensal deve estar entre 0 € e 10 000 €." };
    if (data.percentage && !isNumberBetween(data.percentage, 0, 1000)) return { ok: false, message: "A permilagem deve estar entre 0 e 1000." };
  }

  if (type === "generateQuotas" && !isNumberBetween(data.dueDay, 1, 28)) {
    return { ok: false, message: "O dia de vencimento deve estar entre 1 e 28." };
  }

  if ((type === "payment" || type === "expense") && !isNumberBetween(data.amount, 0, 100000)) {
    return { ok: false, message: "O valor deve ser positivo e realista." };
  }

  return { ok: true };
}

function showFormError(form, message) {
  let error = form.querySelector(".form-error");
  if (!error) {
    error = document.createElement("div");
    error.className = "form-error";
    form.prepend(error);
  }
  error.textContent = message;
}

function isValidNif(value) {
  return /^\d{9}$/.test(value || "");
}

function isNumberBetween(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

function createMissingQuotas(condo, month, dueDay = 10) {
  if (!condo) return;
  const day = String(Math.min(Math.max(Number(dueDay || 10), 1), 28)).padStart(2, "0");
  condo.units
    .filter((unit) => unit.active)
    .forEach((unit) => {
      const exists = condo.payments.some((payment) => payment.unitId === unit.id && payment.month === month);
      if (!exists) {
        condo.payments.push({
          id: uid(),
          unitId: unit.id,
          month,
          amount: Number(unit.monthlyFee || 0),
          dueDate: `${month}-${day}`,
          status: "pending",
          paidAt: "",
          method: "",
          reference: "",
          receiptNumber: "",
          notes: "",
        });
      }
    });
}

function runAutomaticQuotas() {
  state.condominiums
    .filter((condo) => condo.active && condo.autoGenerate)
    .forEach((condo) => createMissingQuotas(condo, currentMonth(), condo.dueDay || 10));
}

function getTotals() {
  return state.condominiums.reduce(
    (totals, condo) => {
      totals.activeCondos += condo.active ? 1 : 0;
      totals.inactiveCondos += condo.active ? 0 : 1;
      totals.activeUnits += condo.units.filter((unit) => unit.active).length;
      totals.pendingAmount += condo.payments.filter((payment) => payment.status !== "paid").reduce((sum, payment) => sum + Number(payment.amount), 0);
      return totals;
    },
    { activeCondos: 0, inactiveCondos: 0, activeUnits: 0, pendingAmount: 0 },
  );
}

function getMonthIncome(month) {
  return getAllPayments()
    .filter(({ payment }) => payment.status === "paid" && payment.month === month)
    .reduce((sum, { payment }) => sum + Number(payment.amount), 0);
}

function getMonthExpenses(month) {
  return state.condominiums.reduce((sum, condo) => sum + condo.expenses.filter((expense) => (expense.date || "").startsWith(month)).reduce((inner, expense) => inner + Number(expense.amount), 0), 0);
}

function getOverduePayments() {
  const rows = [];
  state.condominiums.forEach((condo) => {
    condo.payments.forEach((payment) => {
      const unit = condo.units.find((item) => item.id === payment.unitId);
      if (unit && payment.status !== "paid" && payment.dueDate < today()) rows.push({ condo, unit, payment });
    });
  });
  return rows.sort((a, b) => a.payment.dueDate.localeCompare(b.payment.dueDate));
}

function getAllPayments() {
  return state.condominiums.flatMap((condo) =>
    condo.payments.map((payment) => ({
      condo,
      payment,
      unit: condo.units.find((unit) => unit.id === payment.unitId) || {},
    })),
  );
}

function getDashboardTasks() {
  const tasks = [];
  const overdue = getOverduePayments();
  if (overdue.length) {
    tasks.push({
      kind: "danger",
      label: "Urgente",
      title: `${overdue.length} quotas em atraso`,
      detail: `Total em atraso: ${money.format(overdue.reduce((sum, item) => sum + Number(item.payment.amount), 0))}.`,
      action: `data-action="go" data-view="reports"`,
    });
  }

  state.condominiums
    .filter((condo) => condo.active)
    .forEach((condo) => {
      const activeUnits = condo.units.filter((unit) => unit.active).length;
      const monthPayments = condo.payments.filter((payment) => payment.month === activeMonth).length;
      if (activeUnits && monthPayments < activeUnits) {
        tasks.push({
          kind: "warn",
          label: "Quotas",
          title: `${condo.name}: faltam quotas de ${formatMonth(activeMonth)}`,
          detail: `${monthPayments}/${activeUnits} frações têm quota criada.`,
          action: `data-action="selectCondo" data-id="${condo.id}"`,
        });
      }
    });

  const backups = getAutomaticBackups();
  if (!backups.length) {
    tasks.push({
      kind: "warn",
      label: "Cópia",
      title: "Ainda sem cópia automática local",
      detail: "Exporta uma cópia cifrada antes de entregar a app para uso real.",
      action: `data-action="go" data-view="settings"`,
    });
  }

  return tasks.slice(0, 6);
}

function getSearchResults(query) {
  const normalized = normalizeKey(query);
  if (normalized.length < 2) return [];
  const results = [];
  const matches = (...values) => values.some((value) => normalizeKey(value).includes(normalized));

  state.condominiums.forEach((condo) => {
    if (matches(condo.name, condo.nif, condo.address, condo.city, condo.iban, condo.managerName)) {
      results.push({ type: "Condomínio", title: condo.name, detail: formatAddress(condo), condo });
    }

    condo.units.forEach((unit) => {
      if (matches(unit.label, unit.ownerName, unit.coOwnerName, unit.ownerNif, unit.email, unit.phone, unit.notes)) {
        results.push({ type: "Fração", title: `${unit.label} · ${formatUnitOwners(unit)}`, detail: [unit.ownerNif && `NIF ${unit.ownerNif}`, unit.email, unit.phone].filter(Boolean).join(" · "), condo });
      }
    });

    condo.payments.forEach((payment) => {
      const unit = condo.units.find((item) => item.id === payment.unitId) || {};
      if (matches(payment.month, payment.dueDate, payment.paidAt, payment.method, payment.reference, payment.receiptNumber, unit.label, unit.ownerName, unit.coOwnerName)) {
        results.push({ type: "Pagamento", title: `${unit.label || "Fração"} · ${formatMonth(payment.month)}`, detail: `${payment.status === "paid" ? "Pago" : "Pendente"} · ${money.format(Number(payment.amount))} · ${payment.receiptNumber || payment.reference || ""}`, condo });
      }
    });

    condo.expenses.forEach((expense) => {
      if (matches(expense.date, expense.category, expense.supplier, expense.description, expense.documentName)) {
        results.push({ type: "Despesa", title: expense.description || expense.category, detail: `${formatDate(expense.date)} · ${money.format(Number(expense.amount))} · ${expense.supplier || ""}`, condo });
      }
    });

    condo.documents.forEach((document) => {
      if (matches(document.date, document.type, document.title, document.notes)) {
        results.push({ type: "Documento", title: document.title, detail: `${document.type} · ${formatDate(document.date)} · ${document.notes || ""}`, condo });
      }
    });
  });

  return results.slice(0, 80);
}

function parseBankMovements(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const hasHeader = /data|date|descri|valor|amount/i.test(lines[0]);
  const rows = hasHeader ? parseCsv(lines.join("\n")) : lines.map((line) => {
    const parts = line.split(line.includes(";") ? ";" : ",");
    return { data: parts[0] || "", descricao: parts.slice(1, -1).join(" "), valor: parts.at(-1) || "" };
  });

  return rows
    .map((raw) => normalizeRow(raw))
    .map((row) => ({
      date: normalizeDate(row.data || row.date || row.paid_at || "") || today(),
      description: row.descricao || row.descrição || row.description || row.movimento || row.referencia || row.referência || "",
      amount: Math.abs(parsePortugueseNumber(row.valor || row.amount || row.credito || row.crédito || row.entrada || 0)),
    }))
    .filter((movement) => movement.amount > 0);
}

function findBankMatches(movements) {
  const matches = [];
  const usedPayments = new Set();
  const pendingPayments = getAllPayments().filter(({ payment }) => payment.status !== "paid");

  movements.forEach((movement) => {
    const sameAmount = pendingPayments.filter(({ payment }) => !usedPayments.has(payment.id) && Math.abs(Number(payment.amount) - movement.amount) < 0.01);
    if (!sameAmount.length) return;

    const movementText = normalizeKey(movement.description);
    const textMatches = sameAmount.filter(({ condo, unit, payment }) => {
      const candidates = [condo.name, unit.label, unit.ownerName, unit.coOwnerName, unit.ownerNif, payment.reference, payment.month].map(normalizeKey).filter(Boolean);
      return candidates.some((candidate) => candidate.length >= 3 && movementText.includes(candidate));
    });

    const chosen = textMatches.length === 1 ? textMatches[0] : sameAmount.length === 1 ? sameAmount[0] : null;
    if (!chosen) return;
    usedPayments.add(chosen.payment.id);
    matches.push({ ...chosen, movement });
  });

  return matches;
}

function getCondo(id) {
  return state.condominiums.find((condo) => condo.id === id);
}

function getUnit(id) {
  for (const condo of state.condominiums) {
    const unit = condo.units.find((item) => item.id === id);
    if (unit) return unit;
  }
  return null;
}

function getPayment(id) {
  for (const condo of state.condominiums) {
    const payment = condo.payments.find((item) => item.id === id);
    if (payment) return payment;
  }
  return null;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.condominiums) return saved;
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
  }
  return createEmptyState();
}

function migrateState(rawState) {
  const migrated = {
    selectedCondoId: rawState.selectedCondoId || rawState.condominiums?.[0]?.id || "",
    receiptSequence: Number(rawState.receiptSequence || 1),
    condominiums: Array.isArray(rawState.condominiums) ? rawState.condominiums : [],
  };

  migrated.condominiums = migrated.condominiums.map((condo) => ({
    ...condo,
    postalCode: condo.postalCode || "0000-000",
    city: condo.city || "",
    dueDay: Number(condo.dueDay || 10),
    autoGenerate: condo.autoGenerate !== false,
    units: Array.isArray(condo.units)
      ? condo.units.map((unit) => ({
          ...unit,
          coOwnerName: unit.coOwnerName || unit.spouseName || unit.partnerName || unit.secondOwnerName || "",
          ownerNif: unit.ownerNif || "",
          monthlyFee: Number(unit.monthlyFee || 0),
          percentage: Number(unit.percentage || 0),
          active: unit.active !== false,
        }))
      : [],
    payments: Array.isArray(condo.payments) ? condo.payments : [],
    expenses: Array.isArray(condo.expenses) ? condo.expenses : [],
    documents: Array.isArray(condo.documents) ? condo.documents : [],
  }));

  return migrated;
}

function saveState() {
  state.selectedCondoId = selectedCondoId;
  if (vault.unlocked && vault.key) {
    writeVault().catch(() => alert("Não consegui guardar no cofre cifrado. Exporta uma cópia antes de fechar."));
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function maybeCreateDailyBackup() {
  const backups = getAutomaticBackups();
  if (backups[0]?.date === today()) return;
  saveAutomaticBackup("Cópia diária");
}

function saveAutomaticBackup(reason) {
  if (!state?.condominiums?.length) return;
  if (vault.unlocked && vault.key) return;
  const backups = getAutomaticBackups();
  backups.unshift({
    id: uid(),
    date: today(),
    createdAt: new Date().toISOString(),
    reason,
    state,
  });
  localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(backups.slice(0, 10)));
}

function getAutomaticBackups() {
  try {
    const backups = JSON.parse(localStorage.getItem(AUTO_BACKUP_KEY));
    return Array.isArray(backups) ? backups : [];
  } catch (error) {
    localStorage.removeItem(AUTO_BACKUP_KEY);
    return [];
  }
}

function downloadLatestAutoBackup() {
  const backup = getAutomaticBackups()[0];
  if (!backup) {
    alert("Ainda não existe uma cópia automática local.");
    return;
  }
  downloadFile(`copia-automatica-condominios-${backup.date}.json`, JSON.stringify(backup.state, null, 2), "application/json");
}

function createEmptyState() {
  return {
    selectedCondoId: "",
    receiptSequence: 1,
    condominiums: [],
  };
}

function createSampleState() {
  const condoId = uid();
  const unitA = uid();
  const unitB = uid();
  return {
    selectedCondoId: condoId,
    receiptSequence: 3,
    condominiums: [
      {
        id: condoId,
        name: "Condomínio Rua das Flores 18",
        nif: "509000000",
        address: "Rua das Flores 18, Lisboa",
        postalCode: "1200-001",
        city: "Lisboa",
        managerName: "Administrador do Condomínio",
        iban: "PT50 0000 0000 0000 0000 0000 0",
        dueDay: 10,
        autoGenerate: true,
        notes: "Exemplo inicial para testar a aplicação.",
        active: true,
        units: [
          { id: unitA, label: "1.º Esq.", ownerName: "Ana Martins", coOwnerName: "Rui Martins", ownerNif: "221000000", email: "ana@example.com", phone: "910000000", monthlyFee: 45, percentage: 120, notes: "", active: true },
          { id: unitB, label: "1.º Dto.", ownerName: "João Silva", coOwnerName: "Marta Silva", ownerNif: "222000000", email: "joao@example.com", phone: "920000000", monthlyFee: 48.5, percentage: 130, notes: "", active: true },
        ],
        payments: [
          { id: uid(), unitId: unitA, month: previousMonth(), amount: 45, dueDate: `${previousMonth()}-10`, status: "paid", paidAt: `${previousMonth()}-08`, method: "Transferência", reference: "TRF 101", receiptNumber: "RC-2026-0001", notes: "" },
          { id: uid(), unitId: unitB, month: previousMonth(), amount: 48.5, dueDate: `${previousMonth()}-10`, status: "pending", paidAt: "", method: "", reference: "", receiptNumber: "", notes: "" },
        ],
        expenses: [
          { id: uid(), date: today(), category: "Limpeza", supplier: "Serviços Limpos", description: "Limpeza mensal das partes comuns", amount: 120, documentName: "Fatura limpeza" },
        ],
        documents: [
          { id: uid(), date: today(), type: "Ata", title: "Ata da assembleia ordinária", notes: "Registo inicial de exemplo." },
        ],
      },
    ],
  };
}

function buildStateFromRows(rows, sourceName) {
  const warnings = [];
  const map = new Map();
  const ensureCondo = (name, row = {}) => {
    const key = normalizeKey(name);
    if (!map.has(key)) {
      map.set(key, {
        id: uid(),
        name: String(name).trim(),
        nif: onlyDigits(row.nif_condominio || row.nif_condomínio || row.nif || "").slice(0, 9),
        address: row.morada || row.endereco || row.endereço || "",
        postalCode: normalizePostalCode(row.codigo_postal || row.código_postal || row.cp || ""),
        city: row.localidade || row.cidade || "",
        managerName: row.administrador || "",
        iban: row.iban || "",
        dueDay: 10,
        autoGenerate: true,
        notes: `Importado de ${sourceName}.`,
        active: true,
        importSource: row.origem || sourceName,
        units: [],
        payments: [],
        expenses: [],
        documents: [],
      });
    }
    return map.get(key);
  };

  rows.forEach((rawRow, index) => {
    const row = normalizeRow(rawRow);
    const condoName = row.condominio || row.condomínio || row.predio || row.prédio || row.edificio || row.edifício || row.nome_condominio || row.nome_condomínio;
    const unitLabel = row.fracao || row.fração || row.apartamento || row.unidade || row.loja || row.garagem;

    if ((row.tipo_linha || row.tipo) === "documento" && condoName) {
      const condo = ensureCondo(condoName, row);
      condo.documents.push({
        id: uid(),
        date: normalizeDate(row.data) || today(),
        type: row.tipo_documento || row.categoria || "Outro",
        title: row.titulo || row.título || cleanDocumentTitle(row.origem || sourceName),
        notes: row.notas || row.origem || "",
      });
      return;
    }

    if ((row.tipo_linha || row.tipo) === "despesa" && condoName) {
      const condo = ensureCondo(condoName, row);
      const amount = parsePortugueseNumber(row.valor || row.amount || 0);
      if (amount > 0) {
        condo.expenses.push({
          id: uid(),
          date: row.data || `${row.ano || new Date().getFullYear()}-${String(row.mes_numero || 1).padStart(2, "0")}-01`,
          category: row.categoria || "Despesa",
          supplier: row.fornecedor || "",
          description: row.descricao || row.descrição || row.categoria || "Despesa importada",
          amount,
          documentName: row.origem || sourceName,
        });
      }
      return;
    }

    if ((row.tipo_linha || row.tipo) === "receita_mensal" && condoName) {
      const condo = ensureCondo(condoName, row);
      const owner = row.proprietario || row.proprietário || row.condomino || row.condómino || row.nome || row.descricao || row.descrição;
      if (!owner) return;
      const amount = parsePortugueseNumber(row.valor || 0);
      const monthNumber = Number(row.mes_numero || 1);
      const year = Number(row.ano || new Date().getFullYear());
      const month = `${year}-${String(monthNumber).padStart(2, "0")}`;
      let unit = condo.units.find((item) => normalizeKey(item.ownerName) === normalizeKey(owner) || normalizeKey(item.label) === normalizeKey(owner));
      if (!unit) {
        unit = {
          id: uid(),
          label: String(row.fracao || row.fração || owner).trim(),
          ownerName: String(owner).trim(),
          coOwnerName: row.conjuge || row.cônjuge || row.marido || row.mulher || row.titular_2 || row.segundo_titular || row.coproprietario || row.coproprietário || "",
          ownerNif: "",
          email: "",
          phone: "",
          monthlyFee: amount || 0,
          percentage: 0,
          notes: "Importado de mapa mensal.",
          active: true,
        };
        condo.units.push(unit);
      }
      if (amount > 0 && !condo.payments.some((payment) => payment.unitId === unit.id && payment.month === month)) {
        condo.payments.push({
          id: uid(),
          unitId: unit.id,
          month,
          amount,
          dueDate: `${month}-${String(condo.dueDay || 10).padStart(2, "0")}`,
          status: "paid",
          paidAt: "",
          method: "Importado",
          reference: row.origem || sourceName,
          receiptNumber: "",
          notes: "Importado de mapa mensal de receita/despesa.",
        });
      }
      return;
    }

    if (!condoName || !unitLabel) {
      if (Object.values(row).some(Boolean)) warnings.push(`Linha ${index + 1}: faltam condomínio ou fração.`);
      return;
    }

    const condo = ensureCondo(condoName, row);
    const amount = parsePortugueseNumber(row.quota || row.valor_quota || row.quota_mensal || row.valor || 0);
    const unitId = uid();
    condo.units.push({
      id: unitId,
      label: String(unitLabel).trim(),
      ownerName: row.proprietario || row.proprietário || row.condomino || row.condómino || row.nome || "Por definir",
      coOwnerName: row.conjuge || row.cônjuge || row.marido || row.mulher || row.titular_2 || row.segundo_titular || row.coproprietario || row.coproprietário || "",
      ownerNif: onlyDigits(row.nif_proprietario || row.nif_proprietário || row.nif_condomino || row.nif_condómino || "").slice(0, 9),
      email: row.email || "",
      phone: onlyDigits(row.telefone || row.telemovel || row.telemóvel || row.contacto || "").slice(0, 9),
      monthlyFee: Number.isFinite(amount) ? amount : 0,
      percentage: parsePortugueseNumber(row.permilagem || row.percentagem || 0) || 0,
      notes: row.notas || "",
      active: true,
    });

    const year = Number(row.ano || new Date().getFullYear());
    monthKeys().forEach(({ key, number }) => {
      if (!(key in row)) return;
      const paidAmount = parsePortugueseNumber(row[key]);
      const month = `${year}-${String(number).padStart(2, "0")}`;
      condo.payments.push({
        id: uid(),
        unitId,
        month,
        amount: amount || paidAmount || 0,
        dueDate: `${month}-${String(condo.dueDay || 10).padStart(2, "0")}`,
        status: paidAmount > 0 ? "paid" : "pending",
        paidAt: "",
        method: paidAmount > 0 ? "Importado" : "",
        reference: row.origem || sourceName,
        receiptNumber: "",
        notes: paidAmount > 0 ? `Valor pago importado: ${paidAmount}` : "",
      });
    });
  });

  return {
    selectedCondoId: "",
    receiptSequence: state?.receiptSequence || 1,
    importWarnings: warnings,
    condominiums: [...map.values()].map((condo) => ({
      ...condo,
      postalCode: condo.postalCode || "0000-000",
    })),
  };
}

function normalizeRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      normalizeKey(key).replaceAll(" ", "_"),
      typeof value === "string" ? value.trim() : value,
    ]),
  );
}

function parseCsv(text) {
  const rows = [];
  const delimiter = text.includes(";") ? ";" : ",";
  const parsed = [];
  let cell = "";
  let row = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      parsed.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    parsed.push(row);
  }
  const headers = (parsed.shift() || []).map((header) => header.trim());
  parsed.forEach((line) => {
    const object = {};
    headers.forEach((header, index) => {
      object[header] = line[index] || "";
    });
    rows.push(object);
  });
  return rows;
}

async function parseXlsx(input) {
  const buffer = toArrayBuffer(input);
  const entries = await unzipEntries(buffer);
  const files = Object.fromEntries(entries.map((entry) => [entry.name, bytesToText(entry.bytes)]));
  const shared = parseSharedStrings(files["xl/sharedStrings.xml"] || "");
  const sheetNames = Object.keys(files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  const rows = [];
  sheetNames.forEach((sheetName) => rows.push(...parseSheetXml(files[sheetName], shared)));
  return rows;
}

function parseSharedStrings(xmlText) {
  if (!xmlText) return [];
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  return [...xml.querySelectorAll("si")].map((item) => [...item.querySelectorAll("t")].map((text) => text.textContent).join(""));
}

function parseSheetXml(xmlText, shared) {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  const matrix = [...xml.querySelectorAll("sheetData row")].map((row) => {
    const values = [];
    [...row.querySelectorAll("c")].forEach((cell) => {
      const ref = cell.getAttribute("r") || "";
      const columnIndex = columnNameToIndex(ref.replace(/\d+/g, ""));
      const raw = cell.querySelector("v")?.textContent || "";
      values[columnIndex] = cell.getAttribute("t") === "s" ? shared[Number(raw)] || "" : raw;
    });
    return values;
  });

  const wideQuotaRows = parseWideQuotaMatrix(matrix);
  if (wideQuotaRows.length) return wideQuotaRows;

  const wideExpenseRows = parseWideExpenseMatrix(matrix);
  if (wideExpenseRows.length) return wideExpenseRows;

  const monthlyLedgerRows = parseMonthlyLedgerMatrix(matrix);
  if (monthlyLedgerRows.length) return monthlyLedgerRows;

  const headers = (matrix.shift() || []).map((header) => String(header || "").trim());
  return matrix
    .filter((line) => line.some((value) => value !== undefined && value !== ""))
    .map((line) => Object.fromEntries(headers.map((header, index) => [header || `coluna_${index + 1}`, line[index] || ""])));
}

function parseWideQuotaMatrix(matrix) {
  const headerIndex = matrix.findIndex((row) => row.some((cell) => normalizeKey(cell).replaceAll(" ", "") === "fracoes"));
  if (headerIndex < 0) return [];
  const header = matrix[headerIndex].map((cell) => normalizeKey(cell).replaceAll("\n", " ").trim());
  const fractionCol = header.findIndex((cell) => cell.replaceAll(" ", "") === "fracoes");
  const quotaCol = header.findIndex((cell) => cell.includes("quota") && cell.includes("mensal"));
  const title = extractCondoTitle(matrix.slice(0, headerIndex));
  const year = extractYear(matrix.flat().join(" ")) || new Date().getFullYear();
  const monthColumns = monthKeys()
    .map((month) => ({ ...month, col: header.findIndex((cell) => month.aliases.some((alias) => cell === alias || cell.startsWith(alias))) }))
    .filter((month) => month.col >= 0);

  return matrix.slice(headerIndex + 1).flatMap((row) => {
    const rawLabel = row[fractionCol];
    if (!rawLabel || /total/i.test(String(rawLabel))) return [];
    const labelParts = splitFractionOwner(String(rawLabel));
    const record = {
      tipo_linha: "quota",
      condominio: title,
      fracao: labelParts.fraction,
      proprietario: labelParts.owner,
      quota_mensal: quotaCol >= 0 ? row[quotaCol] || "" : "",
      ano: year,
    };
    monthColumns.forEach((month) => {
      record[month.key] = row[month.col] || "";
    });
    return [record];
  });
}

function parseWideExpenseMatrix(matrix) {
  const headerIndex = matrix.findIndex((row) => {
    const normalized = row.map((cell) => normalizeKey(cell).replaceAll("\n", " ").trim());
    return monthKeys().filter((month) => normalized.some((cell) => month.aliases.includes(cell))).length >= 4;
  });
  if (headerIndex < 0) return [];
  const header = matrix[headerIndex].map((cell) => normalizeKey(cell).replaceAll("\n", " ").trim());
  const title = extractCondoTitle(matrix.slice(0, headerIndex));
  const year = extractYear(matrix.flat().join(" ")) || new Date().getFullYear();
  const monthColumns = monthKeys()
    .map((month) => ({ ...month, col: header.findIndex((cell) => month.aliases.includes(cell)) }))
    .filter((month) => month.col >= 0);

  return matrix.slice(headerIndex + 1).flatMap((row) => {
    const category = row[0];
    if (!category || /total|saldo/i.test(String(category))) return [];
    return monthColumns
      .map((month) => ({
        tipo_linha: "despesa",
        condominio: title,
        categoria: String(category).trim(),
        valor: row[month.col] || "",
        mes_numero: month.number,
        ano: year,
      }))
      .filter((record) => parsePortugueseNumber(record.valor) > 0);
  });
}

function parseMonthlyLedgerMatrix(matrix) {
  const monthInfo = findMonthInfo(matrix);
  if (!monthInfo) return [];
  const headerIndex = matrix.findIndex((row) => {
    const normalized = row.map((cell) => normalizeKey(cell));
    return normalized.includes("receita") && normalized.includes("despesa");
  });
  if (headerIndex < 0) return [];

  const title = extractCondoTitle(matrix.slice(0, headerIndex + 1));
  const rows = [];
  matrix.slice(headerIndex + 1).forEach((row) => {
    const revenueLabel = row[0];
    const revenueValue = row[1];
    const expenseLabel = row[3];
    const expenseValue = row[4];
    if (revenueLabel && !/saldo|mensalidades|receita no|total|m[eê]s anterior/i.test(String(revenueLabel))) {
      rows.push({
        tipo_linha: "receita_mensal",
        condominio: title,
        proprietario: String(revenueLabel).trim(),
        valor: revenueValue || "",
        mes_numero: monthInfo.month,
        ano: monthInfo.year,
      });
    }
    if (expenseLabel && !/despesa no|saldo|total/i.test(String(expenseLabel))) {
      rows.push({
        tipo_linha: "despesa",
        condominio: title,
        categoria: String(expenseLabel).trim(),
        valor: expenseValue || "",
        mes_numero: monthInfo.month,
        ano: monthInfo.year,
      });
    }
  });
  return rows;
}

async function unzipEntries(buffer) {
  const normalizedBuffer = toArrayBuffer(buffer);
  const bytes = new Uint8Array(normalizedBuffer);
  const view = new DataView(normalizedBuffer);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= 0; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP inválido.");
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = [];
  for (let i = 0; i < entryCount; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("ZIP inválido.");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = bytesToText(bytes.slice(offset + 46, offset + 46 + fileNameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    if (!name.endsWith("/")) entries.push({ name, bytes: await inflateZipEntry(compressed, method) });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function toArrayBuffer(input) {
  if (input instanceof ArrayBuffer) return input;
  if (ArrayBuffer.isView(input)) return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  throw new Error("Ficheiro inválido ou danificado.");
}

async function inflateZipEntry(bytes, method) {
  if (method === 0) return bytes;
  if (method !== 8 || !("DecompressionStream" in window)) throw new Error("Este ZIP usa uma compressão que o navegador não consegue ler.");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deriveKey(password, salt) {
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptJson(value, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) };
}

async function decryptJson(payload, key) {
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(payload.iv) }, key, base64ToBytes(payload.data));
  return JSON.parse(new TextDecoder().decode(decrypted));
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function bytesToText(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

function columnNameToIndex(name) {
  return [...name].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function monthKeys() {
  return [
    { key: "jan", number: 1, aliases: ["jan", "janeiro"] },
    { key: "fev", number: 2, aliases: ["fev", "fevereiro"] },
    { key: "mar", number: 3, aliases: ["mar", "marco", "março"] },
    { key: "abril", number: 4, aliases: ["abr", "abril"] },
    { key: "maio", number: 5, aliases: ["mai", "maio"] },
    { key: "jun", number: 6, aliases: ["jun", "junho"] },
    { key: "jul", number: 7, aliases: ["jul", "julho"] },
    { key: "ago", number: 8, aliases: ["ago", "agosto"] },
    { key: "set", number: 9, aliases: ["set", "setembro"] },
    { key: "out", number: 10, aliases: ["out", "outubro"] },
    { key: "nov", number: 11, aliases: ["nov", "novembro"] },
    { key: "dez", number: 12, aliases: ["dez", "dezembro"] },
  ];
}

function extractCondoTitle(rows) {
  const candidates = rows
    .flat()
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter((value) => /condom|lote|pr[eé]dio|edif/i.test(value));
  const best = candidates.find((value) => /condom/i.test(value)) || candidates[0] || "Condomínio importado";
  const lote = best.match(/lote\s*\d+/i)?.[0];
  const edificio = best.match(/edif[ií]cio\s+[a-z0-9\s]+/i)?.[0];
  if (lote) return `Condomínio ${lote.toUpperCase()}`;
  if (edificio) return `Condomínio ${titleCase(edificio)}`;
  return best;
}

function guessCondoNameFromPath(path) {
  const parts = String(path)
    .split(/[\\/]+/)
    .map((part) => part.replace(/\.[^.]+$/, "").trim())
    .filter(Boolean);
  const candidate = parts.find((part) => /condom|lote|edif|pr[eé]dio/i.test(part)) || parts[0] || "";
  return candidate ? titleCase(candidate.replace(/\b20\d{2}\b/g, "").replace(/\s+-\s*$/g, "").trim()) : "";
}

function isDocumentFile(filename) {
  return /\.(pdf|doc|docx|jpg|jpeg|png|webp|heic)$/i.test(filename);
}

function classifyDocument(filename) {
  const key = normalizeKey(filename);
  if (key.includes("ata")) return "Ata";
  if (key.includes("seguro") || key.includes("apolice")) return "Seguro";
  if (key.includes("contrato")) return "Contrato";
  if (key.includes("orcamento") || key.includes("orçamento")) return "Orçamento";
  if (key.includes("fatura") || key.includes("factura") || key.includes("recibo")) return "Fatura/recibo";
  if (key.includes("aviso") || key.includes("convocatoria")) return "Aviso";
  return "Outro";
}

function cleanDocumentTitle(path) {
  const filename = String(path).split(/[\\/]+/).pop() || "Documento";
  return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Documento";
}

function findMonthInfo(matrix) {
  const monthAliases = monthKeys();
  for (const row of matrix.slice(0, 8)) {
    for (const cell of row) {
      const text = normalizeKey(cell);
      if (!text) continue;
      const year = extractYear(text);
      const month = monthAliases.find((item) => item.aliases.some((alias) => text.includes(alias)));
      if (year && month) return { year, month: month.number };
    }
  }
  return null;
}

function extractYear(text) {
  const match = String(text).match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function splitFractionOwner(value) {
  const parts = value.split(/\s+-\s+/);
  if (parts.length < 2) return { fraction: value.trim(), owner: "Por definir" };
  return {
    fraction: parts.shift().trim(),
    owner: parts.join(" - ").trim() || "Por definir",
  };
}

function titleCase(value) {
  return String(value)
    .toLowerCase()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function normalizeKey(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function onlyDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

function normalizePostalCode(value = "") {
  const digits = onlyDigits(value);
  if (digits.length === 7) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return /^\d{4}-\d{3}$/.test(value) ? value : "";
}

function normalizeDate(value = "") {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const parts = String(value).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!parts) return "";
  const year = parts[3].length === 2 ? `20${parts[3]}` : parts[3];
  return `${year}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
}

function daysBetween(start, end) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  return Math.round((endDate - startDate) / 86400000);
}

function parsePortugueseNumber(value) {
  if (typeof value === "number") return value;
  const normalized = String(value || "").replace(/\s/g, "").replace("€", "").replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function previousMonth() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().slice(0, 7);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatMonth(value) {
  if (!value) return "—";
  const [year, month] = value.split("-").map(Number);
  return monthName.format(new Date(year, month - 1, 1));
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-PT");
}

function formatAddress(condo) {
  return [condo.address, condo.postalCode, condo.city].filter(Boolean).join(", ");
}

function formatUnitOwners(unit = {}) {
  return [unit.ownerName, unit.coOwnerName].filter(Boolean).join(" e ");
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replaceAll(" ", "-");
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
