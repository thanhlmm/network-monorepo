import { Protocol, MetricsContext } from 'streamr-network'
import express from 'express'
import request from 'supertest'
import { toReadableStream } from 'streamr-test-utils'
import {
    router as restEndpointRouter,
    MIN_SEQUENCE_NUMBER_VALUE,
    MAX_SEQUENCE_NUMBER_VALUE
} from '../../../../src/plugins/storage/DataQueryEndpoints'
import { Storage } from '../../../../src/plugins/storage/Storage'
import { HttpError } from '../../../../src/errors/HttpError'
import { PassThrough } from 'stream'
import { StreamFetcher } from "../../../../src/StreamFetcher"

const { MessageLayer } = Protocol
const { MessageID } = MessageLayer

const createEmptyStream = () => {
    const stream = new PassThrough()
    stream.push(null)
    return stream
}

describe('DataQueryEndpoints', () => {
    let app: express.Express
    let storage: Storage
    let streamFetcher: {
        authenticate: (streamId: string, sessionToken: string|undefined) => Promise<Record<string, never>>
    }

    function testGetRequest(url: string, sessionToken = 'mock-session-token') {
        return request(app)
            .get(url)
            .set('Accept', 'application/json')
            .set('Authorization', `Bearer ${sessionToken}`)
    }

    function createStreamMessage(content: any): Protocol.StreamMessage {
        return new Protocol.StreamMessage({
            messageId: new MessageID('streamId', 0, new Date(2017, 3, 1, 12, 0, 0).getTime(), 0, 'publisherId', 'msgChainId'),
            content,
        })
    }

    beforeEach(() => {
        app = express()
        storage = {} as Storage
        streamFetcher = {
            authenticate(streamId: string, sessionToken: string|undefined) {
                return new Promise(((resolve, reject) => {
                    if (sessionToken === 'mock-session-token') {
                        resolve({})
                    } else {
                        reject(new HttpError(403, 'GET', ''))
                    }
                }))
            },
        }
        app.use(restEndpointRouter(storage, streamFetcher as unknown as StreamFetcher, new MetricsContext(null as any)))
    })

    describe('Getting last events', () => {
        let streamMessages: Protocol.StreamMessage[]

        beforeEach(() => {
            streamMessages = [
                createStreamMessage({
                    hello: 1,
                }),
                createStreamMessage({
                    world: 2,
                }),
            ]
            storage.requestLast = jest.fn().mockReturnValue(toReadableStream(...streamMessages))
        })

        describe('user errors', () => {
            it('responds 400 and error message if param "partition" not a number', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/zero/last')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Path parameter "partition" not a number: zero',
                    }, done)
            })

            it('responds 403 and error message if not authorized', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last', 'wrong-session-token')
                    .expect('Content-Type', /json/)
                    .expect(403, {
                        error: 'Authentication failed.',
                    }, done)
            })

            it('responds 400 and error message if optional param "count" not a number', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last?count=sixsixsix')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Query parameter "count" not a number: sixsixsix',
                    }, done)
            })

            it('responds 400 and error message if format parameter is invalid', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last?format=foobar')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Query parameter "format" is invalid: foobar',
                    }, done)
            })

            it('responds 400 and error message if publisherId+msgChainId combination is invalid in range request', async () => {
                // eslint-disable-next-line max-len
                const base = '/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1000&toTimestamp=2000&fromSequenceNumber=1&toSequenceNumber=2'
                const suffixes = ['publisherId=foo', 'msgChainId=bar']
                for (const suffix of suffixes) {
                    await testGetRequest(`${base}&${suffix}`)
                        .expect('Content-Type', /json/)
                        .expect(400, {
                            error: 'Invalid combination of "publisherId" and "msgChainId"',
                        })
                }
            })
        })

        describe('GET /api/v1/streams/streamId/data/partitions/0/last', () => {
            it('responds 200 and Content-Type JSON', (done) => {
                const res = testGetRequest('/api/v1/streams/streamId/data/partitions/0/last')
                res
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with object representation of messages by default', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last')
                    .expect(streamMessages.map((m) => m.toObject()), done)
            })

            it('responds with latest version protocol serialization of messages given format=protocol', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last?format=protocol')
                    .expect(streamMessages.map((msg) => msg.serialize(Protocol.StreamMessage.LATEST_VERSION)), done)
            })

            it('responds with specific version protocol serialization of messages given format=protocol&version=30', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last?format=protocol&version=30')
                    .expect(streamMessages.map((msg) => msg.serialize(30)), done)
            })

            it('responds with raw format', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last?count=2&format=raw&version=30')
                    .expect('Content-Type', 'text/plain')
                    .expect(streamMessages.map((msg) => msg.serialize(30)).join('\n'), done)
            })

            it('invokes storage#requestLast once with correct arguments', async () => {
                await testGetRequest('/api/v1/streams/streamId/data/partitions/0/last')
                expect(storage.requestLast).toHaveBeenCalledTimes(1)
                expect((storage.requestLast as jest.Mock).mock.calls[0]).toEqual(['streamId', 0, 1])
            })

            it('responds 500 and error message if storage signals error', (done) => {
                storage.requestLast = () => toReadableStream(new Error('error'))

                testGetRequest('/api/v1/streams/streamId/data/partitions/0/last')
                    .expect('Content-Type', /json/)
                    .expect(500, {
                        error: 'Failed to fetch data!',
                    }, done)
            })
        })

        describe('?count=666', () => {
            it('passes count to storage#requestLast', async () => {
                await testGetRequest('/api/v1/streams/streamId/data/partitions/0/last?count=666')

                expect(storage.requestLast).toHaveBeenCalledTimes(1)
                expect(storage.requestLast).toHaveBeenCalledWith(
                    'streamId',
                    0,
                    666,
                )
            })
        })
    })

    describe('From queries', () => {
        let streamMessages: Protocol.StreamMessage[]

        beforeEach(() => {
            streamMessages = [
                createStreamMessage({
                    a: 'a',
                }),
                createStreamMessage({
                    z: 'z',
                }),
            ]
            storage.requestFrom = () => toReadableStream(...streamMessages)
        })

        describe('?fromTimestamp=1496408255672', () => {
            it('responds 200 and Content-Type JSON', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672')
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with data points as body', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672')
                    .expect(streamMessages.map((msg) => msg.toObject()), done)
            })

            it('invokes storage#requestFrom once with correct arguments', async () => {
                storage.requestFrom = jest.fn().mockReturnValue(createEmptyStream())

                await testGetRequest('/api/v1/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672')

                expect(storage.requestFrom).toHaveBeenCalledTimes(1)
                expect(storage.requestFrom).toHaveBeenCalledWith(
                    'streamId',
                    0,
                    1496408255672,
                    MIN_SEQUENCE_NUMBER_VALUE,
                    undefined
                )
            })

            it('responds 500 and error message if storage signals error', (done) => {
                storage.requestFrom = () => toReadableStream(new Error('error'))

                testGetRequest('/api/v1/streams/streamId/data/partitions/0/from?fromTimestamp=1496408255672')
                    .expect('Content-Type', /json/)
                    .expect(500, {
                        error: 'Failed to fetch data!',
                    }, done)
            })
        })

        describe('?fromTimestamp=1496408255672&fromSequenceNumber=1&publisherId=publisherId', () => {
            const query = 'fromTimestamp=1496408255672&fromSequenceNumber=1&publisherId=publisherId'

            it('responds 200 and Content-Type JSON', (done) => {
                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/from?${query}`)
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with data points as body', (done) => {
                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/from?${query}`)
                    .expect(streamMessages.map((msg) => msg.toObject()), done)
            })

            it('invokes storage#requestFrom once with correct arguments', async () => {
                storage.requestFrom = jest.fn().mockReturnValue(createEmptyStream())

                await testGetRequest(`/api/v1/streams/streamId/data/partitions/0/from?${query}`)

                expect(storage.requestFrom).toHaveBeenCalledTimes(1)
                expect(storage.requestFrom).toHaveBeenCalledWith(
                    'streamId',
                    0,
                    1496408255672,
                    1,
                    'publisherId'
                )
            })

            it('responds 500 and error message if storage signals error', (done) => {
                storage.requestFrom = () => toReadableStream(new Error('error'))

                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/from?${query}`)
                    .expect('Content-Type', /json/)
                    .expect(500, {
                        error: 'Failed to fetch data!',
                    }, done)
            })
        })
    })

    describe('Range queries', () => {
        describe('user errors', () => {
            it('responds 400 and error message if param "partition" not a number', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/zero/range')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Path parameter "partition" not a number: zero',
                    }, done)
            })
            it('responds 403 and error message if not authorized', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range', 'wrong-session-token')
                    .expect('Content-Type', /json/)
                    .expect(403, {
                        error: 'Authentication failed.',
                    }, done)
            })
            it('responds 400 and error message if param "fromTimestamp" not given', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Query parameter "fromTimestamp" required.',
                    }, done)
            })
            it('responds 400 and error message if param "fromTimestamp" not a number', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=notANumber')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Query parameter "fromTimestamp" not a number: notANumber',
                    }, done)
            })
            it('responds 400 and error message if param "toTimestamp" not given', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Query parameter "toTimestamp" required as well. '
                        + 'To request all messages since a timestamp,'
                        + ' use the endpoint /streams/:id/data/partitions/:partition/from',
                    }, done)
            })
            it('responds 400 and error message if optional param "toTimestamp" not a number', (done) => {
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1&toTimestamp=notANumber')
                    .expect('Content-Type', /json/)
                    .expect(400, {
                        error: 'Query parameter "toTimestamp" not a number: notANumber',
                    }, done)
            })
        })

        describe('?fromTimestamp=1496408255672&toTimestamp=1496415670909', () => {
            let streamMessages: Protocol.StreamMessage[]
            beforeEach(() => {
                streamMessages = [
                    createStreamMessage([6, 6, 6]),
                    createStreamMessage({
                        '6': '6',
                    }),
                ]
                storage.requestRange = () => toReadableStream(...streamMessages)
            })

            it('responds 200 and Content-Type JSON', (done) => {
                // eslint-disable-next-line max-len
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909')
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with data points as body', (done) => {
                // eslint-disable-next-line max-len
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909')
                    .expect(streamMessages.map((msg) => msg.toObject()), done)
            })

            it('invokes storage#requestRange once with correct arguments', async () => {
                storage.requestRange = jest.fn().mockReturnValue(createEmptyStream())

                // eslint-disable-next-line max-len
                await testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909')

                expect(storage.requestRange).toHaveBeenCalledTimes(1)
                expect(storage.requestRange).toHaveBeenCalledWith(
                    'streamId',
                    0,
                    1496408255672,
                    MIN_SEQUENCE_NUMBER_VALUE,
                    1496415670909,
                    MAX_SEQUENCE_NUMBER_VALUE,
                    undefined,
                    undefined,
                )
            })

            it('responds 500 and error message if storage signals error', (done) => {
                storage.requestRange = () => toReadableStream(new Error('error'))

                // eslint-disable-next-line max-len
                testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909')
                    .expect('Content-Type', /json/)
                    .expect(500, {
                        error: 'Failed to fetch data!',
                    }, done)
            })
        })

        describe('?fromTimestamp=1000&toTimestamp=2000&fromSequenceNumber=1&toSequenceNumber=2', () => {

            const query = '?fromTimestamp=1000&toTimestamp=2000&fromSequenceNumber=1&toSequenceNumber=2'
            it('invokes storage#requestRange once with correct arguments', async () => {
                storage.requestRange = jest.fn().mockReturnValue(createEmptyStream())

                await testGetRequest(`/api/v1/streams/streamId/data/partitions/0/range${query}`)
                expect(storage.requestRange).toHaveBeenCalledTimes(1)
                expect(storage.requestRange).toHaveBeenCalledWith(
                    'streamId',
                    0,
                    1000,
                    1,
                    2000,
                    2,
                    undefined,
                    undefined,
                )
            })

        })

        // eslint-disable-next-line max-len
        describe('?fromTimestamp=1496408255672&toTimestamp=1496415670909&fromSequenceNumber=1&toSequenceNumber=2&publisherId=publisherId&msgChainId=msgChainId', () => {
            // eslint-disable-next-line max-len
            const query = 'fromTimestamp=1496408255672&toTimestamp=1496415670909&fromSequenceNumber=1&toSequenceNumber=2&publisherId=publisherId&msgChainId=msgChainId'

            let streamMessages: Protocol.StreamMessage[]
            beforeEach(() => {
                streamMessages = [
                    createStreamMessage([6, 6, 6]),
                    createStreamMessage({
                        '6': '6',
                    }),
                ]
                storage.requestRange = () => toReadableStream(...streamMessages)
            })

            it('responds 200 and Content-Type JSON', (done) => {
                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/range?${query}`)
                    .expect('Content-Type', /json/)
                    .expect(200, done)
            })

            it('responds with data points as body', (done) => {
                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/range?${query}`)
                    .expect(streamMessages.map((msg) => msg.toObject()), done)
            })

            it('invokes storage#requestRange once with correct arguments', async () => {
                storage.requestRange = jest.fn().mockReturnValue(createEmptyStream())

                await testGetRequest(`/api/v1/streams/streamId/data/partitions/0/range?${query}`)
                expect(storage.requestRange).toHaveBeenCalledTimes(1)
                expect(storage.requestRange).toHaveBeenCalledWith(
                    'streamId',
                    0,
                    1496408255672,
                    1,
                    1496415670909,
                    2,
                    'publisherId',
                    'msgChainId',
                )
            })

            it('responds 500 and error message if storage signals error', (done) => {
                storage.requestRange = () => toReadableStream(new Error('error'))

                testGetRequest(`/api/v1/streams/streamId/data/partitions/0/range?${query}`)
                    .expect('Content-Type', /json/)
                    .expect(500, {
                        error: 'Failed to fetch data!',
                    }, done)
            })
        })
    })
})
