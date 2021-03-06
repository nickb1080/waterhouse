var vm = require( "vm" );
var eff = require( "eff" );

var wrappers = {};

var range = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

var noop = Function();

var effed = eff( noop );

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

noop.partialConstructor = function () {
  var Ctor = this;
  var outer = [].slice.call(arguments);
  return function () {
    var args = outer.concat([].slice.call(arguments));
    var obj = Object.create(Ctor.prototype);
    var result = Ctor.apply(obj, args);
    if (result && (typeof result === "object" || typeof result === "function")) {
      return result;
    }
    return obj;
  }
  // return eff.arity( func, Ctor.length - outer.length );
};

/*
  len = arguments.length - 1
  outer = new Array len
  outer[i - 1] = arg for arg, i in arguments when i > 0
  func = ->
    outerLen = outer.length
    len = arguments.length + outer.length
    args = new Array len
    args[i] = outerArg for outerArg, i in outer
    args[outerLen + i] = arg for arg, i in arguments
    obj = Object.create Ctor::
    result = Ctor.apply obj, args
    if result and typeof result is "object" or typeof result is "function"
      result
    else
      obj
  arity func, Ctor.length - outer.length
*/


Object.keys( effed ).forEach( function ( key ) {
  
  if (key === "partialConstructor") {
    funcProto.partialConstructor = noop.partialConstructor;

    return;
  }
  
  funcProto[key] = waterhouse( effed[key] );

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
