"use strict";

const spawn = require('child_process').spawn;
const Readable = require('stream').Readable;
const readline = require('readline');

const fs = require('fs');

// For hashing the essid name into unique file name,
const crypto = require('crypto');
const hash = crypto.createHash('sha256');


// PENDING: Turn this into a configuration property,
const BASE_VAR_LIB_PATH = '/var/lib/plegger/';



module.exports = function(net_interface) {


  // The wpa_supplicant process,
  let wpa_supplicant_process = null;
  // Function to execute when the wpa_supplicant code has finished,
  let wpa_supplicant_process_onclose = null;

  // Details about the current wpa process,
  let current_wpa_details = {};
  




  // Parses an ESSID string from the Linux iwlist and coverts it into a
  // JavaScript form that is displayable to the user.
  function parseLinuxESSID(linux_essid) {
    linux_essid.trim();
    // Remove the outer quotes of the essid string,
    return linux_essid.substring(1, linux_essid.length - 1);
  }

  function parseSignalStrength(quality, signal) {
    const qual_re = /(\w+)\/(\w+)/;
    const m = quality.match(qual_re);
    if (m !== null) {
      const v1 = parseInt(m[1]);
      const v2 = parseInt(m[2]);
      return (v1 / v2).toFixed(4);
    }
    return .4;
  }

  function sha256Hash(str, callback) {
    hash.on('readable', () => {
      const data = hash.read();
      if (data) {
        callback(data.toString('hex'));
      }
    });
    hash.write(str);
    hash.end();
  }

  // Sanitise the essid input string. Note that in practice this will probably
  // prevent wpa_supplicant from connecting to the network if this ever happens
  // to change the string. However, not happy about writing data to a file that
  // an external user could potentially manipulate.
  //
  // NOTE: To properly sanitize this we need to know how Linux parses the essid
  //   field so that we can guarentee we always produces a valid token.
  function sanitiseEssidString(essid) {
    return essid.trim().replace(/(\r\n|\n|\r)/gm, "");
  }
  
  // Sanitise the passphrase.
  function sanitisePassphrase(passphrase) {
    // Remove all quotes from passphrase,
    return passphrase.replace(/\"/gm, "");
  }

  function spawnLinuxProcess(cmd, args, callback) {
    const p = spawn(cmd, args);
    let fulloutput = '';
    // Concatenate string to output,
    p.stdout.on('data', (data) => {
      fulloutput += data.toString();
    });
    // When finished,
    p.stdout.on('close', (code) => {
      callback(fulloutput);
    });
    return p;
  }
  
  function onLine(text, on_line_function, complete_function) {
    const rstream = new Readable();
    rstream.push(text);
    rstream.push(null);
    const lineReader = readline.createInterface({ input: rstream });
    lineReader.on('line', on_line_function);
    lineReader.on('close', complete_function);
  }
  
  function notifyCurrentConnected() {
    current_wpa_details.connected = true;
    console.log("Connect: ", current_wpa_details);
  }
  
  function notifyCurrentDisconnected() {
    current_wpa_details.connected = false;
    console.log("Disconnect: ", current_wpa_details);
  }
  
  // Runs the Linux command;
  //   'iwlist [interface] scan'
  // This will generate a list of all available local wifi spots.
  function scan(callback) {

    // Spawn the Linux command asynchronously,
    const wifiscan = spawnLinuxProcess('iwlist', [net_interface, 'scan'], (fulloutput) => {

      const result = {
        raw: []
      };
      let cell = null;

      const cell_re = /\s+Cell (\S+) \- Address\: (\S+)/;
      const channel_re = /\s+Channel\:(\S+)/;
      const essid_re = /\s+ESSID\:"([^"]+)"/;
      const encrypt_re = /\s+Encryption key\:(\S+)/;
      const freq_re = /\s+Frequency\:(\S+)/;
      const qual_re = /\s+Quality\=(\S+)\s+Signal level\=(.+)/;

      const oline_fun = (line) => {
        const found = line.match(cell_re);
        if (found !== null) {
          cell = {
            cell_id: found[1],
            point: found[2]
          };
          result.raw.push(cell);
        }
        else {
          let m = line.match(channel_re);
          if (m !== null) {
            cell.channel = m[1];
          }
          m = line.match(essid_re);
          if (m !== null) {
            cell.essid = m[1];
          }
          m = line.match(encrypt_re);
          if (m !== null) {
            cell.encryption = m[1];
          }
          m = line.match(freq_re);
          if (m !== null) {
            cell.frequency = m[1];
          }
          m = line.match(qual_re);
          if (m !== null) {
            cell.quality = m[1].trim();
            cell.signal = m[2].trim();
            cell.strength = parseSignalStrength(cell.quality, cell.signal);
          }
        }
      };
      const ocomplete_fun = () => {
        callback(result);
      };

      onLine(fulloutput, oline_fun, ocomplete_fun);

    });
  }

  function up(callback) {
  }

  function down(callback) {
  }

  const CONNECT_P = net_interface + ": CTRL-EVENT-CONNECTED ";
  const DISCONNECT_P = net_interface + ": CTRL-EVENT-DISCONNECTED ";

  // Try to connect to the WiFi hotspot via wpa_supplicant. If a connection is already
  // established, issue a 'kill' on the existing process, then on close establish
  // connection with the WiFi network.
  function tryToConnectWPA(essid, filename, callback) {

    function establishConnection() {
      // wpa_supplicant -i wlan1 -c wifi.conf
      wpa_supplicant_process = spawn( 'wpa_supplicant', [ '-i', net_interface, '-c', filename ] );
      current_wpa_details = {
        essid: essid,
        connected: false
      };
      wpa_supplicant_process.stdout.on('data', (data) => {
        // Process the output,
        const ws_output = data.toString();
        const oline_f = (line) => {
          // Small hack. We can determine connect or disconnect event by looking at
          // the first part of the line.
          // Better solution would be to parse the output completely than look at this
          // substring.
          
          if (line.startsWith(CONNECT_P)) {
            notifyCurrentConnected();
          }
          else if (line.startsWith(DISCONNECT_P)) {
            notifyCurrentDisconnected();
          }

        };
        const ocomplete_f = () => {
          // No Op.
        };
        onLine(ws_output, oline_f, ocomplete_f);
      });
      wpa_supplicant_process.on('close', (code, signal) => {
        wpa_supplicant_process = null;
        if (wpa_supplicant_process_onclose !== null) {
          const f = wpa_supplicant_process_onclose;
          wpa_supplicant_process_onclose = null;
          current_wpa_details = null;
          f();
        }
      });

      callback( { status: '%SUCCESS:Connection established' } );

    }

    // Kill the existing wpa_supplicant,
    if (wpa_supplicant_process !== null) {
      wpa_supplicant_process.kill('SIGHUP');
      wpa_supplicant_process_onclose = establishConnection;
    }
    else {
      establishConnection();
    }

  }
  
  // Returns information about the WiFi currently connected to, or null if not
  // connected to WiFi. The object contains the following information;
  //
  //   The ESSID,
  //   Current Status (connected or not)

  function getWiFiConnectionInfo() {
    // Clone the wpa details object.
    // PENDING: Do we need a more efficient clone for this?
    return JSON.parse( JSON.stringify( current_wpa_details ) );
  }
  
  // Try to auto connect to the given essid. Callback result is either
  // success or failure. If it fails, the UI should ask the user to enter
  // a passphase and then the 'connect' function should be used to
  // attempt to connect to the network.
  // This is how you should attempt to connect to an open hotspot.

  function autoConnect(essid, callback) {

    // Scan for wifi that matches essid
    scan( (result, err) => {

      if (err === void 0) {

        // Filter the array by matching essid,
        const matching_cells = result.raw.filter( (cell) => {
          return cell.essid === essid;
        });
        // If matching_cells array is empty then essid not found,
        if (matching_cells.length === 0) {
          callback( { status: '%NO_MATCH_ESSID:No matching WiFi hotspot with essid' } );
          return;
        }
        // If there's more than one network with the same essid then
        // try to connect to the one with the strongest signal.
        let strongest_i = -1;
        let strongest_val = -1;
        matching_cells.forEach( (cell, i) => {
          const this_strength = cell.strength;
          if (strongest_val < this_strength) {
            strongest_val = this_strength;
            strongest_i = i;
          }
        });
        // Strongest signal matching essid,
        const matching_spot = matching_cells[strongest_i];
        
        // ESSID larger than 200 characters seems like it'll be bad,
        if (essid.length > 200) {
          callback( { status: '%INVALID_ESSID:Exceeds 200 characters' } );
          return;
        }

        // Hash the essid name,
        const hash_name = sha256Hash(essid, (hashcode) => {
          
          // The configuration file for this network,
          const conf_filename = BASE_VAR_LIB_PATH + hashcode + '.conf';
          
          const sanitised_essid = sanitiseEssidString(essid);
          
          // Is it an open hotspot?
          if (matching_spot.encryption === 'off') {
            // It is open. Create an open access wpa config for this network,
            fs.writeFile( conf_filename,
                          "network={\n ssid=" + sanitised_essid + "\n key_mgmt=NONE\n}\n", (err) => {
              if (err) {
                callback( { status: '%FS_ERROR:Unable to write wpa_supplicant config file' } );
              }
              else {
                // File successfully written, so now try to connect,
                tryToConnectWPA(sanitised_essid, conf_filename, callback);
              }
            });
          }
          else {
            // No, it's ecrypted so...
            
            // If the file doesn't exist then we can't auto connect,
            fs.stat(conf_filename, (err, stat) => {
              if (err === null) {
                // Config file exists, so use it for wpa_supplicant,
                tryToConnectWPA(sanitised_essid, conf_filename, callback);
              }
              else if (err.code === 'ENOENT') {
                // Config file doesn't exist,
                callback({ status: '%AUTH_REQUIRED:Authentication required to connect to unrecognised secure WiFi' });
              }
              else {
                callback({ status: '%INTERNAL_ERROR:Failed to stat config path' });
              }
            });

          }
        });

      }
      else {
        // There was an error scanning,
        callback(null, err);
      }
    });
  }

  // Connect to the given essid with passphrase and call 'callback' when
  // complete.
  function connect(essid, passphrase, callback) {
    
    // Scan for wifi that matches essid
    scan( (result, err) => {

      if (err === void 0) {

        // Filter the array by matching essid,
        const matching_cells = result.raw.filter( (cell) => {
          return cell.essid === essid;
        });
        // If matching_cells array is empty then essid not found,
        if (matching_cells.length === 0) {
          callback( { status: '%NO_MATCH_ESSID:No matching WiFi hotspot with essid' } );
          return;
        }

        // If there's more than one network with the same essid then
        // try to connect to the one with the strongest signal.
        let strongest_i = -1;
        let strongest_val = -1;
        matching_cells.forEach( (cell, i) => {
          const this_strength = cell.strength;
          if (strongest_val < this_strength) {
            strongest_val = this_strength;
            strongest_i = i;
          }
        });
        // Strongest signal matching essid,
        const matching_spot = matching_cells[strongest_i];

        // ESSID larger than 200 characters seems like it'll be bad,
        if (essid.length > 200) {
          callback( { status: '%INVALID_ESSID:Exceeds 200 characters' } );
          return;
        }

        // Hash the essid name,
        const hash_name = sha256Hash(essid, (hashcode) => {
          
          // The configuration file for this network,
          const conf_filename = BASE_VAR_LIB_PATH + hashcode + '.conf';
          
          const sanitised_essid = sanitiseEssidString( essid );
          
          // Is it an open hotspot?
          if (matching_spot.encryption === 'off') {
            if (passphrase !== null) {
              callback( { status: '%OPEN_WIFI:Essid is an open wifi network, passphrase not required' } );
            }
            else {
              // It is open. Create an open access wpa config for this network,
              fs.writeFile( conf_filename,
                            "network={\n ssid=" + sanitised_essid + "\n key_mgmt=NONE\n}\n", (err) => {
                if (err) {
                  callback( { status: '%FS_ERROR:Unable to write wpa_supplicant config file' } );
                }
                else {
                  // File successfully written, so now try to connect,
                  tryToConnectWPA(sanitised_essid, conf_filename, callback);
                }
              });
            }
          }
          else {
            // Write a new WPA config file,
            const sanitised_passphrase = sanitisePassphrase( passphrase );

            const wpa_passph = spawnLinuxProcess('wpa_passphrase',
                  [ sanitised_essid, sanitised_passphrase ], (fulloutput) => {

              // Create a wpa config for this network,
              fs.writeFile( conf_filename, fulloutput, (err) => {
                if (err) {
                  callback( { status: '%FS_ERROR:Unable to write wpa_supplicant config file' } );
                }
                else {
                  // File successfully written, so now try to connect,
                  tryToConnectWPA(sanitised_essid, conf_filename, callback);
                }
              });

            });

          }

        });

      }
      else {
        // There was an error scanning,
        callback(null, err);
      }
    });
  }

  // Forget the given essid information and call 'callback' when complete.
  function forget(essid, callback) {
    
    // Hash the essid name,
    const hash_name = sha256Hash(essid, (hashcode) => {
      // The configuration file for this network,
      const conf_filename = BASE_VAR_LIB_PATH + hashcode + '.conf';
      // Delete it if it exists. This forces reauthentication.
      fs.unlink(conf_filename);
    });
    
    callback( { status: '%SUCCESS:Essid forgot' } );
    
  }



  return {
    // scan(callback)
    //   Returns a list of local networks that are available to be
    //   connected to.
    scan,

    //   Bring the network interface up.
    up,

    //   Bring the network interface down.
    down,

    // autoConnect(callback)
    //   Try to auto connect to a network that was previously
    //   connected to. If there's a choice of networks, picks
    //   the network with the strongest signal.
    autoConnect,

    // connect(essid, passphrase, callback)
    //   Authenticate a connection with a WiFi network.
    connect,

    // disconnect(callback)
    //   Disconnect from a WiFi network. The device will stay
    //   disconnected until a new connection is established either
    //   with 'autoConnect' or 'connect'.
    disconnect,

    // forget(essid, callback)
    //   Forget a previously connected to network.
    forget,

  };

}
