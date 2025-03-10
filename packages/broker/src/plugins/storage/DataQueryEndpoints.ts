/**
 * Endpoints for RESTful data requests
 */
import express, { Request, Response, Router } from 'express'
import { StreamMessage } from 'streamr-client-protocol'
import { Logger, Metrics, MetricsContext } from 'streamr-network'
import { Readable, Transform } from 'stream'
import { Storage } from './Storage'
import { AuthenticatedRequest, authenticator } from '../../RequestAuthenticatorMiddleware'
import { Format, getFormat } from './DataQueryFormat'
import { LEGACY_API_ROUTE_PREFIX } from '../../httpServer'
import { StreamFetcher } from "../../StreamFetcher"

const logger = new Logger(module)

// TODO: move this to protocol-js
export const MIN_SEQUENCE_NUMBER_VALUE = 0
export const MAX_SEQUENCE_NUMBER_VALUE = 2147483647

class ResponseTransform extends Transform {

    format: Format
    version: number|undefined
    firstMessage = true

    constructor(format: Format, version: number|undefined) {
        super({
            writableObjectMode: true
        })
        this.format = format
        this.version = version
    }

    _transform(input: StreamMessage, _encoding: string, done: () => void) {
        if (this.firstMessage) {
            this.firstMessage = false
            this.push(this.format.header)
        } else {
            this.push(this.format.delimiter)
        }
        this.push(this.format.getMessageAsString(input, this.version))
        done()
    }

    _flush(done: () => void) {
        if (this.firstMessage) {
            this.push(this.format.header)
        }
        this.push(this.format.footer)
        done()
    }
}

function parseIntIfExists(x: string | undefined): number | undefined {
    return x === undefined ? undefined : parseInt(x)
}

const sendError = (message: string, res: Response) => {
    logger.error(message)
    res.status(400).json({
        error: message
    })
}

const createEndpointRoute = (
    name: string,
    router: express.Router,
    metrics: Metrics,
    processRequest: (req: Request, streamId: string, partition: number, onSuccess: (data: Readable) => void, onError: (msg: string) => void) => void
) => {
    router.get(`${LEGACY_API_ROUTE_PREFIX}/streams/:id/data/partitions/:partition/${name}`, (req: Request, res: Response) => {
        const format = getFormat(req.query.format as string)
        if (format === undefined) {
            sendError(`Query parameter "format" is invalid: ${req.query.format}`, res)
        } else {
            metrics.record(name + 'Requests', 1)
            const streamId = req.params.id
            const partition = parseInt(req.params.partition)
            const version = parseIntIfExists(req.query.version as string)
            processRequest(req, streamId, partition, 
                (data: Readable) => {
                    data.once('data', () => {
                        res.writeHead(200, {
                            'Content-Type': format.contentType
                        })
                    })
                    data.on('error', (err: any) => {
                        logger.error(`Stream error in DataQueryEndpoints: ${streamId}`, err)
                        if (!res.headersSent) {
                            res.status(500).json({
                                error: 'Failed to fetch data!'
                            })
                        }
                    })
                    data.pipe(new ResponseTransform(format, version)).pipe(res)
                    res.on('close', () => {
                        // stops streaming the data if the client aborts fetch
                        data.destroy()
                    })
                },
                (errorMessage: string) => sendError(errorMessage, res)
            )
        }
    })
}

type LastRequest = AuthenticatedRequest<{
    count?: string
}>

type FromRequest = AuthenticatedRequest<{
    fromTimestamp?: string
    fromSequenceNumber?: string
    publisherId?: string
}>

type RangeRequest = AuthenticatedRequest<{
    fromTimestamp?: string
    toTimestamp?: string
    fromSequenceNumber?: string
    toSequenceNumber?: string
    publisherId?: string
    msgChainId?: string
    fromOffset?: string // no longer supported
    toOffset?: string   // no longer supported
}>

export const router = (storage: Storage, streamFetcher: StreamFetcher, metricsContext: MetricsContext): Router => {
    const router = express.Router()
    const metrics = metricsContext.create('broker/http')
        .addRecordedMetric('outBytes')
        .addRecordedMetric('outMessages')
        .addRecordedMetric('lastRequests')
        .addRecordedMetric('fromRequests')
        .addRecordedMetric('rangeRequests')

    router.use(
        `${LEGACY_API_ROUTE_PREFIX}/streams/:id/data/partitions/:partition`,
        // partition parsing middleware
        (req, res, next) => {
            if (Number.isNaN(parseInt(req.params.partition))) {
                const errMsg = `Path parameter "partition" not a number: ${req.params.partition}`
                logger.error(errMsg)
                res.status(400).send({
                    error: errMsg
                })
            } else {
                next()
            }
        },
        // authentication
        authenticator(streamFetcher, 'stream_subscribe'),
    )

    // eslint-disable-next-line max-len
    createEndpointRoute('last', router, metrics, (req: LastRequest, streamId: string, partition: number, onSuccess: (data: Readable) => void, onError: (msg: string) => void) => {
        const count = req.query.count === undefined ? 1 : parseIntIfExists(req.query.count)
        if (Number.isNaN(count)) {
            onError(`Query parameter "count" not a number: ${req.query.count}`)
        } else {
            onSuccess(storage.requestLast(
                streamId,
                partition,
                count!,
            ))
        }
    })

    // eslint-disable-next-line max-len
    createEndpointRoute('from', router, metrics, (req: FromRequest, streamId: string, partition: number, onSuccess: (data: Readable) => void, onError: (msg: string) => void) => {
        const fromTimestamp = parseIntIfExists(req.query.fromTimestamp)
        const fromSequenceNumber = parseIntIfExists(req.query.fromSequenceNumber) || MIN_SEQUENCE_NUMBER_VALUE
        const { publisherId } = req.query
        if (fromTimestamp === undefined) {
            onError('Query parameter "fromTimestamp" required.')
        } else if (Number.isNaN(fromTimestamp)) {
            onError(`Query parameter "fromTimestamp" not a number: ${req.query.fromTimestamp}`)
        } else {
            onSuccess(storage.requestFrom(
                streamId,
                partition,
                fromTimestamp,
                fromSequenceNumber,
                publisherId
            ))
        }
    })

    // eslint-disable-next-line max-len
    createEndpointRoute('range', router, metrics, (req: RangeRequest, streamId: string, partition: number, onSuccess: (data: Readable) => void, onError: (msg: string) => void) => {
        const fromTimestamp = parseIntIfExists(req.query.fromTimestamp)
        const toTimestamp = parseIntIfExists(req.query.toTimestamp)
        const fromSequenceNumber = parseIntIfExists(req.query.fromSequenceNumber) || MIN_SEQUENCE_NUMBER_VALUE
        const toSequenceNumber = parseIntIfExists(req.query.toSequenceNumber) || MAX_SEQUENCE_NUMBER_VALUE
        const { publisherId, msgChainId } = req.query
        if (req.query.fromOffset !== undefined || req.query.toOffset !== undefined) {
            onError('Query parameters "fromOffset" and "toOffset" are no longer supported. Please use "fromTimestamp" and "toTimestamp".')
        } else if (fromTimestamp === undefined) {
            onError('Query parameter "fromTimestamp" required.')
        } else if (Number.isNaN(fromTimestamp)) {
            onError(`Query parameter "fromTimestamp" not a number: ${req.query.fromTimestamp}`)
        } else if (toTimestamp === undefined) {
            // eslint-disable-next-line max-len
            onError('Query parameter "toTimestamp" required as well. To request all messages since a timestamp, use the endpoint /streams/:id/data/partitions/:partition/from')
        } else if (Number.isNaN(toTimestamp)) {
            onError(`Query parameter "toTimestamp" not a number: ${req.query.toTimestamp}`)
        } else if ((publisherId && !msgChainId) || (!publisherId && msgChainId)) {
            onError('Invalid combination of "publisherId" and "msgChainId"')
        } else {
            onSuccess(storage.requestRange(
                streamId,
                partition,
                fromTimestamp,
                fromSequenceNumber,
                toTimestamp,
                toSequenceNumber,
                publisherId,
                msgChainId
            ))
        }
    })

    return router
}
