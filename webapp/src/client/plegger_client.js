"use strict";

// Is self-invocing function necessary anymore?
(function() {

  const url = require('url');
  const prettyBytes = require('pretty-bytes');

  const pleg_api = require('./pleg_api');

  // Locale specific date formatters,
  const preferred_locale = window.navigator.language;
  let monthOfYearFormatter;
  let yearFormatter;
  let fileEntryFormatter;

  // Formatter using Intl library.
  // Disabled for now because most browsers don't support this.
  // PENDING: Use a polyfill to support this over all browsers?
  if (false) {
    monthOfYearFormatter = new Intl.DateTimeFormat( preferred_locale, { month: 'long' });
    yearFormatter = new Intl.DateTimeFormat( preferred_locale, { year: 'numeric' });

    fileEntryFormatter = new Intl.DateTimeFormat( preferred_locale,
              { weekday: 'long', month:'short', day:'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  }
  // None locale version,
  else {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const shortMonths = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    const daysOfWeek = [
      'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
    ];

    monthOfYearFormatter = {};
    monthOfYearFormatter.format = (date) => {
      return months[date.getMonth()];
    };
    yearFormatter = {};
    yearFormatter.format = (date) => {
      return date.getFullYear().toString();
    };
    fileEntryFormatter = {};
    fileEntryFormatter.format = (date) => {
      return daysOfWeek[date.getDay()] + ", " + date.getDate() + " " + shortMonths[date.getMonth()] + ", " + date.toLocaleTimeString();
    };
  }



  // This is the DOM element to change when switching between views,
  let uibody_el;

  // The current UI state,
  let ui_state = 'file';

  // If UI state is 'file' then the last file list retrieved,
  let last_file_list;
  const when_file_list = [];


  // Called when the 'listen' icon is selected.
  //   'file' is the file object to listen to,
  //   'el' is the DOM element (for UI effects),
  function onFileListenClick(evt, file, el, i) {
    console.log("Listen to file: ", file, el);

    // ISSUE: Redirect to mp3 streamable version of file?
    window.location = 'serv/play/' + file.file;

  }

  // Called when the 'upload' icon is selected.
  //   'file' is the file object to upload,
  //   'el' is the DOM element (for UI effects),
  function onFileUploadClick(evt, file, el, i) {
    console.log("Upload file: ", file, el);
    // Clear the UI body,
    uibody_el.innerHTML = '';

    // Our redirect,
    var pleg_redirect = encodeURIComponent('http://hw.plegger/mixcloud/rep/' + file.file);
    // ISSUE: Redirect to MixCloud,
    window.location = 'https://www.mixcloud.com/oauth/authorize?client_id=U78E4A3dcmzKwpsy7P&redirect_uri=' + pleg_redirect;
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
    // Reset state,
    last_file_list = void 0;
    // Clear the UI body,
    uibody_el.innerHTML = '<div id="wifi_current"></div><div id="wifi_external"></div><div id="wifi_connect"></div>';

    const wifi_current_el = document.getElementById('wifi_current');
    const wifi_external_el = document.getElementById('wifi_external');
    const wifi_connect_el = document.getElementById('wifi_connect');

    // Query the current wifi state,
    pleg_api.getWiFiInfo( (error, wifi_info) => {
      if (error) {
        throw error;
      }

      console.log(wifi_info);

      let bdy = '';

      bdy += '<table class="settings settings_current">\n';

      bdy += '<tr><td>Connected To:</td>\n';
      bdy += '<td id="connect_network_name"></td>\n';
      bdy += '</tr>\n';
      bdy += '<tr><td>Strength:</td>\n';
      bdy += '<td>' + wifi_info.strength + '</td>\n';
      bdy += '</tr>\n';
      bdy += '</table>\n';

      wifi_current_el.innerHTML = bdy;

      document.getElementById("connect_network_name").textContent = wifi_info.network_name;

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
      for (let i = 0; i < available_hubs.length; ++i) {
        const option_el = document.createElement("option");
        option_el.innerHTML = available_hubs[i].name;
        select_el.append(option_el);
      }

      select_el.onchange = function() {
        const selected_index = select_el.selectedIndex;
        const hub = available_hubs[selected_index];

        const name = hub.name;
        const security = hub.security;
        const strength = hub.strength;

        // When we select, we change the UI so it provides a connect dialog,

        let bdy = '';
        bdy += '<form id="connect_form">\n';
        bdy += '<table class="settings settings_connect">\n';
        bdy += '<tr><td>Connect To</td><td id="connect_to"></td></tr>\n';
        if (security === 'key') {
          bdy += '<tr><td>Password</td><td><input id="password_input" type="password" /></td></tr>';
        }
        bdy += '<tr><td></td><td><input id="connect_btn" type="submit" value="Connect" /></td></tr>\n';
        bdy += '</table>\n';
        bdy += '</form>\n';

        wifi_connect_el.innerHTML = bdy;

        const connect_to_el = document.getElementById("connect_to");
        let password_input_el;
        if (security === 'key') password_input_el = document.getElementById("password_input");
        const connect_form_el = document.getElementById("connect_form");
        const connect_btn_el = document.getElementById("connect_btn");

        // Set the ESSID in the UI,
        connect_to_el.textContent = name;
        // Action,
        connect_form_el.onsubmit = function(evt) {
          evt.preventDefault();
          let passphrase = null;
          if (password_input_el) {
            passphrase = password_input_el.value;
          }
          tryWiFiConnect(name, passphrase, () => {
            connect_btn_el.disabled = false;
          });
          connect_btn_el.disabled = true;
          return false;
        };

      }

    });


  }


  function tryWiFiConnect(essid, passphrase, callback) {
    // Send command to server to try and connect to this wifi,
    pleg_api.connectToWireless( essid, passphrase, (error, result) => {
      if (error) {
        console.error(error);
        callback(error);
      }
      else {
        console.log("Connection responded: ", result);
        callback(undefined, result);
      }
    });

    console.log("Try CONNECT: ", essid, passphrase);
  }


  // Changes the UI so that we can enter a title and other information
  // before uploading.
  function setUploadUI(name, et) {
    // Find the file name in the list,
    const files = last_file_list.files;
    let i = 0;
    for (; i < files.length; ++i) {
      const file_ob = files[i];
      const filename = file_ob.file;
      if (filename === name) {
        break;
      }
    }

    if (i < files.length) {

      // Generate the upload form,
      let upload_form = '';
      upload_form += '<td class="file_upload_base" colspan="5"><form id="fupload_form" class="file_upload">\n';
//      upload_form += '<t3>Upload to MixCloud</t3>\n';
      upload_form += '<div class="input_title">Name</div>\n';
      upload_form += '<input class="user_input" type="text" name="upload_name" />\n';
      upload_form += '<div class="input_title">Description</div>\n';
      upload_form += '<textarea class="user_input" name="upload_description"></textarea>\n';
      upload_form += '<div id="upload_action_bar" class="button_bar">\n';

      upload_form += '<input id="do_upload_btn" class="user_button" type="submit" name="action" value="Upload" />\n';
      upload_form += '<input id="cancel_upload_btn" class="user_button" type="submit" name="action" value="Cancel" />\n';

      upload_form += '</div>\n';
      upload_form += '</form></td>\n';

      const tr = document.getElementById('aentry_' + i);
      tr.innerHTML = upload_form;

      const do_upload_btn = document.getElementById("do_upload_btn");
      const cancel_upload_btn = document.getElementById('cancel_upload_btn');
      const fupload_form_el = document.getElementById("fupload_form");
      // Action,
      fupload_form_el.onsubmit = function(evt) {
        // Kill this event,
        evt.preventDefault();
        return false;
      };
      do_upload_btn.onclick = function(evt) {
        const upload_name = fupload_form_el.elements.upload_name.value;
        const upload_description = fupload_form_el.elements.upload_description.value;

        // Put up a 'please wait' status bar,
        const bb = document.getElementById('upload_action_bar');
        bb.innerHTML = '<h3 class="uploading_indicator">Uploading, Please Wait...</h3>';

        // Upload the Mix Cloud,
        pleg_api.uploadToMixCloud(name, et, upload_name, upload_description,
                                  (error) => {
          // Is there an error?
          if (error) {
            bb.innerHTML = '<h3 class="upload_errpr">Sorry, there was an error.</h3>';
          }
          else {
            // Return file list to how it was before,
            updateFileListEntry(i, files[i]);
          }
        });


      };
      cancel_upload_btn.onclick = function(evt) {
        // Return file list to how it was before,
        updateFileListEntry(i, files[i]);
      };

//      // Make sure this element is visible,
//      tr.scrollIntoView();

    }

    console.log(last_file_list);
    console.log("NAME = " + name);
    console.log("ER = " + et);
  }



  function updateFileListEntry(i, file) {

    const file_time = new Date(file.modtime);
    const dayhour = fileEntryFormatter.format(file_time);
    const size = prettyBytes(file.size);

    const file_ext = file.file.substring(file.file.lastIndexOf(".")+1);

    let bdy = '';
    bdy += '<td class="file_day_hour">' + dayhour + '</td>\n';
    bdy += '<td class="file_size">' + size + '<br/>' + file_ext + '</td>\n';
    bdy += '<td class="file_listen"><a href="#"><img src="assets/headphones.svg" width="20"></a></td>\n';
    bdy += '<td class="file_upload"><a href="#"><img src="assets/arrow-circle-top.svg" width="20"></a></td>\n';
    bdy += '<td class="file_download"><a href="#"><img src="assets/arrow-circle-bottom.svg" width="20"></a></td>\n';

    const tr = document.getElementById('aentry_' + i);
    tr.innerHTML = bdy;

    // Set up events,
    const children = tr.childNodes;
    for (let n = 0; n < children.length; ++n) {
      const c = children[n];
      if (c.className === 'file_listen') {
        c.firstChild.addEventListener('click', function(evt) {
          onFileListenClick(evt, file, c, i);
          evt.preventDefault();
          return false;
        });
      }
      else if (c.className === 'file_upload') {
        c.firstChild.addEventListener('click', function(evt) {
          onFileUploadClick(evt, file, c, i);
          evt.preventDefault();
          return false;
        });
      }
      else if (c.className === 'file_download') {
        c.firstChild.addEventListener('click', function(evt) {
          onFileDownloadClick(evt, file, c, i);
          evt.preventDefault();
          return false;
        });
      }
    }

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

      // Store global state,
      last_file_list = all_files;

      // The files list from the query,
      const files = all_files.files;

      // Format it into a nice list,

      var current_month_year = '';

      let bdy = '';

      for (let i = 0; i < files.length; ++i) {
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
        bdy += '</tr>\n';

      }

      if (current_month_year !== '') {
        bdy += '</table>\n';
      }

      uibody_el.innerHTML = bdy;

      // Update all the file entries,
      for (let i = 0; i < files.length; ++i) {
        const file = files[i];
        updateFileListEntry(i, file);
      }

      // Call any listeners waiting on this to be loaded,
      for (let i = 0; i < when_file_list.length; ++i) {
        when_file_list[i]();
      }
      when_file_list.length = 0;

    });

  }


  // Present the initial UI,
  function presentUI() {
    const main_div_el = document.getElementById("main");

    const header_html =
      '<img class="logo" src="assets/recorder-logo-blue.svg"><br/>\n' +
      '<a id="settings_aref" href="#"><img class="settings" src="assets/wrench.svg"></a>\n<br/>\n';

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


  function handleOperation(query, op) {
    // Replace the browser's history state so the user
    // doesn't 'back' into the command,
    if (window.history) {
      window.history.replaceState({}, '', '/');
    }
    if (op.startsWith('upload ')) {
      // To upload,
      const to_upload = op.substring(7);

      // Update the UI to reflect the fact we are uploading,

      // The query encrypted token,
      const et = query.et;

      // Change the UI so that the entry is an upload,
      if (last_file_list) {
        // If file list aleady set then set it up now,
        setUploadUI(to_upload, et);
      }
      else {
        // Otherwise wait until it's set,
        when_file_list.push(() => {
          setUploadUI(to_upload, et);
        });
      }

//      console.log("HEY, we are going to upload: ", to_upload);
//      console.log("WITH et = ", et);
    }
  }



  // Register a listener called on the page load event,
  document.addEventListener('DOMContentLoaded', () => {

    // Present the UI,
    presentUI();

    // Initially present the file list,
    presentFileList();

    // Any commands to execute?
    const this_href = window.location.href;
    console.log("this_href =", this_href);
    const url_ob = url.parse(this_href, true);
    console.log(url_ob);

    const op = url_ob.query.op;

    if (op !== void 0) {
      handleOperation(url_ob.query, op);
    }

  });

})();
