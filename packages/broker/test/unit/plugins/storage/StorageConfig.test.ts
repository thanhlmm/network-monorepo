/* eslint-disable no-underscore-dangle, object-curly-newline */
import { StorageConfig, StorageConfigListener } from '../../../../src/plugins/storage/StorageConfig'
import nock from 'nock'
import { Protocol } from 'streamr-network'

describe('StorageConfig', () => {

    afterEach(function () {
        if (!nock.isDone()) {
            nock.cleanAll()
            throw new Error('Not all nock interceptors were used!')
        }
    })

    describe('single storage node', () => {
        let config: StorageConfig
        let listener: StorageConfigListener

        beforeEach(() => {
            config = new StorageConfig('nodeId', 1, 0, 'http://api-url.com/path')
            // @ts-expect-error private
            config.setSPIDKeys(new Set(['existing1#0', 'existing2#0', 'existing2#1', 'existing3#0']))
            listener = {
                onSPIDAdded: jest.fn(),
                onSPIDRemoved: jest.fn()
            }
            config.addChangeListener(listener)
        })

        it('setStreams', () => {
            // @ts-expect-error private
            config.setSPIDKeys(new Set(['existing2#0', 'existing3#0', 'new1#0', 'new2#0']))
            expect(listener.onSPIDAdded).toBeCalledTimes(2)
            expect(listener.onSPIDAdded).toHaveBeenCalledWith(new Protocol.SPID('new1', 0))
            expect(listener.onSPIDAdded).toHaveBeenCalledWith(new Protocol.SPID('new2', 0))
            // doesn't remove immediately
            expect(listener.onSPIDRemoved).toBeCalledTimes(0)
            // calling it again will remove it
            // @ts-expect-error private
            config.setSPIDKeys(new Set(['existing2#0', 'existing3#0', 'new1#0', 'new2#0']))
            expect(listener.onSPIDRemoved).toHaveBeenCalledWith(new Protocol.SPID('existing1', 0))
            expect(listener.onSPIDRemoved).toHaveBeenCalledWith(new Protocol.SPID('existing2', 1))
            expect(config.hasSPID(new Protocol.SPID('new1', 0))).toBeTruthy()
            expect(config.hasSPID(new Protocol.SPID('existing1', 0))).toBeFalsy()
            expect(config.hasSPID(new Protocol.SPID('other', 0))).toBeFalsy()
        })

        it('addStream', () => {
            // @ts-expect-error private
            config.addSPIDKeys(new Set(['loremipsum#0', 'foo#0', 'bar#0']))
            expect(listener.onSPIDAdded).toBeCalledTimes(3)
            expect(listener.onSPIDAdded).toHaveBeenCalledWith(new Protocol.SPID('loremipsum', 0))
            expect(listener.onSPIDAdded).toHaveBeenCalledWith(new Protocol.SPID('foo', 0))
            expect(listener.onSPIDAdded).toHaveBeenCalledWith(new Protocol.SPID('bar', 0))
        })

        it('removeStreams', () => {
            // @ts-expect-error private
            config.removeSPIDKeys(new Set(['existing2#0', 'existing2#1']))
            expect(listener.onSPIDRemoved).toBeCalledTimes(2)
            expect(listener.onSPIDRemoved).toHaveBeenCalledWith(new Protocol.SPID('existing2', 0))
            expect(listener.onSPIDRemoved).toHaveBeenCalledWith(new Protocol.SPID('existing2', 1))
        })

        it('refresh', async () => {
            nock('http://api-url.com')
                .get('/path/storageNodes/nodeId/streams')
                .reply(200, [
                    {
                        id: 'foo',
                        partitions: 2
                    },
                    {
                        id: 'bar',
                        partitions: 1
                    },
                ])

            await config.refresh()
            expect(config.hasSPID(new Protocol.SPID('foo', 0))).toBeTruthy()
            expect(config.hasSPID(new Protocol.SPID('foo', 1))).toBeTruthy()
            expect(config.hasSPID(new Protocol.SPID('bar', 0))).toBeTruthy()
        })

        it('onAssignmentEvent', () => {
            config.onAssignmentEvent({
                storageNode: 'nodeId',
                stream: {
                    id: 'foo',
                    partitions: 2
                },
                event: 'STREAM_ADDED'
            })
            expect(config.hasSPID(new Protocol.SPID('foo', 0))).toBeTruthy()
            expect(config.hasSPID(new Protocol.SPID('foo', 1))).toBeTruthy()
        })
    })

    describe('storage cluster', () => {
        let configs: StorageConfig[]

        beforeEach(() => {
            configs = [
                new StorageConfig('nodeId', 3, 0, 'http://api-url.com/path'),
                new StorageConfig('nodeId', 3, 1, 'http://api-url.com/path'),
                new StorageConfig('nodeId', 3, 2, 'http://api-url.com/path'),
            ]
        })

        it('refresh', async () => {
            // One http call per config
            configs.map(() => nock('http://api-url.com')
                .get('/path/storageNodes/nodeId/streams')
                .reply(200, [
                    {
                        id: 'foo',
                        partitions: 100
                    },
                    {
                        id: 'bar',
                        partitions: 100
                    },
                ]))

            await Promise.all(configs.map((config) => config.refresh()))
            // @ts-expect-error private field
            expect(configs[0].spidKeys.size).toBe(61)
            // @ts-expect-error private field
            expect(configs[1].spidKeys.size).toBe(67)
            // @ts-expect-error private field
            expect(configs[2].spidKeys.size).toBe(72)
        })

        it('onAssignmentEvent', () => {
            configs.forEach((config) => config.onAssignmentEvent({
                storageNode: 'nodeId',
                stream: {
                    id: 'foo',
                    partitions: 100
                },
                event: 'STREAM_ADDED'
            }))
            // @ts-expect-error private field
            expect(configs[0].spidKeys.size).toBe(23)
            // @ts-expect-error private field
            expect(configs[1].spidKeys.size).toBe(42)
            // @ts-expect-error private field
            expect(configs[2].spidKeys.size).toBe(35)
        })
    })
})
