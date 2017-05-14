"use strict";

var fs = require('fs');

var config = require('../../bbconfig.js');

// The Node Express request handler for the server side API,

function downloader(req, res) {
  
  // Get the filename parameter from the request URI,
  var filename = req.params.filename;
  
  // Sanity checks on the filename,
  if (filename.indexOf('/') >= 0 || filename.indexOf('\\') >= 0) {
    res.status(404).send('Not found');
    return;
  }
  
  // Fetch the file and download it,

  // Path of music recordings from config,
  var path = config.recordings_path;
  
  // Make sure the path ends with '/'
  if (path.charAt(path.length - 1) !== '/') {
    path = path + '/';
  }

  var qualified_fname = path + filename;
  
  var options = {
    dotfiles: 'deny',
    headers: {
      'Content-disposition': 'attachment;filename=' + filename
    }
  };

  res.sendFile(qualified_fname, options, function(err) {
    // NOTE: This seems to be called in the middle of streaming data to the client.
    //   Not sure why this should produce an error argument...

//      if (err) {
//        console.error('---');
//        console.error(err);
//        console.error('---');
//        res.status(500).send("Couldn't send file: " + filename);
//      }
  });

}


function player(req, res) {
  
  // Get the filename parameter from the request URI,
  var filename = req.params.filename;
  
  // Sanity checks on the filename,
  if (filename.indexOf('/') >= 0 || filename.indexOf('\\') >= 0) {
    res.status(404).send('Not found');
    return;
  }
  
  // Fetch the file and download it,

  // Path of music recordings from config,
  var path = config.recordings_path;
  
  // Make sure the path ends with '/'
  if (path.charAt(path.length - 1) !== '/') {
    path = path + '/';
  }

  var qualified_fname = path + filename;
  
  var options = {
    dotfiles: 'deny',
  };

  res.sendFile(qualified_fname, options, function(err) {
    // NOTE: This seems to be called in the middle of streaming data to the client.
    //   Not sure why this should produce an error argument...

  });

}


module.exports = {
  downloader: downloader,
  player: player
};
