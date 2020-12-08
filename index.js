// Inputs
const XCODE_PATH = process.env.path_to_xcode + '/';
const XCODE_PROJECT = process.env.xcode_project;
const SHARDS = process.env.shards;
const TEST_PLAN = process.env.test_plan;
const TARGET = process.env.target;
const TEST_PATH = process.env.test_path;
const SCHEME = process.env.scheme;
const DEBUG = process.env.debug_mode == 'true' ? true : false;
const PARALLELIZABLE = process.env.parallelizable == 'true' ? true : false;

console.log('XCODE_PATH:',XCODE_PATH)
console.log('XCODE_PROJECT:',XCODE_PROJECT)
console.log('TEST_PLAN:',TEST_PLAN)
console.log('TARGET:',TARGET)
console.log('TEST_PATH:',TEST_PATH)
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
    let classNameTests = []

    if(TEST_PATH != '') {
        let files = walkSync(TEST_PATH, []);
        tests.forEach((test, testIndex)=>{
            let path = files.find((file) => file.indexOf(test.comment) != -1);
            try{
                let testFile = fs.readFileSync(path, 'utf-8');
                testFile.split(/\r?\n/).forEach((line) => {
                    if (line.includes('class')) {
                        let searchStr = 'class';
                        let classIdx = line.indexOf(searchStr)
                        let endIdx = line.indexOf(':')
                        let className = line.substring(classIdx+searchStr.length+1,endIdx);
                        classNameTests.push(className);
                    }
                });
            } catch(err){
                log('Error parsing file: ' + path, err);
            }
        });
    } else {
        classNameTests = tests.map((test) => test.comment.substring(0, test.comment.indexOf('.')));
    }

    // filter out duplicates
    classNameTests = classNameTests.filter(function(elem, pos) {
        return classNameTests.indexOf(elem) == pos;
    })

    log("Tests found in test path: ", classNameTests.length);

    const classNameShards = shard(classNameTests, SHARDS);
    log('Shards: ', classNameShards.length)

    if(DEBUG){
        classNameShards.forEach((shardTarget, index)=>{
            log('Shard['+index+'] has ' + shardTarget.length);
            let duplicates = [];
            classNameShards.forEach((shardCompare, i)=>{
                if(index != i){
                    shardTarget.forEach((sTarget, i)=>{
                        shardCompare.forEach((sCompare, i)=>{
                            if(sTarget == sCompare){
                                duplicates.push(sTarget)
                            }
                        });
                    })
                }
            });
            log('Duplicates in Shard['+index+']', duplicates)
        })
    }

    if(classNameShards.length == 0){
        console.error('Error no tests found in Target');
        return;
    }

    if(TEST_PLAN == ''){
        log('\nCreating ' + classNameShards.length + ' Test Plan shards from Scheme');
        addTestPlans(main_group_uuid, classNameShards);
    } else {
        log('\nCreating ' + shards.length + ' Test Plan shards from Test Plan');
        updateTestPlan(classNameShards);
    }

    let quotedAndCommaSeparated = "\"" + XCODE_PATH + TEST_PLANS.join("\",\""+XCODE_PATH) + "\"";
    // TODO Use Envman to save these globally
    process.env.test_plans = quotedAndCommaSeparated;
});

// List all files in a directory in Node.js recursively in a synchronous fashion
function walkSync(dir, filelist) {
    var path = path || require('path');
    var fs = fs || require('fs'),
        files = fs.readdirSync(dir);
    filelist = filelist || [];
    files.forEach(function(file) {
        if (fs.statSync(path.join(dir, file)).isDirectory()) {
            filelist = walkSync(path.join(dir, file), filelist);
        }
        else {
            filelist.push(path.join(dir, file));
        }
    });
    return filelist;
};

// Update existing test plan
function updateTestPlan(shards){
    let testPlanPath = XCODE_PATH + TEST_PLAN;
    fs.readFile( testPlanPath, function(err, testPlanData) {
        if (err) {
            console.error('Error reading test plan:',err);
            process.exit();
        }
        let jsonString = testPlanData.toString();
        let testPlanJson = JSON.parse(jsonString.replace(/\\\//g, "~"));
        let otherTargets = testPlanJson.testTargets.filter((target) => target.target.name != TARGET)

        const otherTargetsShards = shard(otherTargets, SHARDS);

        log('otherTargetsShards:', otherTargetsShards);

        // Create Test Plans
        shards.forEach((shard, shardIndex) => {
            let shardName = XCODE_PATH+'TestShard_'+shardIndex+'.xctestplan';
            TEST_PLANS.push(shardName);

            let skipTestsShard = shards.filter((shard, index) => index != shardIndex);
            let skipTestNames = [];
            skipTestsShard.forEach((skipTests) => {
                skipTestNames = skipTestNames.concat(skipTests);
            });

            let mainTarget = getMainTargetFromTestPlan(testPlanJson, skipTestNames);
            log('mainTarget:', mainTarget);

            let shardTargets = otherTargetsShards.length > shardIndex ? otherTargetsShards[shardIndex] : [];
            log('shardTargets:', shardTargets);

            // Disable other targets not in the shard
            let disabledShards = otherTargetsShards.filter((tmp, i) => i != shardIndex);
            let allDisabledShards = [];
            disabledShards.forEach((disabledShard) => {
                disabledShard.forEach((target) => {
                    let disabledTarget = Object.assign({}, target)
                    disabledTarget.enabled = false;
                    allDisabledShards.push(disabledTarget);
                })
            });

            log('Writing Test Plan to file');

            let testPlan = createTestPlan(testPlanJson.defaultOptions, [mainTarget].concat(shardTargets).concat(allDisabledShards));

            fs.writeFileSync(shardName, testPlan);

            console.log('Test Plan Shard '+shardIndex+' Created:', shardName);
        })
    });
}

function getMainTargetFromTestPlan(testPlanJson, skippedShardTests){
    let mainTarget = null;
    testPlanJson.testTargets.forEach((testTarget) => {
        if(testTarget.target.name == TARGET){
            mainTarget = JSON.parse(JSON.stringify(testTarget));
            mainTarget.skippedTests = mainTarget.skippedTests.concat(skippedShardTests);
        }
    });
    if(mainTarget == null){
        console.error('Error cannot find Test Target');
        process.exit();
    }
    return mainTarget;
}

// Create and add test plans to project
function addTestPlans(main_group_uuid, shards){
    let schemePath = XCODE_PATH + XCODE_PROJECT + '/xcshareddata/xcschemes/' + SCHEME + '.xcscheme';
    fs.readFile( schemePath, function(err, schemeData) {
        if (err) {
            console.error('Error reading scheme:',err);
            process.exit();
        }

        // Handle &quot; in xml
        let unescapedData = schemeData.toString().replace(/&quot;/g, '~').replace(/&#10;/g, '^');

        // Parse XML to JSON
        let jsonStr = parser.toJson(unescapedData, {reversible: true})
        let schemeJson = JSON.parse(jsonStr);
        log('Scheme: ', schemeJson);

        // Get the Scheme default options
        let defaultOptions = getDefaulOptions(schemeJson);

        let otherTargets = getOtherTargets(schemeJson);
        const otherTargetsShards = shard(otherTargets, SHARDS);

        log('otherTargetsShards:', otherTargetsShards);

        // Create Test Plans
        shards.forEach((shard, shardIndex) => {
            let shardName = 'TestShard_'+shardIndex+'.xctestplan';
            TEST_PLANS.push(shardName);

            log('\nAdding test plan to XCode Project\'s Resources');
            myProj.addResourceFile(shardName, {lastKnownFileType: 'text'}, main_group_uuid);

            let skipTests = shards.filter((shard, index) => index != shardIndex);
            let skipTestNames = [];
            skipTests.forEach((skipTest) => {
                skipTestNames = skipTestNames.concat(skipTest);
            });

            let mainTarget = getMainTarget(schemeJson, skipTestNames);

            log('mainTarget:', mainTarget);

            let shardTargets = otherTargetsShards.length > shardIndex ? otherTargetsShards[shardIndex] : [];

            // Disable other targets not in the shard
            let disabledShards = otherTargetsShards.filter((tmp, i) => i != shardIndex);
            let allDisabledShards = [];
            disabledShards.forEach((disabledShard) => {
                disabledShard.forEach((target) => {
                    let disabledTarget = Object.assign({}, target)
                    disabledTarget.enabled = false;
                    allDisabledShards.push(disabledTarget);
                })
            });
            
            log('Writing Test Plan to file');
            fs.writeFileSync(XCODE_PATH + shardName, createTestPlan(defaultOptions, [mainTarget].concat(shardTargets).concat(allDisabledShards)));

            console.log('Test Plan Shard '+shardIndex+' Created:', shardName);
        })
        log('\nAdding Test Plans to XCode scheme');

        // Add Test Plans to scheme
        let schemeWithTestPlansJson = addTestPlanToXCodeScheme(schemeJson, TEST_PLANS);

        // Handle &quot; in xml
        let reescapedData = JSON.stringify(schemeWithTestPlansJson).replace(/~/g, '&quot;').replace(/\^/g, '&#10;')

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
}

function getOtherTargets(schemeJson){
    let targets = [];
    if(schemeJson.Scheme && schemeJson.Scheme.TestAction){
        let testAction = schemeJson.Scheme.TestAction;
        if(testAction.Testables){
            log('\nScheme Testables: ', testAction);
            let testableReference = [];
            if(testAction.Testables.TestableReference instanceof Array){
                testableReference = testAction.Testables.TestableReference;
            } else {
                testableReference = [testAction.Testables.TestableReference];
            }
            testableReference.forEach((testableReference) => {
                let buildableReference = testableReference.BuildableReference;
                if(testableReference.skipped == 'NO'  && buildableReference.BlueprintName != TARGET){
                    let skippedTests = null;
                    if(testableReference.SkippedTests){
                        skippedTests = [];
                        if(testableReference.SkippedTests.Test instanceof Array){
                            testableReference.SkippedTests.Test.forEach((skippedTest) => {
                                skippedTests.push(skippedTest.Identifier);
                            })
                        } else {
                            skippedTests.push(testableReference.SkippedTests.Test.Identifier);
                        }
                    }
                    let testTarget = {
                        target : {
                            containerPath : buildableReference.ReferencedContainer.replace(/\//g, "~"),
                            identifier : buildableReference.BlueprintIdentifier,
                            name : buildableReference.BlueprintName
                        }
                    };
                    if(skippedTests != null){
                        testTarget.skippedTests = skippedTests;
                    }
                    targets.push(testTarget);
                }
            })
        }
    }
    return targets;
}

function getMainTarget(schemeJson, skippedShardTests){
    let target = null;
    if(schemeJson.Scheme && schemeJson.Scheme.TestAction){
        let testAction = schemeJson.Scheme.TestAction;
        if(testAction.Testables){
            let testableReference = [];
            if(testAction.Testables.TestableReference instanceof Array){
                testableReference = testAction.Testables.TestableReference;
            } else {
                testableReference = [testAction.Testables.TestableReference];
            }
            testableReference.forEach((testableReference) => {
                let buildableReference = testableReference.BuildableReference;
                if(testableReference.skipped == 'NO' && buildableReference.BlueprintName == TARGET){
                    let skippedTests = [];
                    if(testableReference.SkippedTests){
                        if(testableReference.SkippedTests.Test instanceof Array){
                            testableReference.SkippedTests.Test.forEach((skippedTest) => {
                                skippedTests.push(skippedTest.Identifier);
                            })
                        } else {
                            skippedTests.push(testableReference.SkippedTests.Test.Identifier);
                        }
                    }
                    let allSkippedTests = skippedTests.concat(skippedShardTests)
                    target = {
                        "skippedTests" : allSkippedTests,
                        "parallelizable" : PARALLELIZABLE,
                        "target" : {
                            "containerPath" : buildableReference.ReferencedContainer.replace(/\//g, "~"),
                            "identifier" : buildableReference.BlueprintIdentifier,
                            "name" : buildableReference.BlueprintName
                        }
                    };
                }
            })
        }
    }
    if(target == null){
        console.error('Error: unable to find main target:', TARGET);
        process.exit();
    }
    return target;
}

function getDefaulOptions(schemeJson){
    let environmentVariableEntries = [];
    let commandLineArgumentEntries = [];
    let undefinedBehaviorSanitizerEnabled = null;
    let targetForVariableExpansion = null;
    let codeCoverage = false;
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
                        value: envVar.value.replace(/\//g, "~"),
                        enabled: envVar.isEnabled == 'YES' ? true : false
                    });
                })
            } else { // Single Element
                environmentVariableEntries.push({
                    key: envVars.key,
                    value: envVars.value.replace(/\//g, "~"),
                    enabled: envVars.isEnabled == 'YES' ? true : false
                });
            }
        }
    }
    if(schemeJson.Scheme && schemeJson.Scheme.TestAction){
        let testAction = schemeJson.Scheme.TestAction;
        if(testAction.codeCoverageEnabled){
            codeCoverage = true;
        }
        // targetForVariableExpansion
        if(testAction.MacroExpansion && testAction.MacroExpansion.BuildableReference){
            let ref = testAction.MacroExpansion.BuildableReference;
            targetForVariableExpansion = {
                containerPath: ref.ReferencedContainer,
                identifier: ref.BlueprintIdentifier,
                name: ref.BlueprintName
            };
        }
        // undefinedBehaviorSanitizerEnabled
        if(testAction.enableUBSanitizer != null){
            undefinedBehaviorSanitizerEnabled = testAction.enableUBSanitizer == 'YES' ? true : false;
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
        console.error('Error: json.Scheme && json.Scheme.TestAction not found');
        process.exit();
    }
    return schemeJson;
}

function createTestPlan(defaultOptions, testTargets){
    let testPlan = {
        "configurations" : [
            {
                "id" : (''+uuid.v4()).toUpperCase(),
                "name" : "Configuration 1",
                "options" : {}
            }
        ],
        "defaultOptions" : defaultOptions,
        "testTargets" : testTargets,
        "version" : 1
      }
    return JSON.stringify(testPlan).replace(/~/g, '\\/');
}

function shard(arr, numShards) {
    const newArr = [];
    for (let s = 0; s < numShards; s++) {
        newArr.push([])
    }
    for (let i = 0; i < arr.length; i++) {
        const mod = i % numCols
        newArr[mod].push(arr[i])
    }
    return newArray
}

function log(msg, obj){
    if(DEBUG){
        console.log(msg, obj ? obj : '');
    }
}

function getRecursiveTests(myProj, target_uuid, tests = []){
    const target = myProj.getPBXGroupByKey(target_uuid);
    // log('Checking=====:', target_uuid)
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
