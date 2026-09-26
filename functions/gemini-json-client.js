const { HttpsError } = require('firebase-functions/v2/https');

const MODEL_PATTERN = /^[a-zA-Z0-9.-]+$/;
const DEFAULT_TIMEOUT_MS = 40000;

async function generateGeminiJson({
  system,
  data,
  apiKey,
  primaryModel,
  secondaryModel,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const candidates = [...new Set([primaryModel, secondaryModel])];
  if (candidates.some(value => !MODEL_PATTERN.test(value))) {
    throw new HttpsError('failed-precondition', 'AIモデル設定を確認してください');
  }

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(data) }] }],
    generationConfig: {
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingLevel: 'minimal' },
    },
  });
  const transientStatus = status => status === 408 || status === 429 || status >= 500;

  for (let index = 0; index < candidates.length; index += 1) {
    const selectedModel = candidates[index];
    let response;
    try {
      response = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          signal: AbortSignal.timeout(timeoutMs),
          body,
        }
      );
    } catch (error) {
      console.error('Gemini API connection failed', {
        model: selectedModel,
        fallback: index > 0,
        message: error?.message,
      });
      if (index + 1 < candidates.length) continue;
      throw new HttpsError('unavailable', 'AIに接続できませんでした。入力は残っています');
    }

    if (!response.ok) {
      let details = '';
      try {
        if (typeof response.text === 'function') details = (await response.text()).slice(0, 1000);
      } catch {}
      console.error('Gemini API request failed', {
        status: response.status,
        model: selectedModel,
        fallback: index > 0,
        details,
      });

      if (transientStatus(response.status) && index + 1 < candidates.length) continue;
      if (response.status === 400) throw new HttpsError('failed-precondition', 'AIモデルへの送信設定が対応していません');
      if (response.status === 401 || response.status === 403) throw new HttpsError('permission-denied', 'Gemini APIキーまたは利用権限を確認してください');
      if (response.status === 404) throw new HttpsError('failed-precondition', '指定したAIモデルを利用できません');
      if (response.status === 429) throw new HttpsError('resource-exhausted', 'Gemini APIの利用上限に達しました');
      throw new HttpsError('unavailable', 'AIサービスが一時的に利用できません');
    }

    try {
      const result = await response.json();
      const candidate = result.candidates?.[0];
      if (candidate?.finishReason !== 'STOP') throw new Error('Incomplete');
      return JSON.parse(candidate.content.parts.filter(part => !part.thought).map(part => part.text || '').join(''));
    } catch {
      throw new HttpsError('data-loss', 'AIの結果を読み取れませんでした');
    }
  }

  throw new HttpsError('unavailable', 'AIサービスが一時的に利用できません');
}

module.exports = { generateGeminiJson };
