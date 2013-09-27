var async = require('async');
var fs = require('fs');
var JSDocParser = require('jsdoc-parser');

var Tokenizer = require('tokenizer');


var Compiler = function () {

};


Compiler.prototype.compile = function (filenames) {
  var compiler = this;

  filenames.forEach(function (filename) {
    var source = fs.readFileSync(filename, 'utf8');
    var tokens = compiler.tokenize(source);
    tokens = compiler.filterTokens_(tokens);
    console.log(tokens);
  });
};


Compiler.prototype.tokenize = function (source, callback) {
  var tokens = [];

  var in_jsdoc = false;
  var in_command = false;

  var buf = '';
  while (source.length !== 0) {
    var character = source[0];
    buf += character;
    source = source.substr(1);

    switch (character) {
    case '{':
      if (!in_command && !in_jsdoc) {
        if (buf.length > 1) {
          tokens.push({ source: buf.substr(0, buf.length - 1), type: 'code' });
          buf = buf.substr(buf.length - 1);
        }
        in_command = true;
      }
      break;
    case '}':
      if (in_command) {
        tokens.push({ source: buf, type: 'command' });
        in_command = false;
        buf = '';
      }
      break;
    }

    if (in_jsdoc && buf.substr(buf.length - 2) === '*/') {
      tokens.push({ source: buf, type: 'jsdoc' });
      in_jsdoc = false;
      buf = '';
    }

    if (buf.substr(buf.length - 3) === '/**') {
      if (!in_jsdoc) {
        if (buf.length > 3) {
          tokens.push({ source: buf.substr(0, buf.length - 3), type: 'code' });
          buf = buf.substr(buf.length - 3);
        }
        in_jsdoc = true;
      }
    }
  }

  return tokens;
};


Compiler.prototype.filterTokens_ = function (tokens) {
  tokens.forEach(function (token) {
    if (token.type === 'code') {
      token.source = token.source.replace(/\s+\n+\s+|\n+\s+|\s+\n+/g, '');
      token.source = token.source.replace(/\s+/g, ' ');
    }
    token.source = token.source.replace(/^\n+|\n+$/g, '');
  });

  tokens = tokens.filter(function (token) {
    return (token.source.length !== 0);
  });

  var result = '';
  tokens.forEach(function (token) {
    result += token.source;
  });
  console.log(result);

  return tokens;
};


module.exports = Compiler;
