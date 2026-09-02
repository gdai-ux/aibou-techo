// OpenAIの音声認識APIを使って、録音した音声をテキストに変換する。
// iPhone(Safari)はブラウザ標準の音声認識に対応していないため、
// 録音した音声をサーバー経由でOpenAIに送って文字起こしする方式を取っている。

const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';

function extensionFor(mimeType) {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  return 'm4a';
}

async function transcribeAudio(apiKey, buffer, mimeType) {
  const type = (mimeType || 'audio/webm').split(';')[0].trim();
  const blob = new Blob([buffer], { type });
  const form = new FormData();
  form.append('file', blob, `audio.${extensionFor(type)}`);
  form.append('model', 'whisper-1');
  form.append('language', 'ja');

  const resp = await fetch(OPENAI_TRANSCRIBE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`OpenAI transcription error (${resp.status}): ${data.error?.message || JSON.stringify(data)}`);
  }
  return data.text;
}

module.exports = { transcribeAudio };
