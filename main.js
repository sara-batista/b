import { isRelevantPage, isRequestAction, loadBlockingTasks } from './rules.js?v=0.2.0';

const INSTANCE_KEY = '__raizBloqueioPendenciasV2';
const REQUEST_PAGE = window.location.pathname.toLowerCase().startsWith('/2.0/request');

if (isRelevantPage(window.location.pathname) && !window[INSTANCE_KEY]) {
  window[INSTANCE_KEY] = { version: '0.2.0' };
  start();
}

function start() {
  let dialog;
  let content;
  let errorNotice;
  let state = 'checking';
  let tasks = [];
  let pendingCheck = null;
  let pendingAction = null;
  let replayingButton = null;
  let approvedUntil = 0;

  document.addEventListener('click', guardClick, true);
  document.addEventListener('submit', guardSubmit, true);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state === 'blocked') void verify();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }

  function initialize() {
    addStyles();
    dialog = document.createElement('dialog');
    dialog.id = 'raiz-pendencias-dialog';
    dialog.setAttribute('aria-labelledby', 'raiz-pendencias-title');
    dialog.addEventListener('cancel', event => {
      if (state !== 'clear') event.preventDefault();
    });
    content = document.createElement('div');
    dialog.append(content);
    document.body.append(dialog);
    errorNotice = document.createElement('div');
    errorNotice.id = 'raiz-pendencias-error';
    errorNotice.setAttribute('role', 'alert');
    errorNotice.hidden = true;
    document.body.append(errorNotice);
    void verify();
  }

  function guardClick(event) {
    const target = event.target;
    if (!(target instanceof Element) || !isRequestAction(target, window.location.pathname)) return;
    const button = target.closest('button');
    if (button === replayingButton) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (pendingAction) return;
    pendingAction = button;
    void verify().then(result => {
      pendingAction = null;
      if (result !== 'clear' || !button.isConnected) return;
      approvedUntil = Date.now() + 2000;
      replayingButton = button;
      try {
        button.click();
      } finally {
        replayingButton = null;
      }
    });
  }

  function guardSubmit(event) {
    if (!REQUEST_PAGE || Date.now() < approvedUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (pendingAction) return;
    const form = event.target;
    const submitter = event.submitter;
    pendingAction = form;
    void verify().then(result => {
      pendingAction = null;
      if (result !== 'clear' || !form.isConnected) return;
      approvedUntil = Date.now() + 2000;
      form.requestSubmit(submitter || undefined);
    });
  }

  function verify() {
    if (pendingCheck) return pendingCheck;
    state = 'checking';
    if (errorNotice) errorNotice.hidden = true;

    const tokenInput = document.querySelector('input[name="__RequestVerificationToken"]');
    pendingCheck = loadBlockingTasks({
      origin: window.location.origin,
      antiforgeryToken: tokenInput ? tokenInput.value : null
    })
      .then(result => {
        tasks = result;
        state = result.length ? 'blocked' : 'clear';
        renderDialog();
        return state;
      })
      .catch(error => {
        state = 'error';
        console.warn('Bloqueio de pendências: falha na verificação.', error);
        renderDialog();
        return state;
      })
      .finally(() => { pendingCheck = null; });
    return pendingCheck;
  }

  function renderDialog() {
    if (!dialog || !content) return;
    if (state !== 'blocked') {
      if (dialog.open) dialog.close();
      content.replaceChildren();
      if (state === 'error') showErrorNotice();
      return;
    }
    if (errorNotice) errorNotice.hidden = true;

    const title = document.createElement('h2');
    title.id = 'raiz-pendencias-title';
    const message = document.createElement('p');
    title.textContent = 'Tarefas pendentes em atraso';
    message.textContent = `Você possui ${tasks.length} tarefa(s) em atraso que precisam ser concluídas antes de iniciar outra solicitação.`;

    const parts = [title, message];
    const list = document.createElement('ul');
    for (const task of tasks) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.textContent = `#${task.number || '?'} — ${task.name}`;
      link.href = safeTaskLink(task.link);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      item.append(link);
      if (task.due) item.append(document.createTextNode(` · Vencimento: ${task.due}`));
      list.append(item);
    }
    parts.push(list);

    const actions = document.createElement('div');
    actions.className = 'raiz-pendencias-actions';
    const taskLink = document.createElement('a');
    taskLink.href = '/my/tasks';
    taskLink.textContent = 'Abrir minhas tarefas';
    actions.append(taskLink);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Verificar novamente';
    retry.addEventListener('click', () => void verify());
    actions.append(retry);
    parts.push(actions);
    content.replaceChildren(...parts);
    if (!dialog.open) dialog.showModal();
  }

  function showErrorNotice() {
    if (!errorNotice) return;
    const message = document.createElement('span');
    message.textContent = 'Não foi possível verificar as tarefas. Novas solicitações ficam retidas até a consulta funcionar.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Tentar novamente';
    retry.addEventListener('click', () => void verify());
    errorNotice.replaceChildren(message, retry);
    errorNotice.hidden = false;
  }

  function safeTaskLink(raw) {
    if (!raw) return '/my/tasks';
    try {
      const url = new URL(raw, window.location.origin);
      if (url.origin === window.location.origin && /^https?:$/.test(url.protocol)) {
        return url.href;
      }
    } catch { /* Link ausente ou inválido. */ }
    return '/my/tasks';
  }
}

function addStyles() {
  if (document.getElementById('raiz-pendencias-style')) return;
  const style = document.createElement('style');
  style.id = 'raiz-pendencias-style';
  style.textContent = `
    #raiz-pendencias-dialog { width: min(760px, calc(100vw - 32px)); max-height: 80vh;
      border: 0; border-radius: 12px; padding: 28px; color: #172337;
      background: #fff; box-shadow: 0 20px 60px rgba(0,0,0,.25); }
    #raiz-pendencias-dialog::backdrop { background: rgba(0,0,0,.55); }
    #raiz-pendencias-dialog h2 { margin: 0 0 12px; font-size: 22px; }
    #raiz-pendencias-dialog p { margin: 0 0 18px; line-height: 1.5; }
    #raiz-pendencias-dialog ul { max-height: 40vh; overflow: auto; padding-left: 22px; }
    #raiz-pendencias-dialog li { margin-bottom: 10px; }
    #raiz-pendencias-dialog a { color: #1456a0; }
    #raiz-pendencias-dialog .raiz-pendencias-actions { display: flex; gap: 16px;
      align-items: center; justify-content: flex-end; flex-wrap: wrap; margin-top: 20px; }
    #raiz-pendencias-dialog button { border: 0; border-radius: 8px; padding: 10px 16px;
      color: #fff; background: #1456a0; cursor: pointer; font: inherit; }
    #raiz-pendencias-dialog button:disabled { opacity: .55; cursor: wait; }
    #raiz-pendencias-error[hidden] { display: none !important; }
    #raiz-pendencias-error { position: fixed; right: 16px; bottom: 16px;
      z-index: 2147483647; width: min(460px, calc(100vw - 32px));
      display: flex; align-items: center; gap: 12px; padding: 14px 16px;
      border: 1px solid #d99332; border-radius: 8px; background: #fff8ed;
      color: #53330b; box-shadow: 0 8px 24px rgba(0,0,0,.18); line-height: 1.4; }
    #raiz-pendencias-error button { flex: none; border: 0; border-radius: 6px;
      padding: 8px 10px; color: white; background: #1456a0; cursor: pointer; }
  `;
  document.head.append(style);
}
