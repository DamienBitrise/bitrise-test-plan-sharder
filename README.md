# Bitrise Test Plan Sharder step

This step can be used to automatically create equal sized XCode Test Plans from a XCode Test Target.

This step will modify your XCode Project & XCode Scheme to add the generated Test Plans.

These Test Plans can then be run in parallel in fan out builds.

## Prerequisites

- NodeJS - https://nodejs.org/en/download/

Run `node -v` to verify NodeJS Installation. You should see something like `v12.13.0` when it is installed depedning on the version.

## Run Step Locally

To run this step locally you will need to set the inputs using Enviroment Variables

### Enviroment Variables

```
export SOURCE_DIR="/User/var/git/ios"
export XCODE_PROJECT="Notes.xcodeproj"
export SHARDS=2
export TARGET="Notes"
export SCHEME="NotesUITests"
export TYPE=".swift"
```

### Running

In the root of the this repo run `node index.js` to run the test sharder.

**Note:** This will modify your XCode Project & XCode Scheme to add the newly created Test Plans.

## Input variables

### Source Dir. (required)
  * **Description:** This is the location and name of your xcode project
  * **Example:** `$BITRISE_SOURCE_DIR/ios`


### XCode Project (required)
  * **Description:** XCode Project name
  * **Example:** `Notes.xcodeproj`

### XCode Target (required)
  * **Description:** The XCode Target to create Test Plans from
  * **Example:** `NotesUITests`

### XCode Scheme (required)
  * **Description:** The XCode Scheme to test
  * **Example:** `Notes`

### How many Test Plans to create (required)
  * **Description:** The number of Test Plans to generate
  * **Example:** `2`

### Test Class File Type (required)
  * **Description:** .swift or .m
  * **Example:** `.swift`


## Outputs

### TEST_PLANS
  * **Description:** List of Test Plans Created
  * **Example:** `"TestShard_1.xctestplan","TestShard_2.xctestplan"`
