var expect = require('expect.js');
var path = require('path');
var fs = require('fs');
var vm = require('vm');
var Compiler = require('../src/compiler');
var Tokenizer = require('../src/tokenizer');

var compiler = new Compiler();
var tokenizer = new Tokenizer();

goog = {};
goog.require = function () {};
goog.provide = function () {};
goog.getMsg = function(str, opt_values) {
  var values = opt_values || {};
  for (var key in values) {
    var value = ('' + values[key]).replace(/\$/g, '$$$$');
    str = str.replace(new RegExp('\\{\\$' + key + '\\}', 'gi'), value);
  }
  return str;
};

test = {};
test.templates = {};

function compileTemplate(file) {
  var source = fs.readFileSync(path.resolve(__dirname, 'templates/' + file), 'utf8');
  var tokens = tokenizer.tokenizeSource_(source);
  tokens = tokenizer.filterTokens_(tokens);
  return compiler.compileTokens(tokens);
}

describe('Compiler', function () {
  describe('compileTokens', function () {
    it('should compile a simple template', function () {
      var js = compileTemplate('simple.soy');
      vm.runInThisContext(js);
      var html = test.templates.Simple({name: 'Matt', age: 20});
      expect(html.trim()).to.equal('I am Matt, 20 years old. And you?');
    });

    it('should compile a template with print', function () {
      var js = compileTemplate('print.soy');
      vm.runInThisContext(js);
      var html = test.templates.Print({name: 'Matt', age: 20});
      expect(html.trim()).to.equal('I am Matt, 20 years old. And you?');
    });

    it('should compile msg command', function () {
      var js = compileTemplate('msg.soy');
      vm.runInThisContext(js);
      var html = test.templates.MsgCommand({name: 'Matt', age: 20, website: 'http://example.org'});
      expect(html.trim()).to.equal('I am Matt, 20 years old. Check out my <a href="#">profile</a> and <a href="http://example.org">website</a>.<br>What\'s your name?');
    });

    it('should compile elseif command', function () {
      var js = compileTemplate('elseif.soy');
      vm.runInThisContext(js);
      var html = test.templates.ElseIf({gender: 'f'});
      expect(html.trim()).to.equal('You are girl.');
    });
  });

  describe('parseCommandAttributes_', function () {
    it('should parse command attributes', function () {
      var token = {
        source: '{msg meaning="test" desc="Lorem ipsum."}'
      };
      var attrs = compiler.parseCommandAttributes_(token);
      expect(Object.keys(attrs).length).to.equal(2);
      expect(attrs.meaning).to.equal('test');
      expect(attrs.desc).to.equal('Lorem ipsum.');
    });

    it('should parse empty attributes', function () {
      var token = {
        source: '{msg}'
      };
      var attrs = compiler.parseCommandAttributes_(token);
      expect(Object.keys(attrs).length).to.equal(0);
    });
  });

  describe('getVariableName_', function () {
    it('should get variable name', function () {
      var exp = '$name';
      var name = compiler.getVariableName_(exp);
      expect(name).to.equal('name');
    });

    it('should not get variable name', function () {
      var exp = '$name && $surname';
      var name = compiler.getVariableName_(exp);
      expect(name).to.equal(null);
    });
  });

  describe('createMsgFromTokens_', function () {
    it('should create msg', function () {
      var tokens = [
        { source: '{msg meaning="intro" desc="Introduction"}',
          type: 'command',
          closing: false,
          command: 'msg',
          exp: 'meaning="intro" desc="Introduction"' },
        { source: 'I am ', type: 'code' },
        { source: '{print $name}',
          type: 'command',
          closing: false,
          command: 'print',
          exp: '$name' },
        { source: ', ', type: 'code' },
        { source: '{print $age}',
          type: 'command',
          closing: false,
          command: 'print',
          exp: '$age' },
        { source: ' years old. Check out my <a href="#">profile</a>.',
          type: 'code' },
        { source: '{/msg}',
          type: 'command',
          closing: true,
          command: 'msg' }
      ];
      var msg = compiler.createMsgFromTokens_(tokens);
      expect(msg.text).to.equal('I am {$name}, {$age} years old. Check out my {$startLink}profile{$endLink}.');
    });
  });
});
