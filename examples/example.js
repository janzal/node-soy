var soy = require('../');
var fs = require('fs');

var tokenizer = new soy.Tokenizer();
var tokens = tokenizer.tokenize([
		'./example.soy'
	]);

var compiler = new soy.Compiler();
var js = compiler.compileTokens(tokens);

fs.writeFileSync('example.out.js', js, 'utf8');
