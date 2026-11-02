"""Targeted UI + real IndexedDB cross-tab requests. Uses fresh local profiles only."""
from pathlib import Path
import json
import tempfile
from playwright.sync_api import sync_playwright, expect
from ui_support import rows, current_run, click_start, answer_battle, open_teaching, open_check

root = Path(__file__).resolve().parents[1]
out = root / 'test-results'; out.mkdir(exist_ok=True)
url = 'http://127.0.0.1:4187/wordquest-pwa/'
base = '/wordquest-pwa/'
results = []

def api(page, body, data=None):
    return page.evaluate('''async ({base,data})=>{
      const {db}=await import(base+'src/db/runtime.ts');
      const {GameService}=await import(base+'src/services/game.ts');
      const game=new GameService(db);
    ''' + body + '}', {'base': base, 'data': data})

def passed(name, facts):
    results.append({'test': name, 'result': 'PASS', 'facts': facts})
    print(json.dumps(results[-1]), flush=True)

with sync_playwright() as p:
    def launch():
        profile = tempfile.mkdtemp(prefix='defect-regression-', dir=out)
        ctx = p.chromium.launch_persistent_context(profile, executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'], viewport={'width': 1280, 'height': 900})
        ctx.set_default_timeout(15000)
        return ctx

    ctx = launch(); page = ctx.new_page(); page.goto(url)
    run_id = click_start(page)
    for i in range(5):
        if i: page.get_by_role('button', name='Next challenge', exact=True).click()
        answer_battle(page, False)
    page.get_by_role('button', name='Review Mistakes', exact=True).click()
    other = ctx.new_page(); other.goto(url)
    other.get_by_role('heading', name='A world waiting for your words.').wait_for()
    old_context = next(t for t in rows(page, 'remediationTasks') if t['dimension'] == 'context')
    open_teaching(page, 'Spelling'); pending = open_check(page)
    other.get_by_test_id('independent-retest').wait_for()
    stale = api(other, '''try {await game.beginTeaching(data.taskId,data.revision);return 'LEAK'}catch(e){return e.code}''', old_context)
    latest = next(t for t in rows(other, 'remediationTasks') if t['taskId'] == old_context['taskId'])
    blocked = api(other, '''try {await game.beginTeaching(data.taskId,data.revision);return 'LEAK'}catch(e){return e.code}''', latest)
    assert stale == 'STALE_REVIEW' and blocked == 'REVIEW_SESSION_BUSY'
    assert page.get_by_test_id('teaching-card').count() == other.get_by_test_id('teaching-card').count() == 0
    count = len(rows(page, 'exposures')); page.reload(); page.get_by_test_id('independent-retest').wait_for()
    assert len(rows(page, 'exposures')) == count
    assert 'crystal' not in page.locator('body').inner_text().lower()
    passed('Cross-task teaching denied from another tab; stale revision rejected; refresh keeps answer hidden', {'stale': stale, 'fresh_conflict': blocked})

    before_errors = rows(page, 'answers')
    api(other, 'await game.reportReviewExposure(data.taskId,data.revision);', pending)
    page.locator('.review-list').wait_for()
    invalid = next(t for t in rows(page, 'remediationTasks') if t['taskId'] == pending['taskId'])
    assert invalid['phase'] == 'teaching-required' and len(invalid['invalidatedRetests']) == 1
    rejected = api(other, '''try {await game.submitRetest({taskId:data.taskId,expectedRevision:data.revision,submissionId:crypto.randomUUID(),answer:'crystal'});return 'PASS'}catch(e){return e.code}''', pending)
    assert rejected == 'STALE_REVIEW' and rows(page, 'answers') == before_errors
    other.goto(url)  # Home does not render a teaching card.
    other.get_by_role('heading', name='A world waiting for your words.').wait_for()
    open_teaching(page, 'Spelling'); fresh = open_check(page)
    assert fresh['currentQuestion']['fingerprint'] != pending['currentQuestion']['fingerprint']
    page.screenshot(path=str(out / 'fix-independent-retest.png'), full_page=True)
    passed('Reported exposure durably invalidates old check; old submission refused; UI obtains a new unused question', {'different_fingerprint': True, 'original_answers_retained': True})

    api(page, 'await game.reportReviewExposure(data.taskId,data.revision);', fresh)
    page.locator('.review-list').wait_for()
    tasks = rows(page, 'remediationTasks')[:2]
    # Send simultaneous requests from two actual browser connections, using each
    # task's saved revision. These are service-level requests, not UI-only claims.
    request = '''window.concurrentResult=null; import('/wordquest-pwa/src/services/runtime.ts').then(async({game})=>{
      try {await game.beginTeaching(TASK.taskId,TASK.revision);window.concurrentResult='opened'}catch(e){window.concurrentResult=e.code}
    });'''
    page.evaluate(request.replace('TASK', json.dumps(tasks[0])))
    other.evaluate(request.replace('TASK', json.dumps(tasks[1])))
    page.wait_for_function('window.concurrentResult !== null'); other.wait_for_function('window.concurrentResult !== null')
    values = [page.evaluate('window.concurrentResult'), other.evaluate('window.concurrentResult')]
    assert values.count('opened') == 1 and values.count('STALE_REVIEW') == 1, values
    assert sum(t['phase'] == 'teaching-open' for t in rows(page, 'remediationTasks')) == 1
    passed('Concurrent teaching requests from two tabs serialize to one teaching task', {'results': values})
    other.evaluate('run => location.hash = "/review/" + run', run_id)
    page.get_by_role('button', name='Open learning card here', exact=True).click()
    other.get_by_role('button', name='Open learning card here', exact=True).click()
    page.get_by_test_id('teaching-card').wait_for(); other.get_by_test_id('teaching-card').wait_for()
    page.get_by_role('button', name='Close learning card', exact=True).click()
    # The second actually rendered card reports an exposure when it becomes stale;
    # a normal single-window close is not treated as exposure.
    page.locator('.review-list').wait_for()
    assert not any(t['phase'] in ('ready', 'awaiting-answer', 'passed') for t in rows(page, 'remediationTasks'))
    assert any(m['id'].startswith('demo:teaching-exposure:') for m in rows(page, 'metadata'))
    assert rows(page, 'gates')[0]['lockedRunId'] == run_id
    passed('Two rendered teaching windows: closing one triggers durable stale-answer protection in the other', {'lock_retained': True, 'independent_passes': 0})
    ctx.close()

    ctx = launch(); page = ctx.new_page(); page.goto(url); run_id = click_start(page)
    before = current_run(page)
    assisted = api(page, '''const s=await game.presentBattleQuestion(data);return await game.submitBattle({runId:data,instanceId:s.instanceId,expectedVersion:s.run.version,submissionId:crypto.randomUUID(),answer:'crystal',usedHint:true});''', run_id)
    assert assisted['run']['effectiveAnswerCount'] == 0
    page.reload(); page.locator('.question-form').wait_for()
    after = current_run(page)
    assert after['currentHp'] == 5 and after['bossCurrentHp'] == 8 and after['currentQuestionIndex'] == 0
    assert after['questionSet'][0]['question']['questionId'] != before['questionSet'][0]['question']['questionId']
    answer_battle(page, True)
    assert current_run(page)['effectiveAnswerCount'] == 1 and current_run(page)['bossCurrentHp'] == 7
    passed('Assisted service submission safely replaced; real UI continues with exactly one attack', {'hp': 5, 'boss_hp': 7, 'effective': 1})
    # Assist the next slot until its distinct variants are exhausted.
    page.get_by_role('button', name='Next challenge', exact=True).click()
    for _ in range(4):
        result = api(page, '''try {const s=await game.presentBattleQuestion(data);await game.submitBattle({runId:data,instanceId:s.instanceId,expectedVersion:s.run.version,submissionId:crypto.randomUUID(),answer:'crystal',usedHint:true});return 'assisted'}catch(e){return e.code}''', run_id)
        if result == 'ASSISTED_REPLACEMENT_EXHAUSTED': break
    assert result == 'ASSISTED_REPLACEMENT_EXHAUSTED'
    page.reload(); expect(page.get_by_role('alert')).to_contain_text('no unused replacement questions')
    assert page.locator('.question-form').count() == 0
    saved = current_run(page)
    assert saved['status'] == 'active' and saved['currentHp'] == 5 and saved['bossCurrentHp'] == 7
    assert not rows(page, 'rewards')
    page.screenshot(path=str(out / 'fix-assisted-paused.png'), full_page=True)
    passed('Exhausted assistance replacements display a safe pause without damage, win or loss', {'status': saved['status'], 'hp': 5, 'boss_hp': 7})
    ctx.close()

(out / 'defect-browser-report.json').write_text(json.dumps({'result': 'PASS', 'tests': results, 'method': 'UI actions plus explicitly identified cross-tab service requests; fresh profiles only'}, indent=2))
print(f'PASS: {len(results)} defect browser scenarios.', flush=True)
