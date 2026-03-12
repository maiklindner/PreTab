// Settings
let settings = {
  mruEnabled: true,
  queueEnabled: true
};

chrome.storage.local.get({ mruEnabled: true, queueEnabled: true }, (result) => {
  settings.mruEnabled = result.mruEnabled;
  settings.queueEnabled = result.queueEnabled;
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.mruEnabled) settings.mruEnabled = changes.mruEnabled.newValue;
    if (changes.queueEnabled) settings.queueEnabled = changes.queueEnabled.newValue;
  }
});

// History list (default behavior)
let tabHistory = [];

// Set for tabs opened in background and not yet seen
let unseenTabs = new Set();

// Flag: Was the currently active tab from the "unseen" list?
let lastActiveWasUnseen = false;

// Helper variable: Which tab was just "discovered"?
// Prevents skipping if Chrome is faster than our script.
let justAckowledgedId = null;

// Initialize state from storage
chrome.storage.local.get({ 
  tabHistory: [], 
  unseenTabs: [], 
  lastActiveWasUnseen: false 
}, (result) => {
  tabHistory = result.tabHistory;
  unseenTabs = new Set(result.unseenTabs);
  lastActiveWasUnseen = result.lastActiveWasUnseen;
});

function saveState() {
  chrome.storage.local.set({
    tabHistory: tabHistory,
    unseenTabs: Array.from(unseenTabs),
    lastActiveWasUnseen: lastActiveWasUnseen
  });
}

// Event: A new tab is created
chrome.tabs.onCreated.addListener((tab) => {
  if (!tab.active) {
    unseenTabs.add(tab.id);
    saveState();
  }
});

// Event: A tab is activated (clicked)
chrome.tabs.onActivated.addListener((activeInfo) => {
  const tabId = activeInfo.tabId;

  if (unseenTabs.has(tabId)) {
    // Entered a new tab
    unseenTabs.delete(tabId);
    lastActiveWasUnseen = true;
    // IMPORTANT: Remember this ID temporarily
    justAckowledgedId = tabId;
  } else {
    // We are on a normal tab
    lastActiveWasUnseen = false;
    justAckowledgedId = null;
  }

  // Standard history logic
  tabHistory = tabHistory.filter(id => id !== tabId);
  tabHistory.push(tabId);
  if (tabHistory.length > 50) {
    tabHistory.shift();
  }
  saveState();
});

// Event: Window focus changes (handling cross-window switching)
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    chrome.tabs.query({ windowId: windowId, active: true }, (tabs) => {
      if (tabs.length > 0) {
        const tabId = tabs[0].id;
        
        // Update history so the active tab of the focused window becomes the MRU
        tabHistory = tabHistory.filter(id => id !== tabId);
        tabHistory.push(tabId);
        if (tabHistory.length > 50) {
          tabHistory.shift();
        }
        saveState();
      }
    });
  }
});

// Event: A tab is closed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (unseenTabs.has(tabId)) {
    unseenTabs.delete(tabId);
  }

  tabHistory = tabHistory.filter(id => id !== tabId);
  saveState();

  // If MRU is disabled, let browser do default
  if (!settings.mruEnabled) return;

  // If we were in "batch mode" (processing new tabs) and queue is enabled
  if (settings.queueEnabled && lastActiveWasUnseen) {

    // Check where we are right now
    chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
      const currentTab = tabs[0];

      // FIX: If the browser automatically jumped to the next "new" tab,
      // it was just registered in onActivated (justAckowledgedId).
      // In this case: do nothing, we are exactly where we wanted to be.
      if (currentTab && currentTab.id === justAckowledgedId) {
        return;
      }

      // If we landed somewhere else (e.g. Chrome jumped to parent tab),
      // force jump to the next new tab.
      if (unseenTabs.size > 0) {
        chrome.tabs.query({ currentWindow: true }, (allTabs) => {
          const nextTab = allTabs.find(t => unseenTabs.has(t.id));
          if (nextTab) {
            chrome.tabs.update(nextTab.id, { active: true });
          } else {
            // No more new tabs in window -> History
            activateLastHistoryTab();
          }
        });
      } else {
        // List empty -> History
        activateLastHistoryTab();
      }
    });

  } else {
    // Default behavior
    activateLastHistoryTab();
  }
});

// Helper function
function activateLastHistoryTab() {
  if (tabHistory.length > 0) {
    const lastActiveTabId = tabHistory[tabHistory.length - 1];
    chrome.tabs.update(lastActiveTabId, { active: true }).then((tab) => {
      if (tab && tab.windowId) {
        chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
      }
    }).catch(() => {
      tabHistory.pop();
      saveState();
      activateLastHistoryTab();
    });
  }
}

// Event: Cleanup on tab replacement
chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  tabHistory = tabHistory.filter(id => id !== removedTabId);
  tabHistory.push(addedTabId);
  if (unseenTabs.has(removedTabId)) {
    unseenTabs.delete(removedTabId);
    unseenTabs.add(addedTabId);
  }
  saveState();
});

function togglePreviousTab() {
  // We need at least 2 tabs in the history 
  if (tabHistory.length >= 2) {
    // The last element (index length - 1) is the current tab.
    // The previous element (index length - 2) is the previous tab.
    const prevTabId = tabHistory[tabHistory.length - 2];

    chrome.tabs.update(prevTabId, { active: true }).then((tab) => {
      if (tab && tab.windowId) {
        chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
      }
    }).catch((error) => {
      // Cleanup if tab is gone
      console.log("Tab does not exist anymore, removing from history.");
      tabHistory = tabHistory.filter(id => id !== prevTabId);
      saveState();

      // If necessary, go one more back
      if (tabHistory.length >= 2) {
        const fallbackTabId = tabHistory[tabHistory.length - 2];
        chrome.tabs.update(fallbackTabId, { active: true }).then((tab) => {
          if (tab && tab.windowId) {
            chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
          }
        }).catch(() => { });
      }
    });
  } else {
    console.log("Not enough history to switch back.");
  }
}

// Event: Extension icon click
chrome.action.onClicked.addListener((tab) => {
  togglePreviousTab();
});

// Event: Shortcut triggered
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-tab") {
    togglePreviousTab();
  }
});
