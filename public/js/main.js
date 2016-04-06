requirejs.config({
	shim: {
		'lib/mqttws31': {
			exports: 'Paho'
		},
	}
});

var output = document.getElementById('output');
var log = function() {
	console.log.apply(console, arguments);
	
	var now = new Date();
	var time = [
		('0' + now.getHours()).substr(-2),
		('0' + now.getMinutes()).substr(-2),
		('0' + now.getSeconds()).substr(-2)
	].join(':');
	
	var args = Array.from(arguments).map(function(value) {
		if(typeof value == 'object') {
			return JSON.stringify(value);
		} else {
			return String(value);
		}
	});
	
	args.unshift(time);
	
	var text = document.createTextNode(args.join(' ') + '\n');
	if(output.firstChild) {
		output.insertBefore(text, output.firstChild);
	} else {
		output.appendChild(text);
	}
};
var peers = {};
var config = {
	iceServers: [
		{ url: 'stun:stun.services.mozilla.com' },
		{ url: 'stun:stun.l.google.com:19302' }
	]
};

requirejs(['lib/adapter', 'lib/mqttws31'], function(adapter, Paho) {
	navigator.getUserMedia({ audio: true, video: false }, function(stream) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', 'https://iqh33xlkjg.execute-api.us-west-2.amazonaws.com/prod/iotaccess', true);
		
		xhr.onreadystatechange = function() {
			if(xhr.readyState == 4 && xhr.status == 200) {
				var endpoint = JSON.parse(xhr.responseText);
				var id = (Date.now() + Math.random()).toString(36);
				window.client = new Paho.MQTT.Client(endpoint, id);
				client.connect({
					useSSL: true,
					timeout: 3,
					keepAliveInterval: 30,
					mqttVersion:4,
					onSuccess: function() {
						log('connected');
						log('id set to', id);
						
						client.subscribe('user/' + id, {
							onSuccess: function() {
								log('subscribed to', 'user/' + id);
								
								client.subscribe('channel/test-channel', {
									onSuccess: function() {
										log('subscribed to', 'channel/test-channel');
										
										client.onMessageArrived = function(message) {
											message = JSON.parse(message.payloadString);
											
											if(message.from == id) {
												return;
											}
											
											console.log('got', JSON.stringify(message));
											
											var peer = peers[message.from];
											if(!peer) {
												peer = peers[message.from] = new RTCPeerConnection(config);

												peer.onicecandidate = function(event) {
													if(event.candidate) {
														client.send('user/' + message.from, JSON.stringify({
															from: id,
															ice: event.candidate
														}));
													}
												};

												peer.onaddstream = function(event) {
													log('received audio stream');
													var audio = new Audio(window.URL.createObjectURL(event.stream));
													audio.play();
												};

												peer.addStream(stream);
											}

											if(message.sdp) {
												log('setRemoteDescription');
												peer.setRemoteDescription(new RTCSessionDescription(message.sdp));
											}

											if(message.ice) {
												console.log('addIceCandidate');
												peer.addIceCandidate(new RTCIceCandidate(message.ice));
											}

											if(message.readyForOffer) {
												log('createOffer');
												peer.createOffer(function(desc) {
													log('setLocalDescription');
													peer.setLocalDescription(desc);
													client.send('user/' + message.from, JSON.stringify({
														from: id,
														sdp: desc,
														readyForAnswer: true
													}));
												}, log);
											}

											if(message.readyForAnswer) {
												log('createAnswer');
												peer.createAnswer(function(desc) {
													log('setLocalDescription');
													peer.setLocalDescription(desc);
													client.send('user/' + message.from, JSON.stringify({
														from: id,
														sdp: desc
													}));
												}, log);
											}
										};

										// Tell connected clients to send us offers
										client.send('channel/test-channel', JSON.stringify({
											readyForOffer: true,
											from: id
										}));
									}
								});
							}
						});
					},
					onFailure: function() {
						error('could not connect');
					}
				});
			}
		};
		
		xhr.send();
	}, log);
});
