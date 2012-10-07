var updates = require('kujua-sms/updates'),
    lists = require('kujua-sms/lists'),
    logger = require('kujua-utils').logger,
    baseURL = require('duality/core').getBaseURL(),
    appdb = require('duality/core').getDBURL(),
    querystring = require('querystring'),
    jsDump = require('jsDump'),
    fakerequest = require('couch-fakerequest'),
    helpers = require('../../test-helpers/helpers');


var example = {
    sms_message: {
       from: "+13125551212",
       message: '1!PSMM!facility#2011#2#1#5#3#7#9#9#2#5#2#2#11#3#4#5#6#2#1#3#6#8#9#',
       sent_timestamp: '01-19-12 18:45',
       sent_to: "+15551212",
       type: "sms_message",
       locale: "en",
       form: "PSMM"
    },
    clinic: {
        "_id": "4a6399c98ff78ac7da33b639ed60f458",
        "_rev": "1-0b8990a46b81aa4c5d08c4518add3786",
        "type": "clinic",
        "name": "Example clinic 1",
        "contact": {
            "name": "Sam Jones",
            "phone": "+13125551212"
        },
        "parent": {
            "type": "health_center",
            "contact": {
                "name": "Neal Young",
                "phone": "+17085551212"
            },
            "parent": {
                "type": "district_hospital",
                "contact": {
                    "name": "Bernie Mac",
                    "phone": "+14155551212"
                }
            }
        }
    },
};


/*
 * STEP 1:
 *
 * Run add_sms and expect a callback to add a clinic to a data record which
 * contains all the information from the SMS.
 **/
exports.psmm_to_record = function (test) {

    test.expect(13);

    // Data parsed from a gateway POST
    var data = {
        from: '+13125551212',
        message: '1!PSMM!facility#2011#2#1#5#3#7#9#9#2#5#2#2#11#3#4#5#6#2#1#3#6#8#9#',
        sent_timestamp: '01-19-12 18:45',
        sent_to: '+15551212'
    };

    // request object generated by duality includes uuid and query.form from
    // rewriter.
    var req = {
        uuid: '14dc3a5aa6',
        method: "POST",
        headers: helpers.headers("url", querystring.stringify(data)),
        body: querystring.stringify(data),
        form: data
    };

    var resp = fakerequest.update(updates.add_sms, data, req);

    var resp_body = JSON.parse(resp[1].body);

    // assert that we are parsing sent_timestamp
    test.same(
        'Thu Jan 19 2012',
        new Date(resp_body.callback.data.reported_date).toDateString()
    );

    test.equal(
        "18:45",
        new Date(resp_body.callback.data.reported_date)
            .toTimeString().match(/^18:45/)[0]
    );

    delete resp_body.callback.data.reported_date;

    test.same(
        resp_body.callback.options.path,
        baseURL + "/PSMM/data_record/add/clinic/%2B13125551212");

    step2_1(test, helpers.nextRequest(resp_body, 'PSMM'));

};


/*
 * STEP 1:
 *
 * Run data_record/add/clinic and expect a callback to
 * check if the same data record already exists with existing clinic.
 */
var step2_1 = function(test, req) {

    var clinic = example.clinic;

    var viewdata = {rows: [
        {
            "key": ["+13125551212"],
            "value": clinic
        }
    ]};

    var resp = fakerequest.list(lists.data_record, viewdata, req);

    var resp_body = JSON.parse(resp.body);

    test.same(
        resp_body.callback.options.path,
        baseURL + "/PSMM/data_record/merge/2011/2/" + clinic._id);

    test.same(
        resp_body.callback.data.related_entities,
        {clinic: clinic});

    test.same(resp_body.callback.data.errors, []);

    step3_1(test, helpers.nextRequest(resp_body, 'PSMM'),
        step3_2, [test, helpers.nextRequest(resp_body, 'PSMM')]);

};



/**
 * STEP 3, CASE 1: A data record already exists.
 *
 * Run data_record/merge/year/month/clinic_id and expect a callback to update
 * the data record with the new data.
 *
 * @param {Object} test     - Unittest object
 * @param {Object} req      - Callback object used to form the next request
 * @param {Function} finish - Last callback where test.done() is called
 * @param {Array} args      - Args for last callback
 * @api private
 */
var step3_1 = function(test, req, finish, args) {

    var viewdata = {rows: [
        {
            key: ["2011", "2", "4a6399c98ff78ac7da33b639ed60f458"],
            value: {
                _id: "777399c98ff78ac7da33b639ed60f422",
                _rev: "484399c98ff78ac7da33b639ed60f923"
            }
        }
    ]};

    var resp = fakerequest.list(lists.data_record_merge, viewdata, req);
    var resp_body = JSON.parse(resp.body);

    // main tests
    test.same(
        resp_body.callback.data._rev,
        "484399c98ff78ac7da33b639ed60f923");

    test.same(
        resp_body.callback.options.path,
        appdb + "/777399c98ff78ac7da33b639ed60f422");

    test.same(
        resp_body.callback.options.method,
        "PUT");

    test.same(resp_body.callback.data.errors, []);
    test.same(resp_body.callback.data.tasks, []);

    if (typeof finish === 'function') {
        finish.apply(this, args);
    }
};


/**
 * STEP 3, CASE 2:
 *
 * A data record does not exist.
 *
 * Run data_record/merge/year/month/clinic_id and expect a callback to create a
 * new data record.
 */
var step3_2 = function(test, req) {

    var viewdata = {rows: []};

    var resp = fakerequest.list(lists.data_record_merge, viewdata, req);

    var resp_body = JSON.parse(resp.body);

    // If no record exists during the merge then we create a new record with
    // POST
    test.same(resp_body.callback.options.method, "POST");
    test.same(resp_body.callback.options.path, appdb);

    test.done();
};