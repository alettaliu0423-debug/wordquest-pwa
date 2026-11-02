"""SIGKILL the test-owned Chromium process group; restart the same profile offline.

No normal browser close is used at the four crash checkpoints. Never attach to a
user browser or kill a PID not launched here. Requires a current production dist.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from contextlib import suppress
import json
import os
import signal
import socket
import subprocess
import tempfile
import time
from playwright.sync_api import sync_playwright, expect
from ui_support import rows, click_start, answer_battle, open_teaching, open_check, answer_check

root = Path(__file__).resolve().parents[1]
out = root / 'test-results'; out.mkdir(exist_ok=True)
profile = tempfile.mkdtemp(prefix='sigkill-owned-', dir=out)
results = []

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass
    def translate_path(self, request):
        path = request.split('?', 1)[0]
        if not path.startswith('/wordquest-pwa/'): return str(root / 'dist' / 'not-found')
        relative = path[len('/wordquest-pwa/'):]
        if '..' in Path(relative).parts: return str(root / 'dist' / 'not-found')
        return str(root / 'dist' / relative)

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/wordquest-pwa/'
stores = ['runs', 'answers', 'evidence', 'gates', 'remediationTasks', 'rewards', 'exposures', 'storyProgress', 'gameProgress']

def snapshot(page): return {store: rows(page, store) for store in stores}
def passed(name, facts):
    results.append({'test': name, 'result': 'PASS', 'facts': facts})
    print(json.dumps(results[-1]), flush=True)

with sync_playwright() as p:
    def launch(offline):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
        process = subprocess.Popen(['/usr/bin/chromium', '--headless', '--no-sandbox', '--no-first-run', '--disable-breakpad', '--disable-dev-shm-usage', '--hide-crash-restore-bubble', f'--user-data-dir={profile}', f'--remote-debugging-port={port}', 'about:blank'], start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        assert os.getpgid(process.pid) == process.pid and 'chromium' in Path(f'/proc/{process.pid}/comm').read_text()
        browser = None
        for _ in range(60):
            try:
                browser = p.chromium.connect_over_cdp(f'http://127.0.0.1:{port}', timeout=1000); break
            except Exception:
                assert process.poll() is None, 'Owned Chromium exited before CDP was available'
                time.sleep(.1)
        assert browser, 'Owned Chromium did not expose CDP'
        context = browser.contexts[0]; context.set_default_timeout(20000)
        context.set_offline(offline)
        context.add_init_script("speechSynthesis.speak = () => { throw new Error('Online TTS forbidden'); };")
        page = context.new_page(); page.set_viewport_size({'width': 1280, 'height': 900})
        return process, browser, page

    def kill_owned(process, browser):
        assert process.poll() is None and os.getpgid(process.pid) == process.pid
        os.killpg(process.pid, signal.SIGKILL)
        code = process.wait(timeout=10)
        assert code == -signal.SIGKILL
        with suppress(Exception): browser.close()  # Only disposes an already-dead CDP connection.
        return {'signal': 'SIGKILL', 'returncode': code, 'owned_pid': process.pid}

    process = None; browser = None
    try:
        process, browser, page = launch(False); page.goto(url)
        page.evaluate('navigator.serviceWorker.ready.then(()=>true)')
        run_id = click_start(page); answer_battle(page, False)
        page.get_by_role('button', name='Next challenge', exact=True).click()
        page.locator('[data-question-type="context-challenge"]').wait_for()
        before = snapshot(page); route = page.url
        server.shutdown(); server.server_close()
        killed = kill_owned(process, browser)
        process, browser, page = launch(True); page.goto(route)
        page.locator('.question-form').wait_for()
        assert snapshot(page) == before
        expect(page.get_by_test_id('hero-hp')).to_have_text('4 / 5 HP')
        passed('SIGKILL after saved battle: offline cold restore preserves HP, current question, raw answer and exposure', killed)

        for i in range(4):
            if i: page.get_by_role('button', name='Next challenge', exact=True).click()
            answer_battle(page, False)
        page.get_by_test_id('battle-defeat').wait_for()
        before = snapshot(page); route = page.url
        assert before['gates'][0]['lockedRunId'] == run_id and before['remediationTasks']
        killed = kill_owned(process, browser)
        process, browser, page = launch(True); page.goto(route)
        page.get_by_test_id('battle-defeat').wait_for()
        assert snapshot(page) == before
        assert page.get_by_role('button', name='Retry Boss', exact=True).count() == 0
        passed('SIGKILL immediately after saved defeat: failure, raw errors, dimension tasks and lock retained offline', killed)

        page.get_by_role('button', name='Review Mistakes', exact=True).click()
        open_teaching(page, 'Spelling'); pending = open_check(page)
        before = snapshot(page); route = page.url
        killed = kill_owned(process, browser)
        process, browser, page = launch(True); page.goto(route)
        page.get_by_test_id('independent-retest').wait_for()
        assert snapshot(page) == before and 'crystal' not in page.locator('body').inner_text().lower()
        passed('SIGKILL during independent spelling: exact pending check and lock restored without answer exposure', killed)
        answer_check(page, pending, True)
        for _ in range(sum(t['phase'] != 'passed' for t in rows(page, 'remediationTasks'))):
            open_teaching(page); task = open_check(page); answer_check(page, task, True)
        page.get_by_role('button', name='Retry Boss', exact=True).click()
        page.locator('.question-form').wait_for()
        for i in range(8):
            if i: page.get_by_role('button', name='Next challenge', exact=True).click()
            answer_battle(page, True)
        page.get_by_test_id('battle-victory').wait_for()
        before = snapshot(page); route = page.url
        assert len(before['rewards']) == 1
        killed = kill_owned(process, browser)
        process, browser, page = launch(True); page.goto(route)
        page.get_by_test_id('battle-victory').wait_for()
        assert snapshot(page) == before and len(rows(page, 'rewards')) == 1
        page.reload(); page.get_by_test_id('battle-victory').wait_for(); assert snapshot(page) == before
        page.screenshot(path=str(out / 'fix-sigkill-victory.png'), full_page=True)
        passed('SIGKILL after winning transaction: one reward, old failure and all evidence survive offline restart and refresh', killed)
    finally:
        if process and process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL); process.wait(timeout=10)
        if browser:
            with suppress(Exception): browser.close()
        if server.fileno() != -1: server.shutdown(); server.server_close()

(out / 'crash-browser-report.json').write_text(json.dumps({'result': 'PASS', 'tests': results, 'origin_server_stopped': True, 'method': 'Actual SIGKILL of four test-owned process groups, same profile reopened offline', 'limits': ['Linux Chromium process termination; not Huawei Android force-stop or power loss. No in-flight commit atomicity claim from this test.']}, indent=2))
print(f'PASS: {len(results)} forced-termination scenarios.', flush=True)
