// Regras funcionais independentes do componente anterior.
export const TASK_TERMS = [
  'corrigir',
  'correcao',
  'ajuste',
  'ajustar',
  'validar comprovante',
  'validacao de comprovante'
];
export const BLOCKING_ACTIVITY_ALIAS = '[PROCESSO]avaliarAtendimento';
export const MIN_ACTIVITY_REQUESTS = 3;

// O filtro codtask usa o ID numérico interno, diferente do código original da atividade.
// Valores conferidos no filtro de tarefas dos ambientes HML e PRD.
const BLOCKING_ACTIVITY_FILTERS = {
  'hmlraizeducacao.zeev.it': {
    taskId: '19991',
    flow: '393;ef12f561-bd2a-49a8-be91-28542b6263aa;0;0'
  },
  'raizeducacao.zeev.it': {
    taskId: '16070',
    flow: '268;314489d5-5790-40b1-b366-56863e76e425;0;0'
  }
};

export function normalizeText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function isTargetActivity(task, internalTaskId = '') {
  const activityCodes = [
    task?.instance?.instanceTask?.task?.element?.alias,
    task?.alias,
    task?.taskAlias,
    task?.activityCode,
    task?.codtask
  ];
  return activityCodes.some(code =>
    String(code ?? '') === BLOCKING_ACTIVITY_ALIAS ||
    Boolean(internalTaskId && String(code ?? '') === internalTaskId)
  );
}

export function matchesBlockingTask(task, internalTaskId = '') {
  const name = normalizeText(task?.t);
  return TASK_TERMS.some(term => name.includes(term)) || isTargetActivity(task, internalTaskId);
}

export function isRelevantPage(pathname) {
  const path = String(pathname ?? '').toLowerCase();
  return path.includes('/my/services') || path.startsWith('/2.0/request');
}

export function isRequestAction(element, pathname) {
  if (!element || typeof element.closest !== 'function') return false;
  const button = element.closest('button');
  if (!button) return false;
  if (String(pathname).toLowerCase().startsWith('/2.0/request')) {
    return button.id === 'BtnSend';
  }
  return String(pathname).toLowerCase().includes('/my/services') &&
    button.id.startsWith('btnRequest-') &&
    normalizeText(button.dataset.action) === 'solicitar';
}

export function buildAssignmentsUrl(origin, page, codtask = '', flow = '') {
  if (!Number.isInteger(page) || page < 1) throw new Error('Página inválida');
  const url = new URL('/api/internal/bpms/1.0/assignments', origin);
  const params = url.searchParams;
  params.set('pagenumber', String(page));
  params.set('simulation', 'N');
  params.set('codreport', '');
  params.set('filterCombo', '');
  params.set('reporttype', '');
  params.set('codflowexecute', '');
  params.set('codflowsorservices', String(flow));
  params.set('codtask', String(codtask));
  params.set('taskstatus', 'S');
  params.set('field', '');
  params.set('operator', 'Equal');
  params.set('fieldvaluetext', '');
  params.set('fielddatasource', '');
  params.set('fieldvalue', '');
  params.set('requester', '');
  params.set('codrequester', '');
  params.set('tasklate', 'Late');
  params.set('startbegin', '');
  params.set('startend', '');
  params.set('sortfield', '');
  params.set('sortdirection', 'ASC');
  params.set('keyword', '');
  return url.toString();
}

export async function loadBlockingTasks({
  origin,
  fetchImpl = fetch,
  antiforgeryToken = null,
  maxPages = 30,
  timeoutMs = 10000
}) {
  const overdue = new Map();
  const activity = new Map();
  const activityFilter = BLOCKING_ACTIVITY_FILTERS[new URL(origin).hostname];
  const internalTaskId = activityFilter?.taskId || '';

  async function readPage(page, codtask = '', flow = '') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      const headers = { Accept: 'application/json' };
      // O helper GET do Zeev envia este cabeçalho quando o campo existe,
      // inclusive se o valor estiver vazio.
      if (antiforgeryToken !== null) {
        headers['X-SML-AntiForgeryToken'] = antiforgeryToken;
      }
      response = await fetchImpl(buildAssignmentsUrl(origin, page, codtask, flow), {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers,
        signal: controller.signal
      });
    } catch (error) {
      throw new Error(`Não foi possível consultar a página ${page} das tarefas.`, { cause: error });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`A consulta de tarefas falhou na página ${page} (HTTP ${response.status}).`);
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error(`A página ${page} retornou dados inválidos.`, { cause: error });
    }
    const items = data?.success?.itens;
    if (!Array.isArray(items)) {
      throw new Error(`A página ${page} não contém a lista de tarefas esperada.`);
    }
    return items;
  }

  function taskKey(task, page) {
    return String(task.cfetp || task.cfe || `${page}:${task.t ?? ''}`);
  }

  function displayTask(task, id) {
    return {
      id,
      number: String(task.cfe ?? ''),
      name: String(task.t ?? ''),
      due: String(task.el ?? ''),
      link: String(task.lk ?? '')
    };
  }

  let finished = false;
  for (let page = 1; page <= maxPages; page += 1) {
    const items = await readPage(page);
    if (items.length === 0) {
      finished = true;
      break;
    }
    for (const task of items) overdue.set(taskKey(task, page), task);
  }
  if (!finished) {
    throw new Error(`A consulta ultrapassou ${maxPages} páginas; o resultado não é confiável.`);
  }
  if (overdue.size && internalTaskId) {
    // O relatório compacto pode omitir o alias. O filtro específico identifica
    // essas atividades antes de aplicar o limite de solicitações distintas.
    finished = false;
    for (let page = 1; page <= maxPages; page += 1) {
      const items = await readPage(page, internalTaskId, activityFilter.flow);
      if (items.length === 0) {
        finished = true;
        break;
      }
      for (const task of items) activity.set(taskKey(task, page), task);
    }
    if (!finished) {
      throw new Error(`A consulta ultrapassou ${maxPages} páginas; o resultado não é confiável.`);
    }
  }

  for (const [key, task] of overdue) {
    if (isTargetActivity(task, internalTaskId)) activity.set(key, task);
  }

  const activityRequests = new Set();
  for (const task of activity.values()) {
    if (!task.cfe) throw new Error('A atividade não contém o número da solicitação.');
    activityRequests.add(String(task.cfe));
  }

  const blocking = new Map();
  for (const [key, task] of overdue) {
    const name = normalizeText(task.t);
    if (TASK_TERMS.some(term => name.includes(term))) {
      blocking.set(key, displayTask(task, key));
    }
  }
  if (activityRequests.size >= MIN_ACTIVITY_REQUESTS) {
    for (const [key, task] of activity) blocking.set(key, displayTask(task, key));
  }
  return [...blocking.values()];
}
