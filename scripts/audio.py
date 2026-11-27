"""乐乐新闻: make recordings (MP3) so listening keeps going with the screen off.

Voices:  Google Gemini voice first (best, small free daily amount)  →  free voice "7"
         (Kokoro, mix of zf_xiaobei + zf_xiaoxiao, car-tuned) for everything else.
What:    今日要闻 opening line, the gold line, each storyline of a 大事件, each important story.
Where:   site/audio/<hash>.mp3 + site/audio/index.json (published with the site, replaced each run,
         so old recordings never pile up in the code history).
"""
import base64, hashlib, json, os, re, subprocess, sys, time, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE_AUDIO = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '_site', 'audio')
MODELS = os.environ.get('VOICE_MODELS', os.path.join(ROOT, '.voice'))
KEY = os.environ.get('GEMINI_API_KEY')
BUDGET = float(os.environ.get('AUDIO_BUDGET_SEC', '420'))   # free-voice time per run
GOOGLE_MAX = int(os.environ.get('GOOGLE_TTS_MAX', '12'))     # safety cap per day; real limit found by trying
KEEP_H = 48
MYT = timezone(timedelta(hours=8))
os.makedirs(SITE_AUDIO, exist_ok=True)
t0 = time.time()

def load(p, d):
    try:
        with open(p, encoding='utf-8') as f: return json.load(f)
    except Exception: return d
news = load(os.path.join(ROOT, 'data', 'news.json'), {'items': []})
events = load(os.path.join(ROOT, 'data', 'events.json'), {'events': []})
gold = load(os.path.join(ROOT, 'data', 'gold.json'), {})
idx_path = os.path.join(SITE_AUDIO, 'index.json')
idx = load(idx_path, {'clips': {}, 'google': {}})
clips = idx.setdefault('clips', {})
g = idx.setdefault('google', {})
pacific_day = (datetime.now(timezone.utc) - timedelta(hours=8)).strftime('%Y-%m-%d')  # Google's day resets at midnight Pacific
if g.get('day') != pacific_day: g.update(day=pacific_day, used=0, out=False)

# ---------- text for speaking ----------
SAY = [(r'\bAI\b', '人工智能'), (r'\bUS\b', '美国'), (r'\bEU\b', '欧盟'), (r'\bFed\b', '美联储'), (r'\bGDP\b', '国内生产总值'),
       (r'\bCEO\b', '总裁'), (r'\bIPO\b', '首次公开招股'), (r'\bEV\b', '电动车'), (r'\bASEAN\b', '东盟'), (r'\bKLCI\b', '综合指数'), (r'\bRM\s?', '令吉')]
def clean(t):
    t = str(t or '')
    for a, b in SAY: t = re.sub(a, b, t)
    return re.sub(r'\s+', ' ', t).strip()
def end(t):
    t = clean(t)
    return t if not t or t[-1] in '。！？!?.' else t + '。'
def h(s): return hashlib.sha1(s.encode('utf-8')).hexdigest()[:12]

CATS = {'finance': '财经', 'world': '国际', 'sea': '东南亚', 'malaysia': '马来西亚', 'china': '中国', 'tech': '科技'}
def story_text(x):
    t = f"{x.get('source', '')}报道。{end(x.get('zh') or x.get('title'))}"
    if x.get('sum'): t += end(x['sum'])
    my = (x.get('impact') or {}).get('my')
    if my: t += '对马来西亚：' + end(my)
    return t
def line_text(ev, l):
    w = l['w']
    t = f"{ev['name']}，{l['t']}。{end(w.get('summary'))}"
    if w.get('common'): t += '多家媒体都报道：' + ''.join(end(c['t']) for c in w['common'][:3])
    if w.get('views'):
        t += '对这件事，看法不同。' + ''.join(f"{'和'.join((v.get('src') or [])[:2])}认为，{end(v['t'])}" for v in w['views'])
    imp = (w.get('impact') or {})
    if imp.get('my'): t += '对马来西亚：' + end(imp['my'])
    elif imp.get('world'): t += '对全球：' + end(imp['world'])
    return t

# ---------- what to record (most important first) ----------
now = datetime.now(timezone.utc)
def now_utc_ok(iso, hours=36):
    return now - datetime.fromisoformat(iso.replace('Z', '+00:00')) <= timedelta(hours=hours)
want = []  # (key, text, title, priority, google_ok)
WEEK = '一二三四五六日'
nm = datetime.now(MYT)
date_line = f"{nm.month}月{nm.day}日，星期{WEEK[nm.weekday()]}。"
want.append(('date', date_line, f'{nm.month}月{nm.day}日', 100, False))
# 今日重点: the date + the 3 biggest things right now (re-recorded at most every 3 hours)
tops = []
for ev in sorted([e for e in events.get('events', []) if not e.get('hidden') and any(l.get('w') and not l.get('loose') for l in e.get('lines', []))],
                 key=lambda e: -((e.get('heat') or {}).get('score', 1)))[:2]:
    if now_utc_ok(ev['last']): tops.append(ev.get('short') or ev['name'])
for x in sorted([x for x in news.get('items', []) if x.get('ai') and x.get('short') and now_utc_ok(x['published'], 18)],
                key=lambda x: ((x.get('score') or 3), x['published']), reverse=True):
    if len(tops) >= 3: break
    if x['short'] not in tops: tops.append(x['short'])
brief = date_line + ('今天的重点：' + '；'.join(clean(t) for t in tops) + '。' if tops else '')
old = clips.get('brief')
fresh = old and old.get('day') == nm.strftime('%Y-%m-%d') and (datetime.now(timezone.utc) - datetime.fromisoformat(old['at'])) < timedelta(hours=3)
if fresh: brief = old.get('text', brief)  # keep the same opening for up to 3 hours
want.append(('brief', brief, '今日重点', 101, not (old and old.get('day') == nm.strftime('%Y-%m-%d'))))  # Google voice for the first one each day
s = gold.get('spot') or {}
if s.get('g999'):
    gt = f"最后是金价。九九九黄金每克{round(s['g999'])}令吉"
    if s.get('changePct') is not None: gt += f"，比昨天{'上涨' if s['changePct'] >= 0 else '下跌'}百分之{abs(s['changePct'])}"
    want.append(('gold', gt + '。', '金价', 99, False))
want.append(('outro', '你选的新闻播完了，接下来播放未读新闻。', '乐乐新闻', 98, False))
for ev in events.get('events', []):
    if ev.get('hidden'): continue
    last = datetime.fromisoformat(ev['last'].replace('Z', '+00:00'))
    if now - last > timedelta(hours=36): continue
    lines = [l for l in ev.get('lines', []) if l.get('w') and not l.get('loose')]
    if ev.get('overview') and lines:
        want.append((f"ev:{ev['id']}", f"大事件：{ev['name']}。{end(ev['overview'])}", ev['name'], 90 + (ev.get('heat') or {}).get('score', 1), True))
    for l in lines:
        want.append((f"ln:{l['id']}", line_text(ev, l), l['t'], 80 + (ev.get('heat') or {}).get('score', 1), True))
for x in news.get('items', []):
    if not x.get('ai') or x.get('cat') == 'other': continue
    pub = datetime.fromisoformat(x['published'].replace('Z', '+00:00'))
    if now - pub > timedelta(hours=24): continue
    sc = x.get('score') or 3
    if sc < 3 or (sc == 3 and not x.get('sum')): continue
    want.append((x['id'], story_text(x), x.get('short') or x.get('zh') or x['title'], sc * 10 + (5 if x.get('sum') else 0), sc >= 5))
want.sort(key=lambda w: -w[3])

# ---------- voices ----------
def encode(src_args, out):
    # same format for every clip (24 kHz mono 48 kbps CBR) so clips can be joined into one file on iPhone
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *src_args,
                    '-af', 'acompressor=threshold=-20dB:ratio=3:attack=5:release=80,loudnorm=I=-15:TP=-1.5:LRA=7,apad=pad_dur=0.6',
                    '-ar', '24000', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '48k', '-write_xing', '0', '-id3v2_version', '0', '-map_metadata', '-1', out], check=True)
def duration(p):
    # every clip is 48 kbps constant bit rate, so the length follows from the file size (no ffprobe needed)
    return round(os.path.getsize(p) * 8 / 48000, 2)

def google(text, out):
    if not KEY or g.get('out') or g.get('used', 0) >= GOOGLE_MAX: return False
    for model in ['gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-tts']:
        body = json.dumps({'contents': [{'parts': [{'text': f'用平稳、清楚、专业的新闻主播语气，以普通话朗读：{text}'}]}],
                           'generationConfig': {'responseModalities': ['AUDIO'], 'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': 'Kore'}}}}}).encode()
        req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent', data=body,
                                     headers={'x-goog-api-key': KEY, 'content-type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=180) as r: j = json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                g['out'] = True
                print(f'  Google voice: daily free amount used up after {g.get("used", 0)} today'); return False
            print(f'  Google voice {model}: HTTP {e.code}'); continue
        except Exception as e:
            print(f'  Google voice {model}: {e}'); continue
        part = next((p for p in j.get('candidates', [{}])[0].get('content', {}).get('parts', []) if p.get('inlineData')), None)
        if not part: continue
        pcm = out + '.pcm'
        with open(pcm, 'wb') as f: f.write(base64.b64decode(part['inlineData']['data']))
        encode(['-f', 's16le', '-ar', '24000', '-ac', '1', '-i', pcm], out); os.remove(pcm)
        g['used'] = g.get('used', 0) + 1
        return True
    return False

_kokoro = None
def free_voice(text, out):
    global _kokoro
    if _kokoro is None:
        from kokoro_onnx import Kokoro
        from misaki import zh
        import cn2an
        k = Kokoro(os.path.join(MODELS, 'kokoro-v1.0.onnx'), os.path.join(MODELS, 'voices-v1.0.bin'))
        mix = 0.5 * k.get_voice_style('zf_xiaobei') + 0.5 * k.get_voice_style('zf_xiaoxiao')  # voice "7"
        _kokoro = (k, mix, zh.ZHG2P(), cn2an)
    k, mix, g2p, cn2an = _kokoro
    import soundfile as sf
    try: text = cn2an.transform(text, 'an2cn')  # 2020年 → 二零二零年, 3.5% → 百分之三点五
    except Exception: pass
    r = g2p(text); ph = r[0] if isinstance(r, tuple) else r
    samples, sr = k.create(ph, voice=mix, speed=0.95, is_phonemes=True)
    wav = out + '.wav'; sf.write(wav, samples, sr)
    encode(['-i', wav], out); os.remove(wav)
    return True

# ---------- make what's missing ----------
made = {'google': 0, 'free': 0}
keep = set()
for key, text, title, pri, google_ok in want:
    th = h(text)
    keep.add(key)
    c = clips.get(key)
    if c and c.get('t') == th and os.path.exists(os.path.join(SITE_AUDIO, c['f'])): continue
    f = f"{h(key + th)}.mp3"; out = os.path.join(SITE_AUDIO, f)
    voice = None
    if google_ok and google(text, out): voice = 'g'; made['google'] += 1
    elif time.time() - t0 < BUDGET:
        try: free_voice(text, out); voice = 'k'; made['free'] += 1
        except Exception as e: print(f'  free voice failed ({title}): {e}')
    if not voice: continue
    if c and c.get('f') != f:
        try: os.remove(os.path.join(SITE_AUDIO, c['f']))
        except OSError: pass
    clips[key] = {'f': f, 'd': duration(out), 'v': voice, 't': th, 'title': title, 'at': now.isoformat()}
    if key == 'brief': clips[key].update(day=datetime.now(MYT).strftime('%Y-%m-%d'), text=text)

# ---------- drop old recordings ----------
cut = now - timedelta(hours=KEEP_H)
for key in list(clips):
    c = clips[key]
    if key in keep: continue
    if datetime.fromisoformat(c['at']) < cut:
        try: os.remove(os.path.join(SITE_AUDIO, c['f']))
        except OSError: pass
        del clips[key]
used = {c['f'] for c in clips.values()}
for f in os.listdir(SITE_AUDIO):
    if f.endswith('.mp3') and f not in used: os.remove(os.path.join(SITE_AUDIO, f))
idx['updated'] = now.isoformat()
with open(idx_path, 'w', encoding='utf-8') as fp: json.dump(idx, fp, ensure_ascii=False, indent=0)
total = sum(os.path.getsize(os.path.join(SITE_AUDIO, c['f'])) for c in clips.values()) / 1e6
print(f"Audio: +{made['google']} Google, +{made['free']} free voice; {len(clips)} recordings ({total:.1f} MB); "
      f"Google today {g.get('used', 0)}{' (used up)' if g.get('out') else ''}; {round(time.time() - t0)}s")
