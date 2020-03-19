const SuperVis = require('../lib/RiScriptVisitor').RiScriptVisitor;
const Entities = require('he'); // provides decode()

String.prototype.uc = function () {
  return this.toUpperCase();
}

String.prototype.ucf = function () {
  return this[0].toUpperCase() + this.substring(1);
}

class Symbol {
  constructor(text, transforms) {
    this.text = text;
    this.transforms = transforms.map(t => t.getText());
  }
  // interface functions
  getText() { return this.text; }
  accept(ctx) {
    this.text = ctx.context[this.text] || '$' + this.text;
    return ctx.visitTerminal(this);
  }
}

/*
 * This Visitor walks the tree generated by a parser, evaluating
 * each node as it goes
 */
class Visitor extends SuperVis {

  constructor(parent, context, trace) {
    super();
    this.parent = parent;
    this.context = context || {};
    this.trace = trace || false;
  }

  /* visit value and create a mapping in the symbol table */
  visitAssign(ctx) {
    let token = ctx.value();
    let id = this.symbolName(ctx.symbol().getText());
    this.trace && console.log('visitAssign: $' + id + '=' +
      this.flatten(token) + ' tfs=[' + (token.transforms || '') + ']');
    this.context[id] = token ? this.visit(token) : '';
    return ''; // no output on vanilla assign
  }

  /* expand the choices according to specified probabilities */
  visitChoice(ctx) {
    let options = ctx.expr();
    // TODO: should create empty string tokens instead of empty strings
    this.handleEmptyChoices(ctx, options);
    let token = this.randomElement(options);
    if (typeof token === 'string') {
      this.trace && console.log('visitChoice: "' + token + '"', options);
      return token; // fails for transforms on empty string
    } else {
      token.transforms = this.inheritTransforms(token, ctx);
      this.trace && console.log('visitChoice: ' + this.flatten(token),
        "tfs=" + (token.transforms || "[]"));
      return this.visit(token);
    }
  }

  /* simply visit the resolved symbol, don't reparse */
  visitSymbol(ctx) { // TODO: remove symbol class
    let ident = ctx.ident().getText()
      .replace(/^\$/, '') // strip $
      .replace(/[}{]/g, ''); // strip {}

    //let symbol = new Symbol(ident, ctx.transform());
    this.trace && console.log('visitSymbol: $' + ident
      + ' tfs=[' + (ctx.transform() || '') + ']');

    let text = this.context[ident] || '$' + ident;

    // TODO: what if we get choice or symbol or here ...
    // need to visit, but its not a context, just a string

    return this.visitTerminal(text, ctx.transform());
  }

  visitTerminal(ctx, tforms) {

    //console.log('visitTerminal', typeof ctx, typeof ctx === 'string' ? ctx : ctx.getText(), typeOf(tforms));

    let term = ctx;
    if (typeof ctx.getText === 'function') {
      term = ctx.getText(); 
    }
  
    // if (typeof term !== 'string') throw Error('not a string!! was', typeof term);
    let tfs = tforms || ctx.transforms;

    if (typeof term === 'string') {
      if (term === Visitor.EOF) return '';
      term = term.replace(/\r?\n/, ' '); // no line-breaks

      this.trace && console.log('visitTerminal: "'
        + term + '" tfs=[' + (tfs || '') + ']');

      if (term.includes('$')) {
        if (!RiTa.SILENT && !this.context._silent) {
          console.warn('[WARN] Unresolved symbol(s): ' + term);
        }
        return term + (tfs ? tfs.reduce((acc, val) => acc + 
          (typeof val === 'string' ? val : val.getText()), '') : '');
      }
    } else {
      this.trace && console.log('visitTerminal('+(typeof term)+'): "'
        + JSON.stringify(term) + '" tfs=[' + (tfs || '') + ']');
    }

    term = this.handleTransforms(term, tfs);

    return term;
  }

  /* run the transforms and return the results */
  handleTransforms(obj, transforms) {
    let term = obj;
    if (transforms) {
      let tfs = this.trace ? '' : null; // debugging
      for (let i = 0; i < transforms.length; i++) {
        let transform = transforms[i];
        transform = (typeof transform === 'string') ? transform : transform.getText();

        this.trace && (tfs += transform); // debugging
        let comps = transform.split('.');
        for (let j = 1; j < comps.length; j++) {
          if (comps[j].endsWith(Visitor.FUNCTION)) {
            comps[j] = comps[j].substring(0, comps[j].length - 2);
            if (typeof term[comps[j]] === 'function') {
              term = term[comps[j]]();
            }
            else {
              throw Error('Expecting ' + term + '.' + comps[j] + ' to be a function');
            }
          } else if (term.hasOwnProperty(comps[j])) { // property
            term = term[comps[j]];
          } else {
            term = term + '.' + comps[j]; // no-op
          }
        }
      }
      this.trace && (typeof obj !== 'string' || obj.trim().length) 
        && console.log('handleTransforms: ' + obj + tfs + ' -> ' + term);
    }
    return term;
  }

  // Visits a leaf node and returns a string
  // visitTerminal(ctx) {
  //
  //   let term = ctx.getText();
  //
  //   //console.log('visitTerminal', typeof ctx, typeof ctx.getText());
  //
  //   if (term === Visitor.EOF) return '';
  //   //if (/ *\r?\n */.test(term)) return '';
  //
  //   if (typeof term === 'string') term = term.replace(/\r?\n/, ' '); // no line-breaks
  //
  //   this.trace && console.log('visitTerminal: "' + term + '" ' + (ctx.transforms || "[]"));
  //
  //   // handle associated transforms
  //   if (ctx.transforms && ctx.transforms.length && (typeof term !== 'string' || term.length)) {
  //     term = this.handleTransforms(term, ctx);
  //   }
  //   this.trace && console.log('            -> "'+term+'"');
  //
  //   // Warn on unresolved symbols
  //   if (typeof term === 'string' && term.includes('$')) {
  //     if (!RiTa.SILENT && !this.context._silent) {
  //       console.warn('[WARN] Unresolved symbol(s): ' + term);
  //     }
  //   }
  //
  //   return term;
  // }

  /*visit(ctx) { // not used
    return Array.isArray(ctx) ?
      ctx.map(function(child) {
        return child.accept(this);
      }, this) : ctx.accept(this);
  }*/

  //   //this.trace && console.log('2. $' + ident + ' -> ' + ctx.getText(), trans.length);
  //
  //   //console.log('got: '+res);
  //   //console.log(Object.keys(ctx));
  //   // res = this.handleTransforms(res, ctx);
  //   // console.log('2. $' + ident + ' -> ' + res);
  //
  //   return ctx.getText();//this.visitTerminal(res);
  //   // let symbol = new Symbol(ident, trans);
  //   // this.trace && console.log('visitSymbol: $' +
  //   //   symbol.text + ' ' + (symbol.transforms || "[]"));
  //   // return this.visit(symbol);
  // }

  /* simply visit the resolved symbol
  visitSymbolNew(ctx) {
    let ident = ctx.ident().getText()
      .replace(/^\$/, '') // strip $
      .replace(/[}{]/g, ''); // strip {}
  
    if (this.context.hasOwnProperty(ident)) {
      let resolved = this.context[ident];
      ctx = this.visit(resolved);
    }
    this.trace && console.log('visitSymbol: $' +
      ctx.getText() + ' ' + (ctx.transforms || "[]"));
  
    // TODO: handle transforms
    //let term = this.handleTransforms(term, ctx);
  
    return ctx.getText();
  }*/

  /* whenever we resolve a symbol we start a new parse on the result
  visitSymbolReparse(ctx) {
    //console.log(Object.keys(ctx), ctx.getText(), this.flatten(ctx.children));
    let ident = ctx.ident().getText()
      .replace(/^\$/, '') // strip $
      .replace(/[}{]/g, ''); // strip {}
    let trans = ctx.transform();
    let res = '$' + ident;
  
    if (this.context.hasOwnProperty(ident)) {
      let resolved = this.context[ident];
  
      if (trans && trans.length) {
        resolved = '(' + resolved + ')';
        for (var i = 0; i < trans.length; i++) {
          resolved += trans[i].getText();
        }
      }
      //this.trace && console.log('\n');
      this.trace && console.log('reparse: ' + resolved);
      res = this.parent.lexParseVisit(resolved, this.context, this.trace);
      //this.trace && console.log('1. $' + ident + ' -> ' + res, trans.length);
      return res;
    }
    return ctx.getText();
  }*/

  // Entry point for tree visiting
  start(ctx) {
    let result = this.visitScript(ctx).trim();
    return Entities.decode(result.replace(/ +/g, ' '))
      .replace(/[\t\v\f\u00a0\u2000-\u200b\u2028-\u2029\u3000]+/g, ' ');
  }
  //
  // compile(ctx) {
  //   //this.symbolTable = {}; // use context
  //   this.start(ctx);
  // }

  // ---------------------- Helpers ---------------------------

  symbolName(text) {
    return (text.length && text[0] === Visitor.SYM) ? text.substring(1) : text;
  }

  getRuleName(ctx) {
    return ctx.hasOwnProperty('symbol') ?
      this.parent.lexer.symbolicNames[ctx.symbol.type] :
      this.parent.parser.ruleNames[ctx.ruleIndex];
  }

  countChildRules(ctx, ruleName) {
    let count = 0;
    for (let i = 0; i < ctx.getChildCount(); i++) {
      if (this.getRuleName(ctx.getChild(i)) === ruleName) count++;
    }
    return count;
  }

  printChildren(ctx) {
    for (let i = 0; i < ctx.getChildCount(); i++) {
      let child = ctx.getChild(i);
      console.log(i, child.getText(), this.getRuleName(child));
    }
  }

  flatten(toks) {
    if (!Array.isArray(toks)) toks = [toks];
    return toks.reduce((acc, t) => acc += '[' + this.getRuleName(t) + ':' + t.getText() + ']', '');
  }

  flattenChoice(toks) {
    if (!Array.isArray(toks)) toks = [toks];
    return toks.reduce((acc, t) => acc += '[' + this.getRuleName(t) + ':' + t.getText() + ']', 'choice: ');
  }

  appendToArray(orig, adds) {
    return (adds && adds.length) ? (orig || []).concat(adds) : orig;
  }

  setTransforms(token, ctx) {
    let newTransforms = ctx.transform().map(t => t.getText());
    newTransforms = this.appendToArray(newTransforms, ctx.transforms);
    token.transforms = this.appendToArray(token.transforms, newTransforms);
  }

  inheritTransforms(token, ctx) {
    let newTransforms = ctx.transform().map(t => t.getText());
    newTransforms = this.appendToArray(newTransforms, ctx.transforms);
    return this.appendToArray(token.transforms, newTransforms);
  }

  handleEmptyChoices(ctx, options) {
    let ors = this.countChildRules(ctx, Visitor.OR);
    let exprs = this.countChildRules(ctx, "expr");
    let adds = (ors + 1) - exprs;
    for (let i = 0; i < adds; i++) options.push(""); // should be token
  }

  randomElement(arr) {
    return arr[Math.floor((Math.random() * arr.length))];
  }

  visitChildren(ctx) {
    return ctx.children.reduce((acc, child) => {
      child.transforms = ctx.transforms;
      return acc + this.visit(child);
    }, '');
  }
}

function typeOf(o) {
  if (typeof o !== 'object') return typeof o;
  return Array.isArray(o) ? 'array' : 'object';
}

Visitor.LP = '(';
Visitor.RP = ')';
Visitor.OR = 'OR';
Visitor.SYM = '$';
Visitor.EOF = '<EOF>';
Visitor.ASSIGN = '[]';
Visitor.SASSIGN = '{}';
Visitor.FUNCTION = '()';

module.exports = Visitor;
