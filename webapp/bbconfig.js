"use strict";

// Configuration properties for the Plegger project,

module.exports = {
  
  // The wireless interface to use to connect to the internet,
  internet_wireless_interface: "wlan1",
  
  // The path where WiFi connection data is stored,
  BASE_VAR_LIB_PATH: "/var/lib/plegger/",

  // The service http port,
  // For development, you can use;
//  http_port: 8000,
  http_port: 80,
  
  // The virtual host address for the web service.
  landing_host: "hw.plegger",
  
  // Sometimes it's useful to use localhost here for development,
//  landing_host: "localhost:8000",

  // The directory of recordings by the recording service,
  recordings_path: "/home/pi/recordings"
  
}
