import { isRelevantPage, isRequestAction, loadBlockingTasks } from './rules.js?v=0.6.1';

const INSTANCE_KEY = '__raizBloqueioPendenciasV2';
const REQUEST_PAGE = window.location.pathname.toLowerCase().startsWith('/2.0/request');

if (isRelevantPage(window.location.pathname) && !window[INSTANCE_KEY]) {
  window[INSTANCE_KEY] = { version: '0.6.1' };
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
    if (state === 'clear') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (state !== 'checking' || pendingAction || !pendingCheck) return;
    pendingAction = button;
    void pendingCheck.then(result => {
      pendingAction = null;
      if (result !== 'clear' || !button.isConnected) return;
      button.click();
    });
  }

  function guardSubmit(event) {
    if (!REQUEST_PAGE || state === 'clear') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (state !== 'checking' || pendingAction || !pendingCheck) return;
    const form = event.target;
    const submitter = event.submitter;
    pendingAction = form;
    void pendingCheck.then(result => {
      pendingAction = null;
      if (result !== 'clear' || !form.isConnected) return;
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

    const header = document.createElement('div');
    header.className = 'raiz-pendencias-header';
    const brand = document.createElement('span');
    brand.className = 'raiz-pendencias-brand';
    brand.textContent = 'Raiz Educação';
    const title = document.createElement('h2');
    title.id = 'raiz-pendencias-title';
    const message = document.createElement('p');
    title.textContent = 'Tarefas pendentes em atraso';
    message.textContent = `Você possui ${tasks.length} tarefa(s) em atraso que precisam ser concluídas antes de iniciar outra solicitação.`;
    header.append(brand, title, message);

    const parts = [header];
    const list = document.createElement('ul');
    for (const task of tasks) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.textContent = `#${task.number || '?'} — ${task.name}`;
      link.href = safeTaskLink(task.link);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      item.append(link);
      if (task.due) {
        const due = document.createElement('span');
        due.className = 'raiz-pendencias-due';
        due.textContent = `Vencimento: ${task.due}`;
        item.append(due);
      }
      list.append(item);
    }
    parts.push(list);

    const actions = document.createElement('div');
    actions.className = 'raiz-pendencias-actions';
    const taskLink = document.createElement('a');
    taskLink.className = 'raiz-pendencias-secondary';
    taskLink.href = '/my/tasks';
    taskLink.textContent = 'Abrir minhas tarefas';
    actions.append(taskLink);
    const retry = document.createElement('button');
    retry.className = 'raiz-pendencias-primary';
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
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = 'Não foi possível verificar as tarefas';
    const message = document.createElement('span');
    message.textContent = 'Novas solicitações ficam retidas até a consulta funcionar.';
    copy.append(title, message);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Tentar novamente';
    retry.addEventListener('click', () => void verify());
    errorNotice.replaceChildren(copy, retry);
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
    #raiz-pendencias-dialog { width: min(680px, calc(100vw - 32px)); max-height: 84vh;
      box-sizing: border-box; overflow: auto; border: 0; border-top: 6px solid #e47b2b;
      border-radius: 16px; padding: 0; color: #173b3e; background: #fff;
      box-shadow: 0 24px 64px rgba(15,49,50,.28); font-family: inherit; }
    #raiz-pendencias-dialog::backdrop { background: rgba(12,39,40,.62); }
    #raiz-pendencias-dialog .raiz-pendencias-header { padding: 28px 32px 22px;
      border-bottom: 1px solid #e1ece8;
      background: linear-gradient(120deg,#fff7ef 0%,#fff 62%,#f1f8f5 100%); }
    #raiz-pendencias-dialog .raiz-pendencias-brand { display: inline-flex; align-items: center;
      gap: 9px; margin-bottom: 15px; color: #0e5d62; font-size: 12px;
      font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
    #raiz-pendencias-dialog .raiz-pendencias-brand::before { content: ''; display: inline-block;
      width: 24px; height: 8px; border-radius: 8px;
      background: linear-gradient(90deg,#e47b2b 0 38%,#829447 38% 67%,#0e6a70 67%); }
    #raiz-pendencias-dialog h2 { margin: 0 0 8px; color: #173b3e;
      font-size: clamp(21px,3vw,26px); font-weight: 700; line-height: 1.2; }
    #raiz-pendencias-dialog p { margin: 0; color: #475e5c; font-size: 15px; line-height: 1.5; }
    #raiz-pendencias-dialog ul { display: grid; gap: 10px; max-height: 38vh;
      overflow: auto; list-style: none; margin: 0; padding: 20px 32px; }
    #raiz-pendencias-dialog li { display: grid; gap: 5px; margin: 0; padding: 14px 16px;
      border: 1px solid #dce9e4; border-left: 4px solid #e47b2b;
      border-radius: 10px; background: #f8fbf9; }
    #raiz-pendencias-dialog li a { color: #0e5d62; font-weight: 600;
      text-decoration: none; overflow-wrap: anywhere; }
    #raiz-pendencias-dialog li a:hover { text-decoration: underline; }
    #raiz-pendencias-dialog .raiz-pendencias-due { color: #665943; font-size: 13px; }
    #raiz-pendencias-dialog .raiz-pendencias-actions { display: flex; gap: 10px;
      align-items: center; justify-content: flex-end; flex-wrap: wrap;
      padding: 18px 32px 24px; border-top: 1px solid #e1ece8; background: #f4f8f6; }
    #raiz-pendencias-dialog .raiz-pendencias-actions a,
    #raiz-pendencias-dialog .raiz-pendencias-actions button { box-sizing: border-box;
      display: inline-flex; align-items: center; justify-content: center;
      min-height: 42px; padding: 9px 16px; border-radius: 8px;
      font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
    #raiz-pendencias-dialog .raiz-pendencias-secondary { border: 1px solid #a9c6c2;
      color: #0e5d62; background: #fff; }
    #raiz-pendencias-dialog .raiz-pendencias-primary { border: 1px solid #0e5d62;
      color: #fff; background: #0e5d62; }
    #raiz-pendencias-dialog .raiz-pendencias-secondary:hover { background: #eaf3f0; }
    #raiz-pendencias-dialog .raiz-pendencias-primary:hover { background: #0b4c50; }
    #raiz-pendencias-dialog a:focus-visible,
    #raiz-pendencias-dialog button:focus-visible,
    #raiz-pendencias-error button:focus-visible { outline: 3px solid #e47b2b; outline-offset: 3px; }
    #raiz-pendencias-error[hidden] { display: none !important; }
    #raiz-pendencias-error { position: fixed; right: 16px; bottom: 16px;
      z-index: 2147483647; box-sizing: border-box;
      width: min(470px, calc(100vw - 32px)); display: flex;
      align-items: center; gap: 16px; padding: 16px 18px;
      border: 1px solid #f0d7c1; border-left: 5px solid #e47b2b;
      border-radius: 10px; background: #fffaf5; color: #173b3e;
      box-shadow: 0 12px 32px rgba(15,49,50,.18); line-height: 1.4;
      font-family: inherit; }
    #raiz-pendencias-error div { display: grid; gap: 4px; }
    #raiz-pendencias-error strong { font-size: 14px; }
    #raiz-pendencias-error span { color: #475e5c; font-size: 13px; }
    #raiz-pendencias-error button { flex: none; border: 0; border-radius: 8px;
      padding: 9px 12px; color: #fff; background: #0e5d62;
      font: inherit; font-weight: 600; cursor: pointer; }
    #raiz-pendencias-error button:hover { background: #0b4c50; }
    @media (max-width: 540px) {
      #raiz-pendencias-dialog .raiz-pendencias-header { padding: 22px 20px 18px; }
      #raiz-pendencias-dialog ul { padding: 16px 20px; }
      #raiz-pendencias-dialog .raiz-pendencias-actions { padding: 16px 20px 20px; }
      #raiz-pendencias-dialog .raiz-pendencias-actions a,
      #raiz-pendencias-dialog .raiz-pendencias-actions button { width: 100%; }
      #raiz-pendencias-error { align-items: stretch; flex-direction: column; }
    }
  `;
  document.head.append(style);
}
