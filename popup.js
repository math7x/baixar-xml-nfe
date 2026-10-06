const list = document.querySelector('#list');
const count = document.querySelector('#count');
const start = document.querySelector('#start');
const notice = document.querySelector('#notice');
let notes = [];

function normalizeNotes(items) {
  const byKey = new Map();
  for (const item of items || []) {
    const note = typeof item === 'string' ? { key: item } : item;
    if (!/^\d{44}$/.test(note?.key || '')) continue;
    const previous = byKey.get(note.key) || { key: note.key, issuer: '', amount: '' };
    byKey.set(note.key, { key: note.key, issuer: note.issuer || previous.issuer, amount: note.amount || previous.amount });
  }
  return [...byKey.values()];
}

function render() {
  notes = normalizeNotes(notes);
  count.textContent = `${notes.length} ${notes.length === 1 ? 'nota encontrada' : 'notas encontradas'}`;
  list.replaceChildren();
  if (!notes.length) list.innerHTML = '<div class="empty">As notas encontradas aparecerão aqui.</div>';
  for (const [index, note] of notes.entries()) {
    const row = document.createElement('label'); row.className = 'row';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = false; checkbox.value = note.key;
    const details = document.createElement('span'); details.className = 'note-details';
    const keyLine = document.createElement('strong'); keyLine.className = 'note-key'; keyLine.textContent = `${index + 1}. ${note.key}`;
    const issuerLine = document.createElement('span'); issuerLine.textContent = `Razão Social: ${note.issuer || 'não localizada'}`;
    const amountLine = document.createElement('span'); amountLine.textContent = `Valor NF-e: ${note.amount || 'não localizado'}`;
    details.append(keyLine, issuerLine, amountLine); row.append(checkbox, details); list.append(row);
  }
  start.disabled = notes.length === 0;
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

document.querySelector('#capture').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const pageUrl = new URL(tab?.url || '');
    if (!tab?.id || pageUrl.hostname !== 'www.nfe.fazenda.gov.br' || !pageUrl.pathname.includes('manifestacaoDestinatario')) {
      throw new Error('Abra a lista de notas no portal da NF-e e tente novamente.');
    }

    notice.textContent = 'Localizando as chaves na lista…';
    const [scan] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const table = document.getElementById('ctl00_ContentPlaceHolder1_gdvResultadoPesquisa');
        if (!table) return { keys: [], scrollY: window.scrollY };
        const keys = [...new Set((table.innerText || '').match(/\d{44}/g) || [])];
        return { keys, scrollY: window.scrollY };
      }
    });
    const keys = scan?.result?.keys || [];
    if (!keys.length) throw new Error('Não encontrei chaves de 44 dígitos na lista visível.');

    const target = { tabId: tab.id };
    let attached = false;
    const found = [];
    try {
      await chrome.debugger.attach(target, '1.3');
      attached = true;
      for (const [index, key] of keys.entries()) {
        notice.textContent = `Lendo dados da nota ${index + 1} de ${keys.length}…`;
        const [positionResult] = await chrome.scripting.executeScript({
          target: { tabId: tab.id }, args: [key],
          func: wantedKey => {
            const table = document.getElementById('ctl00_ContentPlaceHolder1_gdvResultadoPesquisa');
            if (!table) return null;
            const candidates = [...table.querySelectorAll('a,td,span,div')].filter(el => {
              if (!el.getClientRects().length) return false;
              const matches = [...(el.innerText || '').matchAll(/\d{44}/g)].map(match => match[0]);
              return matches.length === 1 && matches[0] === wantedKey;
            }).sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
            const node = candidates.find(el => el.matches('a,td,span')) || candidates[0];
            if (!node) return null;
            node.scrollIntoView({ block: 'center', inline: 'center' });
            const rect = node.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          }
        });
        const position = positionResult?.result;
        if (!position) { found.push({ key, issuer: '', amount: '' }); continue; }

        await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved', x: 2, y: 2, button: 'none'
        });
        await delay(180);
        const [previousTooltipResult] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const visibleTooltip = [...document.querySelectorAll('body *')].filter(el => {
              const text = el.innerText || '';
              const style = getComputedStyle(el);
              return el.getClientRects().length && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05
                && /Raz[aã]o Social do Emitente/i.test(text) && /Valor Total da NF-e/i.test(text);
            }).sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
            return visibleTooltip?.innerText || '';
          }
        });
        await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved', x: position.x, y: position.y, button: 'none'
        });
        await delay(800);

        const [detailsResult] = await chrome.scripting.executeScript({
          target: { tabId: tab.id }, args: [key, previousTooltipResult?.result || ''],
          func: (wantedKey, previousTooltipText) => {
            const table = document.getElementById('ctl00_ContentPlaceHolder1_gdvResultadoPesquisa');
            if (!table) return { key: wantedKey, issuer: '', amount: '' };
            const nodes = [...table.querySelectorAll('a,td,span,div')].filter(el => {
              const matches = [...(el.innerText || '').matchAll(/\d{44}/g)].map(match => match[0]);
              return matches.length === 1 && matches[0] === wantedKey;
            }).sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
            const node = nodes.find(el => el.matches('a,td,span')) || nodes[0];
            const row = node?.closest('tr') || node?.parentElement;
            const sources = [];
            for (const el of [node, ...(row ? [...row.querySelectorAll('*')] : [])]) {
              for (const attr of ['title', 'data-original-title', 'data-tooltip', 'data-content', 'aria-label']) {
                const value = el?.getAttribute?.(attr);
                if (value) sources.push(value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, ' '));
              }
              if (el?.dataset) sources.push(...Object.values(el.dataset));
            }
            const tooltip = [...document.querySelectorAll('body *')]
              .filter(el => {
                const style = getComputedStyle(el);
                const text = el.innerText || '';
                return el.getClientRects().length && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05
                  && /Raz[aã]o Social do Emitente/i.test(text) && /Valor Total da NF-e/i.test(text);
              })
              .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0];
            const tooltipText = tooltip?.innerText || '';
            if (tooltipText && tooltipText !== previousTooltipText) sources.push(tooltipText);
            const text = sources.join('\n');
            return {
              key: wantedKey,
              issuer: text.match(/Raz[aã]o Social do Emitente\s*:\s*([^\r\n]+)/i)?.[1]?.trim() || '',
              amount: text.match(/Valor Total da NF-e\s*:\s*(?:R\$\s*)?([^\r\n]+)/i)?.[1]?.trim() || ''
            };
          }
        });
        found.push(detailsResult?.result || { key, issuer: '', amount: '' });
      }
    } finally {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [scan.result.scrollY], func: y => window.scrollTo(0, y) }).catch(() => {});
      if (attached) await chrome.debugger.detach(target).catch(() => {});
    }

    notes = normalizeNotes(found);
    await chrome.storage.local.set({ foundKeys: notes });
    render();
    const complete = found.filter(note => note.issuer && note.amount).length;
    notice.textContent = `${complete} de ${found.length} nota(s) com razão social e valor encontrados.`;
  } catch (error) {
    notice.textContent = error.message || 'Não foi possível ler os tooltips desta página.';
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#selectAll').addEventListener('click', () => {
  const boxes = [...list.querySelectorAll('input[type=checkbox]')];
  const allChecked = boxes.length && boxes.every(box => box.checked);
  boxes.forEach(box => { box.checked = !allChecked; });
  document.querySelector('#selectAll').textContent = allChecked ? 'Selecionar todas' : 'Desmarcar todas';
});

start.addEventListener('click', async () => {
  const selected = [...list.querySelectorAll('input:checked')].map(box => box.value);
  if (!selected.length) { notice.textContent = 'Selecione ao menos uma nota.'; return; }
  await chrome.storage.local.set({ downloadQueue: selected, currentKey: selected[0] });
  for (const key of selected) {
    const url = new URL('https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx');
    url.searchParams.set('tipoConsulta', 'resumo'); url.searchParams.set('tipoConteudo', '7PhJ+gAVw2g='); url.searchParams.set('chave', key); url.searchParams.set('nfeAuto', '1');
    await chrome.tabs.create({ url: url.href, active: key === selected[0] });
  }
  notice.textContent = `${selected.length} consulta(s) aberta(s). Resolva o hCaptcha em cada nota.`;
});

chrome.storage.local.get('foundKeys').then(({ foundKeys = [] }) => { notes = normalizeNotes(foundKeys); render(); });
