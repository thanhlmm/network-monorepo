# streamr-client

streamr-client is a JavaScript client for connecting to Streamr data. You can subscribe to user interface widget updates or even raw data streams.

## Requirements

* socket.io

## Usage

```javascript
client = new StreamrClient({ 
	// Connection options and default values
	server: 'data.streamr.com',
	autoConnect: true,
	autoDisconnect: true
})
client.subscribe(
	'stream-id', 
	function(message, streamId, counter) {
		// Do something with the message, which is an object
	},
	{ 
		// Resend options, see below
	}
)
client.connect()
```

## Handling messages

The second argument to client.subscribe() is the callback function that will be called for each message as they arrive. Its arguments are as follows:

Argument | Description
-------- | -----------
message  | A javascript object containing the message itself
streamId | The id of the stream the message belongs to
timestamp| (optional) A javascript Date object containing the timestamp for this message, if available.
counter  | (optional) A sequence number for this message, if available.


## Connection options

Option | Default value | Description
------ | ------------- | -----------
server | api.streamr.com | Address of the server to connect to.
autoConnect | true | If set to `true`, the client connects automatically on the first call to `subscribe()`. Otherwise an explicit call to `connect()` is required.
autoDisconnect | true  | If set to `true`, the client automatically disconnects when the last channel is unsubscribed. Otherwise the connection is left open and can be disconnected explicitly by calling `disconnect()`.

## Resend options

Note that only one of the resend options can be used for a particular subscription. The default functionality is to resend nothing, only subscribe to messages from the subscription moment onwards.

Option | Default value | Description
------ | ------------- | -----------
resend_all | undefined | Set to `true` if you want all the messages for the channel resent from the earliest available message.
resend_last | undefined | Resend the previous `N` messages.
resend_from | undefined | Resend from a specific message number.
resend_from_time | undefined | Resend from a specific Date (or millisecond timestamp).
resend_to | undefined | Can be used in conjunction with `resend_from` to limit the end of the resend. By default it is the newest message.

## Methods

Name | Description
---- | -----------
connect() | Connects to the server, and also subscribes to any streams for which `subscribe()` has been called before calling `connect()`.
disconnect() | Disconnects from the server, clearing all subscriptions.
pause() | Disconnects from the server without clearing subscriptions.
subscribe(streamId, callback, resendOptions) | Subscribes to a stream identified by the string `streamId`. Messages in this stream are passed to the `callback` function. See the above table for `resendOptions`. Returns a `Subscription` object.
unsubscribe(Subscription) | Unsubscribes the given `Subscription`.
unsubscribeAll(`streamId`) | Unsubscribes all `Subscriptions` for `streamId`.
getSubscriptions(`streamId`) | Returns a list of `Subscriptions` for `streamId`.
bind(eventName, function) | Binds a `function` to an event called `eventName`
unbind(eventName, function) | Unbinds the `function` from events called `eventName`

## Events on the client

Name | Handler Arguments | Description
---- | ----------------- | -----------
connected |  | Fired when the client has connected (or reconnected).
disconnected |  | Fired when the client has disconnected (or paused).

## Events on the `Subscription` object

Name | Handler Arguments | Description
---- | ----------------- | -----------
subscribed | {from: number} | Fired when a subscription request is acknowledged by the server.
unsubscribed |  | Fired when an unsubscription is acknowledged by the server.
