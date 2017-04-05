"use strict";

// Is self-invocing function necessary anymore?
(function() {

  const prettyBytes = require('pretty-bytes');
  
  const pleg_api = require('./pleg_api');

  // Locale specific date formatters,
  let preferred_locale = window.navigator.language;
  let dayOfWeekFormatter = new Intl.DateTimeFormat( preferred_locale, { weekday: 'long' });
  let monthOfYearFormatter = new Intl.DateTimeFormat( preferred_locale, { month: 'long' });
  let yearFormatter = new Intl.DateTimeFormat( preferred_locale, { year: 'numeric' });

  let fileEntryFormatter = new Intl.DateTimeFormat( preferred_locale,
            { weekday: 'long', month:'short', day:'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });

  // This is the DOM element to change when switching between views,
  let uibody_el;

  // The current UI state,
  var ui_state = 'file';
  

  
  // Called when the 'listen' icon is selected.
  //   'file' is the file object to listen to,
  //   'el' is the DOM element (for UI effects),
  function onFileListenClick(evt, file, el, i) {
    console.log("Listen to file: ", file, el);

    // ISSUE: Redirect to mp3 streamable version of file?
    window.location = 'serv/play/' + file.file;

  }
  
  // Called when the 'download' icon is selected.
  //   'file' is the file object to listen to,
  //   'el' is the DOM element (for UI effects),
  function onFileDownloadClick(evt, file, el, i) {
    console.log("Download file: ", file, el);
    
    // The forces the client to download by using attachment HTTP header,
    window.location = 'serv/dl/' + file.file;
    
  }

  // Called when the 'settings' icon is clicked on the UI. This should toggle
  // between the wifi setup and the file list,
  function onSettingsClick(evt) {
    console.log("Settings click!");
    
    if (ui_state === 'file') {
      ui_state = 'wifi';
      presentWiFi();
    }
    else if (ui_state === 'wifi') {
      ui_state = 'file';
      presentFileList();
    }
    else {
      console.error("Invalid UI State: " + ui_state);
    }
    
  }
  
  
  // Present the WiFi configuration UI,
  function presentWiFi() {
    // Clear the UI body,
    uibody_el.innerHTML = '<form><div id="wifi_current"></div><div id="wifi_external"></div></form>';
    
    const wifi_current_el = document.getElementById('wifi_current');
    const wifi_external_el = document.getElementById('wifi_external');
    
    // Query the current wifi state,
    pleg_api.getWiFiInfo( (error, wifi_info) => {
      if (error) {
        throw error;
      }

      console.log(wifi_info);

      let bdy = '';
      
      bdy += '<table class="settings settings_current">\n';

      bdy += '<tr><td>Connected To:</td>\n';
      bdy += '<td><input id="connect_network_name" type="text" size="30"></td>\n';
      bdy += '</tr>\n';
      bdy += '<tr><td>Strength:</td>\n';
      bdy += '<td>' + wifi_info.strength + '</td>\n';
      bdy += '</tr>\n';
      bdy += '</table>\n';

      wifi_current_el.innerHTML = bdy;

      document.getElementById("connect_network_name").value = wifi_info.network_name;
      
    });

    pleg_api.getWiFiAvailableHubs( (error, wifi_hubs) => {
      if (error) {
        throw error;
      }

      console.log(wifi_hubs);

      let bdy = '';
      
      bdy += '<table class="settings settings_hubs">\n';

      bdy += '<tr><td>Access Points</td>\n';
      bdy += '<td><select id="hubs_list" size="5"></select></td>\n';
      bdy += '</tr>\n';
      bdy += '</table>\n';

      wifi_external_el.innerHTML = bdy;

      const available_hubs = wifi_hubs.available_hubs;
      
      const select_el = document.getElementById("hubs_list");
      for (const i = 0; i < available_hubs.length; ++i) {
        const option_el = document.createElement("option");
        option_el.innerHTML = available_hubs[i].name;
        select_el.append(option_el);
      }
      
      

    });
    

  }
  
  
  // Present the file list UI,
  function presentFileList() {
    // Clear the UI body,
    uibody_el.innerHTML = '';

    // Query the file list,
    pleg_api.getFileList(null, (error, all_files) => {
      if (error) {
        throw error;
      }
      
      // The files list from the query,
      const files = all_files.files;

      // Format it into a nice list,
      
      var current_month_year = '';
      
      let bdy = '';
      
      for (const i = 0; i < files.length; ++i) {
        // Turn the result into a Date object,
        const file = files[i];
        const file_time = new Date(file.modtime);

        // The localized month,
        const month = monthOfYearFormatter.format(file_time);
        // The localized year,
        const year = yearFormatter.format(file_time);

        const file_month_year = month + " " + year;
        
        if (current_month_year !== file_month_year) {
          // Close out the last group,
          if (current_month_year !== '') {
            bdy += '</table>\n';
          }
          // New Group,
          bdy += '<table class="file_month_group">\n';
          bdy += '<th colspan="2">' + file_month_year + '</th>\n';
          current_month_year = file_month_year;
        }
        
        // The file details,
        const dayhour = fileEntryFormatter.format(file_time);
        const size = prettyBytes(file.size);
        bdy += '<tr id="aentry_' + i + '">\n';
        bdy += '<td class="file_day_hour">' + dayhour + '</td>\n';
        bdy += '<td class="file_size">' + size + '</td>\n';
        bdy += '<td class="file_listen"><a href="#"><img src="assets/headphones.svg" width="20"></a></td>\n';
        bdy += '<td class="file_download"><a href="#"><img src="assets/arrow-circle-top.svg" width="20"></a></td>\n';
        bdy += '</tr>\n';
        
      }
      
      if (current_month_year !== '') {
        bdy += '</table>\n';
      }
      
      uibody_el.innerHTML = bdy;
      
      // After we've set the inner html, hook into the DOM,
      
      for (const i = 0; i < files.length; ++i) {
        const key = 'aentry_' + i;
        const tr = document.getElementById(key);
        
        const children = tr.childNodes;
        for (const n = 0; n < children.length; ++n) {
          const c = children[n];
          if (c.className === 'file_listen') {
            c.firstChild.addEventListener('click', function(evt) {
              onFileListenClick(evt, files[i], c, i);
              evt.preventDefault();
              return false;
            });
          }
          else if (c.className === 'file_download') {
            c.firstChild.addEventListener('click', function(evt) {
              onFileDownloadClick(evt, files[i], c, i);
              evt.preventDefault();
              return false;
            });
          }
        }
        
      }
      
      
      
    });

  }


  // Present the initial UI,
  function presentUI() {
    const main_div_el = document.getElementById("main");

    const header_html = 
      '<img class="logo" src="assets/recorder-logo-blue.svg">\n' +
      '<a id="settings_aref" href="#"><img class="settings" src="assets/wrench.svg"></a>\n';
    
    const footer_html = '';
    
    const base_html =
      header_html +
      '<div id="uibody"></div>\n' +
      footer_html;
    
    main_div_el.innerHTML = base_html;
    
    uibody_el = document.getElementById("uibody");
    
    // The settings reference
    const settings_aref = document.getElementById("settings_aref");
    settings_aref.addEventListener('click', function(evt) {
      onSettingsClick(evt);
      evt.preventDefault();
      return false;
    });
    
  }


  // Register a listener called on the page load event,
  document.addEventListener('DOMContentLoaded', () => {
    
    // Present the UI,
    presentUI();
    
    // Initially present the file list,
    presentFileList();
    
  });
  
})();

