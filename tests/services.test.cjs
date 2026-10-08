const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('workshop reviews are collapsed by default and open with the native disclosure', () => {
  const dom = new JSDOM(source);
  try {
    const details = dom.window.document.querySelector('#services details.service-workshops');
    assert.ok(details);
    assert.equal(details.open, false);
    assert.equal(details.querySelector('summary h3').textContent, 'Workshop Reviewer');
    assert.equal(details.querySelectorAll('li').length, 6);
    assert.equal(details.querySelectorAll('.service-aside').length, 2);
    const original = details.querySelector('ul').innerHTML;
    details.querySelector('summary').click();
    assert.equal(details.open, true);
    details.querySelector('summary').click();
    assert.equal(details.open, false);
    assert.equal(details.querySelector('ul').innerHTML, original);
  } finally {
    dom.window.close();
  }
});

test('ICLR conference reviewing is visible outside the workshop disclosure', () => {
  const dom = new JSDOM(source);
  try {
    const entries = [...dom.window.document.querySelectorAll('#services article.entry')];
    const conference = entries.find(entry => entry.querySelector('h3').textContent === 'Conference Reviewer');
    assert.ok(conference);
    assert.equal(conference.querySelector('time'), null);
    assert.equal(conference.querySelector('p').textContent, 'ICLR 2027');
    assert.equal(conference.querySelector('details'), null);
    assert.equal(entries[0], conference);
  } finally {
    dom.window.close();
  }
});
