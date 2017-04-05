"use strict";

// The API for accessing state provided by the web service running
// on the blue box.


// AJAX stuff,

function query(command, args, callback) {

  // This object is formatted as a JSON string when sent to the server,
  const cmd_object = {
    cmd: command,
    args: args
  };

  // The AJAX request,
  const httpRequest = new XMLHttpRequest();
  httpRequest.onreadystatechange = () => {
    // When response received,
    if (httpRequest.readyState === 4) {
      // Ok, request received,
      if (httpRequest.status === 200) {
        callback( null, JSON.parse( httpRequest.responseText ) );
      }
      // Hmm, error,
      else {
        callback(httpRequest.statusText);
      }
    }
  };

  // POST asynchronously,
  httpRequest.open('POST', '/serv/api', true);
  httpRequest.setRequestHeader('Content-Type', 'application/json');
  httpRequest.send( JSON.stringify( cmd_object ) );

}



// Queries the server API for the current WiFi info. The information is
// returned in the callback; callback(error, wifi_info).
function getWiFiInfo(callback) {
  
  query('getWiFiInfo', [], callback);
  
}


// Queries the server API for the current set of WiFi hubs available to try
// and connect to. The information is returned in the callback;
// callback(error, wifi_hubs).
function getWiFiAvailableHubs(callback) {
  
  query('getWiFiAvailableHubs', [], callback);
  
}


// Queries the server API for the complete list of files available to the user
// as an array sorted chronologically (by default). The result is returned in
// the callback; callback(error, files_array).
function getFileList(sort_order, callback) {

  const args = {
    sort_order
  };
  
  // Make the call to the server,
  query('getFileList', args, callback);
  
}

module.exports = {
  getFileList,
  getWiFiInfo,
  getWiFiAvailableHubs
};
