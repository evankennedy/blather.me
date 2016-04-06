var crypto = require('crypto');

var service = 'iotdevicegateway';
var region = process.env.AWS_REGION;
var accessKey = process.env.AWS_ACCESS_KEY_ID;
var secretKey = process.env.AWS_SECRET_ACCESS_KEY;
var token = encodeURIComponent(process.env.AWS_SESSION_TOKEN);

var algorithm = 'AWS4-HMAC-SHA256';
var host = 'a3f06krxaekopb.iot.us-west-2.amazonaws.com';
var canonicalUri = '/mqtt';
var method = 'GET';

var SigV4Utils = {
    sign: function(key, msg) {
        return crypto.createHmac('sha256', key).update(msg).digest().toString('hex');
    },
    sha256: function(msg) {
        return crypto.createHash('sha256').update(msg, 'utf8').digest().toString('hex');
    },
    getSignatureKey: function(key, dateStamp, regionName, serviceName) {
    	var kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
    	var kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
    	var kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
    	var kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    	return kSigning;
    }
};

exports.handler = function(event, context) {
	var now = new Date();
	var amzdate = now.toISOString().replace(/[-:]/g, '').split('.')[0]+'Z';
	var dateStamp = amzdate.split('T')[0];
	var credentialScope = dateStamp + '/' + region + '/' + service + '/' + 'aws4_request';
	var canonicalQuerystring = 'X-Amz-Algorithm=AWS4-HMAC-SHA256';
	canonicalQuerystring += '&X-Amz-Credential=' + encodeURIComponent(accessKey + '/' + credentialScope);
	canonicalQuerystring += '&X-Amz-Date=' + amzdate;
	canonicalQuerystring += '&X-Amz-Expires=86400';
	canonicalQuerystring += '&X-Amz-SignedHeaders=host';

	var canonicalHeaders = 'host:' + host + '\n';
	var payloadHash = SigV4Utils.sha256('');
	var canonicalRequest = method + '\n' + canonicalUri + '\n' + canonicalQuerystring + '\n' + canonicalHeaders + '\nhost\n' + payloadHash;

	var stringToSign = algorithm + '\n' +  amzdate + '\n' +  credentialScope + '\n' +  SigV4Utils.sha256(canonicalRequest);
	var signingKey = SigV4Utils.getSignatureKey(secretKey, dateStamp, region, service);
	console.log('signingKey', signingKey);
	var signature = SigV4Utils.sign(signingKey, stringToSign);

	canonicalQuerystring += '&X-Amz-Signature=' + signature;
	canonicalQuerystring += '&X-Amz-Security-Token=' + token;
	var requestUrl = 'wss://' + host + canonicalUri + '?' + canonicalQuerystring;
	context.succeed(requestUrl);
};
