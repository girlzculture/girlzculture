// The test calls chrome.tabs.query from this extension's execution context.
// No page injection, interception, network mocking, or production access.
chrome.runtime.onInstalled.addListener(() => {});
