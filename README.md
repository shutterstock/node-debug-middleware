# node-debug-middleware

[![Build Status](https://travis-ci.org/shutterstock/node-debug-middleware.png?branch=master)](https://travis-ci.org/shutterstock/node-debug-middleware)

```shell
npm install debug-middleware
```

Log middleware that does not complete within an allotted amount of time

# Usage

## debug(app, [timeout])

### Arguments

* app - an express app
* timeout (optional) `Number` - Milliseconds to wait for request handlers and middleware to complete.  Defaults to 5000.

Call the middleware debugger after all of your middleware and routes have been defined.

```javascript
var express         = require('express');
var app             = express();
var debugMiddleware = require('debug-middleware');

function slowMiddleware(req, res, next) {
  setTimeout(function() {
    next();
  }, 6000);
}

app.get('/', slowMiddleware, function(req, res, next) {
  res.send('ok');
});

app.on('listening', function() {
  debugMiddleware.debug(app);
});

```

### Output

The following items will be included in the log output:

* The request method
* The request host
* The request path
* The middleware function as a one-line string

Example output:

```
A route middleware took too long to execute:  example.com/some/path?this=that function slowMiddleware(req, res, next) {\n  setTimeout(function() {\n    next();\n  }, 6000);\n}
```

## License

[MIT](LICENSE) © 2017 Shutterstock Images, LLC
