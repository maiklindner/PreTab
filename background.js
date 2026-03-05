// Liste für die Historie (Standard-Verhalten)
let tabHistory = [];

// Set für Tabs, die im Hintergrund geöffnet und noch nicht angesehen wurden
let unseenTabs = new Set();

// Flag: War der gerade aktive Tab einer aus der "Unseen"-Liste?
let lastActiveWasUnseen = false;

// Hilfsvariable: Welcher Tab wurde gerade eben erst "entdeckt"?
// Das verhindert das Überspringen, wenn Chrome schneller ist als unser Skript.
let justAckowledgedId = null;

// Event: Ein neuer Tab wird erstellt
chrome.tabs.onCreated.addListener((tab) => {
  if (!tab.active) {
    unseenTabs.add(tab.id);
  }
});

// Event: Ein Tab wird aktiviert (angeklickt)
chrome.tabs.onActivated.addListener((activeInfo) => {
  const tabId = activeInfo.tabId;

  if (unseenTabs.has(tabId)) {
    // Wir haben einen neuen Tab betreten
    unseenTabs.delete(tabId);
    lastActiveWasUnseen = true;
    // WICHTIG: Wir merken uns diese ID kurzzeitig
    justAckowledgedId = tabId;
  } else {
    // Wir sind auf einem normalen Tab
    lastActiveWasUnseen = false;
    justAckowledgedId = null;
  }

  // Standard Historien-Logik
  tabHistory = tabHistory.filter(id => id !== tabId);
  tabHistory.push(tabId);
  if (tabHistory.length > 50) {
    tabHistory.shift();
  }
});

// Event: Ein Tab wird geschlossen
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (unseenTabs.has(tabId)) {
    unseenTabs.delete(tabId);
  }

  tabHistory = tabHistory.filter(id => id !== tabId);

  // Wenn wir im "Batch-Modus" waren (neue Tabs abarbeiten)
  if (lastActiveWasUnseen) {

    // Prüfen, wo wir gerade sind
    chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
      const currentTab = tabs[0];

      // FIX: Wenn der Browser automatisch schon zum nächsten "neuen" Tab gesprungen ist,
      // dann haben wir diesen gerade in onActivated registriert (justAckowledgedId).
      // In diesem Fall: NICHTS tun, wir sind schon genau da, wo wir hinwollten.
      if (currentTab && currentTab.id === justAckowledgedId) {
        return;
      }

      // Falls wir woanders gelandet sind (z.B. Chrome ist zum Eltern-Tab gesprungen),
      // dann erzwingen wir den Sprung zum nächsten neuen Tab.
      if (unseenTabs.size > 0) {
        chrome.tabs.query({ currentWindow: true }, (allTabs) => {
          const nextTab = allTabs.find(t => unseenTabs.has(t.id));
          if (nextTab) {
            chrome.tabs.update(nextTab.id, { active: true });
          } else {
            // Keine neuen Tabs mehr im Fenster -> Historie
            activateLastHistoryTab();
          }
        });
      } else {
        // Liste leer -> Historie
        activateLastHistoryTab();
      }
    });

  } else {
    // Standard-Verhalten
    activateLastHistoryTab();
  }
});

// Hilfsfunktion
function activateLastHistoryTab() {
  if (tabHistory.length > 0) {
    const lastActiveTabId = tabHistory[tabHistory.length - 1];
    chrome.tabs.update(lastActiveTabId, { active: true }).catch(() => {
      tabHistory.pop();
      activateLastHistoryTab();
    });
  }
}

// Event: Bereinigung bei Tab-Ersetzung
chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  tabHistory = tabHistory.filter(id => id !== removedTabId);
  tabHistory.push(addedTabId);
  if (unseenTabs.has(removedTabId)) {
    unseenTabs.delete(removedTabId);
    unseenTabs.add(addedTabId);
  }
});

function togglePreviousTab() {
  // Wir brauchen mindestens 2 Tabs in der History 
  if (tabHistory.length >= 2) {
    // Das letzte Element (index length - 1) ist der aktuelle Tab.
    // Das Element davor (index length - 2) ist der vorherige Tab.
    const prevTabId = tabHistory[tabHistory.length - 2];

    chrome.tabs.update(prevTabId, { active: true }).catch((error) => {
      // Bereinigen, falls der Tab nicht mehr da
      console.log("Tab does not exist anymore, removing from history.");
      tabHistory = tabHistory.filter(id => id !== prevTabId);

      // Wenn nötig, gehe einen weitere zurück
      if (tabHistory.length >= 2) {
        const fallbackTabId = tabHistory[tabHistory.length - 2];
        chrome.tabs.update(fallbackTabId, { active: true }).catch(() => { });
      }
    });
  } else {
    console.log("Not enough history to switch back.");
  }
}

// Event: Klick auf Extension Icon
chrome.action.onClicked.addListener((tab) => {
  togglePreviousTab();
});

// Event: Shortcut-Aufruf
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-tab") {
    togglePreviousTab();
  }
});
