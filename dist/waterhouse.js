!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.waterhouse=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var vm = require( "vm" );
var eff = require( "eff" );

var wrappers = {};

var range = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

var effNoop = eff( function() {} );

var extend = function ( target ) {
  var sources = [].slice.call( arguments, 1 );
  sources.forEach( function ( source) {
    Object.keys( source ).forEach( function ( key ) {
      target[key] = source[key];
    });
  })
  return target;
};

var makeArgString = function ( n ) {
  var ret = [];
  var i = -1;
  while ( ++i < n ) {
    ret.push( String.fromCharCode( i % 26 + 97 ) );
  }
  return ret.join( ", " );
};

var makeWrapperCode = function ( n ) {
  return [
    "var wrap",
    String( n ).toUpperCase(),
    "= function (fn) { return function (",
    makeArgString( n ),
    ") { return fn.apply(this, arguments); }; };"
  ].join( "" );
};

var code = range.map( makeWrapperCode ).join( "" ) +
  "var funcProto = Function.prototype, FuncCtor = Function;";

var context = vm.createContext();
vm.runInContext( code, context );
var funcProto = context.funcProto;
var FuncCtor = context.FuncCtor;

var wrappers = range.map( function ( i ) {
  return context["wrap" + i]
});

var isOtheFunc = function ( fn ) {
  return ( typeof fn === "function" ) && ( fn instanceof FuncCtor );
};

var isRegFunc = function ( fn ) {
  return ( typeof fn === "function" ) && ( fn instanceof Function );
};

var wrap = function ( fn ) {
  if ( !wrappers[fn.length] ) {
    throw new RangeError( "Function takes too many arguments." );
  }
  return wrappers[fn.length]( fn );
};

var wrapToLength = function ( len, fn ) {
  if ( !wrappers[len] ) {
    throw new RangeError( "Invalid wrapping length." );
  }
  return wrappers[len]( fn );
};

var waterhouse = module.exports = function ( fn ) {
  return wrapToLength( fn.length, function () {
    var ret = fn.apply( this, arguments );
    if ( isRegFunc( ret ) ) {
      return waterhouse( ret )
    }
    return ret;
  });
};

var methods = {};

Object.keys( effNoop ).forEach( function ( key ) {
  funcProto[key] = waterhouse( effNoop[key] );

  methods[key] = function ( fn ) {
    var args = new Array( arguments.length - 1 );
    for ( var i = 1; i < arguments.length; i++ ) {
      args[i - 1] = arguments[i];
    }
    var w = waterhouse( fn );
    return w[key].apply( w, args );
  };

});

extend( waterhouse, methods, {
  FuncCtor: FuncCtor,
  funcProto: funcProto,
  extend: function ( source ) {
    return extend( funcProto, source );
  }
});

},{"eff":12,"vm":2}],2:[function(require,module,exports){
var indexOf = require('indexof');

var Object_keys = function (obj) {
    if (Object.keys) return Object.keys(obj)
    else {
        var res = [];
        for (var key in obj) res.push(key)
        return res;
    }
};

var forEach = function (xs, fn) {
    if (xs.forEach) return xs.forEach(fn)
    else for (var i = 0; i < xs.length; i++) {
        fn(xs[i], i, xs);
    }
};

var defineProp = (function() {
    try {
        Object.defineProperty({}, '_', {});
        return function(obj, name, value) {
            Object.defineProperty(obj, name, {
                writable: true,
                enumerable: false,
                configurable: true,
                value: value
            })
        };
    } catch(e) {
        return function(obj, name, value) {
            obj[name] = value;
        };
    }
}());

var globals = ['Array', 'Boolean', 'Date', 'Error', 'EvalError', 'Function',
'Infinity', 'JSON', 'Math', 'NaN', 'Number', 'Object', 'RangeError',
'ReferenceError', 'RegExp', 'String', 'SyntaxError', 'TypeError', 'URIError',
'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'escape',
'eval', 'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'undefined', 'unescape'];

function Context() {}
Context.prototype = {};

var Script = exports.Script = function NodeScript (code) {
    if (!(this instanceof Script)) return new Script(code);
    this.code = code;
};

Script.prototype.runInContext = function (context) {
    if (!(context instanceof Context)) {
        throw new TypeError("needs a 'context' argument.");
    }
    
    var iframe = document.createElement('iframe');
    if (!iframe.style) iframe.style = {};
    iframe.style.display = 'none';
    
    document.body.appendChild(iframe);
    
    var win = iframe.contentWindow;
    var wEval = win.eval, wExecScript = win.execScript;

    if (!wEval && wExecScript) {
        // win.eval() magically appears when this is called in IE:
        wExecScript.call(win, 'null');
        wEval = win.eval;
    }
    
    forEach(Object_keys(context), function (key) {
        win[key] = context[key];
    });
    forEach(globals, function (key) {
        if (context[key]) {
            win[key] = context[key];
        }
    });
    
    var winKeys = Object_keys(win);

    var res = wEval.call(win, this.code);
    
    forEach(Object_keys(win), function (key) {
        // Avoid copying circular objects like `top` and `window` by only
        // updating existing context properties or new properties in the `win`
        // that was only introduced after the eval.
        if (key in context || indexOf(winKeys, key) === -1) {
            context[key] = win[key];
        }
    });

    forEach(globals, function (key) {
        if (!(key in context)) {
            defineProp(context, key, win[key]);
        }
    });
    
    document.body.removeChild(iframe);
    
    return res;
};

Script.prototype.runInThisContext = function () {
    return eval(this.code); // maybe...
};

Script.prototype.runInNewContext = function (context) {
    var ctx = Script.createContext(context);
    var res = this.runInContext(ctx);

    forEach(Object_keys(ctx), function (key) {
        context[key] = ctx[key];
    });

    return res;
};

forEach(Object_keys(Script.prototype), function (name) {
    exports[name] = Script[name] = function (code) {
        var s = Script(code);
        return s[name].apply(s, [].slice.call(arguments, 1));
    };
});

exports.createScript = function (code) {
    return exports.Script(code);
};

exports.createContext = Script.createContext = function (context) {
    var copy = new Context();
    if(typeof context === 'object') {
        forEach(Object_keys(context), function (key) {
            copy[key] = context[key];
        });
    }
    return copy;
};

},{"indexof":3}],3:[function(require,module,exports){

var indexOf = [].indexOf;

module.exports = function(arr, obj){
  if (indexOf) return arr.indexOf(obj);
  for (var i = 0; i < arr.length; ++i) {
    if (arr[i] === obj) return i;
  }
  return -1;
};
},{}],4:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
var arity10;

module.exports = arity10 = function(fn, n) {
  if (!(n > 0)) {
    n = 0;
  }
  if (n === 0) {
    return function() {
      return fn.call(this);
    };
  } else if (n === 1) {
    return function(a) {
      return fn.apply(this, arguments);
    };
  } else if (n === 2) {
    return function(a, b) {
      return fn.apply(this, arguments);
    };
  } else if (n === 3) {
    return function(a, b, c) {
      return fn.apply(this, arguments);
    };
  } else if (n === 4) {
    return function(a, b, c, d) {
      return fn.apply(this, arguments);
    };
  } else if (n === 5) {
    return function(a, b, c, d, e) {
      return fn.apply(this, arguments);
    };
  } else if (n === 6) {
    return function(a, b, c, d, e, f) {
      return fn.apply(this, arguments);
    };
  } else if (n === 7) {
    return function(a, b, c, d, e, f, g) {
      return fn.apply(this, arguments);
    };
  } else if (n === 8) {
    return function(a, b, c, d, e, f, g, h) {
      return fn.apply(this, arguments);
    };
  } else if (n === 9) {
    return function(a, b, c, d, e, f, g, h, i) {
      return fn.apply(this, arguments);
    };
  } else if (n === 10) {
    return function(a, b, c, d, e, f, g, h, i, j) {
      return fn.apply(this, arguments);
    };
  } else {
    throw new RangeError("Function must take 10 or fewer arguments");
  }
};

},{}],5:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
module.exports = require("./arity-10");

},{"./arity-10":4}],6:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
var binary, nAry;

nAry = require("./n-ary");

module.exports = binary = function(fn) {
  return nAry(fn, 2);
};

},{"./n-ary":15}],7:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
var arity, copy;

arity = require("./arity");

module.exports = copy = function(fn) {
  var func;
  func = function() {
    return fn.apply(this, arguments);
  };
  return arity(func, fn.length);
};

},{"./arity":5}],8:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
var arity, curry;

arity = require("./arity");

module.exports = curry = function(fn) {
  var arg, curried, i, len, outer, _i, _len;
  len = arguments.length - 1;
  outer = new Array(len);
  for (i = _i = 0, _len = arguments.length; _i < _len; i = ++_i) {
    arg = arguments[i];
    if (i > 0) {
      outer[i - 1] = arg;
    }
  }
  curried = function() {
    var args, j, outerArg, outerLen, _j, _k, _len1, _len2;
    outerLen = outer.length;
    len = arguments.length + outerLen;
    args = new Array(len);
    for (i = _j = 0, _len1 = outer.length; _j < _len1; i = ++_j) {
      outerArg = outer[i];
      args[i] = outerArg;
    }
    for (j = _k = 0, _len2 = arguments.length; _k < _len2; j = ++_k) {
      arg = arguments[j];
      args[outerLen + j] = arg;
    }
    if (args.length >= fn.length) {
      return fn.apply(this, args);
    } else {
      return curry.apply(null, [fn].concat(args));
    }
  };
  return arity(curried, fn.length - len);
};

},{"./arity":5}],9:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
var arity, demethodize;

arity = require("./arity");

module.exports = demethodize = function(fn, newArity) {
  var func;
  func = function(context) {
    var arg, args, i, _i, _len;
    args = new Array(arguments.length - 1);
    for (i = _i = 0, _len = arguments.length; _i < _len; i = ++_i) {
      arg = arguments[i];
      if (i > 0) {
        args[i - 1] = arg;
      }
    }
    return fn.apply(context, args);
  };
  return arity(func, newArity || fn.length + 1);
};

},{"./arity":5}],10:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
var firstToLast, rotate;

rotate = require("./rotate");

module.exports = firstToLast = function(fn) {
  return rotate(fn, 1);
};

},{"./rotate":19}],11:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
var flip, swap;

swap = require("./swap");

module.exports = flip = function(fn) {
  return swap(fn, 0, 1);
};

},{"./swap":20}],12:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
var decorate, extend, funcs, methods;

funcs = {
  curry: require("./curry"),
  arity: require("./arity"),
  nAry: require("./n-ary"),
  unary: require("./unary"),
  binary: require("./binary"),
  swap: require("./swap"),
  flip: require("./flip"),
  reverse: require("./reverse"),
  partial: require("./partial"),
  partialConstructor: require("./partial-constructor"),
  rotate: require("./rotate"),
  firstToLast: require("./first-to-last"),
  lastToFirst: require("./last-to-first"),
  demethodize: require("./demethodize"),
  copy: require("./copy")
};

methods = {};

Object.keys(funcs).forEach(function(key) {
  return methods[key] = function() {
    var arg, args, i, _i, _len;
    args = new Array(arguments.length + 1);
    args[0] = this;
    for (i = _i = 0, _len = arguments.length; _i < _len; i = ++_i) {
      arg = arguments[i];
      args[i + 1] = arg;
    }
    return funcs[key].apply(null, args);
  };
});

extend = function(target, source) {
  var key;
  for (key in source) {
    target[key] = source[key];
  }
  return target;
};

decorate = function(fn) {
  return extend(fn, methods);
};

module.exports = extend(decorate, funcs);

},{"./arity":5,"./binary":6,"./copy":7,"./curry":8,"./demethodize":9,"./first-to-last":10,"./flip":11,"./last-to-first":13,"./n-ary":15,"./partial":17,"./partial-constructor":16,"./reverse":18,"./rotate":19,"./swap":20,"./unary":21}],13:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
var lastToFirst, rotate;

rotate = require("./rotate");

module.exports = lastToFirst = function(fn) {
  return rotate(fn, 1, -1);
};

},{"./rotate":19}],14:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
var nAry10;

module.exports = nAry10 = function(fn, n) {
  if (!(n > 0)) {
    n = 0;
  }
  if (n === 0) {
    return function() {
      return fn.call(this);
    };
  } else if (n === 1) {
    return function(a) {
      return fn.call(this, a);
    };
  } else if (n === 2) {
    return function(a, b) {
      return fn.call(this, a, b);
    };
  } else if (n === 3) {
    return function(a, b, c) {
      return fn.call(this, a, b, c);
    };
  } else if (n === 4) {
    return function(a, b, c, d) {
      return fn.call(this, a, b, c, d);
    };
  } else if (n === 5) {
    return function(a, b, c, d, e) {
      return fn.call(this, a, b, c, d, e);
    };
  } else if (n === 6) {
    return function(a, b, c, d, e, f) {
      return fn.call(this, a, b, c, d, e, f);
    };
  } else if (n === 7) {
    return function(a, b, c, d, e, f, g) {
      return fn.call(this, a, b, c, d, e, f, g);
    };
  } else if (n === 8) {
    return function(a, b, c, d, e, f, g, h) {
      return fn.call(this, a, b, c, d, e, f, g, h);
    };
  } else if (n === 9) {
    return function(a, b, c, d, e, f, g, h, i) {
      return fn.call(this, a, b, c, d, e, f, g, h, i);
    };
  } else if (n === 10) {
    return function(a, b, c, d, e, f, g, h, i, j) {
      return fn.call(this, a, b, c, d, e, f, g, h, i, j);
    };
  } else {
    throw new RangeError("Function must take 10 or fewer arguments");
  }
};

},{}],15:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
module.exports = require("./n-ary-10");

},{"./n-ary-10":14}],16:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
var arity, partialConstructor;

arity = require("./arity");

module.exports = partialConstructor = function(Ctor) {
  var arg, func, i, len, outer, _i, _len;
  len = arguments.length - 1;
  outer = new Array(len);
  for (i = _i = 0, _len = arguments.length; _i < _len; i = ++_i) {
    arg = arguments[i];
    if (i > 0) {
      outer[i - 1] = arg;
    }
  }
  func = function() {
    var args, obj, outerArg, outerLen, result, _j, _k, _len1, _len2;
    outerLen = outer.length;
    len = arguments.length + outer.length;
    args = new Array(len);
    for (i = _j = 0, _len1 = outer.length; _j < _len1; i = ++_j) {
      outerArg = outer[i];
      args[i] = outerArg;
    }
    for (i = _k = 0, _len2 = arguments.length; _k < _len2; i = ++_k) {
      arg = arguments[i];
      args[outerLen + i] = arg;
    }
    obj = Object.create(Ctor.prototype);
    result = Ctor.apply(obj, args);
    if (result && typeof result === "object" || typeof result === "function") {
      return result;
    } else {
      return obj;
    }
  };
  return arity(func, Ctor.length - outer.length);
};

},{"./arity":5}],17:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
var arity, partial;

arity = require("./arity");

module.exports = partial = function(fn) {
  var arg, func, i, len, outer, _i, _len;
  len = arguments.length - 1;
  outer = new Array(len);
  for (i = _i = 0, _len = arguments.length; _i < _len; i = ++_i) {
    arg = arguments[i];
    if (i > 0) {
      outer[i - 1] = arg;
    }
  }
  func = function() {
    var args, outerArg, outerLen, _j, _k, _len1, _len2;
    outerLen = outer.length;
    len = arguments.length + outer.length;
    args = new Array(len);
    for (i = _j = 0, _len1 = outer.length; _j < _len1; i = ++_j) {
      outerArg = outer[i];
      args[i] = outerArg;
    }
    for (i = _k = 0, _len2 = arguments.length; _k < _len2; i = ++_k) {
      arg = arguments[i];
      args[outerLen + i] = arg;
    }
    return fn.apply(this, args);
  };
  return arity(func, fn.length - outer.length);
};

},{"./arity":5}],18:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
var arity, reverse;

arity = require("./arity");

module.exports = reverse = function(fn) {
  var func;
  func = function() {
    var arg, args, i, len, _i;
    len = arguments.length;
    args = new Array(len);
    for (i = _i = arguments.length - 1; _i >= 0; i = _i += -1) {
      arg = arguments[i];
      args[len - i - 1] = arg;
    }
    return fn.apply(this, args);
  };
  return arity(func, fn.length);
};

},{"./arity":5}],19:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
var arity, rotate;

arity = require("./arity");

module.exports = rotate = function(fn, count, dir) {
  var func;
  if (dir == null) {
    dir = 1;
  }
  if (!(dir === 1 || dir === -1)) {
    throw new RangeError("direction parameter must be 1 or -1");
  }
  func = function() {
    var arg, args, chunk, i, idx, _i, _len;
    args = new Array(arguments.length);
    for (i = _i = 0, _len = arguments.length; _i < _len; i = ++_i) {
      arg = arguments[i];
      args[i] = arg;
    }
    idx = chunk = args.splice((dir === 1 ? 0 : dir * count), count);
    return fn.apply(this, dir === 1 ? args.concat(chunk) : chunk.concat(args));
  };
  return arity(func, fn.length);
};

},{"./arity":5}],20:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
var arity, swap;

arity = require("./arity");

module.exports = swap = function(fn, p1, p2) {
  var func;
  func = function() {
    var a, arg, args, b, i, _i, _len;
    args = new Array(arguments.length);
    for (i = _i = 0, _len = arguments.length; _i < _len; i = ++_i) {
      arg = arguments[i];
      args[i] = arg;
    }
    a = args[p1];
    b = args[p2];
    args[p2] = a;
    args[p1] = b;
    return fn.apply(this, args);
  };
  return arity(func, fn.length);
};

},{"./arity":5}],21:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
var nAry, unary;

nAry = require("./n-ary");

module.exports = unary = function(fn) {
  return nAry(fn, 1);
};

},{"./n-ary":15}]},{},[1])(1)
});