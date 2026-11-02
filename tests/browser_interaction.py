"""Batch 2: all learning/battle mutations use real UI controls, not service calls.

IndexedDB is read only for assertions and answer-oracle verification. Failure injection
is explicitly isolated to a fresh local browser context, never an existing profile.
"""
from pathlib import Path
from urllib.parse import urlparse
import argparse
import json
import re
import tempfile
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:4187/wordquest-pwa/')
args = parser.parse_args()
assert urlparse(args.url).hostname in ('localhost', '127.0.0.1')
out = Path(__file__).resolve().parents[1] / 'test-results'
out.mkdir(exist_ok=True)
results = []


def passed(name, facts):
    row = {'test': name, 'result': 'PASS', 'facts': facts}
    results.append(row)
    print(json.dumps(row, ensure_ascii=False), flush=True)


from ui_support import rows, current_run, run_by_id, click_start, answer_battle, open_teaching, open_check, answer_check


with sync_playwright() as p:
    profile = tempfile.mkdtemp(prefix='ui-profile-', dir=out)

    def launch():
        ctx = p.chromium.launch_persistent_context(profile, executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'], viewport={'width': 1280, 'height': 900})
        ctx.set_default_timeout(15000)
        ctx.add_init_script("speechSynthesis.speak = () => { throw new Error('Online/system TTS must not be used'); };")
        return ctx

    context = launch()
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(args.url)
    run_id = click_start(page)
    page.screenshot(path=str(out / 'batch2-battle.png'), full_page=True)
    assert page.get_by_role('img', name='Explorer holding a glowing staff').count() == 1
    assert page.get_by_role('img', name='Friendly stone guardian with mossy shoulders').count() == 1
    assert page.get_by_role('link', name='Word Bank', exact=True).count() == 0
    page.set_viewport_size({'width': 800, 'height': 1280})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert all(button.bounding_box()['height'] >= 44 for button in page.locator('.answer-options button').all())
    page.screenshot(path=str(out / 'batch2-portrait.png'), full_page=True)
    page.set_viewport_size({'width': 1280, 'height': 900})
    page.get_by_role('button', name='Cast your spell', exact=True).click()
    expect(page.get_by_role('alert')).to_have_text('Choose an answer to continue.')
    assert rows(page, 'answers') == []
    passed('Battle starts through UI, two fighters/HP shown, empty answer harmless', {'hero_hp': 5, 'boss_hp': 8})

    answer_battle(page, False, double=True)
    assert len(rows(page, 'answers')) == 1
    assert page.locator('.battle-stage.hero-hit').count() == 1
    page.reload()
    page.locator('.question-form').wait_for()
    expect(page.get_by_test_id('hero-hp')).to_have_text('4 / 5 HP')
    answer_battle(page, False)
    page.get_by_role('button', name='Next challenge', exact=True).click()
    page.locator('[data-question-type="listen-spell"]').wait_for()
    saved = current_run(page)
    battle_url = page.url
    context.close()
    context = launch()
    page = context.new_page()
    page.goto(battle_url)
    page.locator('[data-question-type="listen-spell"]').wait_for()
    assert current_run(page)['currentQuestionIndex'] == saved['currentQuestionIndex']
    expect(page.get_by_test_id('hero-hp')).to_have_text('3 / 5 HP')
    passed('Real double-click, refresh and browser-process resume through battle UI', {'answers': 2, 'hp': 3, 'question_restored': True})

    context.set_offline(True)
    page.set_viewport_size({'width': 1280, 'height': 430})
    q = answer_battle(page, False)
    page.set_viewport_size({'width': 1280, 'height': 900})
    assert q['type'] == 'listen-spell'
    heard_errors = [a for a in rows(page, 'answers') if a['questionType'] == 'listen-spell']
    assert len(heard_errors) == 1 and heard_errors[0]['submittedAnswer'] == 'crsytal' and not heard_errors[0]['isCorrect']
    passed('Bundled speech plays with browser network offline; full typed misspelling loses HP', {'hp': 2, 'online_tts': False})
    context.set_offline(False)
    for _ in range(2):
        page.get_by_role('button', name='Next challenge', exact=True).click()
        answer_battle(page, False)
    page.get_by_test_id('battle-defeat').wait_for()
    failed = run_by_id(page, run_id)
    assert failed['status'] == 'lost' and failed['currentHp'] == 0
    original_errors = sorted(rows(page, 'answers'), key=lambda a: a['answerId'])
    assert len(original_errors) == 5
    assert len(rows(page, 'remediationTasks')) == 4
    assert page.get_by_role('button', name='Retry Boss', exact=True).count() == 0
    page.get_by_role('button', name='Review Mistakes', exact=True).click()
    page.get_by_test_id('review-lock').wait_for()
    review_url = page.url
    expect(page.get_by_test_id('review-progress')).to_have_text('Independent checks passed: 0 / 4')
    passed('Fifth mistake ends battle immediately; four dimension tasks and retry lock shown', {'tasks': 4, 'retry_available': False})

    open_teaching(page, 'Spelling')
    expect(page.get_by_test_id('teaching-card').get_by_role('heading')).to_have_text('crystal')
    page.screenshot(path=str(out / 'batch2-teaching.png'), full_page=True)
    page.reload()
    page.get_by_test_id('teaching-card').wait_for()
    first = open_check(page)
    page.screenshot(path=str(out / 'batch2-independent-check.png'), full_page=True)
    before_count = len(rows(page, 'answers'))
    page.get_by_role('button', name='Check my answer', exact=True).click()
    expect(page.get_by_role('alert')).to_have_text('Type the whole word to continue.')
    assert len(rows(page, 'answers')) == before_count
    exposures_before = len(rows(page, 'exposures'))
    page.add_init_script('''window.answerFlashDetected = false;
      new MutationObserver(() => {
        if (document.body && /\\bcrystal\\b/i.test(document.body.innerText)) window.answerFlashDetected = true;
      }).observe(document, {subtree:true, childList:true, characterData:true});''')
    page.reload()
    page.get_by_test_id('independent-retest').wait_for()
    assert not page.evaluate('window.answerFlashDetected')
    assert len(rows(page, 'exposures')) == exposures_before
    page.evaluate('run => location.hash = "/battle/" + run', run_id)
    page.get_by_test_id('independent-retest').wait_for()
    assert page.get_by_test_id('battle-defeat').count() == 0
    # Direct navigation to Word Bank must resume the check, not reveal its spelling.
    page.evaluate("location.hash = '/words'")
    page.get_by_test_id('independent-retest').wait_for()
    assert 'crystal' not in page.locator('body').inner_text().lower()
    page.evaluate('value => location.hash = value', urlparse(review_url).fragment)
    answer_check(page, first, False)
    open_teaching(page, 'Spelling')
    second = open_check(page)
    assert second['currentQuestion']['fingerprint'] != first['currentQuestion']['fingerprint']
    assert second['currentQuestion']['questionId'] != first['currentQuestion']['questionId']
    answer_check(page, second, True)
    expect(page.get_by_test_id('review-progress')).to_have_text('Independent checks passed: 1 / 4')
    assert page.get_by_role('button', name='Retry Boss', exact=True).count() == 0
    passed('Teaching closes before spelling check; refresh safe; no answer lookup; wrong retest gets fresh content', {'partial_checks': 1, 'retry_available': False})

    for _ in range(3):
        open_teaching(page)
        task = open_check(page)
        battle_fingerprints = {q['question']['fingerprint'] for q in failed['questionSet']}
        assert task['currentQuestion']['fingerprint'] not in battle_fingerprints
        answer_check(page, task, True)
    expect(page.get_by_test_id('review-progress')).to_have_text('Independent checks passed: 4 / 4')
    page.get_by_role('button', name='Retry Boss', exact=True).click()
    page.locator('.question-form').wait_for()
    retry = current_run(page)
    assert retry['runId'] != run_id and retry['currentHp'] == 5 and retry['bossCurrentHp'] == 8
    assert run_by_id(page, run_id) == failed
    for item in original_errors:
        assert next(a for a in rows(page, 'answers') if a['answerId'] == item['answerId']) == item
    assert all(retry['questionSet'][i]['question']['fingerprint'] != failed['questionSet'][i]['question']['fingerprint'] for i in range(8))
    passed('Only all required checks open a full-health retry; old failure and errors retained', {'hero_hp': 5, 'boss_hp': 8, 'different_contexts': True})

    spelling_count = 0
    for index in range(8):
        q = answer_battle(page, True)
        spelling_count += q['type'] in ('listen-spell', 'meaning-spell')
        if index == 0:
            assert page.locator('.battle-stage.boss-hit').count() == 1
        if index < 7:
            page.get_by_role('button', name='Next challenge', exact=True).click()
    page.get_by_test_id('battle-victory').wait_for()
    assert spelling_count == 4
    assert len(rows(page, 'rewards')) == 1
    assert all(s['status'] != 'Mastered' for s in rows(page, 'learningStates'))
    assert all(a['scope'] == 'demo' for a in rows(page, 'answers'))
    page.screenshot(path=str(out / 'batch2-victory.png'), full_page=True)
    page.reload()
    page.get_by_test_id('battle-victory').wait_for()
    assert len(rows(page, 'rewards')) == 1
    assert not errors, errors
    passed('Eight UI attacks win, four full-keyboard spelling questions completed, no duplicate reward', {'crystals': 1, 'independent_spelling_questions': 4})
    context.close()

    # Missing-resource scenario: new isolated profile, no cached audio.
    profile = tempfile.mkdtemp(prefix='ui-missing-audio-', dir=out)
    context = launch()
    context.route('**/audio/happy.wav', lambda route: route.fulfill(status=404, body='Intentionally missing'))
    page = context.new_page(); page.goto(args.url)
    page.get_by_role('button', name='Challenge the guardian', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('pronunciation could not be downloaded')
    assert rows(page, 'runs') == [] and not rows(page, 'gates')[0].get('activeRunId')
    passed('Missing offline audio blocks start without partial battle writes or online TTS fallback', {'runs_created': 0})
    context.close()

    profile = tempfile.mkdtemp(prefix='ui-exhaustion-', dir=out)
    context = launch(); page = context.new_page(); page.goto(args.url)
    exhausted_run = click_start(page)
    for i in range(5):
        answer_battle(page, False)
        if i < 4:
            page.get_by_role('button', name='Next challenge', exact=True).click()
    page.get_by_role('button', name='Review Mistakes', exact=True).click()
    seen = set()
    for _ in range(3):
        open_teaching(page, 'Spelling'); task = open_check(page)
        seen.add(task['currentQuestion']['fingerprint'])
        answer_check(page, task, False)
    open_teaching(page, 'Spelling')
    page.get_by_role('button', name='Close learning card', exact=True).click()
    page.get_by_role('button', name='Start independent check', exact=True).click()
    expect(page.locator('.exhausted')).to_contain_text('guardian stays locked')
    assert len(seen) == 3
    assert page.get_by_role('button', name='Retry Boss', exact=True).count() == 0
    page.reload()
    expect(page.locator('.exhausted')).to_contain_text('guardian stays locked')
    assert rows(page, 'gates')[0]['lockedRunId'] == exhausted_run
    page.screenshot(path=str(out / 'batch2-exhausted.png'), full_page=True)
    passed('Three distinct failed retests exhaust content and persist the review lock after refresh', {'distinct_retests': 3, 'retry_available': False})
    context.close()

    profile = tempfile.mkdtemp(prefix='ui-save-failure-', dir=out)
    context = launch(); page = context.new_page(); page.goto(args.url)
    click_start(page)
    page.evaluate('''() => {
      const original = IDBObjectStore.prototype.add;
      window.restoreTestAdd = () => { IDBObjectStore.prototype.add = original; };
      IDBObjectStore.prototype.add = function(...args) {
        if (this.name === 'evidence') throw new Error('Injected UI save failure');
        return original.apply(this, args);
      };
    }''')
    page.get_by_role('button', name='ribbon', exact=True).click()
    page.get_by_role('button', name='Cast your spell', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('Injected UI save failure')
    expect(page.get_by_test_id('hero-hp')).to_have_text('5 / 5 HP')
    expect(page.get_by_test_id('boss-hp')).to_have_text('8 / 8 HP')
    assert rows(page, 'answers') == [] and rows(page, 'evidence') == []
    assert page.locator('.battle-stage.hero-hit,.battle-stage.boss-hit').count() == 0
    assert page.get_by_role('button', name='ribbon', exact=True).get_attribute('aria-pressed') == 'true'
    page.evaluate('window.restoreTestAdd()')
    page.get_by_role('button', name='Cast your spell', exact=True).click()
    expect(page.get_by_test_id('hero-hp')).to_have_text('4 / 5 HP')
    assert len(rows(page, 'answers')) == 1
    passed('UI save failure causes no damage/animation or partial answer; same form safely resubmits after recovery', {'failed_save_answers': 0, 'recovered_answers': 1})
    context.close()

report = {'result': 'PASS', 'tests': results, 'method': 'Actual UI controls; readonly IndexedDB assertions; isolated browser profiles', 'limits': ['No Huawei device or physical soft-keyboard/audio-quality acceptance in cloud.']}
(out / 'interaction-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(f'PASS: {len(results)} actual UI scenarios.', flush=True)
