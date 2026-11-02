"""Run against an already running LOCAL Vite server, using existing Playwright/Chromium.

No installation, public endpoint, existing browser profile or production data is used.
"""
from pathlib import Path
from urllib.parse import urlparse
import argparse
import json
import tempfile
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:4187/wordquest-pwa/')
args = parser.parse_args()
parsed = urlparse(args.url)
assert parsed.hostname in ('localhost', '127.0.0.1'), 'This test only accepts a local server.'
base = parsed.path
assert base.endswith('/')
result_dir = Path(__file__).resolve().parents[1] / 'test-results'
result_dir.mkdir(exist_ok=True)
profile = tempfile.mkdtemp(prefix='chromium-', dir=result_dir)
results = []


def passed(name, facts):
    result = {'test': name, 'result': 'PASS', 'facts': facts}
    results.append(result)
    print(json.dumps(result, ensure_ascii=False), flush=True)


def api(page, body, data=None):
    return page.evaluate('''async ({base, data}) => {
      const { db } = await import(base + 'src/db/runtime.ts');
      const { GameService } = await import(base + 'src/services/game.ts');
      const game = new GameService(db);
    ''' + body + '\n}', {'base': base, 'data': data})


def submission(page, run_id, correct=False):
    return api(page, '''
      const shown = await game.presentBattleQuestion(data.runId);
      const raw = await db.runs.get(data.runId);
      return { submissionId: crypto.randomUUID(), runId: data.runId,
        instanceId: shown.instanceId, expectedVersion: shown.run.version,
        answer: data.correct ? raw.questionSet[raw.currentQuestionIndex].question.answer : 'browser-original-error' };
    ''', {'runId': run_id, 'correct': correct})


def launch(p):
    context = p.chromium.launch_persistent_context(
        profile, executable_path='/usr/bin/chromium', headless=True,
        args=['--no-sandbox'], viewport={'width': 1280, 'height': 800},
    )
    context.set_default_timeout(15000)
    return context


with sync_playwright() as p:
    context = launch(p)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url)
    page.get_by_role('heading', name='A world waiting for your words.').wait_for()
    page.get_by_role('link', name='Word Bank', exact=True).click()
    page.locator('.word-card').nth(1).wait_for()
    assert page.locator('.word-card').count() == 2
    assert page.locator('.learning-status').all_text_contents() == ['New', 'New']
    page.reload()
    page.get_by_role('heading', name='Words worth discovering.').wait_for()
    assert page.locator('.word-card').count() == 2
    assert not page.evaluate("/[\\u4e00-\\u9fff]/u.test(document.body.innerText)")
    passed('English shell, scoped Word Bank and hash-route refresh', {'words': 2, 'route': '#/words'})
    page.set_viewport_size({'width': 800, 'height': 1280})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.get_by_role('link', name='Home', exact=True).click()
    page.get_by_role('heading', name='A world waiting for your words.').wait_for()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.set_viewport_size({'width': 1280, 'height': 800})
    passed('Portrait and landscape layout', {'horizontal_overflow': False})

    run = api(page, 'await game.setPlayerHp(3); return await game.startChallenge();')
    run_id = run['runId']
    first = submission(page, run_id)
    rollback = api(page, '''
      const before = await db.runs.get(data.runId);
      const fault = () => { throw new Error('browser-injected-write-failure'); };
      db.evidence.hook('creating', fault);
      let rejected = false;
      try { await game.submitBattle(data); } catch (e) { rejected = e.message.includes('browser-injected-write-failure'); }
      finally { db.evidence.hook('creating').unsubscribe(fault); }
      return { rejected, unchanged: JSON.stringify(before) === JSON.stringify(await db.runs.get(data.runId)),
        answers: await db.answers.count(), evidence: await db.evidence.count() };
    ''', first)
    assert rollback == {'rejected': True, 'unchanged': True, 'answers': 0, 'evidence': 0}
    passed('Real IndexedDB transaction fault rollback', rollback)

    other = context.new_page()
    other.goto(args.url)
    other.get_by_role('heading', name='A world waiting for your words.').wait_for()
    first_result = api(page, 'return await game.submitBattle(data);', first)
    duplicate = api(page, 'return await game.submitBattle(data);', first)
    competing = dict(first)
    competing['submissionId'] += '-other-tab'
    stale = api(other, 'return await game.submitBattle(data);', competing)
    assert first_result['run']['currentHp'] == 2
    assert duplicate['kind'] == 'duplicate'
    assert stale['kind'] == 'ignored' and stale['reason'] == 'stale'
    assert api(page, 'return await db.answers.count();') == 1
    other.close()
    passed('Duplicate and old-tab submissions', {'effective_answers': 1, 'remaining_hp': 2})

    for _ in range(2):
        api(page, 'return await game.submitBattle(data);', submission(page, run_id))
    failed = api(page, 'return await db.runs.get(data);', run_id)
    assert failed['status'] == 'lost' and failed['currentHp'] == 0
    page.reload()
    page.get_by_role('heading', name='A world waiting for your words.').wait_for()
    lock = api(page, '''
      let code; try { await game.startChallenge(); } catch(e) { code=e.code; }
      return { code, tasks: await db.remediationTasks.toArray(), hp: (await db.runs.get(data)).currentHp };
    ''', run_id)
    assert lock['code'] == 'REVIEW_LOCKED' and lock['hp'] == 0 and len(lock['tasks']) == 3
    passed('Fatal HP, persisted dimension tasks and refresh lock', {'hp': 0, 'tasks': 3, 'retry': 'blocked'})

    def pass_task(task_id):
        return api(page, '''
          const initial=await db.remediationTasks.get(data);
          let teachingBlocked=false;
          try { await game.presentRetest(initial.taskId, initial.revision); } catch(e) { teachingBlocked=e.code==='TEACHING_MUST_BE_CLOSED'; }
          const teaching=await game.beginTeaching(initial.taskId,initial.revision);
          const closed=await game.closeTeaching(initial.taskId,teaching.task.revision);
          const shown=await game.presentRetest(initial.taskId,closed.revision);
          const pending=await db.remediationTasks.get(initial.taskId);
          if ('answer' in shown.question) throw new Error('Answer leaked in formal retest');
          const result=await game.submitRetest({taskId:initial.taskId,expectedRevision:shown.revision,submissionId:crypto.randomUUID(),answer:pending.currentQuestion.answer});
          return {teachingBlocked,kind:result.kind};
        ''', task_id)

    assert pass_task(lock['tasks'][0]['taskId']) == {'teachingBlocked': True, 'kind': 'passed'}
    code = api(page, 'try {await game.startChallenge();return "unlocked"} catch(e){return e.code}')
    assert code == 'REVIEW_LOCKED'
    passed('Teaching gate and partial-review lock', {'partial_retry': 'blocked'})
    for task in lock['tasks'][1:]:
        assert pass_task(task['taskId']) == {'teachingBlocked': True, 'kind': 'passed'}
    retry = api(page, 'await game.setPlayerHp(7);return await game.startChallenge();')
    assert retry['initialHp'] == 7 and retry['currentHp'] == 7 and retry['bossCurrentHp'] == 8
    assert api(page, 'return await db.runs.get(data);', run_id) == failed
    fresh = api(page, 'return await db.runs.get(data);', retry['runId'])
    assert all(fresh['questionSet'][i]['question']['fingerprint'] != failed['questionSet'][i]['question']['fingerprint'] for i in range(8))
    passed('All tasks passed: full-health new run, history retained', {'hp': 7, 'boss_hp': 8, 'new_contexts': True})

    for _ in range(8):
        api(page, 'return await game.submitBattle(data);', submission(page, retry['runId'], True))
    victory = api(page, '''return { run: await db.runs.get(data), rewards: await db.rewards.count(),
      progress: await db.gameProgress.get('demo'), mastered: await db.learningStates.filter(s=>s.status==='Mastered').count(),
      realEvidence: await db.evidence.where('scope').equals('real').count() };''', retry['runId'])
    assert victory['run']['status'] == 'won'
    assert victory['rewards'] == 1 and victory['progress']['crystalIds'] == ['forest-crystal']
    assert victory['mastered'] == 0 and victory['realEvidence'] == 0
    passed('Victory, unique crystal, no invented mastery or real progress', {'crystals': 1, 'mastered': 0, 'real_evidence': 0})

    active = api(page, 'return await game.startChallenge();')
    api(page, 'return await game.submitBattle(data);', submission(page, active['runId'], True))
    api(page, 'return await game.submitBattle(data);', submission(page, active['runId'], False))
    api(page, 'return await game.presentBattleQuestion(data);', active['runId'])
    snapshot = api(page, 'return await db.runs.get(data);', active['runId'])
    assert snapshot['currentHp'] == 6 and snapshot['bossCurrentHp'] == 7
    assert not errors, errors
    context.close()
    context = launch(p)
    page = context.new_page()
    page.goto(args.url)
    page.get_by_role('heading', name='A world waiting for your words.').wait_for()
    assert api(page, 'return await db.runs.get(data);', active['runId']) == snapshot
    assert api(page, 'return await db.runs.get(data);', run_id) == failed
    assert api(page, 'return await db.rewards.count();') == 1
    page.screenshot(path=str(result_dir / 'home.png'), full_page=True)
    passed('Actual browser process restart retains HP, question, failures and reward', {'hp': 6, 'boss_hp': 7})
    context.close()

report = {'browser': 'Chromium', 'result': 'PASS', 'tests': results, 'limits': [
    'Local isolated Chromium only; Huawei formal project not yet tested.',
    'No service worker in batch 1; offline PWA acceptance is pending.',
    'Service APIs are tested directly; interactive Battle/Review/Parent UI is pending.',
]}
(result_dir / 'browser-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(f'PASS: {len(results)} browser scenarios; no remote publication.', flush=True)
