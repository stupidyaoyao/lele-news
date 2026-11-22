// One-off: make a sample clip with Google's Gemini voice, for comparing voices (samples/google-*.mp3).
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const KEY = process.env.GEMINI_API_KEY;
const T = '乐乐新闻大事件。中美俄三国领导人在亚太经合组织峰会期间，举行了历史性的三方峰会，发表了联合公报，并讨论了核风险及全球事务，但外界认为，象征意义大于实质突破。与此同时，马来西亚首相安华、新加坡总理黄循财，也分别同中国领导人展开双边会谈。金价方面，九九九黄金每克四百六十七令吉。';
const MODELS = ['gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-tts', 'gemini-3.1-flash-tts-preview'];
for (const voice of ['Kore', 'Charon']) {
  for (const m of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST', headers: { 'x-goog-api-key': KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: `用平稳、清楚的新闻主播语气，以普通话朗读：${T}` }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }),
    });
    const j = await r.json();
    const d = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (!d) { console.log(m, voice, r.status, JSON.stringify(j).slice(0, 300)); continue; }
    await writeFile('samples/g.pcm', Buffer.from(d.data, 'base64'));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', 'samples/g.pcm', '-b:a', '64k', `samples/google-${voice}.mp3`]);
    console.log('ok', m, voice, d.mimeType);
    break;
  }
}
