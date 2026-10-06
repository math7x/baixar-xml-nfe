(() => {
  const params = new URLSearchParams(location.search);
  const urlKey = params.get('chave') || params.get('chNFe') || '';
  const enabledByUrl = params.get('nfeAuto') === '1';
  if (enabledByUrl) sessionStorage.setItem('nfeAutomationEnabled', '1');
  const automationEnabled = enabledByUrl || sessionStorage.getItem('nfeAutomationEnabled') === '1';
  if (!automationEnabled) return;

  chrome.storage.local.get(['currentKey']).then(({ currentKey }) => {
    const key = /^\d{44}$/.test(urlKey) ? urlKey : currentKey;
    if (!key || !/^\d{44}$/.test(key)) return;
    sessionStorage.setItem('nfeAutomationKey', key);

    let attempts = 0;
    let keyWasFilled = false;
    const timer = setInterval(() => {
      attempts += 1;

      if (sessionStorage.getItem('nfeAutomationStep') === 'awaiting-download') {
        const downloadControl = findDownloadControl();
        if (downloadControl) {
          sessionStorage.setItem('nfeAutomationStep', 'download-clicked');
          sessionStorage.removeItem('nfeAutomationEnabled');
          sessionStorage.removeItem('nfeAutomationKey');
          chrome.runtime.sendMessage({ type: 'nfe:watch-download' }).then(() => {
            downloadControl.click();
            show('Cliquei em “Download do documento”. Confirme o OK; fecharei esta aba quando o arquivo terminar de baixar.');
          }).catch(() => {
            downloadControl.click();
            show('Cliquei em “Download do documento”. Confirme o OK; o acompanhamento do download não ficou disponível.');
          });
          clearInterval(timer);
        } else if (attempts >= 120) {
          show('A consulta foi enviada, mas não encontrei “Download do documento”. Verifique o resultado no portal.');
          clearInterval(timer);
        }
        return;
      }

      const field = findAccessKeyField();
      if (field && !keyWasFilled) {
        fillField(field, key);
        keyWasFilled = true;
        show(`Chave ${key.slice(0, 4)}…${key.slice(-4)} preenchida. Resolva o hCaptcha; depois clicarei em Continuar.`);
      }

      if (field && hcaptchaIsComplete()) {
        const continueButton = document.getElementById('ctl00_ContentPlaceHolder1_btnConsultarHCaptcha')
          || [...document.querySelectorAll('button,input[type="submit"],input[type="button"]')]
            .find(el => /continuar/i.test(`${el.innerText} ${el.value} ${el.title} ${el.getAttribute('aria-label') || ''}`));
        if (continueButton && !continueButton.disabled && sessionStorage.getItem('nfeAutomationStep') !== 'submitted') {
          sessionStorage.setItem('nfeAutomationStep', 'awaiting-download');
          continueButton.click();
          show('hCaptcha validado. Consulta enviada; aguardando o botão de download…');
        }
      }

      if (attempts >= 120 && !keyWasFilled) {
        show('Não localizei o campo da chave. Confira se o formulário terminou de carregar.');
        clearInterval(timer);
      }
    }, 500);

    function findAccessKeyField() {
      const exact = document.getElementById('ctl00_ContentPlaceHolder1_txtChaveAcessoResumo');
      if (exact && exact.getClientRects().length && !exact.disabled && !exact.readOnly) return exact;
      const fields = [...document.querySelectorAll('input:not([type="hidden"]),textarea')]
        .filter(el => el.getClientRects().length && !el.disabled && !el.readOnly);
      const labelNode = [...document.querySelectorAll('label,span,div,p,strong')]
        .find(el => el.children.length < 3 && /chave\s+de\s+acesso\s+da\s+nf/i.test(el.textContent || ''));
      if (labelNode) {
        const associated = labelNode.htmlFor && document.getElementById(labelNode.htmlFor);
        if (associated && fields.includes(associated)) return associated;
        const scope = labelNode.closest('td,fieldset,form,section,div') || labelNode.parentElement;
        const nearby = scope && [...scope.querySelectorAll('input:not([type="hidden"]),textarea')].find(el => fields.includes(el));
        if (nearby) return nearby;
      }
      return fields.find(el => /txtChaveAcesso/i.test(el.id || el.name)) || fields.find(el => el.maxLength === 44);
    }

    function hcaptchaIsComplete() {
      const response = [...document.querySelectorAll('textarea[name="h-captcha-response"],textarea[name="g-recaptcha-response"],input[name="h-captcha-response"],input[name="g-recaptcha-response"]')]
        .some(el => el.value.trim().length > 0);
      return response;
    }

    function findDownloadControl() {
      const controls = [...document.querySelectorAll('a,button,input[type="submit"],input[type="button"],input[type="image"]')]
        .filter(el => el.getClientRects().length && !el.disabled);
      const control = controls.find(el => /download\s+do\s+documento/i.test(`${el.innerText || ''} ${el.value || ''} ${el.title || ''} ${el.alt || ''} ${el.getAttribute('aria-label') || ''}`));
      if (control) return control;
      const image = [...document.querySelectorAll('img[alt],img[title]')]
        .find(el => /download\s+do\s+documento/i.test(`${el.alt} ${el.title}`));
      return image?.closest('a,button') || null;
    }

    function fillField(field, value) {
      field.focus();
      const proto = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(field, value); else field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
    }

    function show(message) {
      document.getElementById('nfe-extension-notice')?.remove();
      const box = document.createElement('div');
      box.id = 'nfe-extension-notice';
      box.textContent = message;
      Object.assign(box.style, { position: 'fixed', zIndex: '2147483647', top: '12px', right: '12px', maxWidth: '380px', padding: '12px 15px', borderRadius: '10px', background: '#e8f7f1', color: '#075e46', border: '1px solid #8fd4ba', boxShadow: '0 4px 18px #0002', font: '14px/1.45 Arial,sans-serif' });
      (document.body || document.documentElement).append(box);
      setTimeout(() => box.remove(), 10000);
    }
  });
})();
