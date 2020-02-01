/* external modules */
var mongodb = require('mongodb');

/* own modules */
var lib = require('./lib');
var common = require('./common');

module.exports = function(url, req, rep, query, payload, session) {

    console.log('REST handling ' + req.method + ' ' + url + ' query ' + JSON.stringify(query) + ' payload ' + JSON.stringify(payload) + ' session ' + session);
    switch(url) {

        case '/account':
            if(!common.sessions[session].accountNo) {
                lib.sendJSONWithError(rep, 401, 'You are not logged in'); return;
            }
            switch(req.method) {
                case 'GET':
                    common.accounts.findOne({_id: common.sessions[session].accountNo}, {}, function(err, account) {
                        if(err) {
                            lib.sendJSONWithError(rep, 400, 'No such object'); return;
                        }
                        delete account.password;                
                        lib.sendJSON(rep, account);
                    });
                    break;
                case 'POST':
                    common.accounts.findOne({_id: common.sessions[session].accountNo}, {}, function(err, account) {
                        if(err) {
                            lib.sendJSONWithError(rep, 400, 'No such object'); return;
                        }                
                        if(isNaN(payload.amount) || payload.amount <= 0) {
                            lib.sendJSONWithError(rep, 400, 'Invalid operation data');
                        } else if(account.balance - payload.amount < account.limit) {
                            lib.sendJSONWithError(rep, 400, 'Limit exceeded');
                        } else {
                            common.accounts.find({email: payload.recipient}).toArray(function(err, docs) {
                                if(err || docs.length != 1) {
                                    lib.sendJSONWithError(rep, 400, 'Recipient unknown or ambiguous');
                                    return;
                                }
                                var recipient_id = docs[0]._id;
                                if(recipient_id.equals(account._id)) {
                                    lib.sendJSONWithError(rep, 400, 'Sender and recipient are the same account');
                                    return;
                                }
                                common.accounts.findOneAndUpdate({_id: common.sessions[session].accountNo},
                                    {$set: {balance: account.balance - payload.amount, lastOperation: new Date().getTime()}},
                                    {returnOriginal: false}, function(err, updated) {
                                    if(err) {
                                        lib.sendJSONWithError(rep, 400, 'Update failed'); return;
                                    }
                                    common.accounts.findOneAndUpdate({_id: recipient_id},
                                        {$inc: {balance: payload.amount, lastOperation: new Date().getTime()}},
                                        {returnOriginal: false}, function(err, updated_r) {
                                            if(err) {
                                                console.log('Recipient account balance is not updated');
                                                return;
                                            }
                                            common.history.insertOne({
                                                date: updated.value.lastOperation,
                                                account: common.sessions[session].accountNo,
                                                recipient_id: recipient_id,
                                                amount: payload.amount,
                                                balance: updated.value.balance,
                                                balance_r: updated_r.value.balance,
                                                description: payload.description
                                            });        
                                            // message to recipient
                                            var message = { transfer: {
                                                from: common.sessions[session].accountNo,
                                                amount: payload.amount,
                                                balance: updated_r.value.balance
                                            }};
                                            lib.sendDataToAccount(recipient_id, JSON.stringify(message));
                                        });
                                    delete updated.value.password;
                                    lib.sendJSON(rep, updated.value);    
                                });
                            });
                        }
                    });
                    break;
                default:
                    lib.sendJSONWithError(rep, 400, 'Invalid method ' + req.method + ' for ' + url);
            }
            break;

        case '/recipients':
            switch(req.method) {
                case 'GET':
                    common.history.aggregate([
                        {$match:{account: common.sessions[session].accountNo}},
                        {$group:{_id:'$recipient_id'}},
                        {$lookup:{from:'accounts','localField':'_id','foreignField':'_id','as':'recipient'}},
                        {$unwind:'$recipient'},
                        {$addFields:{email:'$recipient.email'}},
                        {$project:{_id:false,recipient:false}},
                        {$sort:{email:1}}
                    ]).toArray(function(err, docs) {
                        lib.sendJSON(rep, docs.map(function(el) { return el.email; }));
                    });
                    break;
                default: lib.sendJSONWithError(rep, 400, 'Invalid method ' + req.method + ' for ' + url);
            }
            break;

        case '/history':
            switch(req.method) {
                case 'GET':
                    if(!common.sessions[session].accountNo) {
                        lib.sendJSONWithError(rep, 401, 'You are not logged in'); return;    
                    }
                    var skip = parseInt(query.skip);
                    var limit = parseInt(query.limit);
                    if(isNaN(skip) || isNaN(limit) || skip < 0 || limit <= 0) {
                        lib.sendJSONWithError(rep, 400, 'Skip/limit errornous'); return;    
                        return;
                    }
                    var q = {$or: [{account: common.sessions[session].accountNo},{recipient_id: common.sessions[session].accountNo}]};
                    if(query.filter) {
                        q.description = {$regex: new RegExp(query.filter), $options: 'si'};
                    }
                    common.history.aggregate([
                        {$match:q},
                        {$lookup:{from:'accounts',localField:'account',foreignField:'_id',as:'sender'}},
                        {$unwind:{path:'$sender'}},
                        {$addFields:{email:'$sender.email'}},
                        {$lookup:{from:'accounts',localField:'recipient_id',foreignField:'_id',as:'recipient'}},
                        {$unwind:{path:'$recipient'}},
                        {$addFields:{email_r:'$recipient.email'}},
                        {$addFields:{balance_after:{$cond:{if:{$eq:['$email',common.sessions[session].email]},then:'$balance',else:'$balance_r'}}}},
                        {$project:{account:false,sender:false,recipient:false,balance:false,balance_r:false}},
                        {$sort:{date:-1}},{$skip:skip},{$limit:limit}
                    ]).toArray(function(err, entries) {
                        if(err)
                            lib.sendJSONWithError(rep, 400, 'History retrieving failed');
                        else {
                            lib.sendJSON(rep, entries);
                        }
                    });
                    break;
                case 'DELETE':
                    if(!common.sessions[session].accountNo) {
                        lib.sendJSONWithError(rep, 401, 'You are not logged in'); return;    
                    }
                    common.history.aggregate([
                        {$match:{$or: [{account: common.sessions[session].accountNo},{recipient_id: common.sessions[session].accountNo}]}},
                        {$lookup:{from:'accounts',localField:'account',foreignField:'_id',as:'sender'}},
                        {$unwind:{path:'$sender'}},
                        {$lookup:{from:'accounts',localField:'recipient_id',foreignField:'_id',as:'recipient'}},
                        {$unwind:{path:'$recipient'}},
                        {$count:'count'}
                    ]).toArray(function(err, docs) {
                        if(err || docs.length != 1)
                            lib.sendJSONWithError(rep, 400, 'Cannot count objects in history'); 
                        else
                            lib.sendJSON(rep, docs[0]);
                    });
                    break;
            }
            break;

        case '/login':
            switch(req.method) {
                case 'GET':
                    var whoami = {
                        session: session,
                        accountNo: common.sessions[session].accountNo,
                        email: common.sessions[session].email
                    };
                    lib.sendJSON(rep, whoami);
                    break;
                case 'POST':
                    if(!payload || !payload.email || !payload.password) {
                        lib.sendJSONWithError(rep, 401, 'Invalid credentials');
                        return;
                    }
                    common.accounts.findOne(payload, {}, function(err, account) {
                        if(err || !account) {
                            lib.sendJSONWithError(rep, 401, 'Bad password');
                            return;
                        }
                        common.sessions[session].accountNo = account._id;
                        common.sessions[session].email = account.email;
                        delete account.password;
                        lib.sendJSON(rep, account);
                    });
                    break;
                case 'DELETE':
                    delete common.sessions[session].accountNo;
                    delete common.sessions[session].email;
                    lib.sendJSON(rep, { session: session });
                    break;
                default:
                    lib.sendJSONWithError(rep, 400, 'Invalid method ' + req.method + ' for ' + url);
            }
            break;

        default:
            lib.sendJSONWithError(rep, 400, 'Invalid rest endpoint ' + url);
    }
};