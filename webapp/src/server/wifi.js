"use strict";

const config = require('../../bbconfig.js');

const spawn = require('child_process').spawn;
const Readable = require('stream').Readable;
const readline = require('readline');
const EventEmitter = require('events').EventEmitter;

const util = require('util');
const fs = require('fs');

// For hashing the essid name into unique file name,
const crypto = require('crypto');

// Base storage path from configuration,
const BASE_VAR_LIB_PATH = config.BASE_VAR_LIB_PATH;
const LAST_ESSID_FILE = 'last_essid_connect';


// Wifi is created with the network interface to use as the argument.
// For example;
//
//   const Wifi = require('./wifi');
//   const connection = Wifi('wlan1');

module.exports = function(net_interface) {


  // The wpa_supplicant process,
  let wpa_supplicant_process = null;
  // Function to execute when the wpa_supplicant code has finished,
  let wpa_supplicant_process_onclose = null;

  // Details about the current wpa process,
  let current_wpa_details = {};





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
    const hash = crypto.createHash('sha256');
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

  // Calls 'on_line_function' for each line in the string 'text'. Once finished,
  // calls 'complete_function'.
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
    // Emit event when WPA tells us the wifi is connected,
    out.emit('connect', current_wpa_details);
  }

  function notifyCurrentDisconnected() {
    current_wpa_details.connected = false;
    // Emit event when WPA tells us the wifi is disconnected,
    // This can happen for various reasons such as when WiFi switched off
    // or signal interference. It can be temporary or permanent.
    out.emit('disconnect', current_wpa_details);
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

  // Bring the network interface up,
  function up(callback) {
    // Spawn the Linux command asynchronously,
    const up_cmd = spawnLinuxProcess('ip', [ 'link', 'set', net_interface, 'up' ], (fulloutput) => {
      callback( { status:'%SUCCESS:Interface up' } );
    });
  }

  // Bring the network interface down,
  function down(callback) {
    // Spawn the Linux command asynchronously,
    const up_cmd = spawnLinuxProcess('ip', [ 'link', 'set', net_interface, 'down' ], (fulloutput) => {
      callback( { status:'%SUCCESS:Interface down' } );
    });
  }

  const CONNECT_P = net_interface + ": CTRL-EVENT-CONNECTED ";
  const DISCONNECT_P = net_interface + ": CTRL-EVENT-DISCONNECTED ";

  // Try to connect to the WiFi hotspot via wpa_supplicant. If a connection is already
  // established, issue a 'kill' on the existing process, then on close establish
  // connection with the WiFi network.
  function tryToConnectWPA(essid, security, filename, callback) {

    function establishConnection() {
      // wpa_supplicant -i wlan1 -c wifi.conf
      wpa_supplicant_process = spawn( 'wpa_supplicant', [ '-i', net_interface, '-c', filename ] );
      current_wpa_details = {
        essid: essid,
        security: security,
        strength: 10,
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

      // Write this essid to a file,
      const last_connect_filename = BASE_VAR_LIB_PATH + LAST_ESSID_FILE;
      fs.writeFile( last_connect_filename, essid, (err) => {
        if (err) {
          console.trace("Unable to write file: ", last_connect_filename);
        }
      });

      callback( { status: '%SUCCESS:Connection established', essid:essid } );

    }

    // Kill the existing wpa_supplicant,
    if (wpa_supplicant_process !== null) {
      wpa_supplicant_process_onclose = establishConnection;
      wpa_supplicant_process.kill('SIGHUP');
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
    if (current_wpa_details === null || current_wpa_details === void 0) {
      return null;
    }
    // Clone the wpa details object.
    // PENDING: Do we need a more efficient clone for this?
    return JSON.parse( JSON.stringify( current_wpa_details ) );
  }

  // Returns strongest signal matching the given essid, or null when the
  // essid doesn't match any networks in the scan.
  function findStrongestMatching(result, essid) {
    // Filter the array by matching essid,
    const matching_cells = result.raw.filter( (cell) => {
      return cell.essid === essid;
    });
    // If matching_cells array is empty then essid not found,
    if (matching_cells.length === 0) {
      return null;
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
    return matching_cells[strongest_i];
  }

  // Attempts to auto-connect to a WiFi network. This function prioritises
  // networks as follows; If the last connected network is available then
  // connects to that. Otherwise, connects to a secure WiFi network with the
  // strongest signal, otherwise strongest open WiFi network.
  //
  // Will NOT connect to a network unless the user has specifically tried to
  // connect to it in the past, and hasn't chosen to 'forget' it.

  function autoConnect(callback) {

    // Scan for available wifi,
    scan( (result, err) => {
      if (err === void 0) {

        // Sorts scan result by signal strength and chooses the best signal
        // that has been connected to before,
        function findAutoConnectWifi() {

          // Copy,
          const scan_res = result.raw.slice();
          // Sort by signal strength,
          scan_res.sort( (o1, o2) => (o2.strength - o1.strength) );

          let i = 0;
          function checkCell() {
            if (i < scan_res.length) {
              const cell = scan_res[i];
              ++i;

              const essid = cell.essid;
              const security = ( cell.encryption === 'on' ) ? 'key' : 'open';
              const strength = cell.strength;

              // Hash the essid name,
              sha256Hash(essid, (hashcode) => {

                // The configuration file for this network,
                const conf_filename = BASE_VAR_LIB_PATH + hashcode + '.conf';
                // Does it exist?
                fs.stat(conf_filename, (err, stat) => {
                  if (err === null) {
                    // Config file exists, so use it for wpa_supplicant,
                    tryToConnectWPA(essid, security, conf_filename, callback);
                  }
                  else {
                    // File doesn't exist so go to next essid in scan,
                    checkCell();
                  }
                });

              });

            }
            else {
              // Exhausted all entries so report to client,
              callback( { status:'%NO_AVAILABLE_NETWORKS:No available WiFi networks to connect' } );
            }

          }
          checkCell();

        }

        // Attempts to auto connect to the wifi with the given essid.
        // If the essid not found then reverts to 'findAutoConnectWifi'.
        function autoConnectTo(essid) {
          const matching_cell = findStrongestMatching(result, essid);
          if (matching_cell === null) {
            // No matching essid in the scan,
            // So sort by strongest signal and pick the first that has a conf
            // file,
            findAutoConnectWifi();
          }
          else {

            const security = ( matching_cell.encryption === 'on' ) ? 'key' : 'open';
            const strength = matching_cell.strength;

            // Connect to this one,
            // Hash the essid name,
            sha256Hash(essid, (hashcode) => {

              // The configuration file for this network,
              const conf_filename = BASE_VAR_LIB_PATH + hashcode + '.conf';
              // Does it exist?
              fs.stat(conf_filename, (err, stat) => {
                if (err === null) {

                  // Config file exists, so use it for wpa_supplicant,
                  tryToConnectWPA(essid, security, conf_filename, callback);
                }
                else {
                  // File doesn't exist so fall back to global scan,
                  findAutoConnectWifi();
                }
              });

            });

          }

        }

        // Is there a previously connected file?
        const last_connect_filename = BASE_VAR_LIB_PATH + LAST_ESSID_FILE;
        fs.readFile(last_connect_filename, (err, data) => {
          if (err) {
            // Probably file doesn't exist. This is fine,
            findAutoConnectWifi();
          }
          else {
            autoConnectTo(data.toString());
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

    console.log("WIFI: Connect to %s pass: %s", essid, passphrase);
  
    // Scan for wifi that matches essid
    scan( (result, err) => {

      if (err === void 0) {

        // Find the strongest matching essid from the list,
        const matching_spot = findStrongestMatching(result, essid);
        if (matching_spot === null) {
          callback( { status: '%NO_MATCH_ESSID:No matching WiFi hotspot with essid' } );
          return;
        }

        // ESSID larger than 200 characters seems like it'll be bad,
        if (essid.length > 200) {
          callback( { status: '%INVALID_ESSID:Exceeds 200 characters' } );
          return;
        }

        // Hash the essid name,
        sha256Hash(essid, (hashcode) => {

          // The configuration file for this network,
          const conf_filename = BASE_VAR_LIB_PATH + hashcode + '.conf';

          const sanitised_essid = sanitiseEssidString( essid );

          const security = ( matching_spot.encryption === 'on' ) ? 'key' : 'open';
          const strength = matching_spot.strength;

          // Is it an open hotspot?
          if (security === 'open') {
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
                  tryToConnectWPA(sanitised_essid, security, conf_filename, callback);
                }
              });
            }
          }
          else {
            // Write a new WPA config file,
            const sanitised_passphrase = sanitisePassphrase( passphrase );

            // Generate the wpa_supplicant config file using the 'wpa_passphrase' linux command.
            const wpa_passph = spawnLinuxProcess('wpa_passphrase',
                  [ sanitised_essid, sanitised_passphrase ], (fulloutput) => {

              // Write out the config file content,
              fs.writeFile( conf_filename, fulloutput, (err) => {
                if (err) {
                  callback( { status: '%FS_ERROR:Unable to write wpa_supplicant config file' } );
                }
                else {
                  // File successfully written, so now try to connect,
                  tryToConnectWPA(sanitised_essid, security, conf_filename, callback);
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

  // Disconnect from the current connected WiFi network. If currently
  // not connected to a network then does nothing (but returns success).
  function disconnect(callback) {
    if (wpa_supplicant_process !== null) {
      // Kill the wpa process and callback when it closes. Is there a better way to
      // do this?
      wpa_supplicant_process.on('close', (code, signal) => {
        try {
          callback ( { status: '%SUCCESS:Disconnected' } );
        }
        catch (e) {
          // Capture and display error just in case user code throws an
          // error,
          console.error(e);
        }
      });
      wpa_supplicant_process.kill('SIGHUP');
    }
    else {
      callback ( { status: '%SUCCESS:Disconnected' } );
    }
  }

  // Forget the given essid information and call 'callback' when complete.
  function forget(essid, callback) {

    // Hash the essid name,
    sha256Hash(essid, (hashcode) => {
      // The configuration file for this network,
      const conf_filename = BASE_VAR_LIB_PATH + hashcode + '.conf';
      // Delete it if it exists. This forces reauthentication.
      fs.unlink(conf_filename);
    });

    callback( { status: '%SUCCESS:Essid forgot' } );

  }

  // Exported API,

  class WiFi extends EventEmitter {}
  const out = new WiFi();

  // getWiFiConnectionInfo
  //   Returns an object returning the current connection (or null if
  //   no connection).
  out.getWiFiConnectionInfo = getWiFiConnectionInfo;

  // scan(callback)
  //   Returns a list of local networks that are available to be
  //   connected to.
  out.scan = scan;

  //   Bring the network interface up.
  out.up = up;

  //   Bring the network interface down.
  out.down = down;

  // autoConnect(callback)
  //   Try to auto connect to a network that was previously
  //   connected to. If there's a choice of networks, picks
  //   the network with the strongest signal.
  out.autoConnect = autoConnect;

  // connect(essid, passphrase, callback)
  //   Authenticate a connection with a WiFi network.
  out.connect = connect;

  // disconnect(callback)
  //   Disconnect from a WiFi network. The device will stay
  //   disconnected until a new connection is established either
  //   with 'autoConnect' or 'connect'.
  out.disconnect = disconnect;

  // forget(essid, callback)
  //   Forget a previously connected to network.
  out.forget = forget;

  return out;

}
