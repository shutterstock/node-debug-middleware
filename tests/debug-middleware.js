var express = require('express');
var mocha   = require('mocha');
var chai    = require('chai');
var sinon   = require('sinon');
var request = require('supertest');
var expect  = chai.expect;
require('mocha-sinon');
chai.use(require('sinon-chai'));

var subject = require('../debug-middleware');

describe("debug-middleware", function() {
  var app, canary, shimSpy, fakeShim;

  describe("unit tests", function() {
    beforeEach(function() {
      app = express();
      app.disable('x-powered-by');

      canary = function() {
        throw new Error("This should not be called");
      };

      shimSpy = sinon.spy();

      fakeShim = function(req, res, next) {
        shimSpy();
        res.send('shimmed');
      };
    });

    describe(".shimMiddleware", function() {
      var first, second, shimSpy, fakeShim;

      beforeEach(function() {
        first   = function first(req, res, next) { process.nextTick(canary); };
        second  = function first(req, res, next) { process.nextTick(canary); };

        shimSpy = sinon.spy();
        fakeShim = function(req, res, next) {
          shimSpy();
          next();
        };
      });

      it("replaces all middleware with the timeoutFn shim", function(done) {
        this.sinon.stub(subject, 'timeoutFn').returns(fakeShim);

        app.use(first);
        app.use(second);

        app.get('/', function(req, res, next){
          res.end('ok');
        });

        subject.shimMiddleware(app);

        expect(subject.timeoutFn).to.have.been.calledWith(first);
        expect(subject.timeoutFn).to.have.been.calledWith(second);

        request(app)
          .get('/')
          .end(function(err, res){
            expect(res.status).to.equal(200);
            expect(res.text).to.equal('ok');
            expect(shimSpy).to.have.been.called;
            done(err);
          });
      });

      it("does not replace the router", function() {
        this.sinon.stub(subject, 'timeoutFn');

        app.get('/', function(req, res, next){
          res.send('ok');
        });

        subject.shimMiddleware(app);

        var handlers = app.stack.map(function(middleware){ return middleware.handle });

        expect(handlers).to.contain(app.router);
      });

      it("does not replace error handlers", function() {
        this.sinon.stub(subject, 'timeoutFn');

        var errorHandler = function(err, req, res, next) {
          next();
        };

        app.use(errorHandler);

        subject.shimMiddleware(app);

        var handlers = app.stack.map(function(middleware){ return middleware.handle });

        expect(handlers).to.contain(errorHandler);
      });

      it("passes its timeout to the timeoutFn", function() {
        this.sinon.spy(subject, 'timeoutFn');

        var timeout = 5;
        subject.shimMiddleware(app, timeout);

        expect(subject.timeoutFn).to.have.been.called;
      });
    });

    describe(".shimRoutes", function() {
      var first, second;

      beforeEach(function() {
        first   = function first(req, res, next) { process.nextTick(canary) }
        second  = function first(req, res, next) { process.nextTick(canary) }

        this.sinon.stub(subject, 'timeoutFn').returns(function(res, res, next){
          res.send('shimmed')
        });
      });

      it("replaces all routes with the timeoutFn shim", function(done) {
        app.get('/something', first);
        app.post('/another', second);

        subject.shimRoutes(app);

        expect(subject.timeoutFn).to.have.been.calledWith(first);
        expect(subject.timeoutFn).to.have.been.calledWith(second);

        request(app)
          .get('/something')
          .end(function(err, res){
            expect(res.status).to.equal(200);
            expect(res.text).to.equal('shimmed');
            done();
          });
      });

      it("does not replace the router", function() {
        app.get('/', function(req, res, next) { res.send('unused'); });

        subject.shimRoutes(app);

        var handlers = app.stack.map(function(middleware){ return middleware.handle });

        expect(handlers).to.contain(app.router);
      });
    });

    describe(".debug", function() {
      beforeEach(function() {
        this.sinon.spy(subject, 'shimRoutes');
        this.sinon.spy(subject, 'shimMiddleware');
      });

      describe("when no timeout is specified", function() {
        it("calls shimmers with a default timeout", function() {
          var defaultTimeout = 5000;
          subject.debug(app);
          expect(subject.shimMiddleware).to.have.been.calledWith(app, defaultTimeout);
          expect(subject.shimMiddleware).to.have.been.calledWith(app);
        });
      });

      describe("when a timeout is specified", function() {
        it("calls shimmers with the timeout provided", function() {
          var timeout = 1000;

          subject.debug(app, timeout);
          expect(subject.shimMiddleware).to.have.been.calledWith(app, timeout);
          expect(subject.shimMiddleware).to.have.been.calledWith(app, timeout);
        });
      });

      it("calls shimRoutes with the app", function() {
        subject.debug(app);

        expect(subject.shimRoutes).to.have.been.calledWith(app);
      });

      it("calls shimMiddleware with the app", function() {
        subject.debug(app);

        expect(subject.shimMiddleware).to.have.been.calledWith(app);
      });

      it("does not replace the router", function() {
        this.sinon.stub(subject, 'timeoutFn');

        app.get('/', function(req, res, next){
          res.send('ok');
        });

        subject.debug(app);

        var handlers = app.stack.map(function(middleware){ return middleware.handle });

        expect(handlers).to.contain(app.router);
      });
    });

    describe(".timeoutFn", function() {
      beforeEach(function() {
        this.sinon.stub(subject, 'callLogger');
      });

      describe("and the middleware finishes fast enough", function() {
        it("executes normally without logging", function(done) {
          var fakeWork = sinon.spy();

          var fakeMiddleware = function(req, res, next) {
            process.nextTick(function() {
              fakeWork();
              next();
            });
          };

          var timedoutFn = subject.timeoutFn(fakeMiddleware, 10);

          var fakeReq, fakeRes;
          timedoutFn(fakeReq, fakeRes, function(){
            setTimeout(function() {
              expect(subject.callLogger).to.not.have.been.called;
              expect(fakeWork).to.have.been.called;
              done();
            },50);
          });
        });
      });

      describe("and the middleware takes too long", function() {
        it("logs a message with the request metadata", function(done) {
          var fakeWork = sinon.spy();

          var fakeMiddleware = function(req, res, next) {
            setTimeout(function() {
              fakeWork();
              next();
            }, 50);
          };

          var timedoutFn = subject.timeoutFn(fakeMiddleware, 10);

          var fakeReq = {}, fakeRes = {};
          timedoutFn(fakeReq, fakeRes, function(){
            expect(subject.callLogger).to.have.been.calledWith(fakeMiddleware, fakeReq, fakeRes);
            expect(fakeWork).to.have.been.called;
            done();
          });
        });
      });

      describe.skip("and the request handler finishes fast enough", function() {
      });

      describe.skip("and the request handler takes too long", function() {
        it("logs a message with the request metadata", function(done) {
          var fakeWork = sinon.spy();

          app.get('/slow', function(req, res, next) {
            setTimeout(function() {
              fakeWork();
              res.send('ok');
            }, 50);
          });

          var timedoutFn = subject.timeoutFn(fakeHandler, 10);

          var fakeReq = {}, fakeRes = {};
          timedoutFn(fakeReq, fakeRes, function(){
            expect(subject.callLogger).to.have.been.calledWith(fakeHandler, fakeReq, fakeRes);
            expect(fakeWork).to.have.been.called;
            done();
          });
        });
      });
    });

    describe(".callLogger", function() {
      it("logs information", function() {
        this.sinon.spy(console, 'warn');

        function fakeMiddleware(req, res, next) {
          next();
        }

        var fakeReq = {
          method: 'GET',
          url: '/some/path?this=that',
          headers: {
            host: 'example.com'
          }
        };
        var fakeRes = {};

        subject.callLogger(fakeMiddleware, fakeReq, fakeRes);

        expect(console.warn).to.have.been.called;

        var logString = console.warn.lastCall.args[0];

        expect(logString).to.match(/took too long/);
        expect(logString).to.match(/GET example\.com\/some\/path\?this=that/);
        expect(logString).to.match(/function fakeMiddleware/);
      });
    });
  });

  describe("integration tests", function() {
    describe("when a route handler is fast enough", function() {
      it("does not log the route handler", function(done) {
        var routeWork = this.sinon.spy();

        app.get('/fastRoute', function(req, res, next) {
          setTimeout(function() {
            routeWork();
            res.send('ok');
          },5);
        });

        var waitMs = 10;
        subject.debug(app, waitMs);

        this.sinon.spy(console, 'warn');

        request(app)
          .get('/fastRoute')
          .end(function(err, res) {
            setTimeout(function(){
              expect(err).to.not.exist;
              expect(res.status).to.equal(200);
              expect(res.text).to.equal('ok');
              expect(routeWork).to.have.been.called;
              expect(console.warn).not.to.have.been.called;

              done();
            }, waitMs*2);
          });
      });
    });

    describe("when a route handler is too slow", function() {
      it("logs the route handler", function(done) {
        var routeWork = this.sinon.spy();

        app.get('/slowRoute', function(req, res, next) {
          setTimeout(function() {
            routeWork();
            res.send('ok');
          },50);
        });

        var waitMs = 10;
        subject.debug(app, waitMs);

        this.sinon.spy(console, 'warn');

        request(app)
          .get('/slowRoute')
          .end(function(err, res) {
            setTimeout(function(){
              expect(err).to.not.exist;
              expect(res.status).to.equal(200);
              expect(res.text).to.equal('ok');
              expect(routeWork).to.have.been.called;
              expect(console.warn).to.have.been.called;

              done();
            }, waitMs*2);
          });
      });
    });
  });
});
