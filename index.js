// Inputs
const SOURCE_DIR = process.env.source_dir + '/';
const XCODE_PROJECT = process.env.xcode_project;
const SHARDS = process.env.shards;
const TARGET = process.env.target;
const SCHEME = process.env.scheme;
const TYPE = process.env.file_type;

console.log('SOURCE_DIR:',SOURCE_DIR)
console.log('XCODE_PROJECT:',XCODE_PROJECT)
console.log('TARGET:',TARGET)
console.log('SCHEME:',SCHEME)
console.log('SHARDS:',SHARDS)
console.log('TYPE:',TYPE)

// Outputs
const TEST_PLANS = [];

const xcode = require('xcode'),
    fs = require('fs'),
    uuid = require('uuid'),
    parser = require('xml2json');
    projectPath = SOURCE_DIR + XCODE_PROJECT + '/project.pbxproj',
    outputProjectPath = SOURCE_DIR + XCODE_PROJECT + '/project.pbxproj',
    myProj = xcode.project(projectPath);


// parsing is async, in a different process
myProj.parse(function (err) {
    if (err) {
        console.error('Error:', err);
        return;
    }
    const project = myProj.getFirstProject();
    const main_group_uuid = project.firstProject.mainGroup;
    const group = myProj.getPBXGroupByKey(main_group_uuid);
    const target = group.children.find((child) => child.comment == TARGET);
    const target_uuid = target.value;

    const tests = myProj.getPBXGroupByKey(target_uuid).children.filter((test) => test.comment.indexOf(TYPE) != -1);
    const shard_size = Math.ceil(tests.length / SHARDS);
    const shards = shard(tests, shard_size);
    console.log('Processing ' + shards.length + ' shards');
    shards.forEach((shard, index) => {
        let shardName = 'TestShard_'+index+'.xctestplan';
        TEST_PLANS.push(shardName);

        myProj.addResourceFile(shardName, {lastKnownFileType: 'text'}, main_group_uuid);
        console.log('Writing Test Plan to file');
        fs.writeFileSync(SOURCE_DIR+shardName, createTestPlan(target_uuid, [].concat(shards), index));
    })
    console.log('Updating scheme');
    addTestPlanToXCodeScheme(SOURCE_DIR + XCODE_PROJECT + '/xcshareddata/xcschemes/' + SCHEME + '.xcscheme', TEST_PLANS);
    
    console.log('Writing xcode project');
    fs.writeFileSync(outputProjectPath, myProj.writeSync());
    let quotedAndCommaSeparated = "\"" + SOURCE_DIR + TEST_PLANS.join("\",\""+SOURCE_DIR) + "\"";
    console.log(SHARDS+' Test Plans Created:', quotedAndCommaSeparated);
    process.env.test_plans = quotedAndCommaSeparated;
});

function addTestPlanToXCodeScheme(scheme, testPlans){
    fs.readFile( scheme, function(err, data) {
        if (err) {
            console.error(err);
            return; 
        }
        var json = JSON.parse(parser.toJson(data, {reversible: true}));

        if(json.Scheme && json.Scheme.TestAction){
            if(!json.Scheme.TestAction.TestPlans){
                json.Scheme.TestAction.TestPlans = {
                    TestPlanReference: []
                }
            }
            testPlans.forEach((testPlan) => {
                json.Scheme.TestAction.TestPlans.TestPlanReference.push({ reference: 'container:'+testPlan, '$t': '' })
            })
        } else {
            console.log('Error: json.Scheme && json.Scheme.TestAction not found');   
        }
        var stringified = JSON.stringify(json);
        var xml = parser.toXml(stringified);
        fs.writeFile(scheme, xml, function(err, data) {
            if (err) {
                console.log(err);
            } else {
                console.log('Writing XCode Project: ');   
            }
        });
    });
}

function createTestPlan(target_uuid, shards, shardIndex){
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
                "options" : {
            
                }
            }
        ],
        "defaultOptions" : {
            "codeCoverage" : false
        },
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
    var newArr = []; start = 0; end = howMany;
    for(var i=1; i<= Math.ceil(arr.length / howMany); i++) {
        newArr.push(arr.slice(start, end));
        start = start + howMany;
        end = end + howMany
    }
    return newArr;
}
