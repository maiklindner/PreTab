let currentMessages = {};

function getMessage(key) {
  return currentMessages[key] ? currentMessages[key].message : key;
}

function initLocalization(callback) {
  chrome.storage.local.get({ language: 'auto' }, (data) => {
    let lang = data.language;
    if (lang === 'auto') {
      lang = chrome.i18n.getUILanguage().replace('-', '_');
      const supported = ['en', 'de', 'es', 'fr', 'ja', 'pt_BR', 'zh_CN'];
      if (!supported.includes(lang)) {
        lang = lang.split('_')[0];
        if (!supported.includes(lang)) lang = 'en';
      }
    }
    
    fetch(`/_locales/${lang}/messages.json`)
      .then(res => res.ok ? res.json() : fetch(`/_locales/en/messages.json`).then(r => r.json()))
      .then(messages => {
        currentMessages = messages;
        document.getElementById('langSelect').value = data.language;
        localizeHtmlPage();
        if (callback) callback();
      })
      .catch(err => {
        console.error("Failed to load locales", err);
        if (callback) callback();
      });
  });
}

function localizeHtmlPage() {
  document.getElementById('pageTitle').textContent = getMessage('optionsTitle');
  document.getElementById('titleH1').textContent = getMessage('extName');
  document.getElementById('descText').textContent = getMessage('optionsDesc');
  
  document.getElementById('mruTitle').textContent = getMessage('optMruTitle');
  document.getElementById('mruDesc').textContent = getMessage('optMruDesc');
  
  document.getElementById('queueTitle').textContent = getMessage('optQueueTitle');
  document.getElementById('queueDesc').textContent = getMessage('optQueueDesc');
}

document.addEventListener('DOMContentLoaded', () => {
    initLocalization();

    const mruToggle = document.getElementById('mruToggle');
    const queueToggle = document.getElementById('queueToggle');

    // Load initial settings
    chrome.storage.local.get({ mruEnabled: true, queueEnabled: true }, (data) => {
        mruToggle.checked = data.mruEnabled;
        queueToggle.checked = data.queueEnabled;
    });

    // Save bindings
    mruToggle.addEventListener('change', (e) => {
        chrome.storage.local.set({ mruEnabled: e.target.checked });
    });

    queueToggle.addEventListener('change', (e) => {
        chrome.storage.local.set({ queueEnabled: e.target.checked });
    });

    document.getElementById('langSelect').addEventListener('change', (e) => {
        chrome.storage.local.set({ language: e.target.value }, () => {
            initLocalization();
        });
    });
});
