"use strict";

var fs = require('fs');

var config = require('../../bbconfig.js');

// The Node Express request handler for the server side API,

module.exports = function( wifi ) {

  // The map of server commands,
  var server_commands = {};


  wifi.on('connect', function(args) {
    console.log("WIFI.CONNECT");
    broadcast("WIFI.CONNECT");
  });
  wifi.on('disconnect', function(args) {
    console.log("WIFI.DISCONNECT");
    broadcast("WIFI.DISCONNECT");
  });

  // Try and auto-connect to the last wifi,
  wifi.autoConnect( function(result, err) {
    if (err === void 0) {
      console.log(result);
    }
    else {
      console.error(err);
    }
  });


  // Broadcast message to any clients interested in events from
  // the API.
  function broadcast(msg) {

  }

  function completeResponse(return_result, res) {
    // Complete this request with a JSON result,
    res.setHeader('Content-Type', 'application/json');
    res.end( JSON.stringify(return_result) );
  }

  function completeResponseError(error, res) {
    // Complete this request with a JSON result,
    res.setHeader('Content-Type', 'application/json');
    res.end( JSON.stringify( { error: error.toString() } ) );
  }

  // Returns current wifi information,
  server_commands.getWiFiInfo = function(args, req, res) {

    // Query the operating system and fetch the following info,

    // Current connection. This should be cached info that's updated
    // every few seconds,
    var result = {
      network_name: 'Test Wifi Hub',
      security:     'key',
      strength:     7
    };

    completeResponse(result, res);

  }


  // Returns available hotspots,
  server_commands.getWiFiAvailableHubs = function(args, req, res) {

    // Query the operating system and fetch the following info,

    wifi.scan( function(result, err) {

      if (err === void 0) {
        var hotspot_list = result.raw;
        var available_hubs = [];
        var len = hotspot_list.length;
        for (var i = 0; i < len; ++i) {
          var hs = hotspot_list[i];
          var hub = {};
          hub.name = hs.essid;
          hub.security = (hs.encryption === 'on') ? 'key' : 'open';
          hub.strength = parseFloat(hs.strength) * 10;
          available_hubs.push(hub);
        }

        var result = {
          available_hubs: available_hubs
        };

        completeResponse(result, res);
      }
      else {
        completeResponseError(err, res);
      }

    });

//    var result = {
//      available_hubs: [ { name:'TalkTalk 1234',   security:'key',   strength:10 },
//                        { name:'Jimmy\'s Palace', security:'key',   strength:8 },
//                        { name:'BT Host 92RE',    security:'key',   strength:4 },
//                        { name:'BT Host 22PA',    security:'open',  strength:4 },
//                        { name:'TalkTalk 6543',   security:'key',   strength:2 },
//                        { name:'Sky Box 99AZ',    security:'key',   strength:1 },
//                        { name:'Far Away Hub',    security:'open',  strength:1 }
//                      ]
//    };

  }



  // Returns the list of music files from the recording directory,
  server_commands.getFileList = function(args, req, res) {

    // Path of music recordings from config,
    var path = config.recordings_path;

    // Make sure the path ends with '/'
    if (path.charAt(path.length - 1) !== '/') {
      path = path + '/';
    }

    // Read the recordings_path directory,
    fs.readdir(path, function(err, files) {
      if (err) {
        completeResponseError(err, res);
      }
      else {
        var file_details = [];
        var i = 0;
        var len = files.length;
        for (; i < len; ++i) {
          var file = files[i];

          var stat_result = fs.statSync(path + file);

          if (stat_result.isFile()) {
            var fdetail = {};
            fdetail.file = file;
            fdetail.size = stat_result.size;
            fdetail.modtime = stat_result.mtime.getTime();

            file_details.push(fdetail);
          }
        }

        var sort_spec;

        // PENDING: Support other sort specifications here,

        // Sort by last modification time (newest first),
        sort_spec = function(o1, o2) {
          if (o1.modtime < o2.modtime) {
            return 1;
          }
          else if (o1.modtime > o2.modtime) {
            return -1;
          }
          return 0;
        };

        // Sort by the chosen spec,
        file_details.sort( sort_spec );

        // The response,
        var result = { files: file_details };
        completeResponse(result, res);

      }
    });

  };





  // Handles the API requests and responses,
  return function(req, res) {

    // Get the query arguments from the client,
    if (req.body !== void 0) {
      var query = req.body;
      var command = query.cmd;
      var args = query.args;

      var func = server_commands[command];
      if (func !== void 0) {
        func(args, req, res);
        return;
      }

    }

    // Bad request,
    res.setHeader('Content-Type', 'application/json');
    res.status(400).send('{error:"Invalid Request"}');

  }

}
