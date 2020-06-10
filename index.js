// Inputs
const XCODE_PATH = process.env.path_to_xcode + '/';
const XCODE_PROJECT = process.env.xcode_project;
const SHARDS = process.env.shards;
const TARGET = process.env.target;
const SCHEME = process.env.scheme;
const DEBUG = process.env.debug_mode == 'true' ? true : false;


console.log('XCODE_PATH:',XCODE_PATH)
console.log('XCODE_PROJECT:',XCODE_PROJECT)
console.log('TARGET:',TARGET)
console.log('SCHEME:',SCHEME)
console.log('SHARDS:',SHARDS)
console.log('DEBUG:',DEBUG)

// Outputs
const TEST_PLANS = [];

const xcode = require('xcode'),
    fs = require('fs'),
    uuid = require('uuid'),
    parser = require('xml2json'),
    projectPath = XCODE_PATH + XCODE_PROJECT + '/project.pbxproj',
    outputProjectPath = XCODE_PATH + XCODE_PROJECT + '/project.pbxproj',
    myProj = xcode.project(projectPath);

function log(msg, obj){
    if(DEBUG){
        console.log(msg, obj ? obj : '');
    }
}
function getRecursiveTests(myProj, target_uuid, tests = []){
    const target = myProj.getPBXGroupByKey(target_uuid);
    if(target && target.children && target.children.length > 0){
        target.children.forEach((test) => {
            if(test && test.comment && (test.comment.indexOf('.swift') != -1 || test.comment.indexOf('.m') != -1)){
                tests.push(test);
            } else {
                return getRecursiveTests(myProj, test.value, tests)
            }
        })
        return tests;
    } else {
        return tests;
    }
}

myProj.parse(function (err) {
    if (err) {
        console.error('Error:', err);
        return;
    }
    const project = myProj.getFirstProject();
    const main_group_uuid = project.firstProject.mainGroup;
    const group = myProj.getPBXGroupByKey(main_group_uuid);
    log('Target children: ', group.children)
    const target = group.children.find((child) => child.comment == TARGET);
    const target_uuid = target.value;

    const tests = getRecursiveTests(myProj, target_uuid, []);
    log('Tests Found in Target:',tests.length);
    
    const shard_size = Math.ceil(tests.length / SHARDS);
    const shards = shard(tests, shard_size);
    if(shards.length == 0){
        console.error('Error no tests found in Target');
        return;
    }
    log('\nCreating ' + shards.length + ' Test Plan shards');

    let schemePath = XCODE_PATH + XCODE_PROJECT + '/xcshareddata/xcschemes/' + SCHEME + '.xcscheme';
    fs.readFile( schemePath, function(err, schemeData) {
        if (err) {
            console.error('Error reading scheme:',err);
            process.exit();
            return; 
        }

        // Handle &quot; in xml
        let unescapedData = schemeData.toString().replace(/&quot;/g, '~');

        // Parse XML to JSON
        let jsonStr = parser.toJson(unescapedData, {reversible: true})
        let schemeJson = JSON.parse(jsonStr);

        // Get the Scheme default options
        let defaultOptions = getDefaulOptions(schemeJson);

        // Create Test Plans
        shards.forEach((shard, index) => {
            let shardName = XCODE_PATH+'TestShard_'+index+'.xctestplan';
            TEST_PLANS.push(shardName);

            log('\nAdding test plan to XCode Project\'s Resources');
            myProj.addResourceFile(shardName, {lastKnownFileType: 'text'}, main_group_uuid);

            log('Writing Test Plan to file');
            fs.writeFileSync(shardName, createTestPlan(target_uuid, [].concat(shards), index, defaultOptions));

            console.log('Test Plan Shard '+index+' Created:', shardName);
        })
        log('\nAdding Test Plans to XCode scheme');

        // Add Test Plans to scheme
        let schemeWithTestPlansJson = addTestPlanToXCodeScheme(schemeJson, TEST_PLANS);

        // Handle &quot; in xml
        let reescapedData = JSON.stringify(schemeWithTestPlansJson).replace(/~/g, '&quot;')

        let xml = parser.toXml(reescapedData);
        fs.writeFile(schemePath, xml, function(err, data) {
            if (err) {
                console.error(err);
                process.exit();
            } else {
                console.log('XCode scheme updated');   
                fs.writeFileSync(outputProjectPath, myProj.writeSync());
                console.log('XCode project updated');
            }
        });
    });
    let quotedAndCommaSeparated = "\"" + XCODE_PATH + TEST_PLANS.join("\",\""+XCODE_PATH) + "\"";
    // TODO Use Envman to save these globally
    process.env.test_plans = quotedAndCommaSeparated;
});

function getDefaulOptions(schemeJson){
    let environmentVariableEntries = [];
    let commandLineArgumentEntries = [];
    let undefinedBehaviorSanitizerEnabled = null;
    let targetForVariableExpansion = null;
    let codeCoverage = false;
    if(schemeJson.Scheme && schemeJson.Scheme.TestAction){
        let testAction = schemeJson.Scheme.TestAction;
        if(testAction.codeCoverageEnabled){
            codeCoverage = true;
        }
    }
    if(schemeJson.Scheme && schemeJson.Scheme.LaunchAction){
        let launchAction = schemeJson.Scheme.LaunchAction;
        // CommandLineArguments
        if(launchAction.CommandLineArguments){
            let cmgArgs = launchAction.CommandLineArguments.CommandLineArgument;
            if(cmgArgs instanceof Array){
                cmgArgs.forEach((cmdArg) => {
                    commandLineArgumentEntries.push({
                        argument: cmdArg.argument,
                        enabled: cmdArg.isEnabled == 'YES' ? true : false
                    });
                })
            } else { // Single Element
                commandLineArgumentEntries.push({
                    argument: cmgArgs.argument,
                    enabled: cmgArgs.isEnabled == 'YES' ? true : false
                });
            }
        }
        // EnvironmentVariables
        if(launchAction.EnvironmentVariables){
            let envVars = launchAction.EnvironmentVariables.EnvironmentVariable;
            if(envVars instanceof Array){
                envVars.forEach((envVar) => {
                    environmentVariableEntries.push({
                        key: envVar.key,
                        value: envVar.value,
                        enabled: envVar.isEnabled == 'YES' ? true : false
                    });
                })
            } else { // Single Element
                environmentVariableEntries.push({
                    key: envVars.key,
                    value: envVars.value,
                    enabled: envVars.isEnabled == 'YES' ? true : false
                });
            }
        }
        // targetForVariableExpansion
        if(launchAction.MacroExpansion && launchAction.MacroExpansion.BuildableReference){
            let ref = launchAction.MacroExpansion.BuildableReference;
            targetForVariableExpansion = {
                containerPath: ref.ReferencedContainer,
                identifier: ref.BlueprintIdentifier,
                name: ref.BlueprintName
            };
        }
        // undefinedBehaviorSanitizerEnabled
        if(launchAction.enableUBSanitizer != null){
            undefinedBehaviorSanitizerEnabled = launchAction.enableUBSanitizer == 'YES' ? true : false;
        }
        
    }
    let defaultOpts = {};
    if(commandLineArgumentEntries.length > 0){
        defaultOpts.commandLineArgumentEntries = commandLineArgumentEntries;
    }
    if(environmentVariableEntries.length > 0){
        defaultOpts.environmentVariableEntries = environmentVariableEntries;
    }
    if(targetForVariableExpansion != null){
        defaultOpts.targetForVariableExpansion = targetForVariableExpansion;
    }
    if(undefinedBehaviorSanitizerEnabled != null){
        defaultOpts.undefinedBehaviorSanitizerEnabled = undefinedBehaviorSanitizerEnabled;
    }
    if(codeCoverage){
        defaultOpts.codeCoverage = codeCoverage;
    }
    return defaultOpts;
}

function addTestPlanToXCodeScheme(schemeJson, testPlans){
    if(schemeJson.Scheme && schemeJson.Scheme.TestAction){
        schemeJson.Scheme.TestAction.TestPlans = {
            TestPlanReference: []
        };
        testPlans.forEach((testPlan) => {
            schemeJson.Scheme.TestAction.TestPlans.TestPlanReference.push({ reference: 'container:'+testPlan, '$t': '' })
        });
    } else {
        console.log('Error: json.Scheme && json.Scheme.TestAction not found');   
    }
    return schemeJson;
}

function createTestPlan(target_uuid, shards, shardIndex, defaultOptions){
    let skipTests = shards.filter((shard, index) => index != shardIndex);
    let skipTestNames = [];
    skipTests.forEach((skipTest) => {
        let tests = skipTest.map((test) => test.comment.substring(0, test.comment.indexOf('.')));
        skipTestNames = skipTestNames.concat(tests);
    });
    let testPlan = {
        "configurations" : [
            {
                "id" : (''+uuid.v4()).toUpperCase(),
                "name" : "Configuration 1",
                "options" : {}
            }
        ],
        "defaultOptions" : defaultOptions,
        "testTargets" : [
          {
            "skippedTests" : skipTestNames,
            "target" : {
              "containerPath" : "container:"+XCODE_PROJECT,
              "identifier" : target_uuid,
              "name" : TARGET
            }
          }
        ],
        "version" : 1
      }
    return JSON.stringify(testPlan);
}

function shard(arr, howMany) {
    let newArr = []; start = 0; end = howMany;
    for(let i=1; i<= Math.ceil(arr.length / howMany); i++) {
        newArr.push(arr.slice(start, end));
        start = start + howMany;
        end = end + howMany
    }
    return newArr;
}
