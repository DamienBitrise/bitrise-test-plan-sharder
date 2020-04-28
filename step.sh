#!/bin/bash

set -e
TMP_CURRENT_DIR="$( pwd )"
THIS_SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

cd $THIS_SCRIPT_DIR

echo '$' "npm i xcode"
npm i xcode

echo '$' "node "$THIS_SCRIPT_DIR/index.js""
node "$THIS_SCRIPT_DIR/index.js"

envman add --key TEST_PLANS --value $test_plans

cd $TMP_CURRENT_DIR