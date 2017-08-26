#!/usr/bin/env bash
#
# Install all depends etc
#
sudo systemctl webapp stop
sudo systemctl recorder stop

cd /usr/share/plegger/webapp
sudo npm -g install browserify
sudo npm install
sudo browserify src/client/plegger_client.js -t babelify --outfile web/pleg_cfe.js -d

sudo systemctl webapp start
sudo systemctl recorder start
