// PodMuse 剪藏 — 点击图标/右键菜单，把当前页面或链接发送到本机 PodMuse
const ENDPOINT = 'http://127.0.0.1:41987/clip'

async function sendUrl(url, tabId) {
  if (!url || !/^https?:\/\//i.test(url)) return
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (res.ok && tabId != null) {
      chrome.action.setBadgeText({ text: '✓', tabId })
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId })
    } else if (tabId != null) {
      chrome.action.setBadgeText({ text: '!', tabId })
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId })
    }
  } catch {
    if (tabId != null) {
      chrome.action.setBadgeText({ text: '!', tabId })
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId })
    }
  }
  if (tabId != null) {
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '', tabId })
    }, 2500)
  }
}

chrome.action.onClicked.addListener(tab => {
  sendUrl(tab.url, tab.id)
})

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'send-page-to-podmuse',
    title: '发送到 PodMuse',
    contexts: ['page', 'link'],
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.linkUrl || (tab ? tab.url : '')
  sendUrl(url, tab ? tab.id : null)
})
