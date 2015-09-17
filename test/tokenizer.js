var expect = require('expect.js');
var fs = require('fs');
var path = require('path');
var Tokenizer = require('../src/tokenizer');

var tokenizer = new Tokenizer();

describe('Tokenizer', function () {
  it('should tokenize a simple template', function () {
    var source = fs.readFileSync(path.resolve(__dirname, 'templates/simple.soy'), 'utf8');
    var tokens = tokenizer.tokenizeSource_(source);
    expect(tokens.length).to.equal(9);
    expect(tokens[0].type).to.equal('jsdoc');
    expect(tokens[1].type).to.equal('code');
    expect(tokens[2].type).to.equal('command');
    expect(tokens[3].type).to.equal('code');
    expect(tokens[4].type).to.equal('command');
    expect(tokens[5].type).to.equal('code');
    expect(tokens[6].type).to.equal('command');
    expect(tokens[7].type).to.equal('code');
    expect(tokens[8].type).to.equal('command');
  });
});
