// 相棒とのチャット（専属パーソナルトレーナー役）。
// 会話はこの端末のlocalStorageにだけ保存する（サーバーには毎回の応答生成にだけ使い、
// 会話ログとしては残さない）。人格（名前・口調・性格）と直近の記録はサーバー側で
// 組み立てるので、ここでは送受信と表示だけを持つ。

const CHAT_HISTORY_KEY = 'chatHistory';
const CHAT_HISTORY_MAX = 60; // この端末に保存しておく件数（表示用）
const CHAT_CONTEXT_MAX = 16; // サーバーに送る直近の件数（AI費用を抑えるため絞る）

function loadChatHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function saveChatHistory(messages) {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages.slice(-CHAT_HISTORY_MAX)));
  } catch (e) { /* 保存できなくても会話自体は続けられる */ }
}

let chatMessages = loadChatHistory();

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderMessages() {
  const scroll = document.getElementById('chatScroll');
  const intro = document.getElementById('chatIntro');
  intro.classList.toggle('hidden', chatMessages.length > 0);
  scroll.innerHTML = chatMessages.map((m) =>
    `<div class="chat-msg ${m.role === 'user' ? 'user' : m.role === 'error' ? 'error' : 'assistant'}">` +
    `<div class="chat-bubble">${escapeHtml(m.content)}</div></div>`
  ).join('');
  scroll.scrollTop = scroll.scrollHeight;
}

function showTyping() {
  const scroll = document.getElementById('chatScroll');
  const el = document.createElement('div');
  el.className = 'chat-msg assistant chat-typing';
  el.id = 'chatTyping';
  el.innerHTML = '<div class="chat-bubble"><span></span><span></span><span></span></div>';
  scroll.appendChild(el);
  scroll.scrollTop = scroll.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById('chatTyping');
  if (el) el.remove();
}

function autoGrowInput() {
  const el = document.getElementById('chatInput');
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const btn = document.getElementById('chatSendBtn');
  const message = input.value.trim();
  if (!message || btn.disabled) return;

  chatMessages.push({ role: 'user', content: message });
  renderMessages();
  saveChatHistory(chatMessages);
  input.value = '';
  autoGrowInput();
  btn.disabled = true;
  showTyping();

  try {
    const profile = window.mascotProfile ? mascotProfile() : { tone: 'normal', speech: 'normal', bio: '' };
    const name = window.mascotName ? mascotName() : '';
    // 直近の会話だけをサーバーに送る（今回の発言は別で渡すので、それより前のぶん）
    const history = chatMessages
      .slice(0, -1)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-CHAT_CONTEXT_MAX)
      .map((m) => ({ role: m.role, content: m.content }));

    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...notionHeaders() },
      body: JSON.stringify({ message, tone: profile.tone, speech: profile.speech, name, bio: profile.bio, history }),
    });
    const data = await resp.json();
    hideTyping();
    if (!resp.ok) throw new Error(data.error || '返信を受け取れませんでした');
    chatMessages.push({ role: 'assistant', content: data.reply });
  } catch (e) {
    hideTyping();
    chatMessages.push({ role: 'error', content: e.message });
  } finally {
    renderMessages();
    saveChatHistory(chatMessages);
    btn.disabled = false;
    input.focus();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('chatIntroName').textContent = window.mascotName ? mascotName() : 'あいぼう';
  renderMessages();

  const input = document.getElementById('chatInput');
  const btn = document.getElementById('chatSendBtn');
  btn.addEventListener('click', sendChatMessage);
  input.addEventListener('input', autoGrowInput);
  input.addEventListener('keydown', (e) => {
    // Enterで送信、Shift+Enterで改行（PCでの利用を想定。スマホは基本タップ送信）
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
});
