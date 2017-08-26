"use strict";

var fs = require('fs');
var path = require('path');
var util = require('util');
var request = require('request');
var url = require("url");
var spawn = require('child_process').spawn;
var crypto = require('crypto');

var config = require('../../bbconfig.js');
var secrets = require('../../secrets.js');


// The Node Express request handler for the server side API,

module.exports = function( wifi ) {

  // Used for encryption,
  var encryptor;
  // Make an encryptor key
  crypto.randomBytes(20, function(err, buffer) {
    var secret_encryptor_key = buffer.toString('base64');
    encryptor = require('simple-encryptor')(secret_encryptor_key);
  });

  // Server side state
  // -----------------

  // // Stores the MixCloud auth code for the file requested to be
  // // uploaded. We hide this information from the client because
  // // the code gives user account privileges.
  // //
  // // NOTE: This is used to store state between the
  // //   'request upload' and 'actual upload' functions. Another
  // //   option to storing the state server side would be to
  // //   encrypt the code and give it to the client.
  // var auth_code_db = {};

  var currently_uploading = {};

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

    // Current connection. This should be cached info that's updated
    // every few seconds,
    var connect_info = wifi.getWiFiConnectionInfo();
    var result;
    if (connect_info !== null) {
      result = {
        network_name: connect_info.essid,
        security:     connect_info.security,
        strength:     connect_info.strength
      };
    }
    else {
      result = {
        network_name: '',
        security:     '',
        strength:     10
      };
    }



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


  server_commands.connectToWireless = function(args, req, res) {

    // The essid and passphrase entered on the client,
    var essid = args.essid;
    var passphrase = args.passphrase;

    // Try to connect to WiFi essid,
    wifi.connect(essid, passphrase, function(result, err) {
      if (err === void 0) {
        completeResponse(result, res);
      }
      else {
        completeResponseError(err, res);
      }
    });

  };



  // https://www.mixcloud.com/oauth/access_token?client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI&client_secret=YOUR_CLIENT_SECRET&code=OAUTH_CODE

  function mixCloudAuthorise(args, req, res) {

    var oauth_code = args.oauth_code;

    // Fetch properties from the local configuration file,
    var mixcloud_client_id = secrets.mixcloud_client_id;
    var mixcloud_client_secret = secrets.mixcloud_client_secret;

    var mixcloud_redirect = encodeURIComponent('http://hw.plegger/mixcloud/rep/' + args.filename);

    // Make a request to the MixCloud API end point for an access
    // token.

    var mixcloud_url = util.format(
                'https://www.mixcloud.com/oauth/access_token' +
                '?client_id=%s&redirect_uri=%s&client_secret=%s&code=%s',
                mixcloud_client_id, mixcloud_redirect,
                mixcloud_client_secret, oauth_code);

    // Request the OAuth code,
    request(mixcloud_url, function(error, response, body) {
      // Respond with error,
      if (error) {
        completeResponseError(error, res);
      }
      else {
        try {
          var api_response_ob = JSON.parse(body);
          // Fetch the access token,
          var access_token = api_response_ob.access_token;

          console.log("ISSUE access_token: ", access_token);

          // Give the access info to the client,
          // Command for client,
          var client_command = encodeURIComponent('upload ' + args.filename);

          // Encrypted token,
          var enc_token = encryptor.encrypt(access_token);

          console.log("ISSUE access_token encoded: ", enc_token);

          // Redirect with URI encoded variables,
          res.redirect('/?op=' + client_command + '&et=' + encodeURIComponent(enc_token));

        }
        catch (e) {
          completeResponseError(e, res);
        }
      }
    });

  }



  // Performs the actual upload operation,
  server_commands.performMixCloudUpload = function(args, req, res) {

    console.log("performMixCloudUpload");
    console.log(args);

    var filename = args.filename;

    // Encrypted token,
    var et = args.et;

    var given_name = args.given_name;
    var given_desc = args.given_desc;
    if (given_name === void 0 || given_name.length < 2) {
      given_name = 'Music Upload';
    }

    // Santitize filename,
    filename = filename.replace('/', '');
    filename = filename.replace('\\', '');

    // Decrypt the auth code,
    var access_token = encryptor.decrypt(et);

    console.log("access_token = ", access_token);

    // If no access token then something weird happened,
    if (access_token === void 0 || access_token === null) {
      completeResponseError(Error('Invalid access token'), res);
    }
    else {

      // Is this already being uploaded?
      var unique_key = access_token + '.' + filename;
      var upload_status = currently_uploading[unique_key];
      if (upload_status === void 0) {
        upload_status = { callbacks: [ ] };
        currently_uploading[unique_key] = upload_status;
      }

      var time_now = Date.now();

      if (upload_status.finished === true) {
        if (time_now < upload_status.time_finished + 30000) {
          completeResponse(upload_status.result, res);
          return;
        }
        else {
          delete upload_status.finished;
          delete upload_status.result;
        }
      }
      upload_status.callbacks.push(res);
      if (upload_status.callbacks.length > 1) {
        return;
      }

      // Call the MixCloud API,

      var qual_filename = path.join(config.recordings_path, filename);

      // Curl arguments,
      var curl_args = [];
      curl_args.push('-F');
      curl_args.push('mp3=@' + qual_filename);
      curl_args.push('-F');
      curl_args.push('name=' + given_name);
      curl_args.push('-F');
      curl_args.push('description=' + given_desc);
      curl_args.push('https://api.mixcloud.com/upload/?access_token=' + encodeURIComponent(access_token));

      console.log("Spawning 'curl' command with args: ", curl_args);
      var p = spawn('curl', curl_args);
      let fulloutput = '';
      // Concatenate string to output,
      p.stdout.on('data', (data) => {
        fulloutput += data.toString();
      });
      p.stderr.on('data', (data) => {
        fulloutput += data.toString();
      });
      // When finished,
      p.on('close', (code, signal) => {
        console.log("Curl complete!");
        console.log("output:");
        console.log(fulloutput);
        console.log("Exit code: ", code);
        var result = {};
        result.upload_file = qual_filename;
        result.curl_exit_code = code;
        result.curl_output = fulloutput;

        upload_status.finished = true;
        upload_status.time_finished = Date.now();
        upload_status.result = result;
        // Notify all the waiting response objects,
        var check_res;
        do {
          check_res = upload_status.callbacks.pop();
          if (check_res) {
            try {
              completeResponse(result, check_res);
            }
            catch (e) {
              console.error(e);
            }
          }
        } while (check_res);

      });

    }

  }



  // Returns the list of music files from the recording directory,
  server_commands.getFileList = function(args, req, res) {

    // Path of music recordings from config,
    var rec_path = config.recordings_path;

    // Make sure the rec_path ends with '/'
    if (rec_path.charAt(rec_path.length - 1) !== '/') {
      rec_path = rec_path + '/';
    }

    // Read the recordings_path directory,
    fs.readdir(rec_path, function(err, files) {
      if (err) {
        completeResponseError(err, res);
      }
      else {
        var file_details = [];
        var i = 0;
        var len = files.length;
        for (; i < len; ++i) {
          var file = files[i];

          var stat_result = fs.statSync(rec_path + file);

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

    var urlv = url.parse(req.url);
    var in_pathname = urlv.pathname;
    var MIXCLOUD_ENDPOINT = '/mixcloud/rep/';

    // MixCloud redirect address,
    if (in_pathname.startsWith(MIXCLOUD_ENDPOINT)) {
      var filename = req.params.filename;
      var oauth_code = req.query.code;
      if (oauth_code) {
        // Okay, we have the oauth code,
        // So check with mixcloud that it's valid,
        mixCloudAuthorise(
          { oauth_code: oauth_code, filename: filename }, req, res );
      }
      else {
        // No auth code,
        // Redirect to main page,
        res.redirect('/?error=NO_OAUTH');
      }
      return;
    }
    // Get the query arguments from the client,
    else if (req.body !== void 0) {
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
