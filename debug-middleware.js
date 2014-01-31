var express = require('express');

module.exports = {
  debug: function(app, timeoutMilliseconds){
    timeoutMilliseconds = timeoutMilliseconds || 5000;
    for(var i in app.stack) {
      var middleware = app.stack[i];
      if(app.router === middleware.handle || middleware.handle.length > 3 /* error handler */) continue;
      middleware._handle = middleware.handle;
      middleware.handle = timeoutFn(middleware.handle, timeoutMilliseconds);
    }

    var app_routes = app.routes.routes || app.routes;
    for(var method in app_routes){
      var routes = app_routes[method];
      routes.forEach(function(route){
        for(var i = 0; i < route.callbacks.length; i++){
          var middleware = route.callbacks[i];
          route.callbacks[i] = timeoutFn(middleware, timeoutMilliseconds);
        }
      });
    }
  }
}


var timeoutFn = function(middleware, timeoutMilliseconds){
  return function(req, res, next){

    var err;
    if(arguments.length == 4){
      err = arguments[0];
      req = arguments[1];
      res = arguments[2];
      next = arguments[3];
    }

    var timeoutId = setTimeout(function(){
      if(!res.finished){
        var error = new Error("A route middleware took too long to execute: " + req.url + " " + (middleware.name ? ('function name: "' + middleware.name + '"') : '') + " " + middleware.toString());
        var errorHandler = express.errorHandler({ dumpExceptions: true });
        errorHandler(error, req, res);
      }
    }, timeoutMilliseconds);

    var nextFn = function(err){
      clearTimeout(timeoutId);
      next(err);
    };

    if(middleware.length == 4) middleware(err, req, res, nextFn);
    else middleware(req, res, nextFn);
  };
}

