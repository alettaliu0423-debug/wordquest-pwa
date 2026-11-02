"""Production build, project subpath, real server shutdown, offline cold UI recovery."""
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from threading import Thread
from urllib.parse import urlparse, unquote
import hashlib
import json
import mimetypes
import tempfile
from playwright.sync_api import sync_playwright, expect
from ui_support import rows, current_run, run_by_id, click_start, answer_battle, open_teaching, open_check, answer_check

root = Path(__file__).resolve().parents[1]
dist = root / 'dist'
assert (dist / 'sw.js').is_file(), 'Run the project-subpath production build first.'
base = '/wordquest-pwa/'
out = root / 'test-results'
out.mkdir(exist_ok=True)
profile = tempfile.mkdtemp(prefix='production-offline-', dir=out)
results = []


def passed(name, facts):
    result = {'test': name, 'result': 'PASS', 'facts': facts}
    results.append(result)
    print(json.dumps(result, ensure_ascii=False), flush=True)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if not path.startswith(base):
            self.send_error(404); return
        name = path[len(base):] or 'index.html'
        if '..' in Path(name).parts:
            self.send_error(404); return
        file = dist / name
        if not file.is_file():
            self.send_error(404); return
        content = file.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', 'application/javascript' if name.endswith('.js') else mimetypes.guess_type(name)[0] or 'application/octet-stream')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}{base}'

with sync_playwright() as p:
    def launch(offline=False):
        context = p.chromium.launch_persistent_context(profile, executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'], viewport={'width': 1280, 'height': 900})
        context.set_default_timeout(20000)
        context.add_init_script("speechSynthesis.speak = () => { throw new Error('No TTS fallback allowed'); };")
        if offline:
            context.set_offline(True)
        return context

    context = launch()
    page = context.new_page(); page.goto(url)
    page.get_by_role('button', name='Challenge the guardian', exact=True).wait_for()
    sw_info = page.evaluate('''async()=>{
      const r=await navigator.serviceWorker.ready;
      return new Promise((resolve,reject)=>{const c=new MessageChannel();const t=setTimeout(()=>reject(new Error('worker query timeout')),5000);c.port1.onmessage=e=>{clearTimeout(t);c.port1.close();resolve(e.data)};r.active.postMessage({type:'INFO'},[c.port2])});
    }''')
    assert sw_info['complete']
    manifest = page.evaluate("async()=>await (await fetch('./manifest.webmanifest')).json()")
    assert manifest['id'] == './' and manifest['scope'] == './' and manifest['start_url'] == './'
    assert 'caches.delete(' not in (dist / 'sw.js').read_text()
    assert 'clients.claim()' not in (dist / 'sw.js').read_text()
    passed('Production project-path manifest and actual build/audio precache', {'complete': True, 'version': sw_info['version']})

    run_id = click_start(page)
    answer_battle(page, False)
    page.get_by_role('button', name='Next challenge', exact=True).click()
    page.locator('[data-question-type="context-challenge"]').wait_for()
    before = current_run(page)
    battle_url = page.url
    cache_names = sorted(page.evaluate('caches.keys()'))
    context.close()
    server.shutdown(); server.server_close()
    # No origin server is running from this point onward.
    context = launch(True)
    page = context.new_page(); page.goto(battle_url)
    page.locator('[data-question-type="context-challenge"]').wait_for()
    expect(page.get_by_test_id('hero-hp')).to_have_text('4 / 5 HP')
    assert current_run(page) == before
    assert sorted(page.evaluate('caches.keys()')) == cache_names
    assert not page.evaluate('navigator.onLine')
    passed('Origin server stopped + browser process restarted: offline battle and exact snapshot restored', {'hero_hp': 4, 'question_index': 1})

    answer_battle(page, False)
    page.get_by_role('button', name='Next challenge', exact=True).click()
    q = answer_battle(page, True)
    assert q['type'] == 'listen-spell'
    audio_hashes = page.evaluate('''async()=>{
      const cache=await caches.open('wordquest-official-audio-v1:' + new URL(location.href).pathname);
      const result={};
      for(const word of ['crystal','happy']){
        const response=await cache.match(new URL('audio/'+word+'.wav',location.href));
        if(!response)throw new Error('missing cached recording');
        result[word]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await response.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
      }
      return result;
    }''')
    assert audio_hashes == {name: hashlib.sha256((dist / 'audio' / f'{name}.wav').read_bytes()).hexdigest() for name in ['crystal', 'happy']}
    passed('Offline local speech plays after cold restart; both cached recordings match shipped bytes', audio_hashes)

    for _ in range(3):
        page.get_by_role('button', name='Next challenge', exact=True).click()
        answer_battle(page, False)
    page.get_by_test_id('battle-defeat').wait_for()
    failed = run_by_id(page, run_id)
    assert failed['currentHp'] == 0 and failed['status'] == 'lost'
    page.get_by_role('button', name='Review Mistakes', exact=True).click()
    page.get_by_test_id('review-lock').wait_for()
    open_teaching(page, 'Spelling')
    pending = open_check(page)
    exposure_count = len(rows(page, 'exposures'))
    review_url = page.url
    context.close()
    context = launch(True)
    page = context.new_page(); page.goto(review_url)
    page.get_by_test_id('independent-retest').wait_for()
    assert 'crystal' not in page.locator('body').inner_text().lower()
    saved_task = next(t for t in rows(page, 'remediationTasks') if t['taskId'] == pending['taskId'])
    assert saved_task == pending and len(rows(page, 'exposures')) == exposure_count
    assert rows(page, 'gates')[0]['lockedRunId'] == run_id
    page.screenshot(path=str(out / 'batch2-offline-retest.png'), full_page=True)
    passed('Offline defeat/teaching and another process restart restore the same answer-hidden retest and lock', {'same_question': True, 'exposures_unchanged': True})

    answer_check(page, saved_task, True)
    remaining = sum(t['phase'] != 'passed' for t in rows(page, 'remediationTasks'))
    for _ in range(remaining):
        open_teaching(page)
        task = open_check(page)
        answer_check(page, task, True)
    page.get_by_role('button', name='Retry Boss', exact=True).click()
    page.locator('.question-form').wait_for()
    retry = current_run(page)
    assert retry['runId'] != run_id and retry['currentHp'] == 5 and retry['bossCurrentHp'] == 8
    assert run_by_id(page, run_id) == failed
    assert sorted(page.evaluate('caches.keys()')) == cache_names
    assert all(a['scope'] == 'demo' for a in rows(page, 'answers'))
    passed('Entire mandatory review and full-health retry complete with no origin server or network', {'hero_hp': 5, 'boss_hp': 8, 'old_failure_preserved': True, 'cache_names_unchanged': True})
    context.close()

report = {'result': 'PASS', 'tests': results, 'origin_server_stopped': True, 'browser_process_restarted': True,
          'limits': ['Chromium on local secure-context origin; not HarmonyOS real-device acceptance.', 'No GitHub/Pages deployment was performed.']}
(out / 'production-browser-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(f'PASS: {len(results)} production/offline UI scenarios. No remote deployment.', flush=True)
