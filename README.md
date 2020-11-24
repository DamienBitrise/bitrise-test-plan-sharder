# Bitrise Test Plan Sharder step

This step can be used to automatically create equal sized XCode Test Plans from a XCode Test Target.

This step will modify your XCode Project & XCode Scheme to add the generated Test Plans.

These Test Plans can then be run in parallel in fan out builds.

## Prerequisites

- NodeJS - https://nodejs.org/en/download/

To verify your NodeJS Installation run:

`node -v`

You should see something like this printed if it was successful:

 `v12.13.0`

## Run Step Locally

To run this step locally you will need to set the inputs using Enviroment Variables

**Enviroment Variables**

```
export SOURCE_DIR="/User/var/git/ios"
export XCODE_PROJECT="Notes.xcodeproj"
export SHARDS=2
export TARGET="Notes"
export TEST_PATH="/User/vagrant/git/MyProject/UITests/"
export SCHEME="NotesUITests"
export DEBUG="false"
```

**Running**

From the folder you downloaded this code open the terminal and run:

`node index.js` 

**Note:** This will modify your XCode Project & XCode Scheme to add the newly created Test Plans.

## Input variables

**Source Dir** (required)
  * **Description:** This is the location and name of your xcode project
  * **Example:** `$BITRISE_SOURCE_DIR/ios`


**XCode Project** (required) 
  * **Description:** XCode Project name
  * **Example:** `Notes.xcodeproj`

**XCode Target** (required)
  * **Description:** The XCode Target to create Test Plans from
  * **Example:** `NotesUITests`

**Test Path** (required)
  * **Description:** Path to your targets test classes
  * **Example:** `/User/vagrant/git/MyProject/UITests/`

**XCode Test Plan name** (optional)
  * **Description:** The XCode Test Plan already in your project you want to shard. The file should be referenced relative to the XCode Project Path setting
  * **Example:** `Notes.xctestplan`

**XCode Scheme** (required)
  * **Description:** The XCode Scheme to test
  * **Example:** `Notes`

**How many Test Plans to create (required)**
  * **Description:** The number of Test Plans to generate
  * **Example:** `2`

**Debug (required)**
  * **Description:** Show verbose debug logs
  * **Example:** `true`
  
  **Parallelizable (optional)**
    * **Description:** Allow each shard to run multiple simulators in parallel
    * **Example:** `true`

## Outputs

**TEST_PLANS**
  * **Description:** List of Test Plans Created
  * **Example:** `"TestShard_1.xctestplan","TestShard_2.xctestplan"`
