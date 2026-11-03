const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const title = 'Shopify storefront and business automation developer '.repeat(4).trim();
const anchor = (href, text = '', label = '') => ({href, innerText: text,
    textContent: text, title: '', getAttribute: () => label, closest: () => null});
const anchors = [anchor('https://example.com/job'),
    anchor('https://example.com/job', title),
    anchor('https://example.com/icon', '  ', ' Accessible\n title '),
    anchor('javascript:alert(1)', 'Unsafe'), anchor('data:text/plain,test', 'Data'),
    ...Array.from({length: 45}, (_, i) => anchor('https://example.com/' + i, 'Job ' + i))];
const source = name => fs.readFileSync(path.join(__dirname,'..','extension',name), 'utf8');
const page = source('page.js');
const start = page.indexOf("        function collectLink(a)");
const end = page.indexOf("        root.querySelectorAll('img[src]')", start);
assert.ok(start >= 0 && end > start, 'Main link extractor must exist');
const allLinkMap = Object.create(null);
vm.runInNewContext(page.slice(start, end), {allLinkMap,shadowHosts:[],
    root: {querySelectorAll: () => anchors}, window: {location: {href: 'https://example.com'}}});
assert.equal(allLinkMap['https://example.com/job'], title);
assert.equal(allLinkMap['https://example.com/icon'], 'Accessible title');
assert.equal(Object.keys(allLinkMap).length, 47);

const api = source('api.js');
const frameStart = api.indexOf('    function _extractFrame(');
const frameEnd = api.indexOf('    function _formatFrame(', frameStart);
assert.ok(frameStart >= 0 && frameEnd > frameStart, 'Frame extractor must exist');
const frame = vm.runInNewContext(api.slice(frameStart, frameEnd) + '\n_extractFrame()', {
    window: {top: {}, self: {}, location: {href: 'https://example.com/frame'}},
    document: {title: 'Fixture', body: {innerText: 'Frame'},
        querySelectorAll: selector => selector === 'a[href]' ? anchors : []}});
assert.equal(frame.error, undefined);
assert.equal(frame.links.length, 48);
assert.equal(frame.links[1].text, title);
assert.equal(frame.links[2].text, 'Accessible title');
console.log('PASS: full labels, whitespace normalization, accessible fallback, duplicate label recovery, unsafe schemes excluded, and more than 40 frame links.');
