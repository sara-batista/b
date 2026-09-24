// Critérios de bloqueio e filtros do relatório em um só lugar.
const BLOCKING_CONFIG = {
  taskStatus: 'S',
  taskLate: 'Late',
  nameTerms: [
    'corrigir',
    'correcao',
    'ajuste',
    'ajustar',
    'validar comprovante',
    'validacao de comprovante'
  ],
  activity: {
    aliases: ['[PROCESSO]avaliarAtendimento', '[DP]avaliarAtendimento'],
    minRequests: 3,
    taskLateByAlias: {
      '[PROCESSO]avaliarAtendimento': 'Late',
      '[DP]avaliarAtendimento': ''
    },
    // O filtro codtask usa o ID numérico interno, diferente do código original.
    // [PROCESSO] tem filtros conferidos em HML e PRD. O ID de [DP] foi
    // conferido no relatório de configurações do aplicativo PRD.
    filters: {
      '[PROCESSO]avaliarAtendimento': {
        'hmlraizeducacao.zeev.it': {
          taskId: '19991',
          flow: '393;ef12f561-bd2a-49a8-be91-28542b6263aa;0;0'
        },
        'raizeducacao.zeev.it': {
          taskId: '16070',
          flow: '268;314489d5-5790-40b1-b366-56863e76e425;0;0'
        }
      },
      '[DP]avaliarAtendimento': {
        'raizeducacao.zeev.it': {
          taskId: '18227',
          flow: '125;8b786926-94a3-4e6f-8bb6-be0215dfea84;0;0'
        }
      }
    }
  }
};

export const TASK_TERMS = BLOCKING_CONFIG.nameTerms;
export const BLOCKING_ACTIVITY_ALIASES = BLOCKING_CONFIG.activity.aliases;
export const BLOCKING_ACTIVITY_ALIAS = BLOCKING_ACTIVITY_ALIASES[0];
export const MIN_ACTIVITY_REQUESTS = BLOCKING_CONFIG.activity.minRequests;

export function normalizeText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function activityAlias(task, internalTaskIds = new Map()) {
  const activityCodes = [
    task?.instance?.instanceTask?.task?.element?.alias,
    task?.alias,
    task?.taskAlias,
    task?.activityCode,
    task?.codtask
  ];
  const alias = BLOCKING_ACTIVITY_ALIASES.find(value =>
    activityCodes.some(code => String(code ?? '') === value)
  );
  if (alias) return alias;
  for (const code of activityCodes) {
    const matchedAlias = internalTaskIds.get(String(code ?? ''));
    if (matchedAlias) return matchedAlias;
  }
  return '';
}

export function matchesBlockingTask(task, internalTaskId = '') {
  const name = normalizeText(task?.t);
  const internalTaskIds = internalTaskId
    ? new Map([[internalTaskId, BLOCKING_ACTIVITY_ALIAS]])
    : new Map();
  return TASK_TERMS.some(term => name.includes(term)) || Boolean(activityAlias(task, internalTaskIds));
}

function displayTask(task, id, reason) {
  return {
    id,
    number: String(task.cfe ?? ''),
    name: String(task.t ?? ''),
    due: String(task.el ?? ''),
    link: String(task.lk ?? ''),
    reasons: [reason]
  };
}

function selectBlockingTasks(overdue, activity) {
  const blocking = new Map();
  function addTask(key, task, reason) {
    const existing = blocking.get(key);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    } else {
      blocking.set(key, displayTask(task, key, reason));
    }
  }
  for (const [key, task] of overdue) {
    const name = normalizeText(task.t);
    if (TASK_TERMS.some(term => name.includes(term))) {
      addTask(key, task, 'overdue');
    }
  }
  for (const [alias, tasks] of activity) {
    const requestNumbers = new Set();
    for (const task of tasks.values()) {
      if (!task.cfe) throw new Error('A atividade não contém o número da solicitação.');
      requestNumbers.add(String(task.cfe));
    }
    if (requestNumbers.size >= MIN_ACTIVITY_REQUESTS) {
      const reason = BLOCKING_CONFIG.activity.taskLateByAlias[alias] === '' ? 'dp-evaluation' : 'overdue';
      for (const [key, task] of tasks) addTask(key, task, reason);
    }
  }
  return [...blocking.values()];
}

export function summarizeBlockingTasks(tasks) {
  return {
    overdueCount: tasks.filter(task => task.reasons.includes('overdue')).length,
    dpRequestCount: new Set(tasks
      .filter(task => task.reasons.includes('dp-evaluation'))
      .map(task => task.number)).size
  };
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

export function buildAssignmentsUrl(origin, page, codtask = '', flow = '', taskLate = BLOCKING_CONFIG.taskLate) {
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
  params.set('taskstatus', BLOCKING_CONFIG.taskStatus);
  params.set('field', '');
  params.set('operator', 'Equal');
  params.set('fieldvaluetext', '');
  params.set('fielddatasource', '');
  params.set('fieldvalue', '');
  params.set('requester', '');
  params.set('codrequester', '');
  params.set('tasklate', taskLate);
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
  const activity = new Map(BLOCKING_ACTIVITY_ALIASES.map(alias => [alias, new Map()]));
  const hostname = new URL(origin).hostname;
  const activityFilters = BLOCKING_ACTIVITY_ALIASES.flatMap(alias => {
    const filter = BLOCKING_CONFIG.activity.filters[alias]?.[hostname];
    return filter ? [{ alias, ...filter }] : [];
  });
  const internalTaskIds = new Map(activityFilters.map(({ alias, taskId }) => [taskId, alias]));

  async function readPage(page, codtask = '', flow = '', taskLate = BLOCKING_CONFIG.taskLate) {
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
      response = await fetchImpl(buildAssignmentsUrl(origin, page, codtask, flow, taskLate), {
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
  for (const { alias, taskId, flow } of activityFilters) {
    const taskLate = BLOCKING_CONFIG.activity.taskLateByAlias[alias];
    if (taskLate && !overdue.size) continue;
    // O relatório compacto pode omitir o alias. O filtro específico identifica
    // essas atividades antes de aplicar o limite de solicitações distintas.
    finished = false;
    for (let page = 1; page <= maxPages; page += 1) {
      const items = await readPage(page, taskId, flow, taskLate);
      if (items.length === 0) {
        finished = true;
        break;
      }
      for (const task of items) activity.get(alias).set(taskKey(task, page), task);
    }
    if (!finished) {
      throw new Error(`A consulta ultrapassou ${maxPages} páginas; o resultado não é confiável.`);
    }
  }

  for (const [key, task] of overdue) {
    const alias = activityAlias(task, internalTaskIds);
    if (alias && BLOCKING_CONFIG.activity.taskLateByAlias[alias]) activity.get(alias).set(key, task);
  }

  return selectBlockingTasks(overdue, activity);
}
