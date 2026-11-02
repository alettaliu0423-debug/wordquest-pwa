"""Shared UI-only interaction helpers. Database reads are assertion-only."""
import re
from playwright.sync_api import expect

def rows(page, store):
    return page.evaluate('''name=>new Promise((resolve,reject)=>{
      const opened=indexedDB.open('wordquest-official-v1');
      opened.onerror=()=>reject(opened.error);
      opened.onsuccess=()=>{const db=opened.result;const tx=db.transaction(name,'readonly');let data;
        tx.objectStore(name).getAll().onsuccess=e=>data=e.target.result;
        tx.oncomplete=()=>{db.close();resolve(data)};tx.onabort=()=>reject(tx.error)};
    })''', store)


def current_run(page):
    gate = rows(page, 'gates')[0]
    return next(r for r in rows(page, 'runs') if r['runId'] == gate['activeRunId'])


def run_by_id(page, run_id):
    return next(r for r in rows(page, 'runs') if r['runId'] == run_id)


def click_start(page):
    page.get_by_role('button', name='Challenge the guardian', exact=True).click()
    page.locator('.question-form').wait_for()
    expect(page.get_by_test_id('hero-hp')).to_have_text('5 / 5 HP')
    return current_run(page)['runId']


def answer_battle(page, correct, double=False):
    form = page.locator('.question-form')
    form.wait_for()
    before = current_run(page)
    q = before['questionSet'][before['currentQuestionIndex']]['question']
    spelling = q['type'] in ('listen-spell', 'meaning-spell')
    if spelling:
        # No full target word in title, teaching card, sidebar or page copy.
        assert not re.search(r'\b' + q['answer'] + r'\b', page.locator('body').inner_text(), re.I)
        assert q['answer'] not in page.title().lower()
        entry = page.get_by_role('textbox', name='Your spelling')
        assert entry.get_attribute('autocomplete') == 'off'
        assert entry.get_attribute('autocorrect') == 'off'
        assert entry.get_attribute('spellcheck') == 'false'
        if q['type'] == 'listen-spell':
            assert page.get_by_role('button', name='Cast your spell', exact=True).is_disabled()
            page.get_by_role('button', name='Play word', exact=True).click()
            expect(page.locator('.listening-state')).to_have_text('Word heard. Now spell it in full.')
        entry.press_sequentially(q['answer'] if correct else 'crsytal', delay=15)
        if page.viewport_size['height'] < 500:
            entry_box = entry.bounding_box()
            submit_box = page.get_by_role('button', name='Cast your spell', exact=True).bounding_box()
            assert entry_box['y'] >= 0
            assert submit_box['y'] + submit_box['height'] <= page.viewport_size['height']
            assert page.get_by_test_id('hero-hp').bounding_box()['y'] >= 0
    else:
        choice = q['answer'] if correct else next(c for c in q['choices'] if c != q['answer'])
        page.get_by_role('button', name=choice, exact=True).click()
    cast = page.get_by_role('button', name='Cast your spell', exact=True)
    cast.dblclick() if double else cast.click()
    hero = before['currentHp'] - (0 if correct else 1)
    boss = before['bossCurrentHp'] - (1 if correct else 0)
    expect(page.get_by_test_id('hero-hp')).to_have_text(f"{hero} / {before['initialHp']} HP")
    expect(page.get_by_test_id('boss-hp')).to_have_text(f'{boss} / 8 HP')
    assert run_by_id(page, before['runId'])['effectiveAnswerCount'] == before['effectiveAnswerCount'] + 1
    return q


def open_teaching(page, dimension=None):
    tasks = page.locator('.review-task').filter(has=page.get_by_role('button', name='Learn again', exact=True))
    if dimension:
        tasks = tasks.filter(has=page.get_by_text(dimension, exact=True))
    tasks.first.get_by_role('button', name='Learn again', exact=True).click()
    page.get_by_test_id('teaching-card').wait_for()


def open_check(page):
    page.get_by_role('button', name='Close learning card', exact=True).click()
    page.get_by_test_id('independent-ready').wait_for()
    assert page.get_by_test_id('teaching-card').count() == 0
    page.get_by_role('button', name='Start independent check', exact=True).click()
    page.get_by_test_id('independent-retest').wait_for()
    task = next(t for t in rows(page, 'remediationTasks') if t['phase'] == 'awaiting-answer')
    q = task['currentQuestion']
    if q['type'] == 'meaning-spell':
        assert not re.search(r'\b' + q['answer'] + r'\b', page.locator('body').inner_text(), re.I)
        assert q['answer'] not in page.title().lower()
    return task


def answer_check(page, task, correct):
    q = task['currentQuestion']
    if q['type'] == 'meaning-spell':
        page.get_by_role('textbox', name='Your spelling').press_sequentially(q['answer'] if correct else 'wrong', delay=15)
    else:
        choice = q['answer'] if correct else next(c for c in q['choices'] if c != q['answer'])
        page.get_by_role('button', name=choice, exact=True).click()
    page.get_by_role('button', name='Check my answer', exact=True).click()
    page.locator('.review-list').wait_for()


