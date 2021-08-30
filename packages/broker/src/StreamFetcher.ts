import memoize from 'memoizee'
import { Logger } from 'streamr-network'
// TODO do all REST operations to E&E via StreamrClient
import StreamrClient, { StreamOperation } from 'streamr-client'
import { Todo } from './types'

const logger = new Logger(module)

const MAX_AGE = 15 * 60 * 1000 // 15 minutes
const MAX_AGE_MINUTE = 1000 // 1 minutes

export class StreamFetcher {

    fetch
    checkPermission
    authenticate
    client: StreamrClient

    constructor(client: StreamrClient) {
        this.fetch = memoize<StreamFetcher['_fetch']>(this._fetch, {
            maxAge: MAX_AGE,
            promise: true,
        })
        this.checkPermission = memoize<StreamFetcher['_checkPermission']>(this._checkPermission, {
            maxAge: MAX_AGE,
            promise: true,
        })
        this.authenticate = memoize<StreamFetcher['_authenticate']>(this._authenticate, {
            maxAge: MAX_AGE_MINUTE,
            promise: true,
        })
        this.client = client
    }

    private async _authenticate(streamId: string, sessionToken: string, operation: StreamOperation = StreamOperation.STREAM_SUBSCRIBE): Promise<Todo>  {
        await this.checkPermission(streamId, operation)
        return this.fetch(streamId)
    }

    /**
     * Returns a Promise that resolves with the stream json.
     * Fails if there is no read permission.
     *
     * @param streamId
     * @param sessionToken
     * @returns {Promise.<TResult>}
     * @private
     */
    private async _fetch(streamId: string): Promise<Todo> {
        return this.client.getStream(streamId)
    }

    /**
     * Retrieves permissions to a stream, and checks if a permission is granted
     * for the requested operation.
     * Promise always resolves to true or throws if permissions are invalid.
     *
     * @param streamId
     * @param sessionToken
     * @param operation
     * @returns {Promise}
     * @private
     */
    private async _checkPermission(streamId: string, operation: StreamOperation = StreamOperation.STREAM_SUBSCRIBE): Promise<boolean> {
        if (streamId == null) {
            throw new Error('_checkPermission: streamId can not be null!')
        }
        return (await this.client.getStream(streamId)).hasPermission(operation, await this.client.getAddress())
    }
}
