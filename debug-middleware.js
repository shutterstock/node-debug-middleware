exports.debug = function(app, msTimeout){
  msTimeout = msTimeout || 5000;
  exports.shimRoutes(app, msTimeout);
  exports.shimMiddleware(app, msTimeout);
};

exports.shimRoutes = function(app, timeoutMilliseconds) {
  var app_routes = app.routes.routes || app.routes;
  for(var method in app_routes){
    var routes = app_routes[method];
    routes.forEach(function(route){
      for(var i = 0; i < route.callbacks.length; i++){
        var middleware = route.callbacks[i];
        route.callbacks[i] = exports.timeoutFn(middleware, timeoutMilliseconds);
      }
    });
  }
};

exports.shimMiddleware = function(app, timeoutMilliseconds) {
  for(var i in app.stack) {
    var middleware = app.stack[i];
    if(app.router === middleware.handle) continue;
    if(middleware.handle.length != 3) continue;
    middleware.handle = exports.timeoutFn(middleware.handle, timeoutMilliseconds);
  }
};

exports.timeoutFn = function(middleware, timeoutMilliseconds){
  return function(req, res, next) {
    var timeoutId = setTimeout(function() {
      exports.callLogger(middleware, req, res);
    }, timeoutMilliseconds);

    var nextFn = function(err){
      clearTimeout(timeoutId);
      next(err);
    };

    middleware(req, res, nextFn);
  }
};

exports.callLogger = function(middleware, req, res) {
  var logString = [
    "A route middleware took too long to execute: ",
    req.headers.host,
    req.url,
    middleware.toString()
  ].join('');

  console.warn(logString);
};
