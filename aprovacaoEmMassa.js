function createTaskSelectionState(initialIds = []) {
  const selectedIds = new Set();

  const normalizeId = (id) => {
    if (id === null || id === undefined) return "";
    return String(id).trim();
  };

  initialIds.forEach((id) => {
    const normalizedId = normalizeId(id);
    if (normalizedId) selectedIds.add(normalizedId);
  });

  return {
    set(id, selected) {
      const normalizedId = normalizeId(id);
      if (!normalizedId) return;

      if (selected) {
        selectedIds.add(normalizedId);
      } else {
        selectedIds.delete(normalizedId);
      }
    },
    has(id) {
      const normalizedId = normalizeId(id);
      return normalizedId ? selectedIds.has(normalizedId) : false;
    },
    retain(ids) {
      const retainedIds = new Set(ids.map(normalizeId).filter(Boolean));
      selectedIds.forEach((id) => {
        if (!retainedIds.has(id)) selectedIds.delete(id);
      });
    },
    values() {
      return Array.from(selectedIds);
    }
  };
}

function reconcileTaskSelectionIds(selectionState, visibleIds) {
  const normalizedVisibleIds = visibleIds
    .map((id) => id === null || id === undefined ? "" : String(id).trim())
    .filter(Boolean);

  // Durante o carregamento o Zeev esvazia o tbody antes de inserir as novas
  // linhas. Preservar o estado nesse intervalo evita perder a seleção.
  if (normalizedVisibleIds.length > 0) {
    selectionState.retain(normalizedVisibleIds);
  }

  return normalizedVisibleIds.filter((id) => selectionState.has(id));
}

function resolveZeevUserId(candidates = []) {
  for (const candidate of candidates) {
    const match = String(candidate ?? "").match(/(\d+)$/);
    if (match) return Number(match[1]);
  }

  return null;
}

function getCurrentZeevUserId() {
  return resolveZeevUserId([
    jq("#userId").val(),
    jq(".menu-user .user[userid]").first().attr("userid"),
    jq(".user[userid]").first().attr("userid")
  ]);
}

function escapeTaskMessage(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createTaskSupportMessage() {
  const supportUrl = "https://raizeducacao.zeev.it/2.0/request?c=nIGZbj%2BSflQVvsUdA5hVOmC4ZZr8GXW%2FThxNe7g52WrGa4yThcuEkqRqO5VT82klt906ee7Z6xOdQXtaVd20Pg%3D%3D";
  return `Para solicitar suporte, acesse <a href="${supportUrl}" target="_blank" rel="noopener noreferrer" style="color: #855000; text-decoration: underline;"><strong>[Processos] Solicitações Ticket Raiz</strong></a>.`;
}

function getTaskContentLeft() {
  if (typeof document === "undefined") return 0;
  return Math.max(0, document.querySelector("#containerPageContent")?.getBoundingClientRect().left || 0);
}

function showTaskModal(title, message, callback) {
  jq("#modalOverlay, #colorbox").remove();
  if (typeof window !== "undefined") jq(window).off("resize.ticketRaizResultModal");
  const contentLeft = getTaskContentLeft();
  jq("body").append(`
    <div id="modalOverlay" style="position: fixed; top: 0; right: 0; bottom: 0; left: ${contentLeft}px; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; background: rgba(12, 47, 45, 0.60); z-index: 90 !important;">
    <div id="colorbox" role="dialog" aria-modal="true" aria-labelledby="task-modal-title" tabindex="-1" style="display: flex; flex-direction: column; visibility: visible; position: relative !important; top: auto !important; left: auto !important; transform: none !important; margin: 0 !important; width: min(760px, 100%); max-height: min(76vh, 680px); background: #fff; color: #203330; border: 1px solid #cfe4e1; border-radius: 14px; box-shadow: 0 22px 60px rgba(12, 47, 45, 0.28); overflow: hidden; box-sizing: border-box;">
      <div style="flex: none; padding: 20px 24px 16px; border-bottom: 3px solid #f08700; background: linear-gradient(105deg, #eaf7f5 0%, #fff6e9 100%);">
        <div style="color: #286f69; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">Ticket Raiz · Tarefas</div>
        <h2 id="task-modal-title" style="margin: 5px 0 0; color: #174e4a; font-size: 20px; font-weight: 700; line-height: 1.3;">${escapeTaskMessage(title)}</h2>
      </div>
      <div style="min-height: 0; overflow-y: auto; overflow-wrap: anywhere; padding: 20px 24px; font-size: 14px; line-height: 1.5; background: #fff;">${message}</div>
      <div style="flex: none; padding: 14px 24px; border-top: 1px solid #dbeae7; text-align: right; background: #f7fbfa;">
        <button type="button" class="btn close-task-modal-btn" style="min-width: 96px; padding: 8px 18px; border: 1px solid #d47900; border-radius: 8px; background: #f08700; color: #203330; font-weight: 700;">OK</button>
      </div>
    </div>
    </div>
  `);

  if (typeof window !== "undefined") {
    jq(window).on("resize.ticketRaizResultModal", function () {
      jq("#modalOverlay").css("left", `${getTaskContentLeft()}px`);
    });
  }

  jq(".close-task-modal-btn").off("click").on("click", function () {
    if (typeof window !== "undefined") jq(window).off("resize.ticketRaizResultModal");
    jq("#modalOverlay, #colorbox").remove();
    if (typeof callback === "function") callback();
  });
  jq(".close-task-modal-btn").trigger("focus");
}

function extractMovementError(error) {
  const apiMessage = error?.responseJSON?.error?.message
    || error?.responseJSON?.message
    || error?.error?.message
    || (typeof error?.error === "string" ? error.error : null)
    || error?.responseText
    || error?.message;

  if (apiMessage) {
    if (typeof apiMessage === "string") {
      try {
        const parsed = JSON.parse(apiMessage);
        return parsed?.error?.message || parsed?.message || apiMessage;
      } catch (_) {
        return apiMessage;
      }
    }

    return String(apiMessage);
  }

  return error?.status ? `Erro HTTP ${error.status}.` : "Erro inesperado ao movimentar a tarefa.";
}

if (typeof jq !== "undefined") {
  jq(document).ready(function () {
  const dominio = window.location.origin;
  const page = window.location.href;
  const taskSelectionState = createTaskSelectionState();
  const aprovadores = [1890, 1885, 1894, 4130, 1959, 1897, 5240, 1888, 4101, 7148];
  const usuarioLogado = getCurrentZeevUserId();
  const podeAprovarEmMassa = aprovadores.includes(usuarioLogado);
  let taskSelectionSyncTimer = null;

  const getTaskAssignmentId = (checkbox) => {
    const checkboxValue = jq(checkbox).val();
    const rowKey = jq(checkbox).closest("tr").data("key");
    return String(checkboxValue || rowKey || "").trim();
  };

  const updateTaskSelectionControls = () => {
    const checkboxes = jq(".task-check-action");
    const checkedCount = checkboxes.filter(":checked").length;
    const headerCheckbox = jq("#checkbox-header");

    headerCheckbox.prop("checked", checkboxes.length > 0 && checkedCount === checkboxes.length);
    headerCheckbox.prop("indeterminate", checkedCount > 0 && checkedCount < checkboxes.length);

    if (podeAprovarEmMassa && checkedCount > 0) {
      jq("#containerButton").removeClass("d-none");
    } else {
      jq("#containerButton").addClass("d-none");
    }
  };

  const reconcileTaskSelection = () => {
    const checkboxes = jq(".task-check-action");
    const visibleIds = checkboxes.map(function () {
      return getTaskAssignmentId(this);
    }).get();
    const checkedIds = new Set(reconcileTaskSelectionIds(taskSelectionState, visibleIds));

    checkboxes.each(function () {
      jq(this).prop("checked", checkedIds.has(getTaskAssignmentId(this)));
    });

    updateTaskSelectionControls();
  };

  const scheduleTaskSelectionSync = () => {
    clearTimeout(taskSelectionSyncTimer);
    taskSelectionSyncTimer = setTimeout(reconcileTaskSelection, 0);
  };

  const ensureTaskHeaderCheckbox = () => {
    const tableHeader = jq(".table-hover-pointer thead tr th:first");
    if (tableHeader.length > 0 && jq("#checkbox-header").length === 0) {
      tableHeader.html('<input type="checkbox" class="checkbox-header" id="checkbox-header">');
    }
  };

  if (!localStorage.getItem('chkReload')) {
    localStorage.setItem('chkReload', '');
  } else if (localStorage.getItem('chkReload') === "1") {
    localStorage.setItem('chkReload', '');
  }

  addActionRow();

  const updateText = (selector, original, updated) => {
    jq(selector).each(function () {
      const element = jq(this).find('span').first();
      const text = element.text().replace(original, updated);
      element.text(text);
    });
  };

  const updatePageTitleAndButton = (original, updated) => {
    jq('.page-title h1, .btn-new-notification span').each(function () {
      const text = jq(this).text().replace(original, updated);
      jq(this).text(text);
    });
  };

  if (dominio.includes('hml')) {
    jq('#aHeaderMenuHomeName').text('Ticket Raiz HML');
  } else {
    jq('#aHeaderMenuHomeName').text('Ticket Raiz');
  }

  jq(`a[href="${dominio}/my/notifications"]`).removeClass("d-lg-none");
  updateText(`a[href="${dominio}/my/notifications"]`, /Notificações/g, 'Mensagens');
  jq(`a[href="${dominio}/my/notifications"] .notification-count`).removeClass('d-none');

  switch (page) {
    case `${dominio}/my/notifications`:
    case `${dominio}/my/notifications#`:
      updatePageTitleAndButton(/Notificações/g, 'Mensagens');
      updatePageTitleAndButton(/notificação/g, 'mensagem');
      break;
    case `${dominio}/my/tasks-legacy`:
      jq("tr").each(function () {
        jq(this).find("th:first, td:first").removeClass("d-none");
      });

      applyDNoneForMobile();

      jq(window).on("resize", applyDNoneForMobile);

      ensureTaskHeaderCheckbox();
      setInterval(ensureTaskHeaderCheckbox, 500);

      jq(document).off("change.ticketRaizTaskSelection", ".task-check-action");
      jq(document).on("change.ticketRaizTaskSelection", ".task-check-action", function () {
        taskSelectionState.set(getTaskAssignmentId(this), jq(this).prop("checked"));
        updateTaskSelectionControls();
      });

      jq(document).off("change.ticketRaizTaskSelection", "#checkbox-header");
      jq(document).on("change.ticketRaizTaskSelection", "#checkbox-header", function () {
        const isChecked = jq(this).prop("checked");
        jq(".task-check-action").each(function () {
          jq(this).prop("checked", isChecked);
          taskSelectionState.set(getTaskAssignmentId(this), isChecked);
        });
        if (typeof tasklist_check_click === "function") {
            tasklist_check_click();
        }
        updateTaskSelectionControls();
      });

      jq(".task-check-action:checked").each(function () {
        taskSelectionState.set(getTaskAssignmentId(this), true);
      });
      scheduleTaskSelectionSync();

      break;
    case `${dominio}/my/services-legacy`:
      //verificaAtrasos(dominio);
      break;
  }

  const observer = new MutationObserver(function (mutations, observerInstance) {
    if (jq("#userPersona").val() != "PowerUser") {
      jq("#LkDelete").hide();
    }

    observerInstance.disconnect();

    mutations.forEach(function (mutation) {
      if (mutation.type === 'childList') {
        switch (page) {
          case `${dominio}/my/notifications#`:
            updateText('#LkSend', /Enviar notificação/g, 'Enviar mensagem');
            updateText('.modal-header.bg-white h1', /Notificação/g, 'Mensagem');
            break;
          case `${dominio}/my/services-legacy`:
            jq(mutation.addedNodes).find('.card-title').each(function () {
              const text = jq(this).text();
              const iconMap = {
                '[Atendimento]': "https://i.postimg.cc/t4pSfV5M/servico-de-atendimento-ao-consumidor.png",
                '[BI]': "https://i.postimg.cc/zXn20knh/business-intelligence.png",
                '[Operações]': "https://i.postimg.cc/13BCZ575/mechanical.png",
                '[P&C]': "https://i.postimg.cc/KzNCqDXQ/recursos-humanos.png",
                '[Comercial]': "https://i.postimg.cc/kXZzp5Zr/carrinho.png",
                '[Recursos Humanos]': "https://i.postimg.cc/KzNCqDXQ/recursos-humanos.png",
                '[Departamento Pessoal]': "https://i.postimg.cc/L6bFFDJb/estrutura-de-organizacao.png",
                '[Fiscal]': "https://i.postimg.cc/xdb047g5/livre-de-impostos-1.png",
                '[Financeiro]': "https://i.postimg.cc/wMR3cvZq/salvando.png",
                '[Jurídico]': "https://i.postimg.cc/Z584S36t/juridico-1.png",
                '[TI]': "https://i.postimg.cc/qR9cVgPY/tecnologia.png",
                '[Cobrança]': "https://i.postimg.cc/P5tFC8Bk/cobranca.png",
                '[TOTVS]': "https://i.postimg.cc/kMRrCKd1/totvs-icon-131953.png",
                '[Performance]': "https://i.postimg.cc/Pxq6SsdV/velocimetro.png"
              };

              for (const [prefix, iconSrc] of Object.entries(iconMap)) {
                if (text.startsWith(prefix) && jq(this).find('img').length === 0) {
                  const icon = jq('<img>', {
                    src: iconSrc,
                    alt: prefix.replace('[', '').replace(']', ''),
                    style: "width: 32px; height: 32px; margin-right: 10px;"
                  });
                  jq(this).prepend(icon);
                  break;
                }
              }
            });

            jq('.fav').html('<img class="ico-no-favorite ico-md" src="https://i.postimg.cc/KzWHSJL9/coracao.png" alt="Ícone de favorito">');
            jq('.unfav').html('<img class="ico-no-favorite ico-md" src="https://i.postimg.cc/2jHg6F7L/coracao-3.png" alt="Ícone de favorito">');
            break;
          case `${dominio}/my/tasks-legacy`:
            jq("tr").each(function () {
              jq(this).find("th:first, td:first").removeClass("d-none");
            });

            ensureTaskHeaderCheckbox();

            applyDNoneForMobile();
            scheduleTaskSelectionSync();
            break;
        }
      }
    });

    observerInstance.observe(document.body, { childList: true, subtree: true });
  });

  observer.observe(document.body, { childList: true, subtree: true });
  });
}

function addActionRow() {
  const newRow = `
    <div id="containerButton" class="d-none" style="display: flex; align-items: center; margin-left: auto;">
      <button type="button" id="btnApproveTasks" class="btn btn-success ml-3" style="white-space: nowrap;">Aprovar Tarefas</button>
      <button type="button" id="btnRejectTasks" class="btn btn-danger ml-3" style="white-space: nowrap; display: none;">Reprovar Tarefas</button>
    </div>`;

  jq("#containerActions .input-group").append(newRow);

  jq("#btnApproveTasks").off("click").on("click", movimentaTarefas.bind(null, true));
  jq("#btnRejectTasks").off("click").on("click", movimentaTarefas.bind(null, false));
}

async function validaPendencias() {
  const tokenElement = jq('input[name="__RequestVerificationToken"]');
  const token = tokenElement.length ? tokenElement.val() : null;

  if (!token) {
    console.error("Token de verificação não encontrado.");
    return;
  }

  const url = `${window.location.origin}/api/internal/bpms/1.0/assignments?pagenumber=1&simulation=N&codreport=6x6Iw2g5qn7z%252Bt743f1Lbg%253D%253D&reporttype=mytasks&codflowexecute=&=&codtask=&taskstatus=S&field=&operator=Equal&fieldvaluetext=&fielddatasource=&fieldvalue=&requester=&codrequester=&=&tasklate=Late&startbegin=&startend=&sortfield=&sortdirection=ASC&keyword=&chkReload=on`;

  const headers = {
    "Accept": "*/*",
    "Content-Type": "application/json",
    "x-sml-antiforgerytoken": token
  };

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: headers,
      credentials: "include"
    });

    if (response.ok) {
      const data = await response.json();
      console.log (data)
      if (data.success && data.success.itens && data.success.itens.length > 0) {
        const items = data.success.itens;
        const dataAtual = new Date();
        let count = 0;

        jq.each(items, function (index, item) {
          const dataDte = converteParaDate(item.dte);
          const diferencaDias = Math.floor((dataAtual - dataDte) / (1000 * 60 * 60 * 24));
          const regex = /corrigir|correção|validar\s+comprovante/i;

          if (diferencaDias >= 7 && regex.test(item.t)) {
            count++;
          }
        });

        if (count > 0) {
          mostrarAlerta('danger', 'Atenção', `Existem ${count} pendências em aberto. Para prosseguir com novas solicitações, é necessário resolvê-las primeiro.`);
        } else {
          jq('#colorbox, #modalOverlay').remove();
          jq('body').css({ pointerEvents: 'auto', overflow: 'auto' });
        }
      } else {
        console.warn("Nenhum item encontrado ou estrutura inesperada");
      }
    } else {
      console.error("Erro HTTP:", response.status, response.statusText);
    }
  } catch (error) {
    console.error("Erro na requisição:", error);
  }
}

async function processTaskBatch(tasks, decisao, token, options = {}) {
  const processTask = options.processTask || processaMovimentacao;
  const wait = options.wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const onTaskStart = options.onTaskStart || (() => {});
  const onProgress = options.onProgress || (() => {});
  const results = [];

  if (!token) {
    return tasks.map((task) => ({
      ...task,
      status: "failed",
      error: "Não foi possível autenticar o usuário no Zeev. Nenhuma tarefa foi enviada."
    }));
  }

  for (const [index, task] of tasks.entries()) {
    onTaskStart(task, index + 1, tasks.length);
    try {
      await wait(2000);
      const response = await processTask(
        task.taskNumber,
        decisao ? "1" : "2",
        decisao ? "Aprovado" : "Reprovado",
        token
      );

      results.push({
        ...task,
        status: response?.success ? "success" : response?.uncertain ? "uncertain" : "failed",
        error: response?.error || "Falha sem detalhes retornados pela API."
      });
    } catch (error) {
      results.push({
        ...task,
        status: "uncertain",
        error: extractMovementError(error)
      });
    }

    onProgress(results.length, tasks.length);
  }

  return results;
}

function formatTaskErrorForDisplay(error) {
  const message = String(error ?? "");
  const invalidApproval = /resultado de ação\s*["“”']?1["“”']?\s*não condiz com nenhum botão previsto na configuração/i.test(message);
  const completionExpected = /resultados esperados são:\s*["“”']?3(?!\d)["“”']?/i.test(message);
  if (invalidApproval && completionExpected) {
    return "A ação informada não é válida para a etapa atual do processo."
      + "Neste momento, a tarefa está em uma etapa de conclusão, e não de aprovação.";
  }
  return message;
}

function buildTaskBatchSummary(results, decisao) {
  const successful = results.filter((result) => result.status === "success");
  const failed = results.filter((result) => result.status === "failed");
  const uncertain = results.filter((result) => result.status === "uncertain");
  const actionLabel = decisao ? "aprovadas" : "reprovadas";
  const statusCard = (count, label, color, background, border) => (
    `<div style="padding: 14px 16px; border: 1px solid ${border}; border-radius: 10px; background: ${background}; color: ${color};">`
    + `<strong style="display: block; font-size: 26px; line-height: 1.1;">${count}</strong>`
    + `<span style="display: block; margin-top: 5px; font-size: 13px; font-weight: 600;">${label}</span></div>`
  );
  const renderItems = (items, color, background, border, displayError = (item) => item.error) => items.map((item) => (
    `<div style="padding: 12px 14px; border: 1px solid ${border}; border-left: 3px solid ${color}; border-radius: 8px; background: ${background};">`
    + `<strong style="display: block; margin-bottom: 4px; color: ${color};">${escapeTaskMessage(item.taskId)}</strong>`
    + `<div style="white-space: pre-wrap; overflow-wrap: anywhere;">${escapeTaskMessage(displayError(item))}</div></div>`
  )).join("");
  const failedGroups = Array.from(failed.reduce((groups, item) => {
    const error = formatTaskErrorForDisplay(item.error);
    if (!groups.has(error)) groups.set(error, { error, tasks: [] });
    groups.get(error).tasks.push(item);
    return groups;
  }, new Map()).values()).sort((a, b) => b.tasks.length - a.tasks.length);
  const renderTaskIds = (items) => `<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px;">${items.map((item) => (
    `<span style="padding: 3px 8px; border-radius: 999px; background: #fee2e2; color: #991b1b; font-size: 12px; font-weight: 700;">${escapeTaskMessage(item.taskId)}</span>`
  )).join("")}</div>`;
  const renderFailedGroup = (group) => {
    const extraTasks = group.tasks.slice(5);
    return `<div style="padding: 12px 14px; border: 1px solid #fee2e2; border-left: 3px solid #b91c1c; border-radius: 8px; background: #fffafa;">`
      + `<strong style="display: block; margin-bottom: 5px; color: #991b1b;">${group.tasks.length === 1 ? escapeTaskMessage(group.tasks[0].taskId) : `${group.tasks.length} tarefas com o mesmo motivo`}</strong>`
      + `<div style="white-space: pre-wrap; overflow-wrap: anywhere;">${escapeTaskMessage(group.error)}</div>`
      + (group.tasks.length > 1 ? renderTaskIds(group.tasks.slice(0, 5)) : "")
      + (extraTasks.length > 0 ? `<details style="margin-top: 8px;"><summary style="cursor: pointer; color: #991b1b; font-weight: 700;">Ver outros ${extraTasks.length} tickets</summary>${renderTaskIds(extraTasks)}</details>` : "")
      + `</div>`;
  };
  let message = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 10px; margin-bottom: 22px;" aria-label="Resumo de ${results.length} ${results.length === 1 ? "tarefa" : "tarefas"}">`
    + statusCard(successful.length, `Tarefas ${actionLabel}`, "#17635e", "#eaf7f5", "#a8dad4")
    + statusCard(failed.length, "Com erro", "#b91c1c", "#fef2f2", "#fecaca")
    + statusCard(uncertain.length, "N\u00e3o confirmadas", "#8a4e00", "#fff4e6", "#f3c48b")
    + `</div>`;

  if (successful.length > 0) {
    message += `<details style="margin-bottom: 22px; padding: 12px 14px; border: 1px solid #b8dfda; border-radius: 8px; background: #f3faf9;">`
      + `<summary style="cursor: pointer; color: #17635e; font-weight: 700;">Ver ${successful.length} ${successful.length === 1 ? "tarefa" : "tarefas"} ${actionLabel}</summary>`
      + `<div style="display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px;">`
      + successful.map((task) => `<span style="padding: 4px 9px; border-radius: 999px; background: #d8f1ee; color: #17635e; font-weight: 600;">${escapeTaskMessage(task.taskId)}</span>`).join("")
      + `</div></details>`;
  }
  if (failed.length > 0) {
    const extraGroups = failedGroups.slice(3);
    const extraTaskCount = extraGroups.reduce((total, group) => total + group.tasks.length, 0);
    message += `<section aria-label="Erros por tarefa" style="margin-bottom: 22px;">`
      + `<h3 style="margin: 0 0 10px; color: #991b1b; font-size: 15px; font-weight: 700;">Erros por tarefa <span style="font-size: 12px; font-weight: 600;">(${failed.length})</span></h3>`
      + `<div style="display: grid; gap: 9px;">${failedGroups.slice(0, 3).map(renderFailedGroup).join("")}</div>`
      + (extraGroups.length > 0 ? `<details style="margin-top: 10px; padding: 11px 14px; border: 1px solid #fee2e2; border-radius: 8px;"><summary style="cursor: pointer; color: #991b1b; font-weight: 700;">Ver outros ${extraGroups.length} motivos (${extraTaskCount} tarefas)</summary><div style="display: grid; gap: 9px; margin-top: 10px;">${extraGroups.map(renderFailedGroup).join("")}</div></details>` : "")
      + `</section>`;
  }
  if (uncertain.length > 0) {
    message += `<section aria-label="Resultado n\u00e3o confirmado" style="margin-bottom: 22px;">`
      + `<h3 style="margin: 0 0 6px; color: #8a4e00; font-size: 15px; font-weight: 700;">Resultado n\u00e3o confirmado</h3>`
      + `<p style="margin: 0 0 10px; color: #714400;">Confira o estado destas tarefas antes de tentar novamente.</p>`
      + `<div style="display: grid; gap: 9px;">${renderItems(uncertain, "#8a4e00", "#fff9f0", "#f3c48b")}</div></section>`;
  }
  if (failed.length > 0 || uncertain.length > 0) {
    message += `<div style="padding-top: 14px; border-top: 1px solid #dbeae7; color: #45615e; font-size: 13px;">${createTaskSupportMessage()}</div>`;
  }

  const title = failed.length > 0 || uncertain.length > 0
    ? successful.length > 0 ? "Conclu\u00eddo com ressalvas" : "N\u00e3o conclu\u00eddo"
    : "Sucesso!";
  return { title, message, shouldRefresh: successful.length > 0 || uncertain.length > 0 };
}

async function movimentaTarefas(decisao) {
  try {
    const tasks = jq(".task-check-action:checked").map(function () {
      const checkbox = jq(this);
      const row = checkbox.closest("tr");
      const taskNumber = String(checkbox.val() || row.data("key") || "").trim();
      const taskId = row.find("td.d-none.d-md-table-cell span.badge").text().trim();

      return taskNumber ? { taskNumber, taskId: taskId || `#${taskNumber}` } : null;
    }).get().filter(Boolean);
    console.log("Tarefas selecionadas para processamento:", tasks);

    const totalTasks = tasks.length;

    if (totalTasks === 0) {
      showTaskModal(
        "Atenção!",
        "Nenhuma tarefa está selecionada.<br><br>Marque ao menos uma tarefa antes de executar a aprovação."
      );
      return;
    }

    jq("#btnApproveTasks, #btnRejectTasks").prop("disabled", true);
    jq(".app-overlay").show();

    const contentLeft = getTaskContentLeft();
    jq("body").append(`
      <div id="processingModal" style="position: fixed; top: 0; right: 0; bottom: 0; left: ${contentLeft}px; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; background: rgba(12, 47, 45, 0.20); z-index: 100;">
        <div role="status" aria-live="polite" style="width: min(380px, 100%); padding: 24px; box-sizing: border-box; background: #fff; border: 1px solid #cfe4e1; border-top: 4px solid #f08700; border-radius: 14px; box-shadow: 0 20px 50px rgba(12, 47, 45, 0.25); text-align: left;">
          <div style="color: #286f69; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">Ticket Raiz · Tarefas</div>
          <p style="margin: 5px 0 20px; color: #174e4a; font-size: 18px; font-weight: 700; line-height: 1.3;">Processando movimentações...</p>
          <p id="currentTaskNumber" style="margin: 0 0 14px; color: #174e4a; font-weight: 600; overflow-wrap: anywhere;">Autenticando...</p>
          <div role="progressbar" aria-label="Progresso do lote" aria-valuemin="0" aria-valuemax="${totalTasks}" aria-valuenow="0" style="height: 8px; overflow: hidden; border-radius: 999px; background: #eaf7f5;">
            <div id="taskProgressBar" style="width: 0%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #7ac5bf, #f08700); transition: width 0.25s ease;"></div>
          </div>
          <p id="progressCount" style="margin: 9px 0 0; color: #45615e; font-size: 13px; text-align: right;">0 / ${totalTasks} concluídas</p>
        </div>
      </div>
    `);
    if (typeof window !== "undefined") {
      jq(window).off("resize.ticketRaizProcessingModal").on("resize.ticketRaizProcessingModal", function () {
        jq("#processingModal").css("left", `${getTaskContentLeft()}px`);
      });
    }

    const authentication = await buscaToken();
    if (!authentication.token) {
      showTaskModal("Falha na autenticação", `<p>${escapeTaskMessage(authentication.error)}</p>`);
      return;
    }

    const results = await processTaskBatch(tasks, decisao, authentication.token, {
      onTaskStart(task, current, total) {
        jq("#currentTaskNumber").text(`Ticket atual: ${task.taskId} (${current} de ${total})`);
      },
      onProgress(processed, total) {
        jq("#progressCount").text(`${processed} / ${total} concluídas`);
        jq("#taskProgressBar").css("width", `${Math.round((processed / total) * 100)}%`);
        jq("#processingModal [role='progressbar']").attr("aria-valuenow", processed);
      }
    });

    const summary = buildTaskBatchSummary(results, decisao);
    showTaskModal(
      summary.title,
      summary.message,
      summary.shouldRefresh ? () => window.location.reload() : null
    );
  } catch (error) {
    console.error("Erro ao processar tarefa:", error);
    showTaskModal(
      "Erro!",
      `Não foi possível concluir o processamento das tarefas.<br><br>${createTaskSupportMessage()}`
    );
  } finally {
    if (typeof window !== "undefined") jq(window).off("resize.ticketRaizProcessingModal");
    jq(".app-overlay").hide();
    jq("#processingModal").remove();
    jq("#btnApproveTasks, #btnRejectTasks").prop("disabled", false);
  }
}

function createAssignmentPayload(result, reason) {
  return {
    result: String(result ?? "").trim(),
    instanceTaskEnvelope: {
      formFields: [],
      comments: String(reason ?? "").trim()
    }
  };
}

async function processaMovimentacao(id, result, reason, token) {
  try {
    if (!token) throw new Error("Token de autenticação não encontrado.");

    const response = await jq.ajax({
      url: `${window.location.origin}/api/2/assignments/${id}`,
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      data: JSON.stringify(createAssignmentPayload(result, reason))
    });

    if (response?.success === false || response?.error) {
      return { success: false, error: extractMovementError(response) };
    }

    return { success: true, response };
  } catch (error) {
    const status = Number(error?.status) || null;
    return {
      success: false,
      uncertain: status === null || status >= 500,
      status,
      error: extractMovementError(error)
    };
  }
}

function describeAuthenticationFailure(stage, error) {
  const status = Number(error?.status);
  return status > 0 ? `${stage}: HTTP ${status}.` : `${stage}: sem resposta válida.`;
}

async function buscaToken() {
  const usuarioLogado = getCurrentZeevUserId();
  if (!usuarioLogado) {
    return { token: null, error: "Não foi possível identificar o usuário logado no Zeev. Nenhuma tarefa foi enviada." };
  }

  const errors = [];
  try {
    const currentUser = await jq.ajax({
      url: `${window.location.origin}/api/2/tokens`,
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    if (currentUser?.temporaryToken && resolveZeevUserId([currentUser.userId]) === usuarioLogado) {
      return { token: currentUser.temporaryToken, error: null };
    }
    errors.push("Token do usuário atual: resposta sem token válido para o usuário logado.");
  } catch (error) {
    errors.push(describeAuthenticationFailure("Token do usuário atual", error));
  }

  let stage = "Datasource do Zeev";
  try {
    const apiUrl = `${window.location.origin}/api/internal/legacy/1.0/datasource/get/1.0/` +
      (window.location.origin.includes('hml')
        ? "yjbbrV4FLfJUDeTgo97d3CmCz9CCIBqtlH2OupdGmAiSrUr8-LKFdChlE37fCDRMhGf@-i0xUw8t9Pl8mXHU6w__"
        : "DDwgBioycx75M0IiEFF-sdk0HwdR17CgcklxG-9Wy5WHeAyX4eV9pCstsjxLBqOYG2SnaXgEA6YhPK1R8LpVdw__"
      );

    const responseToken = await jq.ajax({ url: apiUrl, method: "GET", headers: { "Content-Type": "application/json" } });
    const token = responseToken?.success?.[0]?.cod || (() => { throw new Error("Token não encontrado."); })();

    stage = "Impersonação do usuário";
    const response = await jq.ajax({
      url: `${window.location.origin}/api/2/tokens/impersonate/${usuarioLogado}`,
      method: "GET",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
    });

    const temporaryToken = response?.impersonate?.temporaryToken;
    if (!temporaryToken) throw new Error("Token de impersonação não encontrado.");
    return { token: temporaryToken, error: null };

  } catch (error) {
    errors.push(describeAuthenticationFailure(stage, error));
    return { token: null, error: `${errors.join(" ")} Nenhuma tarefa foi enviada.` };
  }

}



function applyDNoneForMobile() {
  const isMobile = window.innerWidth <= 768;
  jq("#containerReport tr").each(function () {
    jq(this).find("small").toggleClass("d-none", isMobile);
    jq('table.table th:nth-last-child(2), table.table td:nth-last-child(2)').hide();
  });
}

async function verificaAtrasos(dominio) {
  const tokenElement = jq('input[name="__RequestVerificationToken"]');
  const token = tokenElement.length ? tokenElement.val() : null;

  if (!token) {
    console.error("Token de verificação não encontrado.");
    return;
  }

  const url = `${window.location.origin}/api/internal/bpms/1.0/assignments?pagenumber=1&simulation=N&codreport=6x6Iw2g5qn7z%252Bt743f1Lbg%253D%253D&reporttype=mytasks&codflowexecute=&=&codtask=&taskstatus=S&field=&operator=Equal&fieldvaluetext=&fielddatasource=&fieldvalue=&requester=&codrequester=&=&tasklate=Late&startbegin=&startend=&sortfield=&sortdirection=ASC&keyword=&chkReload=on`;

  const headers = {
    "Accept": "*/*",
    "Content-Type": "application/json",
    "x-sml-antiforgerytoken": token
  };

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: headers,
      credentials: "include"
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.success.itens && data.success.itens.length > 0) {
        const items = data.success.itens;
        const totalSolicitacoes = items.length;

        const tableRows = items.map(item => `
          <tr>
            <td style="white-space: nowrap;"><a href="${item.lk}" data-key="${item.cfetp}" tabindex="0" role="button">${item.cfe}</a></td>
            <td style="color: #dc3545; padding: 3px 10px; white-space: nowrap;">${item.el}</td>
            <td style="white-space: nowrap;">${item.t}</td>
          </tr>`).join('');

        const modalHTML = `
          <div id="modalOverlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.6); z-index: 89 !important;"></div>
          <div id="colorbox" class="" role="dialog" tabindex="-1" style="display: block; visibility: visible; top: 50%; left: 50%; transform: translate(-50%, -50%); position: fixed; width: 400px; height: 350px; background: white; z-index: 90 !important; border-radius: 8px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3); padding: 16px; overflow: hidden;">
            <h2 style="margin: 0; text-align: center; padding: 3px 0; font-size: 18px;">Atenção!</h2>
            <p style="text-align: left; font-size: 14px; margin-bottom: 3px;">
              Você possui um total de <strong style="color: #dc3545">${totalSolicitacoes}</strong> solicitações com o SLA expirado.
            </p>
            <div style="overflow-x: auto; overflow-y: auto; height: 200px;">
              <table style="width: 100%; text-align: left; border-collapse: collapse; margin-top: 3px;">
                <thead>
                  <tr style="border: none;">
                    <th style="border: none; padding: 3px; white-space: nowrap;">#</th>
                    <th style="border: none; padding: 3px 10px; white-space: nowrap;">Venc.</th>
                    <th style="border: none; padding: 3px; white-space: nowrap;">Tarefa</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
            </div>
            <div class="spaced text-right" style="margin-top: 3px; text-align: center;">
              <button type="button" class="btn btn-success" id="closeModalBtn" onclick="validaPendencias()" style="padding: 6px 12px;">OK</button>
            </div>
          </div>`;

        jq('body').append(modalHTML);
      } else {
        console.warn("Nenhum item encontrado ou estrutura inesperada");
      }
    } else {
      console.error("Erro HTTP:", response.status, response.statusText);
    }
  } catch (error) {
    console.error("Erro na requisição:", error);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    createTaskSelectionState,
    reconcileTaskSelectionIds,
    resolveZeevUserId,
    escapeTaskMessage,
    createTaskSupportMessage,
    extractMovementError,
    createAssignmentPayload,
    processTaskBatch,
    buildTaskBatchSummary,
    buscaToken,
    movimentaTarefas,
    processaMovimentacao
  };
}
