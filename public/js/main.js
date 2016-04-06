requirejs.config({
	shim: {
		'lib/mqttws31': {
			exports: 'Paho'
		},
	}
});

var onerror = console.error.bind(console);
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
				console.log(endpoint);
				var id = (Date.now() + Math.random()).toString(36);
				window.client = new Paho.MQTT.Client(endpoint, id);
				client.connect({
					useSSL: true,
					timeout: 3,
					keepAliveInterval: 30,
					mqttVersion:4,
					onSuccess: function() {
						console.log('connected', id);
						
						client.subscribe('user/' + id, {
							onSuccess: function() {
								client.subscribe('room/test', {
									onSuccess: function() {
										console.log('subscribed to', ['user/' + id, 'room/test']);
										
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
													var audio = new Audio(window.URL.createObjectURL(event.stream));
													audio.play();
												};

												peer.addStream(stream);
											}

											if(message.sdp) {
												console.log(new Date().getSeconds(), 'setRemoteDescription');
												peer.setRemoteDescription(new RTCSessionDescription(message.sdp));
											}

											if(message.ice) {
												console.log(new Date().getSeconds(), 'addIceCandidate');
												peer.addIceCandidate(new RTCIceCandidate(message.ice));
											}

											if(message.readyForOffer) {
												console.log(new Date().getSeconds(), 'createOffer');
												peer.createOffer(function(desc) {
													console.log(new Date().getSeconds(), 'setLocalDescription');
													peer.setLocalDescription(desc);
													client.send('user/' + message.from, JSON.stringify({
														from: id,
														sdp: desc,
														readyForAnswer: true
													}));
												}, onerror);
											}

											if(message.readyForAnswer) {
												console.log(new Date().getSeconds(), 'createAnswer');
												peer.createAnswer(function(desc) {
													console.log(new Date().getSeconds(), 'setLocalDescription');
													peer.setLocalDescription(desc);
													client.send('user/' + message.from, JSON.stringify({
														from: id,
														sdp: desc
													}));
												}, onerror);
											}
										};

										// Tell connected clients to send us offers
										client.send('room/test', JSON.stringify({
											readyForOffer: true,
											from: id
										}));
									}
								});
							}
						});
					},
					onFailure: function() {
						console.error('could not connect');
					}
				});
			}
		};
		
		xhr.send();
	}, onerror);
});
