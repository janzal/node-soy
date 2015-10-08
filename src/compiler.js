var JSDocParser = require('jsdoc-parser');


var Compiler = function () {
  this.open_commands_ = null;
  this.provides_ = null;
  this.scopes_ = null;
};


Compiler.COMMON_TYPES = [
  'string', 'number', 'boolean', 'function', 'undefined', 'null'
];


Compiler.prototype.compileTokens = function (tokens) {
  this.open_commands_ = [];
  this.provides_ = [];
  this.requires_ = [];
  this.scopes_ = [];
  this.msgs_ = 0;

  var code_chunks = [];

  while (tokens.length) {
    var chunk = this.compileToken_(tokens);
    code_chunks.push(chunk);
  }

  var result = '';
  if (this.provides_.length !== 0) {
    result += this.provides_.map(function (symbol) {
      return 'goog.provide("' + symbol + '");';
    }).join('\n') + '\n\n';
  }
  if (this.requires_.length !== 0) {
    result += this.requires_.map(function (symbol) {
      return 'goog.require("' + symbol + '");';
    }).join('\n') + '\n';
  }
  result += 'goog.require("goog.array");\n\n';
  result += code_chunks.join('');
  return result;
};

Compiler.prototype.compileToken_ = function (tokens) {
  var token = tokens.shift();

  var indentation_level = this.open_commands_.length;
  var indentation = '';
  for (var i = 0; i < indentation_level; ++i) {
    indentation += '  ';
  }

  var output = '';
  switch (token.type) {
  case 'jsdoc':
    output = this.compileJSDocToken_(token);
    break;

  case 'command':
    token = this.parseCommandToken_(token);
    if (token.command == 'msg') {
      var inner_tokens = this.collectInnerTokens_(token, tokens);
      output = this.compileMsgCommandTokens_(inner_tokens);
    } else {
      output = this.compileCommandToken_(token);
    }
    break;

  case 'code':
    output = this.compileCodeToken(token);
    break;

  default:
    throw new Error('Unknown token type: ' + token.type);
  }

  if (output === null) {
    return '';
  }

  if (this.open_commands_.length < indentation_level) {
    indentation_level = this.open_commands_.length;
    indentation = '';
    for (var i = 0; i < indentation_level; ++i) {
      indentation += '  ';
    }
  }

  return indentation + output + '\n';
};


Compiler.prototype.compileJSDocToken_ = function (token) {
  if (this.open_commands_.length !== 0) {
    throw new Error('Unexpected jsdoc: ' + token.source);
  }

  var comment_content = token.source.substr(2, token.source.length - 4);
  var template_jsdoc = JSDocParser.parse(comment_content);
  var jsdoc = '/**';
  if (template_jsdoc.description) {
    jsdoc += '\n * ' + template_jsdoc.description.replace(/\n/g, '\n * ');
  }

  jsdoc += '\n * @param {'
  var template_annotations = template_jsdoc.annotations;
  if (template_annotations['params']) {
    jsdoc += '{ ';
    var requires = this.requires_;
    jsdoc += template_annotations['params'].map(function (param) {
      var composite_type = param.type.substr(1, param.type.length - 2);

      var base_types = this.parseCompositeType_(composite_type);
      base_types.forEach(function (type) {
        if (requires.indexOf(type) === -1) {
          requires.push(type);
        }
      });

      return param.name + ': ' + composite_type;
    }, this).join(', ');
    jsdoc += ' }';
  } else {
    jsdoc += '!Object';
  }
  jsdoc += '} data Data to map to template variables.';

  jsdoc += '\n * @param {!Object.<string, function(string): string>} ' +
      '_helpers Helper functions.'

  jsdoc += '\n * @return {string} Template rendering.'

  return jsdoc + '\n */';
};


/**
 * Parses a command token and stores the result into its fields:
 * – token.closing – true if the token is a closing command
 * – token.command – a command name
 *
 * @param token A command token to parse.
 * @return An updated token object.
 */
Compiler.prototype.parseCommandToken_ = function (token) {
  token.closing = (token.source[1] === '/');
  var match = token.source.substr(token.closing ? 2 : 1).match(/^[a-zA-Z]\w*/);
  token.command = match ? match[0] : null;

  if (!token.closing) {
    var prefix_length = (token.closing ? 2 : 1) + (token.command ? token.command.length + 1: 0);
    token.exp = token.source.substr(prefix_length)
      .trimLeft()
      .replace(/\}$/, '') || null;
  }

  return token;
};


/**
 * Shifts tokens array until a matching closing command token is found.
 *
 * @param command A starting command token.
 * @param tokens Remaining tokens array.
 * @return Tokens found between starting and closing command tokens.
 */
Compiler.prototype.collectInnerTokens_ = function (token, tokens) {
  var command = token.command;
  var inner = [token];
  do {
    token = tokens.shift();
    if (token.type == 'command') {
      token = this.parseCommandToken_(token);
    }
    inner.push(token);
  } while (token.command != command);
  return inner;
};


Compiler.prototype.compileCommandToken_ = function (token) {
  var closing = token.closing;
  var command = token.command;
  var prefix_length = (closing ? 2 : 1) + (command ? command.length : 0);

  command = command || 'print';

  if (!closing) { // command start
    // "{" + command + "\s"
    return this.compileCommandStart_(command, token.exp);

  } else { // command end
    // "{/" + command + "}"
    if (token.source.length > prefix_length + 1) {
      throw new Error(
          'Syntax Error: Closing commands do not accept expressions');
    }

    var last_open_command = this.open_commands_[0];
    if (command !== last_open_command) {
      throw new Error(
          'Syntax Error: Unexpected closing command "' + command + '", ' +
          '"' + last_open_command + '" has not been closed');
    }

    return this.compileCommandEnd_(command);
  }
};


Compiler.prototype.compileCommandStart_ = function (command, exp) {
  var output;
  var block_command = false;

  switch (command) {
  case 'foreach':
    var exp_parts = exp.split(/\s+/);
    if (exp_parts[0][0] !== '$') {
      throw new Error(
          'Syntax Error: {foreach} command expecting a variable name ' +
          'but got "' + exp_parts[0] + '"');
    }
    if (exp_parts[1] !== 'in') {
      throw new Error(
          'SyntaxError: Unexpected token "' + exp_parts[1] + '" in {foreach}');
    }
    if (exp_parts[2][0] !== '$') {
      throw new Error(
          'Syntax Error: {foreach} command expecting a variable name ' +
          'but got "' + exp_parts[2] + '"');
    }
    var source_var = this.compileVariables_(exp_parts[2]);
    output = 'if (' + source_var + ') { goog.array.forEach(' +
        source_var + ', ' +
        'function (' + exp_parts[0].substr(1) + ', index) {';
    this.scopes_.unshift([ exp_parts[0].substr(1) ]);
    block_command = true;
    break;

  case 'if':
    exp = this.compileVariables_(exp);
    output = 'if (' + exp + ') {';
    block_command = true;
    break;

  case 'elseif':
    exp = this.compileVariables_(exp);
    output = '} else if (' + exp + ') {';
    break;

  case 'else':
    if (exp) {
      throw new Error('SyntaxError: {else} does not accept expressions.');
    }
    output = '} else {';
    break;

  case 'print':
    exp = this.compileVariables_(exp);
    output = 'rendering += String(' + exp + ').replace(/(<(?!a|\\/a|strong|\\/strong|b|\\/b)([^>]+)>)/ig,"");';
    break;

  case 'printWithBlessFromDevil':
  case 'dangerousPrint':
    exp = this.compileVariables_(exp, false);
    output = 'rendering += ' + exp + ';';
    break;

  case 'dump':
    compiledExp = this.compileVariables_(exp);
    escapedExp = exp.replace(/\'/g, '\\\'');
    output = 'console.debug(\'"' + escapedExp + '"  =>\', ' + compiledExp + ');';
    break;

  case 'debugger':
    output = 'debugger;'
    break;

  case 'template':
    output = exp + ' = function (data, _helpers) { var rendering = "";';
    block_command = true;

    var ns = exp.replace(/\.\w+$/, '');
    if (this.provides_.indexOf(ns) === -1) {
      this.provides_.push(ns);
    }
    break;
  }

  if (block_command) {
    this.open_commands_.unshift(command);
  }

  return output;
};


Compiler.prototype.compileCommandEnd_ = function (command) {
  var output;

  switch (command) {
  case 'foreach':
    output = '}); }';
    this.scopes_.shift();
    break;
  case 'if':
    output = '}';
    break;
  case 'template':
    output = 'return rendering; };';
    break;
  default:
    throw new Error(
        'Syntax Error: Unexpected closing command "' + command + '"');
  }

  this.open_commands_.shift();
  return output;
};


Compiler.prototype.compileMsgCommandTokens_ = function (tokens) {
  var msg = this.createMsgFromTokens_(tokens);

  var indentation_level = this.open_commands_.length;
  var indentation = '';
  for (var i = 0; i < indentation_level; ++i) {
    indentation += '  ';
  }

  var source = this.createMsgSource_(msg);

  return source + '\n' +
    indentation + 'rendering += MSG_UNNAMED_' + msg.id + ';';
};


/**
 * Parses a command token into a map of its attributes.
 *
 * @param token A starting command token.
 * @return A map of attributes.
 */
Compiler.prototype.parseCommandAttributes_ = function (token) {
  var source = token.source;
  var attributes = {};

  var in_key = false;
  var in_value = false;
  var quote = '';
  var key = '';

  var buf = '';
  var prev = '';
  while (source.length !== 0) {
    var character = source[0];
    buf += character;
    source = source.substr(1);

    switch (character) {
    case ' ':
      if (!in_key && !in_value) {
        in_key = true;
        buf = '';
      }
      break;

    case '=':
      if (in_key) {
        key = buf.substr(0, buf.length - 1);
        in_key = false;
        in_value = true;
        buf = '';
      }
      break;

    case '"':
    case "'":
      if (in_value) {
        if (!quote) {
          quote = character;
          buf = '';
        } else if (quote == character && prev != '\\') {
          in_value = false;
          attributes[key] = buf.substr(0, buf.length - 1);
          buf = '';
          key = '';
          quote = '';
        }
      }
      break;
    }

    prev = character;
  }

  return attributes;
};


Compiler.prototype.getVariableName_ = function (exp) {
  var name = null;
  if (exp.match(/^\$[a-zA-Z0-9_]+$/)) {
    name = exp.substr(1);

    for (var i = 0; i < name.length; i++) {
      if (i > 0 && name[i] == '_' && name.length > i + 1) {
        name = name.substring(0, i) + name.charAt(i + 1).toUpperCase() + name.substring(i + 2);
      }
    }
  }
  return name;
};


Compiler.prototype.createMsgFromTokens_ = function (tokens) {
  var msg = {};

  var starting = tokens.shift();
  var ending = tokens.pop();

  var attrs = this.parseCommandAttributes_(starting);

  var params = {};

  msg.id = this.msgs_++;

  var text = '';
  var vars = 0;
  for (var i in tokens) {
    var token = tokens[i];
    switch (token.type) {
    case 'code':
      text += token.source.replace("'", "\\'");
      break;

    case 'command':
      if (!token.command == 'print') {
        throw new Error('Command ' + token.command + ' not supported in msg');
      }
      var name = this.getVariableName_(token.exp);
      if (!name) {
        name = 'var_' + (++vars);
      }
      params[name] = this.compileVariables_(token.exp);
      text += '{$' + name + '}';
      break;
    }
  }

  // Replace breaks with placeholders
  var br = (text.indexOf('<br>') !== -1);
  if (br) {
    text = text.replace(/<br>/g, '{$break}');
    params['break'] = "'<br>'";
  }

  // Replace links with placeholders
  var regex = /<a[^>]*>/g;
  var match;
  var i = 1;
  var matches = text.match(regex)
  if (matches) {
    var count = matches.length;
    while (match = regex.exec(text)) {
      var key = count > 1 ? 'startLink_' + i : 'startLink';
      text = text.substr(0, match.index) + '{$' + key + '}' + text.substr(match.index + match[0].length);
      text = text.replace('</a>', '{$endLink}');
      regex.lastIndex = 0;

      // Replace variables in links
      var tag = "'" + match[0] + "'";
      var m;
      var tagregex = new RegExp("{\\$.+}");
      while ((m = tagregex.exec(tag)) != null) {
        var name = m[0].substr(2, m[0].length - 3);
        tag = tag.substr(0, m.index) + "' + " + params[name] + " + '" + tag.substr(m.index + m[0].length);
        if (text.indexOf('{$' + name + '}') === -1) {
          delete params[name];
        }
      }
      params[key] = tag;

      params['endLink'] = "'</a>'";
      i++;
    }
  }

  msg.meaning = attrs.meaning;
  msg.desc = attrs.desc;
  msg.text = text;
  msg.params = params;

  return msg;
};


Compiler.prototype.createMsgSource_ = function (msg) {
  var indentation_level = this.open_commands_.length;
  var indentation = '';
  for (var i = 0; i < indentation_level; ++i) {
    indentation += '  ';
  }

  var source = '';
  source += '\n' + indentation + '/**\n';
  if (msg.meaning) {
    source += indentation + ' * @meaning ' + msg.meaning + '\n';
  }
  source += indentation + ' * @desc ' + msg.desc + '\n';
  source += indentation + ' */\n';
  source += indentation + 'var MSG_UNNAMED_' + msg.id + ' = goog.getMsg(\n';
  source += indentation + "  '" + msg.text + "',\n";
  source += indentation + "  {";

  var first = true;
  for (var key in msg.params) {
    if (!first) {
      source += ',\n   ' + indentation;
    }
    var value = msg.params[key];
    source += "'" + key + "': " + value;
    first = false;
  }

  source += "});\n";

  return source;
};


Compiler.prototype.compileCodeToken = function (token) {
  if (this.open_commands_.length === 0 && /^\s*$/.test(token.source)) {
    return null;
  }

  return 'rendering += "' + token.source.replace(/"/g, '\\"') + '";';
};


Compiler.prototype.compileVariables_ = function (str) {
  var scopes = this.scopes_;
  str = str.replace(/\$([a-zA-Z]\w*)/g, function (match, name) {
    for (var i = 0, ii = scopes.length; i < ii; ++i) {
      var scope = scopes[i];
      if (scope.indexOf(name) !== -1) {
        return name;
      }
    }
    var variableName = 'data.' + name;

    return variableName;
  });

  return str;
};


Compiler.prototype.parseCompositeType_ = function (composite) {
  var types = [];

  var i = 0;
  var len = composite.length;
  var type = '';

  while (i < len) {
    var ch = composite[i++];
    var chc = ch.charCodeAt(0);

    var alphanumeric = (
        chc >= 48 && chc <= 57 ||
        chc >= 65 && chc <= 90 ||
        chc >= 97 && chc <= 122);
    var chaining = (ch === '_' || ch === '.');
    var special = (
        ch === '!' || ch === '<' || ch === '>' || ch === ',' || ch === '|');
    var white = /\s/.test(ch);

    if (alphanumeric || chaining) {
      type += ch;
    } else if (special || white) {
      if (type) {
        type = type.replace(/\.$/, '');
        types.push(type);
        type = '';
      }
    } else {
      throw new Error('Invalid character in composite type "' + ch + '"');
    }
  }

  if (type) {
    type = type.replace(/\.$/, '');
    types.push(type);
  }

  types = this.stripCommonTypes_(types);

  return types;
};


Compiler.prototype.stripCommonTypes_ = function (types) {
  return types.filter(function (type) {
    var primitive = (Compiler.COMMON_TYPES.indexOf(type) !== -1);
    if (primitive) {
      return false;
    }

    var Type = global;
    var levels = type.split('.');
    for (var l = 0, ll = levels.length; l < ll; ++l) {
      Type = Type[levels[l]];
      if (!Type) {
        return true;
      }
    }

    return (typeof Type !== 'function');
  });
};


module.exports = Compiler;
