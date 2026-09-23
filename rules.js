// Regras funcionais independentes do componente anterior.
export const TASK_TERMS = [
  'corrigir',
  'correcao',
  'ajuste',
  'ajustar',
  'validar comprovante',
  'validacao de comprovante'
];

export function normalizeText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function matchesBlockingTask(task) {
  const name = normalizeText(task?.t);
  return TASK_TERMS.some(term => name.includes(term));
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

export function buildAssignmentsUrl(origin, page) {
  if (!Number.isInteger(page) || page < 1) throw new Error('Página inválida');
  const url = new URL('/api/internal/bpms/1.0/assignments', origin);
  const params = url.searchParams;
  params.set('pagenumber', String(page));
  params.set('simulation', 'N');
  params.set('codreport', '');
  params.set('filterCombo', '');
  params.set('reporttype', '');
  params.set('codflowexecute', '');
  params.set('codflowsorservices', '');
  params.set('codtask', '');
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
  const found = [];
  const seen = new Set();

  for (let page = 1; page <= maxPages; page += 1) {
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
      response = await fetchImpl(buildAssignmentsUrl(origin, page), {
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
    if (items.length === 0) return found;

    for (const task of items) {
      if (!matchesBlockingTask(task)) continue;
      const id = String(task.cfetp || task.cfe || `${page}:${found.length}`);
      if (seen.has(id)) continue;
      seen.add(id);
      found.push({
        id,
        number: String(task.cfe ?? ''),
        name: String(task.t ?? ''),
        due: String(task.el ?? ''),
        link: String(task.lk ?? '')
      });
    }
  }

  throw new Error(`A consulta ultrapassou ${maxPages} páginas; o resultado não é confiável.`);
}
