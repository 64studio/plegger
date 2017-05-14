"use strict";

// Node.js HTTP service for the blue box UI.

var config = require('../../bbconfig');

var express = require('express');
var bodyParser = require('body-parser');
var serverApi = require('./server_api');
var serverDl = require('./server_dl');

var wifiManager = require('./wifi');

var app = express();

// Install some middleware components,

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())


// Redirection middleware. If the requested host name is NOT 'config.landing_host' then
// we are forwarded to the index page.
app.use( function(req, res, next) {
  // If the request is not to the landing host,
  if (req.headers.host !== config.landing_host) {
    // Redirect to where we want to go,
    res.redirect('http://' + config.landing_host + '/');
  }
  else {
    // Continue through the middleware chain,
    next();
  }
});

// Create the wifi object,
var wifi = wifiManager( config.internet_wireless_interface );

// The plegger service API object with wifi,
var plegger_service_api = serverApi( wifi );


// The dynamic URIs,
//app.get('/serv/api', bb_server_api);
app.post('/serv/api', plegger_service_api);
app.get('/serv/play/:filename', serverDl.player);
app.get('/serv/dl/:filename', serverDl.downloader);

// The static files to be served up,
app.use('/', express.static('web'));

// Start the HTTP service,
var http_port = config.http_port;
app.listen(http_port, function () {
  console.log('Service started on port ' + http_port);
});





