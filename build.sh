#!/usr/bin/env bash

# hack to get it to work under pbuilder
# todo: check $HOME is "" & $USER is "pbuilder" before setting the env var
export HOME=/tmp/buildd
NPMPACKAGES="$HOME/.npm-packages"
mkdir -p $NPMPACKAGES

# install browserify
npm install --prefix=$NPMPACKAGES -g browserify

# download the npm modules
cd webapp
npm install

# run browserify
$NPMPACKAGES/bin/browserify src/client/plegger_client.js -t babelify --outfile web/pleg_cfe.js -d
