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
  return `Para solicitar suporte, acesse <a href="${supportUrl}" target="_blank" rel="noopener noreferrer"><strong>[Processos] Solicitações Ticket Raiz</strong></a>.`;
}

function showTaskModal(title, message, callback) {
  jq("#modalOverlay, #colorbox").remove();
  jq("body").append(`
    <div id="modalOverlay" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); z-index: 89 !important;"></div>
    <div id="colorbox" role="dialog" aria-modal="true" tabindex="-1" style="display: flex; flex-direction: column; visibility: visible; top: 50%; left: 50%; transform: translate(-50%, -50%); position: fixed; width: min(640px, calc(100vw - 32px)); max-height: 80vh; background: white; z-index: 90 !important; border-radius: 8px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3); padding: 16px;">
      <h2 style="margin: 0 0 12px; text-align: center; font-size: 18px;">${escapeTaskMessage(title)}</h2>
      <div style="min-height: 0; overflow-y: auto; overflow-wrap: anywhere;">${message}</div>
      <div style="margin-top: 16px; text-align: center;">
        <button type="button" class="btn btn-success close-task-modal-btn">OK</button>
      </div>
    </div>
  `);

  jq(".close-task-modal-btn").off("click").on("click", function () {
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
  const onProgress = options.onProgress || (() => {});
  const results = [];

  if (!token) {
    return tasks.map((task) => ({
      ...task,
      status: "failed",
      error: "Não foi possível autenticar o usuário no Zeev. Nenhuma tarefa foi enviada."
    }));
  }

  for (const task of tasks) {
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

function buildTaskBatchSummary(results, decisao) {
  const successful = results.filter((result) => result.status === "success");
  const failed = results.filter((result) => result.status === "failed");
  const uncertain = results.filter((result) => result.status === "uncertain");
  const actionLabel = decisao ? "aprovadas" : "reprovadas";
  const renderItems = (items) => `<ul style="padding-left: 20px;">${items.map((item) => (
    `<li><strong>${escapeTaskMessage(item.taskId)}</strong>: ${escapeTaskMessage(item.error)}</li>`
  )).join("")}</ul>`;
  let message = `<p><strong>${successful.length}</strong> de ${results.length} tarefas ${actionLabel}. `
    + `<strong>${failed.length}</strong> com erro. `
    + `<strong>${uncertain.length}</strong> com resultado não confirmado.</p>`;

  if (successful.length > 0) {
    message += `<p>Concluídas: ${successful.map((task) => escapeTaskMessage(task.taskId)).join(", ")}.</p>`;
  }
  if (failed.length > 0) {
    message += `<p><strong>Erros por tarefa:</strong></p>${renderItems(failed)}`;
  }
  if (uncertain.length > 0) {
    message += `<p><strong>Resultado não confirmado:</strong> confira o estado destas tarefas antes de tentar novamente.</p>${renderItems(uncertain)}`;
  }
  if (failed.length > 0 || uncertain.length > 0) {
    message += `<p>${createTaskSupportMessage()}</p>`;
  }

  const title = failed.length > 0 || uncertain.length > 0
    ? successful.length > 0 ? "Concluído com ressalvas" : "Não concluído"
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

    jq("body").append(`
      <div id="processingModal" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.1); border-radius: 8px; z-index: 100; text-align: center;">
        <p>Processando movimentações...</p>
        <p id="progressCount">0 / ${totalTasks}</p>
      </div>
    `);

    const authentication = await buscaToken();
    if (!authentication.token) {
      showTaskModal("Falha na autenticação", `<p>${escapeTaskMessage(authentication.error)}</p>`);
      return;
    }

    const results = await processTaskBatch(tasks, decisao, authentication.token, {
      onProgress(processed, total) {
        jq("#progressCount").text(`${processed} / ${total}`);
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
